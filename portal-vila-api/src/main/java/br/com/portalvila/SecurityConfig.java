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
import org.springframework.stereotype.Component;
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

                    "/api/auth/password-reset/request",
                    "/api/auth/password-reset/confirm",
                    "/api/webhooks/asaas",
                    "/actuator/health",
                    "/error"
                ).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/events/dashboard").permitAll()
                // Health checks (no data): /api/health, and the old address render.yaml still points at.
                .requestMatchers(HttpMethod.GET, "/api/health", "/api/residents/registration-houses").permitAll()
                // Joining needs a code the administration made for the house: these two are the only open doors.
                .requestMatchers(HttpMethod.POST, "/api/residents/invite-check", "/api/residents/register-with-invite").permitAll()
                // Asking for a condominium to be registered, and activating the account of whoever runs a new one.
                .requestMatchers(HttpMethod.POST, "/api/public/**").permitAll()
                // Each condominium's own Asaas notices (checked by their address and token, in the controller).
                .requestMatchers(HttpMethod.POST, "/api/webhooks/asaas/c/*").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/documents/*/file").permitAll()
                .requestMatchers("/api/platform/**").hasRole("PLATFORM_ADMIN")
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
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}

@Configuration
class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final AppUserRepository users;
    private final PlatformAdmins platformAdmins;
    private final CondominiumAccess access;

    JwtAuthFilter(JwtService jwtService, AppUserRepository users, PlatformAdmins platformAdmins, CondominiumAccess access) {
        this.jwtService = jwtService;
        this.users = users;
        this.platformAdmins = platformAdmins;
        this.access = access;
    }

    /**
     * The token only says who the caller is. Whether the account is still active, and which role it has now, comes
     * from the database, so a released house or a removed síndico loses access right away instead of when the token
     * expires.
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        Long condominium = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(authHeader.substring(7));
                AppUser user = claims.getSubject() == null ? null : users.findByEmailIgnoreCase(claims.getSubject())
                    .filter(candidate -> candidate.active)
                    .orElse(null);
                if (user != null && !JwtService.isDocumentToken(claims)) {
                    boolean runsPlatform = platformAdmins.includes(user.email);
                    // A suspended condominium keeps its data, and its people stay out until it is reactivated.
                    if (!runsPlatform && access.suspended(user.condominiumId)) {
                        response.setStatus(HttpStatus.FORBIDDEN.value());
                        response.setContentType("application/json;charset=UTF-8");
                        response.getWriter().write("{\"error\":\"" + CondominiumAccess.SUSPENDED_MESSAGE + "\"}");
                        return;
                    }
                    // Running the platform comes on top of the role inside the account's own condominium.
                    var authorities = runsPlatform
                        ? List.of(new SimpleGrantedAuthority("ROLE_" + user.role), new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))
                        : List.of(new SimpleGrantedAuthority("ROLE_" + user.role));
                    var auth = new UsernamePasswordAuthenticationToken(user.email, null, authorities);
                    org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);
                    // Like the role, the condominium comes from the account in the database, never from the request.
                    condominium = user.condominiumId;
                }
            } catch (RuntimeException ignored) {
                org.springframework.security.core.context.SecurityContextHolder.clearContext();
            }
        }
        if (condominium == null) {
            // Nobody signed in: the request runs with no condominium unless its route names one.
            filterChain.doFilter(request, response);
            return;
        }
        Long previous = TenantContext.enter(condominium);
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.restore(previous);
        }
    }
}

@Service
class CurrentUserService {
    private final AppUserRepository users;
    private final ResidentRepository residents;
    private final SettingsRepository settings;

    CurrentUserService(AppUserRepository users, ResidentRepository residents, SettingsRepository settings) {
        this.users = users;
        this.residents = residents;
        this.settings = settings;
    }

    /** The administration, and the síndico when the condominium allows it: record, approve and pay bills. */
    boolean canPay() {
        String role = current().role;
        return "ADMIN".equals(role)
            || "SINDICO".equals(role) && settings.findAll().stream().findFirst().map(found -> found.sindicoCanPay).orElse(false);
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

    /** Admin, or the resident chosen as síndico: manages budgets and the services they are linked to. */
    boolean canManageBudgets() {
        String role = current().role;
        return "ADMIN".equals(role) || "SINDICO".equals(role);
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

/**
 * Permission checks used in @PreAuthorize as {@code @access...}. The role is read from the database
 * rather than the token, so choosing or removing the síndico takes effect right away.
 */
@Component("access")
class AccessRules {
    private final CurrentUserService currentUser;

    AccessRules(CurrentUserService currentUser) {
        this.currentUser = currentUser;
    }

    public boolean canManageBudgets() {
        return currentUser.canManageBudgets();
    }

    public boolean canPay() {
        return currentUser.canPay();
    }
}
