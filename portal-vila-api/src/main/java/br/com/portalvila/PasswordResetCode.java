package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "password_reset_codes")
public class PasswordResetCode {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** Looked up by account while nobody is signed in, so not filtered; whose it is, all the same. */
    @JsonIgnore
    @Column(name = "condominium_id", nullable = false)
    public Long condominiumId = TenantContext.current();

    @Column(nullable = false)
    public Long userId;

    @JsonIgnore
    @Column(nullable = false)
    public String codeHash;

    @Column(nullable = false)
    public LocalDateTime expiresAt;

    public LocalDateTime usedAt;

    @Column(nullable = false)
    public int attempts = 0;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
