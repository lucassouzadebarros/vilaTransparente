package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "budgets")
public class Budget {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    public Long serviceId;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String supplier;

    public String supplierDocument;
    public String phone;

    @Column(nullable = false)
    public BigDecimal amount = BigDecimal.ZERO;

    public LocalDate budgetDate;
    public LocalDate validUntil;
    public LocalDate expectedDate;

    @Column(nullable = false)
    public String status = "EM_ANALISE";

    public Long documentId;

    @Column(columnDefinition = "text")
    public String notes;

    public Long createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
