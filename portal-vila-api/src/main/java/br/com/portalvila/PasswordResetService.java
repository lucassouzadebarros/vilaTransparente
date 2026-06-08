package br.com.portalvila;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
class PasswordResetService {
    private static final String RESET_SENT_MESSAGE = "Se o e-mail estiver cadastrado, enviaremos uma senha temporaria para acesso.";
    private static final String RESET_DEBUG_MESSAGE = "Senha temporaria gerada. Use-a para entrar e cadastrar uma nova senha.";
    private static final String RESET_CONFIRMED_MESSAGE = "Senha alterada com sucesso. Entre novamente com a nova senha.";
    private static final String CHANGE_CONFIRMED_MESSAGE = "Senha alterada com sucesso.";
    private static final String EMAIL_NOT_CONFIGURED_MESSAGE = "Envio de e-mail nao configurado. Fale com a administracao para recuperar a senha.";
    private static final int MAX_ATTEMPTS = 5;
    private static final String TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

    private final AppUserRepository users;
    private final PasswordResetCodeRepository resetCodes;
    private final PasswordEncoder passwordEncoder;
    private final PasswordEmailService passwordEmailService;
    private final SecureRandom random = new SecureRandom();
    private final boolean debugCodeEnabled;
    private final long expirationMinutes;

    PasswordResetService(
        AppUserRepository users,
        PasswordResetCodeRepository resetCodes,
        PasswordEncoder passwordEncoder,
        PasswordEmailService passwordEmailService,
        @Value("${portal.password-reset.debug:false}") boolean debugCodeEnabled,
        @Value("${portal.password-reset.expiration-minutes:15}") long expirationMinutes
    ) {
        this.users = users;
        this.resetCodes = resetCodes;
        this.passwordEncoder = passwordEncoder;
        this.passwordEmailService = passwordEmailService;
        this.debugCodeEnabled = debugCodeEnabled;
        this.expirationMinutes = expirationMinutes;
    }

    @Transactional
    PasswordResetResponse requestReset(PasswordResetRequest request) {
        String email = normalizeEmail(request.email());
        return users.findByEmailIgnoreCase(email)
            .filter(user -> user.active)
            .map(user -> createResetForUser(user, debugCodeEnabled))
            .orElseGet(() -> new PasswordResetResponse(RESET_SENT_MESSAGE, null));
    }

    @Transactional
    PasswordResetResponse requestResetForResident(Long residentId) {
        AppUser user = users.findByResidentId(residentId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Morador ativo nao possui usuario de acesso."));
        return createResetForUser(user, true);
    }

    @Transactional
    PasswordResetResponse confirmReset(PasswordResetConfirmRequest request) {
        String email = normalizeEmail(request.email());
        String code = onlyDigits(request.code());
        if (code.length() != 6) {
            throw invalidCode();
        }
        validateNewPassword(request.password());

        AppUser user = users.findByEmailIgnoreCase(email)
            .filter(candidate -> candidate.active)
            .orElseThrow(this::invalidCode);
        PasswordResetCode resetCode = resetCodes.findFirstByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(user.id)
            .filter(this::usable)
            .orElseThrow(this::invalidCode);

        if (!passwordEncoder.matches(code, resetCode.codeHash)) {
            resetCode.attempts++;
            resetCodes.save(resetCode);
            throw invalidCode();
        }

        user.passwordHash = passwordEncoder.encode(request.password());
        user.mustChangePassword = false;
        users.save(user);
        resetCode.usedAt = LocalDateTime.now();
        resetCodes.save(resetCode);
        return new PasswordResetResponse(RESET_CONFIRMED_MESSAGE, null);
    }

    @Transactional
    PasswordResetResponse changePassword(AppUser user, ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.currentPassword(), user.passwordHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Senha atual incorreta.");
        }
        validateNewPassword(request.newPassword());
        if (passwordEncoder.matches(request.newPassword(), user.passwordHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A nova senha precisa ser diferente da senha atual.");
        }
        user.passwordHash = passwordEncoder.encode(request.newPassword());
        user.mustChangePassword = false;
        users.save(user);
        return new PasswordResetResponse(CHANGE_CONFIRMED_MESSAGE, null);
    }

    private PasswordResetResponse createResetForUser(AppUser user, boolean includePasswordInResponse) {
        String temporaryPassword = nextTemporaryPassword();
        boolean mayReturnPassword = includePasswordInResponse || debugCodeEnabled;
        boolean sentByEmail = passwordEmailService.sendTemporaryPassword(user, temporaryPassword);
        if (!sentByEmail && !mayReturnPassword) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, EMAIL_NOT_CONFIGURED_MESSAGE);
        }

        user.passwordHash = passwordEncoder.encode(temporaryPassword);
        user.mustChangePassword = true;
        users.save(user);

        String debugCode = mayReturnPassword ? temporaryPassword : null;
        return new PasswordResetResponse(sentByEmail ? RESET_SENT_MESSAGE : RESET_DEBUG_MESSAGE, debugCode);
    }

    private boolean usable(PasswordResetCode resetCode) {
        return resetCode.usedAt == null
            && resetCode.attempts < MAX_ATTEMPTS
            && resetCode.expiresAt.isAfter(LocalDateTime.now());
    }

    private void validateNewPassword(String password) {
        if (password == null || password.trim().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A senha precisa ter pelo menos 6 caracteres.");
        }
    }

    private String nextTemporaryPassword() {
        StringBuilder password = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            password.append(TEMP_PASSWORD_CHARS.charAt(random.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return password.toString();
    }

    private String onlyDigits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Codigo invalido ou expirado.");
    }
}
