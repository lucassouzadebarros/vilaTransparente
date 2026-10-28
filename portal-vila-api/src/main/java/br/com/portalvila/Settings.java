package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.hibernate.annotations.TenantId;

@Entity
@Table(name = "settings")
public class Settings {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public String villageName = "Portal da Vila";

    @Column(nullable = false)
    public BigDecimal monthlyAmount = BigDecimal.valueOf(100);

    @Column(nullable = false)
    public Integer paymentDueDay = 10;

    @Column(nullable = false)
    public String gatewayProvider = "ASAAS";

    @JsonIgnore
    public String webhookSecret;

    /** A service above this value needs a budget approved by the houses before it starts. Empty means no rule. */
    public BigDecimal budgetRequiredAbove;

    /** PIX, or BOLETO: a boleto that also carries a Pix QR code (the unit pays either way). */
    @Column(nullable = false)
    public String billingType = BILLING_PIX;

    /** Late fee, in percent of the charge, added by Asaas after the due date. Zero: none. */
    @Column(nullable = false)
    public BigDecimal finePercent = BigDecimal.ZERO;

    /** Interest per month, in percent, added by Asaas after the due date. Zero: none. */
    @Column(nullable = false)
    public BigDecimal interestPercent = BigDecimal.ZERO;

    /** Names the charge on the invoice ("Taxa condominial - Casa 3 - 2026-11"). Empty: "Taxa condominial". */
    public String chargeTitle;

    /** Reserve fund added to each monthly charge, in percent of the monthly fee. Zero: none. */
    @Column(nullable = false)
    public BigDecimal reserveFundPercent = BigDecimal.ZERO;

    /** Reminders by the app before the due date, on the day and the day after, while the charge is unpaid. */
    @Column(nullable = false)
    public boolean remindersEnabled = false;

    @Column(nullable = false)
    public Integer reminderDaysBefore = 3;

    /** FIXED: the same value for every unit (monthlyAmount). FRACTION: monthlyTotal divided by each unit's ideal fraction. */
    @Column(nullable = false)
    public String chargeMode = MODE_FIXED;

    /** What the whole condominium costs in a month, divided among the units in FRACTION mode. */
    public BigDecimal monthlyTotal;

    /** Price of a cubic meter of water and of gas, for the charges by meter reading. */
    public BigDecimal waterPrice;
    public BigDecimal gasPrice;

    static final String MODE_FIXED = "FIXED";
    static final String MODE_FRACTION = "FRACTION";

    static final String BILLING_PIX = "PIX";
    static final String BILLING_BOLETO = "BOLETO";
    static final String DEFAULT_CHARGE_TITLE = "Taxa condominial";

    String chargeTitleOrDefault() {
        return chargeTitle == null || chargeTitle.isBlank() ? DEFAULT_CHARGE_TITLE : chargeTitle;
    }

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
