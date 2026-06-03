package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "webhook_events",
    uniqueConstraints = @UniqueConstraint(name = "uk_webhook_gateway_event", columnNames = {"gateway", "event_id"})
)
public class WebhookEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

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
