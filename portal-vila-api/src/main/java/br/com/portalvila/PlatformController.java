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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    private final CondominiumRequestService requests;
    private final CurrentUserService currentUser;

    PlatformController(PlatformService platform, CondominiumRequestService requests, CurrentUserService currentUser) {
        this.platform = platform;
        this.requests = requests;
        this.currentUser = currentUser;
    }

    /** Requests from the public form, newest first; {@code status} PENDING, APPROVED, REJECTED or ALL. */
    @GetMapping("/requests")
    List<CondominiumRequest> requests(@RequestParam(required = false) String status) {
        return requests.list(status);
    }

    /** How many requests wait for an answer (the number beside "Pedidos" in the menu). */
    @GetMapping("/requests/pending-count")
    Map<String, Long> pendingRequests() {
        return Map.of("pending", requests.pending());
    }

    @PostMapping("/requests/{id}/approve")
    ApprovalResult approve(@PathVariable Long id, @RequestBody ApproveCondominiumRequest request) {
        return platform.approve(id, request);
    }

    @PostMapping("/requests/{id}/reject")
    CondominiumRequest reject(@PathVariable Long id, @RequestBody RejectCondominiumRequest request) {
        return requests.reject(id, request.note());
    }

    /** A new activation code for whoever will run the condominium; any earlier one stops working. */
    @PostMapping("/condominiums/{id}/manager")
    ManagerInvitation inviteManager(@PathVariable Long id, @RequestBody InviteManagerRequest request) {
        return platform.inviteManager(id, request);
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

/** Any signed-in account: who it is, its role, whether it runs the platform, and its condominium. */
@RestController
@RequestMapping("/api/session")
class SessionController {
    private final CurrentUserService currentUser;
    private final PlatformAdmins platformAdmins;
    private final CondominiumRepository condominiums;
    private final GatewayCredentials credentials;

    SessionController(CurrentUserService currentUser, PlatformAdmins platformAdmins, CondominiumRepository condominiums, GatewayCredentials credentials) {
        this.currentUser = currentUser;
        this.platformAdmins = platformAdmins;
        this.condominiums = condominiums;
        this.credentials = credentials;
    }

    @GetMapping
    SessionResponse current() {
        AppUser user = currentUser.current();
        SessionCondominium condominium = condominiums.findById(user.condominiumId)
            .map(found -> new SessionCondominium(found.id, found.name, found.slug, found.status, credentials.connected(found.id)))
            .orElse(null);
        return new SessionResponse(user.name, user.email, user.role, user.residentId, platformAdmins.includes(user.email), condominium,
            currentUser.canPay());
    }
}

/**
 * What anyone may do without an account: ask for a condominium to be registered, and activate the account of whoever
 * runs a newly approved one. Both answer the same way to every wrong attempt and are limited per address.
 */
@RestController
@RequestMapping("/api/public")
class PublicPlatformController {
    private final CondominiumRequestService requests;
    private final ManagerInviteService managers;
    private final LoginAttemptLimiter limiter;

    PublicPlatformController(CondominiumRequestService requests, ManagerInviteService managers, LoginAttemptLimiter limiter) {
        this.requests = requests;
        this.managers = managers;
        this.limiter = limiter;
    }

    @PostMapping("/condominium-requests")
    Map<String, String> requestCondominium(@RequestBody CondominiumRequestForm form, HttpServletRequest http) {
        requests.submit(form, http);
        return Map.of("status", "RECEBIDO");
    }

    @PostMapping("/activation/check")
    ActivationPreview checkActivation(@RequestBody ActivationCodeRequest request, HttpServletRequest http) {
        return limited(http, () -> managers.check(request.code()));
    }

    @PostMapping("/activation/complete")
    Map<String, String> activate(@RequestBody ActivationRequest request, HttpServletRequest http) {
        String email = limited(http, () -> managers.complete(request.code(), request.password()));
        return Map.of("status", "ATIVADA", "email", email);
    }

    /** Wrong codes count against the address; a right one clears it. */
    private <T> T limited(HttpServletRequest http, java.util.function.Supplier<T> attempt) {
        String key = LoginAttemptLimiter.key("ativacao", null, http);
        limiter.check(key);
        try {
            T result = attempt.get();
            limiter.succeed(key);
            return result;
        } catch (org.springframework.web.server.ResponseStatusException failure) {
            if (failure.getStatusCode().value() == 404) {
                limiter.fail(key);
            }
            throw failure;
        }
    }
}
