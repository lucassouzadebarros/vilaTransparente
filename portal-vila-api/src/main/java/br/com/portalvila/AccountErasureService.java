package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Deleting an account (a Google Play requirement, and the resident's right under the LGPD). What identifies the person is
 * erased: name, e-mail, phone, CPF/CNPJ, the way in, the notice tokens and the e-mail in the change log. What the
 * condominium must keep to account for its money (charges, payments, expenses, votes, reports) stays, without a name:
 * it points at the house, not at the person. The house is free for a new invitation afterwards.
 */
@Service
class AccountErasureService {
    static final String ADMIN_MESSAGE = "A conta de administrador não pode ser excluída pelo app. Fale com o suporte.";
    static final String ERASED_ACTOR = "conta-excluida";

    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final AppUserRepository users;
    private final PushTokenRepository pushTokens;
    private final PasswordResetCodeRepository resetCodes;
    private final AuditEntryRepository auditEntries;
    private final AuditService audit;
    private final PasswordEncoder encoder;

    AccountErasureService(
        ResidentRepository residents,
        HouseRepository houses,
        AppUserRepository users,
        PushTokenRepository pushTokens,
        PasswordResetCodeRepository resetCodes,
        AuditEntryRepository auditEntries,
        AuditService audit,
        PasswordEncoder encoder
    ) {
        this.residents = residents;
        this.houses = houses;
        this.users = users;
        this.pushTokens = pushTokens;
        this.resetCodes = resetCodes;
        this.auditEntries = auditEntries;
        this.audit = audit;
        this.encoder = encoder;
    }

    /** The person deletes their own account and confirms with the password. */
    @Transactional
    void eraseOwn(AppUser user, String password) {
        if ("ADMIN".equals(user.role)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ADMIN_MESSAGE);
        }
        if (password == null || !encoder.matches(password, user.passwordHash)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Senha incorreta.");
        }
        Resident resident = user.residentId == null ? null : residents.findById(user.residentId).orElse(null);
        erase(user, resident, true);
    }

    /** The administration erases the personal data of a resident, for a request that came by e-mail or from a former resident. */
    @Transactional
    Resident eraseResident(Long residentId) {
        Resident resident = residents.findById(residentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Morador não encontrado."));
        AppUser user = users.findByResidentId(resident.id).orElse(null);
        if (user != null && "ADMIN".equals(user.role)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ADMIN_MESSAGE);
        }
        erase(user, resident, false);
        return resident;
    }

    private void erase(AppUser user, Resident resident, boolean byTheOwner) {
        String oldEmail = user != null ? user.email : resident != null ? resident.email : null;
        String houseLabel = resident == null ? "Casa" : houses.findById(resident.houseId).map(house -> house.label).orElse("Casa");

        if (resident != null) {
            resident.name = "Morador removido";
            resident.email = "removido-" + resident.id + "@removido.invalid";
            resident.phone = null;
            resident.documentMasked = null;
            resident.documentNumber = null;
            resident.status = "INACTIVE";
            residents.save(resident);
        }
        if (user != null) {
            user.name = "Conta excluída";
            user.email = "excluida-" + user.id + "@excluida.invalid";
            user.passwordHash = encoder.encode(UUID.randomUUID().toString());
            user.active = false;
            user.mustChangePassword = false;
            if (SindicoService.ROLE.equals(user.role)) {
                user.role = "RESIDENT";
            }
            users.save(user);
            pushTokens.deleteAll(pushTokens.findByUserIdIn(List.of(user.id)));
            LocalDateTime now = LocalDateTime.now();
            for (PasswordResetCode code : resetCodes.findByUserIdAndUsedAtIsNull(user.id)) {
                code.usedAt = now;
                resetCodes.save(code);
            }
        }
        if (oldEmail != null) {
            for (AuditEntry entry : auditEntries.findByActorEmailIgnoreCase(oldEmail)) {
                entry.actorEmail = ERASED_ACTOR;
                auditEntries.save(entry);
            }
        }
        String entityType = resident != null ? "RESIDENT" : "USER";
        Long entityId = resident != null ? resident.id : user != null ? user.id : null;
        String summary = houseLabel + " - dados pessoais apagados" + (byTheOwner ? " pelo próprio morador" : " pela administração");
        if (byTheOwner) {
            // The signed-in e-mail is the one just erased: the entry must not bring it back.
            audit.recordAs(ERASED_ACTOR, null, "ACCOUNT_ERASED", entityType, entityId, summary);
        } else {
            audit.record("ACCOUNT_ERASED", entityType, entityId, summary);
        }
    }
}
