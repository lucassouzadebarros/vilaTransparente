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
 * {@link JwtAuthFilter} sets it from the signed-in account for each request. Work without an account (the scheduled
 * jobs, the Asaas webhook, the first load) has no condominium of its own yet and falls back to the Vila, which is the
 * only condominium that exists. That fallback is temporary: before a second condominium is created it becomes an error,
 * and each of those entry points resolves its own condominium.
 */
final class TenantContext {
    /** The Vila: the condominium every row existed in before the app served several. */
    static final long VILA = 1L;

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
    public void customize(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, this);
    }
}
