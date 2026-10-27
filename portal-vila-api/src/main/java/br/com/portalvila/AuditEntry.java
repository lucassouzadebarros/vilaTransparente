package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.hibernate.annotations.TenantId;

/** One line of the trail: who did what, and when, on money and access. */
@Entity
@Table(name = "audit_log")
public class AuditEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    public String actorEmail;
    public String actorRole;

    @Column(nullable = false)
    public String action;

    public String entityType;
    public Long entityId;

    @Column(length = 400)
    public String summary;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
