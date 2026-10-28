package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A bill the condominium has to pay. It waits for a second person's approval when it is above the condominium's limit,
 * and once paid it becomes an expense of the cash box, with the receipt.
 */
@Entity
@Table(name = "payables")
public class Payable {
    static final String PENDING_APPROVAL = "PENDING_APPROVAL";
    static final String APPROVED = "APPROVED";
    static final String PAID = "PAID";
    static final String CANCELLED = "CANCELLED";
    static final String MONTHLY = "MONTHLY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    public Long supplierId;

    @Column(nullable = false)
    public String description;

    public String category;

    @Column(nullable = false)
    public BigDecimal amount;

    @Column(nullable = false)
    public LocalDate dueDate;

    @Column(nullable = false)
    public String status = APPROVED;

    /** "2 of 5": the installments of one bill share the group key. */
    public Integer installment;
    public Integer installments;
    public String groupKey;

    /** MONTHLY: paying it creates next month's, already approved. */
    public String recurrence;

    public Long budgetId;
    public Long serviceOrderId;

    /** The bill itself (invoice, boleto). */
    public Long documentId;

    /** Why it may go above the spending limit without an approved budget; shown to every unit, like the expense's. */
    @Column(columnDefinition = "text")
    public String exceptionReason;

    @Column(columnDefinition = "text")
    public String notes;

    public String createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public String approvedBy;
    public LocalDateTime approvedAt;

    public String paidBy;
    public LocalDate paidAt;
    public String paymentMethod;
    public Long receiptDocumentId;
    public Long expenseId;

    public String cancelledBy;
    public LocalDateTime cancelledAt;

    @Column(columnDefinition = "text")
    public String cancelReason;

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
