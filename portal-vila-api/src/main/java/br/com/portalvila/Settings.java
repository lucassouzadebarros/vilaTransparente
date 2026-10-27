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

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
