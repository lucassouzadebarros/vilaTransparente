package br.com.portalvila;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Who runs the platform (above the condominiums): the accounts whose e-mail is in {@code portal.platform.admin-emails}.
 * Kept in the server's settings rather than in the database, so the first one needs nobody to write to production, and
 * an account keeps its role in its own condominium (the Vila's administrator stays its administrator).
 */
@Component
class PlatformAdmins {
    private final Set<String> emails;

    PlatformAdmins(@Value("${portal.platform.admin-emails:}") String configured) {
        this.emails = Arrays.stream(configured.split(","))
            .map(email -> email.trim().toLowerCase(Locale.ROOT))
            .filter(email -> !email.isEmpty())
            .collect(Collectors.toUnmodifiableSet());
    }

    boolean includes(String email) {
        return email != null && emails.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}

/** The web panel of the platform. Only for {@link PlatformAdmins} (see SecurityConfig). */
@RestController
@RequestMapping("/api/platform")
class PlatformController {
    private final PlatformService platform;
    private final CurrentUserService currentUser;

    PlatformController(PlatformService platform, CurrentUserService currentUser) {
        this.platform = platform;
        this.currentUser = currentUser;
    }

    /** Who is signed in to the panel. The panel calls it to know whether this account may use it. */
    @GetMapping("/me")
    PlatformMe me() {
        AppUser user = currentUser.current();
        return new PlatformMe(user.name, user.email);
    }

    /** Every condominium, with a few numbers counted inside each one. */
    @GetMapping("/condominiums")
    List<CondominiumSummary> list() {
        return platform.list();
    }

    @GetMapping("/condominiums/{id}")
    CondominiumDetail detail(@PathVariable Long id) {
        return platform.detail(id);
    }

    @PostMapping("/condominiums")
    CondominiumSummary create(@Valid @RequestBody CreateCondominiumRequest request) {
        return platform.create(request);
    }

    @PutMapping("/condominiums/{id}")
    CondominiumSummary rename(@PathVariable Long id, @Valid @RequestBody RenameCondominiumRequest request) {
        return platform.rename(id, request.name());
    }

    @PutMapping("/condominiums/{id}/status")
    CondominiumSummary changeStatus(@PathVariable Long id, @Valid @RequestBody CondominiumStatusRequest request) {
        return platform.changeStatus(id, request.status());
    }
}
