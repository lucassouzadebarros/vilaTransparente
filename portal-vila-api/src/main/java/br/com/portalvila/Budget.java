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

    /** The problem this budget was generated for, if any. */
    public Long problemReportId;

    /** True when it is a quote for the same job as the other budgets of the problem: only one of them wins. */
    @Column(nullable = false)
    public boolean competes = true;

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

    /** What the supplier will do, so the houses know what they are voting on. */
    @Column(columnDefinition = "text")
    public String scope;

    @Column(columnDefinition = "text")
    public String notes;

    public Long createdBy;

    public LocalDateTime votingClosedAt;

    /** Last day the houses can vote. After it the voting closes by itself. Empty means no deadline. */
    public java.time.LocalDate votingDeadline;

    /** The day the houses that had not voted were last reminded, so nobody gets the reminder twice in a day. */
    public java.time.LocalDate remindedOn;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
