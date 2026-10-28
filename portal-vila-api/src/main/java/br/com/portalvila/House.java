package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.hibernate.annotations.TenantId;

@Entity
@Table(name = "houses", uniqueConstraints = @UniqueConstraint(columnNames = {"condominium_id", "number"}))
public class House {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public Integer number;

    @Column(nullable = false)
    public String label;

    @Column(nullable = false)
    public boolean active = true;

    /** The unit's share when the month is divided by ideal fraction: any weight, as long as every unit uses the same one. */
    public java.math.BigDecimal idealFraction;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public House() {
    }

    public House(Integer number, String label) {
        this.number = number;
        this.label = label;
    }
}
