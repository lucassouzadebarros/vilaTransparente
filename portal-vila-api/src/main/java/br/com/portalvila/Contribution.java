package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "contributions",
    uniqueConstraints = @UniqueConstraint(name = "uk_contributions_house_month", columnNames = {"house_id", "reference_month"})
)
public class Contribution {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long houseId;

    public Long residentId;

    @Column(nullable = false)
    public String referenceMonth;

    @Column(nullable = false)
    public BigDecimal amount = BigDecimal.ZERO;

    public BigDecimal paidAmount;
    public String status = "PENDING";
    public LocalDateTime paymentDate;
    public String paymentMethod;

    @Column(nullable = false)
    public boolean manualPayment = false;

    public String manualReason;
    public Long pixChargeId;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
