package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * The first access of whoever runs a condominium: a single-use code (only its hash is kept) with which they choose their
 * own password. Looked up by the code before anyone is signed in, so not filtered by condominium.
 */
@Entity
@Table(name = "account_activations")
public class AccountActivation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "condominium_id", nullable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public Long userId;

    @Column(nullable = false, unique = true)
    public String codeHash;

    @Column(nullable = false)
    public LocalDateTime expiresAt;

    public LocalDateTime usedAt;
    public LocalDateTime revokedAt;
    public String createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    boolean open(LocalDateTime now) {
        return usedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }
}
