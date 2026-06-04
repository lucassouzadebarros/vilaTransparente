package br.com.portalvila;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
class WebhookService {
    private final ObjectMapper objectMapper;
    private final WebhookEventRepository events;
    private final PixChargeRepository pixCharges;
    private final ContributionRepository contributions;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;
    private final String configuredToken;

    WebhookService(
        ObjectMapper objectMapper,
        WebhookEventRepository events,
        PixChargeRepository pixCharges,
        ContributionRepository contributions,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents,
        @Value("${portal.asaas.webhook-token:}") String configuredToken
    ) {
        this.objectMapper = objectMapper;
        this.events = events;
        this.pixCharges = pixCharges;
        this.contributions = contributions;
        this.settingsRepository = settingsRepository;
        this.dashboardEvents = dashboardEvents;
        this.configuredToken = configuredToken;
    }

    @Transactional
    public WebhookResult processAsaas(String token, JsonNode payload) {
        validateWebhookToken(token);
        String eventId = text(payload, "id");
        String eventType = text(payload, "event");
        JsonNode payment = payload.path("payment");
        String gatewayPaymentId = text(payment, "id");

        if (eventId == null || eventId.isBlank()) {
            eventId = eventType + ":" + gatewayPaymentId + ":" + text(payload, "dateCreated");
        }
        if (events.existsByGatewayAndEventId("ASAAS", eventId)) {
            return new WebhookResult(false, true, "Evento duplicado ignorado por event_id.");
        }

        WebhookEvent event = new WebhookEvent();
        event.gateway = "ASAAS";
        event.eventId = eventId;
        event.eventType = eventType == null ? "UNKNOWN" : eventType;
        event.gatewayPaymentId = gatewayPaymentId;
        event.payloadJson = write(payload);

        boolean duplicatePaymentEvent = gatewayPaymentId != null
            && events.existsByGatewayAndGatewayPaymentIdAndEventType("ASAAS", gatewayPaymentId, event.eventType);
        if (duplicatePaymentEvent) {
            event.processed = true;
            event.processedAt = LocalDateTime.now();
            event.errorMessage = "Evento duplicado por pagamento + tipo.";
            events.save(event);
            return new WebhookResult(false, true, event.errorMessage);
        }

        try {
            boolean changed = applyPaymentEvent(event.eventType, gatewayPaymentId, payment);
            event.processed = true;
            event.processedAt = LocalDateTime.now();
            events.save(event);
            if (changed) {
                dashboardEvents.publishDashboardChanged();
            }
            return new WebhookResult(true, false, "Webhook processado.");
        } catch (RuntimeException ex) {
            event.errorMessage = ex.getMessage();
            events.save(event);
            throw ex;
        }
    }

    private boolean applyPaymentEvent(String eventType, String gatewayPaymentId, JsonNode payment) {
        if (gatewayPaymentId == null || gatewayPaymentId.isBlank()) {
            return false;
        }
        PixCharge charge = pixCharges.findByGatewayAndGatewayPaymentId("ASAAS", gatewayPaymentId).orElse(null);
        if (charge == null) {
            return false;
        }
        Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();

        switch (eventType) {
            case "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED" -> {
                charge.status = "PAID";
                charge.paidAt = LocalDateTime.now();
                charge.receiptUrl = text(payment, "transactionReceiptUrl");
                contribution.status = "PAID";
                contribution.paidAmount = decimal(payment, "value", charge.value);
                contribution.paymentDate = LocalDateTime.now();
                contribution.paymentMethod = "PIX_ASAAS";
            }
            case "PAYMENT_OVERDUE" -> {
                charge.status = "OVERDUE";
                contribution.status = "OVERDUE";
            }
            case "PAYMENT_REFUNDED" -> {
                charge.status = "REFUNDED";
                contribution.status = "PENDING";
                contribution.paidAmount = BigDecimal.ZERO;
                contribution.paymentDate = null;
            }
            case "PAYMENT_DELETED" -> {
                charge.status = "CANCELLED";
                contribution.status = "CANCELLED";
            }
            default -> {
                return false;
            }
        }
        charge.updatedAt = LocalDateTime.now();
        contribution.updatedAt = LocalDateTime.now();
        pixCharges.save(charge);
        contributions.save(contribution);
        return true;
    }

    private void validateWebhookToken(String token) {
        String secret = settingsRepository.findAll().stream()
            .findFirst()
            .map(s -> s.webhookSecret)
            .filter(s -> s != null && !s.isBlank())
            .orElse(configuredToken);
        if (secret != null && !secret.isBlank() && (token == null || !secret.equals(token))) {
            throw new InvalidWebhookTokenException();
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private BigDecimal decimal(JsonNode node, String field, BigDecimal fallback) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? fallback : value.decimalValue();
    }

    private String write(JsonNode payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}

class InvalidWebhookTokenException extends RuntimeException {
    InvalidWebhookTokenException() {
        super("Token de webhook invalido.");
    }
}
