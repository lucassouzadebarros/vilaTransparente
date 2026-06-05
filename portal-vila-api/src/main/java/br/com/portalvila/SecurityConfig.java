package br.com.portalvila;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.stereotype.Service;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthFilter jwtAuthFilter) throws Exception {
        return http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/auth/login",
                    "/api/auth/register-resident",
                    "/api/auth/password-reset/request",
                    "/api/auth/password-reset/confirm",
                    "/api/webhooks/asaas",
                    "/actuator/health"
                ).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/events/dashboard").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/residents/registration-houses").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/residents/self-registration").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/documents/*/file").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) ->
                    writeError(response, HttpStatus.UNAUTHORIZED, "Sessão inválida ou expirada. Entre novamente."))
                .accessDeniedHandler((request, response, accessDeniedException) ->
                    writeError(response, HttpStatus.FORBIDDEN, "Acesso negado. Entre com a conta admin."))
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private static void writeError(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}

@Configuration
class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtService jwtService;

    JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(authHeader.substring(7));
                String role = String.valueOf(claims.get("role"));
                var auth = new UsernamePasswordAuthenticationToken(
                    claims.getSubject(),
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))
                );
                org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (RuntimeException ignored) {
                org.springframework.security.core.context.SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }
}

@Service
class CurrentUserService {
    private final AppUserRepository users;
    private final ResidentRepository residents;

    CurrentUserService(AppUserRepository users, ResidentRepository residents) {
        this.users = users;
        this.residents = residents;
    }

    AppUser current() {
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário não autenticado.");
        }
        return users.findByEmailIgnoreCase(authentication.getName())
            .filter(user -> user.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário não encontrado."));
    }

    boolean isAdmin() {
        return "ADMIN".equals(current().role);
    }

    Long requiredResidentId() {
        AppUser user = current();
        if (user.residentId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuário sem casa vinculada.");
        }
        return user.residentId;
    }

    Resident currentResident() {
        return residents.findById(requiredResidentId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Morador não encontrado."));
    }

    void assertResidentAccess(Long residentId) {
        if (isAdmin()) {
            return;
        }
        if (residentId == null || !residentId.equals(requiredResidentId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso restrito a sua casa.");
        }
    }

    void assertHouseAccess(Long houseId) {
        if (isAdmin()) {
            return;
        }
        Resident resident = currentResident();
        if (houseId == null || !houseId.equals(resident.houseId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso restrito a sua casa.");
        }
    }

    void assertContributionAccess(Contribution contribution) {
        if (isAdmin()) {
            return;
        }
        assertResidentAccess(contribution.residentId);
    }
}
