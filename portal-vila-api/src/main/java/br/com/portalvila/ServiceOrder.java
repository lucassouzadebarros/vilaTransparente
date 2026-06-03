package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "service_orders")
public class ServiceOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

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

    @Column(columnDefinition = "text")
    public String notes;

    public Long createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
