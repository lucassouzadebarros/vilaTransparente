package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A unit's water or gas meter at the end of a month, what it used since the reading before, and the charge it became. */
@Entity
@Table(name = "meter_readings")
public class MeterReading {
    static final String WATER = "WATER";
    static final String GAS = "GAS";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public Long houseId;

    @Column(nullable = false)
    public String kind;

    @Column(nullable = false)
    public String referenceMonth;

    public BigDecimal previousReading;

    @Column(nullable = false)
    public BigDecimal reading;

    public BigDecimal consumption;
    public BigDecimal unitPrice;
    public BigDecimal amount;

    /** The one-off charge this reading became; while empty, it can still be corrected. */
    public Long contributionId;

    public String recordedBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
