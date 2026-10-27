package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "push_tokens")
public class PushToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** Looked up by device token, so not filtered; whose it is, all the same. */
    @JsonIgnore
    @Column(name = "condominium_id", nullable = false)
    public Long condominiumId = TenantContext.current();

    @Column(nullable = false)
    public Long userId;

    @Column(nullable = false, length = 200)
    public String token;

    public String platform;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
