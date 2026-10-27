package br.com.portalvila;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Invitations by house. The administration makes one for a house that has nobody yet; the person types it in the app,
 * sees only their house and creates their own access. Nobody can claim a house without a code, and a code works once.
 */
@Service
class HouseInviteService {
    /** No 0/O and no 1/I/L: a code read out loud or from a screenshot is not mistyped. */
    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    static final String INVALID_MESSAGE = "Código inválido ou expirado. Peça um novo à administração.";

    private final HouseInviteRepository invites;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final AuditService audit;
    private final long validityDays;
    private final SecureRandom random = new SecureRandom();

    HouseInviteService(
        HouseInviteRepository invites,
        HouseRepository houses,
        ResidentRepository residents,
        AuditService audit,
        @Value("${portal.invite.validity-days:7}") long validityDays
    ) {
        this.invites = invites;
        this.houses = houses;
        this.residents = residents;
        this.audit = audit;
        this.validityDays = validityDays;
    }

    record Issued(HouseInvite invite, House house, String code) {
    }

    /** A new invitation for a house with nobody in it. Any earlier open invitation for the house stops working. */
    @Transactional
    Issued issue(Long houseId) {
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa não encontrada."));
        if (residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta casa já tem morador cadastrado.");
        }
        LocalDateTime now = LocalDateTime.now();
        for (HouseInvite open : invites.findByHouseIdAndUsedAtIsNullAndRevokedAtIsNull(house.id)) {
            open.revokedAt = now;
            invites.save(open);
        }
        String code = newCode();
        HouseInvite invite = new HouseInvite();
        invite.houseId = house.id;
        invite.codeHash = hash(code);
        invite.createdBy = currentActor();
        invite.expiresAt = now.plusDays(validityDays);
        HouseInvite saved = invites.save(invite);
        audit.record("INVITE_CREATED", "HOUSE_INVITE", saved.id, house.label + " - convite valido por " + validityDays + " dias");
        return new Issued(saved, house, code);
    }

    /**
     * The condominium a typed code belongs to. Nobody is signed in yet, so the code itself is looked up above the
     * condominiums; everything after that ({@link #redeemable} and the registration) runs inside the one found.
     */
    Optional<Long> condominiumOf(String rawCode) {
        String normalized = normalize(rawCode);
        if (normalized.length() != CODE_LENGTH) {
            return Optional.empty();
        }
        return TenantContext.callAcrossCondominiums(() -> invites.findByCodeHash(hash(normalized)).map(invite -> invite.condominiumId));
    }

    /** The invitation behind a code typed by someone, if it can still be used. Every failure looks the same to the caller. */
    Optional<HouseInvite> redeemable(String rawCode) {
        String normalized = normalize(rawCode);
        if (normalized.length() != CODE_LENGTH) {
            return Optional.empty();
        }
        return invites.findByCodeHash(hash(normalized))
            .filter(invite -> invite.usedAt == null && invite.revokedAt == null)
            .filter(invite -> invite.expiresAt.isAfter(LocalDateTime.now()))
            .filter(invite -> houses.findById(invite.houseId).filter(house -> house.active).isPresent())
            .filter(invite -> residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(invite.houseId, "ACTIVE").isEmpty());
    }

    @Transactional
    void markUsed(HouseInvite invite, Long residentId) {
        invite.usedAt = LocalDateTime.now();
        invite.usedByResidentId = residentId;
        invites.save(invite);
        String label = houses.findById(invite.houseId).map(house -> house.label).orElse("Casa");
        audit.record("INVITE_USED", "HOUSE_INVITE", invite.id, label + " - acesso criado pelo morador");
    }

    @Transactional
    void revoke(Long inviteId) {
        HouseInvite invite = invites.findById(inviteId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Convite não encontrado."));
        if (invite.usedAt != null || invite.revokedAt != null) {
            return;
        }
        invite.revokedAt = LocalDateTime.now();
        invites.save(invite);
        String label = houses.findById(invite.houseId).map(house -> house.label).orElse("Casa");
        audit.record("INVITE_REVOKED", "HOUSE_INVITE", invite.id, label + " - convite cancelado");
    }

    /** Open invitations, newest first. The codes themselves are never listed: they were shown once, when made. */
    List<HouseInvite> open() {
        LocalDateTime now = LocalDateTime.now();
        return invites.findByUsedAtIsNullAndRevokedAtIsNullOrderByCreatedAtDesc().stream()
            .filter(invite -> invite.expiresAt.isAfter(now))
            .toList();
    }

    /** The same code however it is typed: lower case, with a dash or with spaces. */
    static String normalize(String raw) {
        return raw == null ? "" : raw.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }

    /** Shown to people as XXXX-XXXX. */
    static String display(String code) {
        return code.substring(0, 4) + "-" + code.substring(4);
    }

    private String newCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    private static String hash(String normalizedCode) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalizedCode.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication == null || authentication.getName() == null ? "sistema" : authentication.getName();
    }
}
