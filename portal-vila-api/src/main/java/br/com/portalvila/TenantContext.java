package br.com.portalvila;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.function.Supplier;

/**
 * Which condominium the current work belongs to. Hibernate reads it every time a transaction opens its session: the
 * entities marked {@code @TenantId} get it stamped on insert and filtered on every read, so a repository call cannot
 * return (or touch) another condominium's rows.
 *
 * {@link JwtAuthFilter} sets it from the signed-in account for each request. Work without an account names its own:
 * the invitation routes take the condominium of the code, a document link the one in its token, the voting schedule
 * goes through each condominium, and the Asaas webhook and the first load are the Vila's. Anything else still falls back
 * to the Vila; that fallback becomes an error before a second condominium is created.
 */
final class TenantContext {
    /** The Vila: the condominium every row existed in before the app served several. */
    static final long VILA = 1L;

    /** Not a condominium: reads see every condominium. Only for finding out which one something belongs to. */
    private static final long ALL = -1L;

    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    static long current() {
        Long id = CURRENT.get();
        return id == null ? VILA : id;
    }

    static void set(long condominiumId) {
        CURRENT.set(condominiumId);
    }

    static void clear() {
        CURRENT.remove();
    }

    /**
     * Runs {@code work} as that condominium and puts the previous one back. Open the transaction <em>inside</em> the
     * block: a session keeps the condominium it was opened with, so one already open would not change.
     */
    static <T> T callAs(long condominiumId, Supplier<T> work) {
        Long previous = CURRENT.get();
        CURRENT.set(condominiumId);
        try {
            return work.get();
        } finally {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        }
    }

    static void runAs(long condominiumId, Runnable work) {
        callAs(condominiumId, () -> {
            work.run();
            return null;
        });
    }

    /**
     * Reads above the condominiums, for an entry point that has a code or an id but nobody signed in yet (an invitation
     * code, say) and must find out whose it is. Read only: then do the work with {@link #callAs} in that condominium.
     */
    static <T> T callAcrossCondominiums(Supplier<T> lookup) {
        return callAs(ALL, lookup);
    }

    static boolean isAcrossCondominiums(Long condominiumId) {
        return condominiumId != null && condominiumId == ALL;
    }
}

@Component
class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<Long>, HibernatePropertiesCustomizer {
    @Override
    public Long resolveCurrentTenantIdentifier() {
        return TenantContext.current();
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }

    @Override
    public boolean isRoot(Long tenantId) {
        return TenantContext.isAcrossCondominiums(tenantId);
    }

    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, this);
    }
}
