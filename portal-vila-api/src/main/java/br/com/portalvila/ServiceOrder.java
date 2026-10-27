package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.hibernate.annotations.TenantId;

@Entity
@Table(name = "service_orders")
public class ServiceOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false, columnDefinition = "text")
    public String description;

    public String category;

    @Column(nullable = false)
    public String priority = "MEDIA";

    @Column(nullable = false)
    public String status = "PLANEJADO";

    public BigDecimal expectedValue;
    public BigDecimal finalValue;
    public String supplier;
    public String supplierDocument;
    public LocalDate plannedDate;
    public LocalDate completedDate;
    public Long approvedBudgetId;

    /** The problem report this service was opened from, if any. */
    public Long problemReportId;

    /** Why this service was paid above the limit without an approved budget. Shown to everyone. */
    @Column(columnDefinition = "text")
    public String emergencyReason;

    @Column(columnDefinition = "text")
    public String notes;

    public Long createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
