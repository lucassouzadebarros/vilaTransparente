package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(
    name = "webhook_events",
    uniqueConstraints = @UniqueConstraint(name = "uk_webhook_gateway_event", columnNames = {"gateway", "event_id"})
)
public class WebhookEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** The Asaas notice arrives before anyone knows its condominium, so not filtered; whose it is, all the same. */
    @JsonIgnore
    @Column(name = "condominium_id", nullable = false)
    public Long condominiumId = TenantContext.current();

    @Column(nullable = false)
    public String gateway = "ASAAS";

    @Column(nullable = false)
    public String eventId;

    @Column(nullable = false)
    public String eventType;

    public String gatewayPaymentId;

    @Column(nullable = false, columnDefinition = "text")
    public String payloadJson;

    @Column(nullable = false)
    public boolean processed = false;

    public LocalDateTime processedAt;
    public String errorMessage;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
