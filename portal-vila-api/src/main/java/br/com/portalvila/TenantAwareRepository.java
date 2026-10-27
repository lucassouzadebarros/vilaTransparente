package br.com.portalvila;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.jpa.repository.support.JpaEntityInformation;
import org.springframework.data.jpa.repository.support.SimpleJpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

/**
 * Base of every repository. Hibernate filters queries by condominium ({@code @TenantId}) but not a load by id
 * ({@code EntityManager.find}), so an id from another condominium would still be found, updated or deleted. Here the
 * load by id is a query, which the filter covers, and saving a row this session did not load first checks that the row
 * belongs to the current condominium.
 *
 * The transaction annotations repeat the parent's: an overriding method does not inherit them.
 */
@Transactional(readOnly = true)
class TenantAwareRepository<T, ID> extends SimpleJpaRepository<T, ID> {
    private final JpaEntityInformation<T, ?> entity;
    private final EntityManager entityManager;
    private final String byIdQuery;

    TenantAwareRepository(JpaEntityInformation<T, ?> entityInformation, EntityManager entityManager) {
        super(entityInformation, entityManager);
        this.entity = entityInformation;
        this.entityManager = entityManager;
        this.byIdQuery = "select e from " + entityInformation.getEntityName() + " e where e."
            + entityInformation.getRequiredIdAttribute().getName() + " = :id";
    }

    /** Also what {@code deleteById} uses. */
    @Override
    public Optional<T> findById(ID id) {
        Objects.requireNonNull(id, "id");
        return entityManager.createQuery(byIdQuery, entity.getJavaType())
            .setParameter("id", id)
            .getResultStream()
            .findFirst();
    }

    @Override
    public T getReferenceById(ID id) {
        return findById(id).orElseThrow(() -> new EntityNotFoundException(entity.getEntityName() + " " + id));
    }

    /** Also what {@code saveAndFlush} and {@code saveAll} use. */
    @Override
    @Transactional
    @SuppressWarnings("unchecked")
    public <S extends T> S save(S row) {
        if (!entity.isNew(row) && !entityManager.contains(row) && findById((ID) entity.getId(row)).isEmpty()) {
            throw new EntityNotFoundException(entity.getEntityName() + " " + entity.getId(row));
        }
        return super.save(row);
    }
}
