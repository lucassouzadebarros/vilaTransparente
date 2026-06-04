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
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final PixGatewayClient gatewayClient;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;
    private final String configuredToken;

    WebhookService(
        ObjectMapper objectMapper,
        WebhookEventRepository events,
        PixChargeRepository pixCharges,
        ContributionRepository contributions,
        HouseRepository houses,
        ResidentRepository residents,
        PixGatewayClient gatewayClient,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents,
        @Value("${portal.asaas.webhook-token:}") String configuredToken
    ) {
        this.objectMapper = objectMapper;
        this.events = events;
        this.pixCharges = pixCharges;
        this.contributions = contributions;
        this.houses = houses;
        this.residents = residents;
        this.gatewayClient = gatewayClient;
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
            charge = createLocalChargeFromPayment(gatewayPaymentId, payment);
            if (charge == null) {
                return false;
            }
        }
        Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();

        switch (eventType) {
            case "PAYMENT_CREATED", "PAYMENT_UPDATED" -> {
                String status = normalizeGatewayStatus(text(payment, "status"));
                applyNormalizedStatus(charge, contribution, status, payment);
            }
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

    private PixCharge createLocalChargeFromPayment(String gatewayPaymentId, JsonNode payment) {
        String billingType = text(payment, "billingType");
        if (billingType != null && !billingType.isBlank() && !"PIX".equalsIgnoreCase(billingType)) {
            return null;
        }
        LocalDate dueDate = date(payment, "dueDate");
        if (dueDate == null) {
            return null;
        }
        Resident resident = residentFromPayment(payment);
        if (resident == null) {
            return null;
        }
        House house = houses.findById(resident.houseId).orElse(null);
        if (house == null) {
            return null;
        }
        String detectedMonth = monthFromExternalReference(text(payment, "externalReference"));
        if (detectedMonth == null) {
            detectedMonth = java.time.YearMonth.from(dueDate).toString();
        }
        final String month = detectedMonth;
        if (contributions.findByHouseIdAndReferenceMonth(house.id, month)
            .flatMap(contribution -> pixCharges.findByContributionId(contribution.id))
            .isPresent()) {
            return null;
        }

        BigDecimal value = decimal(payment, "value", BigDecimal.ZERO);
        Contribution contribution = contributions.findByHouseIdAndReferenceMonth(house.id, month).orElseGet(() -> {
            Contribution created = new Contribution();
            created.houseId = house.id;
            created.residentId = resident.id;
            created.referenceMonth = month;
            created.amount = value;
            created.status = "PENDING";
            return contributions.save(created);
        });
        contribution.residentId = resident.id;
        contribution.amount = value;
        contribution.updatedAt = LocalDateTime.now();
        contribution = contributions.save(contribution);

        PixQrCode qrCode = tryQrCode(gatewayPaymentId);
        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gateway = "ASAAS";
        charge.gatewayPaymentId = gatewayPaymentId;
        charge.externalReference = storedExternalReference(payment, gatewayPaymentId);
        charge.value = value;
        charge.dueDate = dueDate;
        charge.status = normalizeGatewayStatus(text(payment, "status"));
        charge.qrCodeBase64 = qrCode == null ? null : qrCode.encodedImage();
        charge.pixCopyPaste = qrCode == null ? null : qrCode.payload();
        charge.invoiceUrl = text(payment, "invoiceUrl");
        charge.receiptUrl = text(payment, "transactionReceiptUrl");
        charge.updatedAt = LocalDateTime.now();
        charge = pixCharges.save(charge);

        contribution.pixChargeId = charge.id;
        applyNormalizedStatus(charge, contribution, charge.status, payment);
        return pixCharges.save(charge);
    }

    private Resident residentFromPayment(JsonNode payment) {
        House house = houseFromExternalReference(text(payment, "externalReference"));
        if (house != null) {
            return residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").orElse(null);
        }
        String customerId = text(payment, "customer");
        if (customerId == null || customerId.isBlank()) {
            return null;
        }
        return residents.findFirstByGatewayCustomerIdAndStatusOrderByCreatedAtDesc(customerId, "ACTIVE").orElse(null);
    }

    private House houseFromExternalReference(String externalReference) {
        if (externalReference == null || externalReference.isBlank()) {
            return null;
        }
        String marker = "-HOUSE-";
        int index = externalReference.lastIndexOf(marker);
        if (index < 0) {
            return null;
        }
        try {
            Integer number = Integer.parseInt(externalReference.substring(index + marker.length()));
            return houses.findByNumber(number).orElse(null);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String monthFromExternalReference(String externalReference) {
        if (externalReference == null || !externalReference.startsWith("VILA-") || externalReference.length() < 12) {
            return null;
        }
        String month = externalReference.substring(5, 12);
        return month.matches("\\d{4}-\\d{2}") ? month : null;
    }

    private String storedExternalReference(JsonNode payment, String gatewayPaymentId) {
        String externalReference = text(payment, "externalReference");
        return externalReference == null || externalReference.isBlank()
            ? "ASAAS-" + gatewayPaymentId
            : externalReference;
    }

    private PixQrCode tryQrCode(String gatewayPaymentId) {
        try {
            return gatewayClient.getPixQrCode(gatewayPaymentId);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private void applyNormalizedStatus(PixCharge charge, Contribution contribution, String status, JsonNode payment) {
        if ("PAID".equals(status)) {
            charge.status = "PAID";
            charge.paidAt = charge.paidAt == null ? LocalDateTime.now() : charge.paidAt;
            charge.receiptUrl = text(payment, "transactionReceiptUrl");
            contribution.status = "PAID";
            contribution.paidAmount = decimal(payment, "value", charge.value);
            contribution.paymentDate = contribution.paymentDate == null ? LocalDateTime.now() : contribution.paymentDate;
            contribution.paymentMethod = "PIX_ASAAS";
        } else if ("OVERDUE".equals(status)) {
            charge.status = "OVERDUE";
            contribution.status = "OVERDUE";
        } else if ("REFUNDED".equals(status)) {
            charge.status = "REFUNDED";
            contribution.status = "PENDING";
            contribution.paidAmount = BigDecimal.ZERO;
            contribution.paymentDate = null;
        } else if ("CANCELLED".equals(status)) {
            charge.status = "CANCELLED";
            contribution.status = "CANCELLED";
        } else {
            charge.status = "PENDING";
            contribution.status = "PENDING";
        }
        charge.updatedAt = LocalDateTime.now();
        contribution.updatedAt = LocalDateTime.now();
        pixCharges.save(charge);
        contributions.save(contribution);
    }

    private String normalizeGatewayStatus(String status) {
        if (status == null) {
            return "PENDING";
        }
        return switch (status) {
            case "RECEIVED", "CONFIRMED", "PAID" -> "PAID";
            case "OVERDUE" -> "OVERDUE";
            case "REFUNDED" -> "REFUNDED";
            case "DELETED", "CANCELLED" -> "CANCELLED";
            default -> "PENDING";
        };
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

    private LocalDate date(JsonNode node, String field) {
        String value = text(node, field);
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
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
        super("Token de webhook inválido.");
    }
}
