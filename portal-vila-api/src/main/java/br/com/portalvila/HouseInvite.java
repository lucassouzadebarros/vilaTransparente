package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * The way into the app for the person who lives in a house: a single-use, expiring code the administration hands out.
 * Only a hash of the code is kept, so a copy of the database does not hold working codes.
 */
@Entity
@Table(name = "house_invites")
public class HouseInvite {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long houseId;

    @JsonIgnore
    @Column(nullable = false, length = 64)
    public String codeHash;

    public String createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime expiresAt;

    public LocalDateTime usedAt;

    public Long usedByResidentId;

    public LocalDateTime revokedAt;
}
