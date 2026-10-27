package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The person who runs a new condominium gets an administrator account that cannot sign in yet, and a single-use code
 * with which they choose their own password. No password is ever sent. A new code for the same condominium cancels the
 * one before (a lost message, say).
 */
@Service
class ManagerInviteService {
    static final long VALIDITY_DAYS = 7;
    static final String INVALID_MESSAGE = "Código inválido ou expirado. Peça um novo a quem administra a plataforma.";
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    record Issued(AppUser account, String code, LocalDateTime expiresAt) {
    }

    private record Open(AccountActivation activation, AppUser account, Condominium condominium) {
    }

    private final AppUserRepository users;
    private final AccountActivationRepository activations;
    private final CondominiumRepository condominiums;
    private final CondominiumAccess access;
    private final PasswordEncoder encoder;
    private final AuditService audit;

    ManagerInviteService(
        AppUserRepository users,
        AccountActivationRepository activations,
        CondominiumRepository condominiums,
        CondominiumAccess access,
        PasswordEncoder encoder,
        AuditService audit
    ) {
        this.users = users;
        this.activations = activations;
        this.condominiums = condominiums;
        this.access = access;
        this.encoder = encoder;
        this.audit = audit;
    }

    static String cleanEmail(String raw) {
        String email = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 160 || !EMAIL.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um e-mail válido.");
        }
        return email;
    }

    static String cleanName(String raw) {
        String name = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (name.length() < 2 || name.length() > 120) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o nome de quem vai administrar o condomínio.");
        }
        return name;
    }

    /** Refuses an e-mail that already belongs to someone (one account per e-mail, for now). Checked before creating anything. */
    void assertEmailAvailable(String email, Long condominiumId) {
        users.findByEmailIgnoreCase(cleanEmail(email)).ifPresent(existing -> {
            boolean waitingHere = !existing.active && condominiumId != null && condominiumId.equals(existing.condominiumId);
            if (!waitingHere) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe uma conta com o e-mail " + existing.email + ". Use outro e-mail.");
            }
        });
    }

    Issued invite(long condominiumId, String rawName, String rawEmail) {
        Condominium condominium = condominiums.findById(condominiumId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Condomínio não encontrado."));
        String name = cleanName(rawName);
        String email = cleanEmail(rawEmail);
        assertEmailAvailable(email, condominium.id);

        AppUser account = users.findByEmailIgnoreCase(email).orElseGet(() -> {
            // A password nobody knows: the account is only usable after the person chooses their own.
            AppUser created = new AppUser(name, email, encoder.encode(UUID.randomUUID().toString()), "ADMIN", null);
            created.condominiumId = condominium.id;
            created.active = false;
            return created;
        });
        account.name = name;
        AppUser saved = users.save(account);

        LocalDateTime now = LocalDateTime.now();
        for (AccountActivation open : activations.findByCondominiumIdAndUsedAtIsNullAndRevokedAtIsNull(condominium.id)) {
            open.revokedAt = now;
            activations.save(open);
        }
        String code = AccessCodes.newCode();
        AccountActivation activation = new AccountActivation();
        activation.condominiumId = condominium.id;
        activation.userId = saved.id;
        activation.codeHash = AccessCodes.hash(code);
        activation.expiresAt = now.plusDays(VALIDITY_DAYS);
        activation.createdBy = currentActor();
        activations.save(activation);

        TenantContext.runAs(condominium.id, () -> audit.record("MANAGER_INVITED", "USER", saved.id, "Administração convidada: " + name));
        return new Issued(saved, AccessCodes.display(code), activation.expiresAt);
    }

    /** The invitation still waiting in a condominium, if there is one. */
    Optional<PendingManager> pending(long condominiumId) {
        LocalDateTime now = LocalDateTime.now();
        return activations.findByCondominiumIdAndUsedAtIsNullAndRevokedAtIsNull(condominiumId).stream()
            .filter(activation -> activation.open(now))
            .max(Comparator.comparing(activation -> activation.createdAt))
            .flatMap(activation -> users.findById(activation.userId)
                .map(user -> new PendingManager(user.name, user.email, activation.expiresAt)));
    }

    /** What a typed code opens, to show before the password is chosen. Every wrong, used or expired code looks the same. */
    ActivationPreview check(String rawCode) {
        Open open = find(rawCode);
        return new ActivationPreview(open.condominium().name, open.account().name, open.account().email);
    }

    String complete(String rawCode, String password) {
        Open open = find(rawCode);
        if (password == null || password.trim().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A senha precisa ter pelo menos 8 caracteres.");
        }
        AppUser account = open.account();
        account.passwordHash = encoder.encode(password);
        account.active = true;
        account.mustChangePassword = false;
        users.save(account);
        AccountActivation activation = open.activation();
        activation.usedAt = LocalDateTime.now();
        activations.save(activation);
        TenantContext.runAs(open.condominium().id, () -> audit.record("MANAGER_ACTIVATED", "USER", account.id, "Conta ativada: " + account.name));
        return account.email;
    }

    private Open find(String rawCode) {
        String normalized = AccessCodes.normalize(rawCode);
        LocalDateTime now = LocalDateTime.now();
        return Optional.of(normalized)
            .filter(AccessCodes::wellFormed)
            .flatMap(code -> activations.findByCodeHash(AccessCodes.hash(code)))
            .filter(activation -> activation.open(now))
            .filter(activation -> !access.suspended(activation.condominiumId))
            .flatMap(activation -> users.findById(activation.userId)
                .flatMap(account -> condominiums.findById(activation.condominiumId)
                    .map(condominium -> new Open(activation, account, condominium))))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, INVALID_MESSAGE));
    }

    private static String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication == null || authentication.getName() == null ? "sistema" : authentication.getName();
    }
}
