package br.com.portalvila;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

/**
 * Records who changed money or access. The caller is whoever is signed in; changes that come from the gateway
 * (webhook, sync) have no user and are recorded as "sistema".
 */
@Service
class AuditService {
    private static final int SUMMARY_LIMIT = 400;

    private final AuditEntryRepository entries;

    AuditService(AuditEntryRepository entries) {
        this.entries = entries;
    }

    void record(String action, String entityType, Long entityId, String summary) {
        AuditEntry entry = new AuditEntry();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication instanceof AnonymousAuthenticationToken || authentication.getName() == null) {
            entry.actorEmail = "sistema";
        } else {
            entry.actorEmail = authentication.getName();
            entry.actorRole = authentication.getAuthorities().stream()
                .findFirst()
                .map(authority -> authority.getAuthority().replaceFirst("^ROLE_", ""))
                .orElse(null);
        }
        entry.action = action;
        entry.entityType = entityType;
        entry.entityId = entityId;
        entry.summary = summary == null ? null : summary.length() > SUMMARY_LIMIT ? summary.substring(0, SUMMARY_LIMIT) : summary;
        entry.createdAt = LocalDateTime.now();
        entries.save(entry);
    }

    List<AuditEntry> latest() {
        return entries.findTop200ByOrderByCreatedAtDescIdDesc();
    }

    static String money(BigDecimal value) {
        return value == null ? "R$ 0,00" : "R$ " + String.format(new Locale("pt", "BR"), "%,.2f", value);
    }
}
