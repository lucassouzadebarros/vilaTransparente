package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "direct_receipts",
    uniqueConstraints = @UniqueConstraint(name = "uk_direct_receipt_gateway_payment", columnNames = {"gateway", "gateway_payment_id"})
)
public class DirectReceipt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String gateway = "ASAAS";

    @Column(nullable = false)
    public String gatewayPaymentId;

    public String externalReference;

    @Column(nullable = false)
    public String category = "RECEBIMENTO_DIRETO";

    @Column(nullable = false)
    public String description = "Recebimento direto via Asaas";

    @Column(nullable = false)
    public BigDecimal amount = BigDecimal.ZERO;

    @Column(nullable = false)
    public String referenceMonth;

    @Column(nullable = false)
    public LocalDateTime receivedAt = LocalDateTime.now();

    @Column(nullable = false)
    public String status = "PENDING";

    @Column(columnDefinition = "text")
    public String receiptUrl;

    @Column(columnDefinition = "text")
    public String payloadJson;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
