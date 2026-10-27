package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.hibernate.annotations.TenantId;

/** A gateway payment the admin chose to keep out of the portal (for example test payments). */
@Entity
@Table(
    name = "excluded_gateway_payments",
    uniqueConstraints = @UniqueConstraint(name = "uk_excluded_gateway_payment", columnNames = {"gateway", "gateway_payment_id"})
)
public class ExcludedGatewayPayment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public String gateway = "ASAAS";

    @Column(nullable = false)
    public String gatewayPaymentId;

    public String reason;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
