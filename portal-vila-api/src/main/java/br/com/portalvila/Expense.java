package br.com.portalvila;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "expenses")
public class Expense {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String description;

    public String category;

    @Column(nullable = false)
    public BigDecimal amount = BigDecimal.ZERO;

    @Column(nullable = false)
    public LocalDate expenseDate = LocalDate.now();

    public String supplier;
    public String paymentMethod;

    @Column(columnDefinition = "text")
    public String notes;

    public Long documentId;
    public Long serviceOrderId;
    public Long budgetId;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
