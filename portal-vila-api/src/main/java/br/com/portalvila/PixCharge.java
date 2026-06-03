package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "pix_charges",
    uniqueConstraints = @UniqueConstraint(name = "uk_pix_gateway_payment", columnNames = {"gateway", "gateway_payment_id"})
)
public class PixCharge {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long contributionId;

    @Column(nullable = false)
    public String gateway = "ASAAS";

    @Column(nullable = false)
    public String gatewayPaymentId;

    @Column(nullable = false)
    public String externalReference;

    public String txid;

    @Column(name = "charge_value", nullable = false)
    public BigDecimal value = BigDecimal.ZERO;

    @Column(nullable = false)
    public LocalDate dueDate;

    @Column(nullable = false)
    public String status = "PENDING";

    @Column(columnDefinition = "text")
    public String qrCodeBase64;

    @Column(columnDefinition = "text")
    public String pixCopyPaste;

    @Column(columnDefinition = "text")
    public String invoiceUrl;

    @Column(columnDefinition = "text")
    public String receiptUrl;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public LocalDateTime paidAt;

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
