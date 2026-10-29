package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Set;

/**
 * A bill paid by Pix from the condominium's Asaas account. REQUESTED is kept before Asaas is called; then it follows
 * Asaas: PENDING, BANK_PROCESSING, DONE (the bill is settled with the receipt), FAILED or CANCELLED (the bill stays open).
 */
@Entity
@Table(name = "pix_transfers")
public class PixTransfer {
    public static final String REQUESTED = "REQUESTED";
    public static final String PENDING = "PENDING";
    public static final String BANK_PROCESSING = "BANK_PROCESSING";
    public static final String DONE = "DONE";
    public static final String FAILED = "FAILED";
    public static final String CANCELLED = "CANCELLED";
    /** Still on its way: the bill can neither be paid another way nor changed meanwhile. */
    public static final Set<String> IN_FLIGHT = Set.of(REQUESTED, PENDING, BANK_PROCESSING);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public Long payableId;

    @Column(nullable = false)
    public BigDecimal amount;

    @Column(nullable = false)
    public String pixKey;

    @Column(nullable = false)
    public String pixKeyType;

    public String gatewayTransferId;

    @Column(nullable = false)
    public String status = REQUESTED;

    @Column(columnDefinition = "text")
    public String failReason;

    @Column(columnDefinition = "text")
    public String receiptUrl;

    public String endToEndId;
    public BigDecimal fee;

    @Column(nullable = false)
    public String requestedBy;

    @Column(nullable = false)
    public LocalDateTime requestedAt = LocalDateTime.now();

    public LocalDateTime confirmedAt;

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
