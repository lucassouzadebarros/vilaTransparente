package br.com.portalvila;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
class WebhookService {
    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);
    /** Value older installs stored in the settings table; it must never be trusted once a real token is in place. */
    static final String LEGACY_DEFAULT_SECRET = "dev-webhook-token";
    private static final Pattern CHARGE_REFERENCE = Pattern.compile("(?:VILA|C\\d+)-(\\d{4}-\\d{2})");

    private final ObjectMapper objectMapper;
    private final WebhookEventRepository events;
    private final PixChargeRepository pixCharges;
    private final DirectReceiptRepository directReceipts;
    private final ContributionRepository contributions;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final PixGatewayClient gatewayClient;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;
    private final GatewayPaymentLockService paymentLocks;
    private final ExcludedGatewayPaymentRepository excludedPayments;
    private final String configuredToken;
    private final boolean acceptStoredSecret;

    WebhookService(
        ObjectMapper objectMapper,
        WebhookEventRepository events,
        PixChargeRepository pixCharges,
        DirectReceiptRepository directReceipts,
        ContributionRepository contributions,
        HouseRepository houses,
        ResidentRepository residents,
        PixGatewayClient gatewayClient,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents,
        GatewayPaymentLockService paymentLocks,
        ExcludedGatewayPaymentRepository excludedPayments,
        @Value("${portal.asaas.webhook-token:}") String configuredToken,
        @Value("${portal.asaas.accept-stored-webhook-secret:true}") boolean acceptStoredSecret
    ) {
        this.objectMapper = objectMapper;
        this.events = events;
        this.pixCharges = pixCharges;
        this.directReceipts = directReceipts;
        this.contributions = contributions;
        this.houses = houses;
        this.residents = residents;
        this.gatewayClient = gatewayClient;
        this.settingsRepository = settingsRepository;
        this.dashboardEvents = dashboardEvents;
        this.paymentLocks = paymentLocks;
        this.excludedPayments = excludedPayments;
        this.configuredToken = configuredToken;
        this.acceptStoredSecret = acceptStoredSecret;
    }

    /** Tells the admin, in the logs, when the guessable legacy secret is still accepted. The secret is the Vila's. */
    @EventListener(ApplicationReadyEvent.class)
    void warnAboutLegacySecret() {
        TenantContext.runAs(TenantContext.VILA, this::warnAboutVilaSecret);
    }

    private void warnAboutVilaSecret() {
        if (acceptStoredSecret && LEGACY_DEFAULT_SECRET.equals(storedSecret())) {
            log.warn("O segredo do webhook gravado no banco ainda e o valor padrao '{}'. Troque o token no Asaas e em "
                + "ASAAS_WEBHOOK_TOKEN e depois defina ASAAS_ACCEPT_STORED_WEBHOOK_SECRET=false.", LEGACY_DEFAULT_SECRET);
        }
        if (isBlank(configuredToken) && isBlank(storedSecret())) {
            log.warn("Nenhum token de webhook configurado: todas as chamadas ao webhook serao recusadas.");
        }
    }

    /** The Vila's notices, at the address configured by hand in its Asaas account: checked against the server's token. */
    @Transactional
    public WebhookResult processAsaas(String token, JsonNode payload) {
        validateWebhookToken(token);
        return processVerified(payload);
    }

    /** A notice whose origin was already checked (a condominium's own address and token), inside its condominium. */
    @Transactional
    public WebhookResult processVerified(JsonNode payload) {
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

    @Transactional
    public DirectReceiptReprocessResponse reprocessDirectReceipts() {
        int checked = 0;
        int updated = 0;
        int unchanged = 0;
        int skippedNoPayload = 0;
        int failed = 0;

        for (DirectReceipt receipt : directReceipts.findAll()) {
            checked++;
            if (receipt.payloadJson == null || receipt.payloadJson.isBlank()) {
                skippedNoPayload++;
                continue;
            }
            try {
                JsonNode root = objectMapper.readTree(receipt.payloadJson);
                JsonNode payment = root.has("payment") ? root.path("payment") : root;
                String description = directReceiptDescription(payment);
                if (Objects.equals(receipt.description, description)) {
                    unchanged++;
                    continue;
                }
                receipt.description = description;
                receipt.updatedAt = LocalDateTime.now();
                directReceipts.save(receipt);
                updated++;
            } catch (RuntimeException | JsonProcessingException ex) {
                failed++;
            }
        }

        if (updated > 0) {
            dashboardEvents.publishDashboardChanged();
        }
        return new DirectReceiptReprocessResponse(checked, updated, unchanged, skippedNoPayload, failed);
    }

    /**
     * Applies a payment read straight from the Asaas API (history sync) using the same rules as a webhook,
     * without recording a webhook event. Only a received payment may become a direct receipt, so pending or
     * cancelled charges that this portal never tracked do not create noise.
     */
    boolean applySyncedPayment(String eventType, JsonNode payment) {
        String gatewayPaymentId = text(payment, "id");
        if (gatewayPaymentId == null || gatewayPaymentId.isBlank()) {
            return false;
        }
        boolean allowDirectReceipt = "PAYMENT_RECEIVED".equals(eventType);
        return paymentLocks.withLock(gatewayPaymentId,
            () -> applyPaymentEventLocked(eventType, gatewayPaymentId, payment, allowDirectReceipt));
    }

    private boolean applyPaymentEvent(String eventType, String gatewayPaymentId, JsonNode payment) {
        if (gatewayPaymentId == null || gatewayPaymentId.isBlank()) {
            return false;
        }
        return paymentLocks.withLock(gatewayPaymentId, () -> applyPaymentEventLocked(eventType, gatewayPaymentId, payment, true));
    }

    private boolean applyPaymentEventLocked(String eventType, String gatewayPaymentId, JsonNode payment, boolean allowDirectReceipt) {
        if (excludedPayments.existsByGatewayAndGatewayPaymentId("ASAAS", gatewayPaymentId)) {
            return false;
        }
        PixCharge charge = pixCharges.findByGatewayAndGatewayPaymentId("ASAAS", gatewayPaymentId).orElse(null);
        if (charge == null) {
            charge = createLocalChargeFromPayment(gatewayPaymentId, payment);
            if (charge == null) {
                return allowDirectReceipt && upsertDirectReceipt(eventType, gatewayPaymentId, payment);
            }
            markDirectReceiptLinked(gatewayPaymentId);
        }
        Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();

        switch (eventType) {
            case "PAYMENT_CREATED", "PAYMENT_UPDATED" -> {
                String status = normalizeGatewayStatus(text(payment, "status"));
                applyNormalizedStatus(charge, contribution, status, payment);
            }
            case "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED" -> {
                LocalDateTime paidMoment = paidMoment(payment);
                charge.status = "PAID";
                charge.paidAt = charge.paidAt == null ? paidMoment : charge.paidAt;
                charge.receiptUrl = text(payment, "transactionReceiptUrl");
                contribution.status = "PAID";
                contribution.paidAmount = decimal(payment, "value", charge.value);
                contribution.paymentDate = contribution.paymentDate == null ? paidMoment : contribution.paymentDate;
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
        String externalReference = text(payment, "externalReference");
        String detectedMonth = monthFromExternalReference(externalReference);
        if (detectedMonth == null) {
            detectedMonth = java.time.YearMonth.from(dueDate).toString();
        }
        final String month = detectedMonth;
        boolean additionalCharge = isAdditionalExternalReference(externalReference);
        Contribution existingContribution = contributions.findFirstByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, month).orElse(null);
        boolean existingContributionHasCharge = existingContribution != null
            && pixCharges.findByContributionId(existingContribution.id).isPresent();
        if (!additionalCharge && existingContributionHasCharge) {
            return null;
        }

        BigDecimal value = decimal(payment, "value", BigDecimal.ZERO);
        Contribution contribution = additionalCharge || existingContribution == null
            ? null
            : existingContribution;
        if (contribution == null) {
            Contribution created = new Contribution();
            created.houseId = house.id;
            created.residentId = resident.id;
            created.referenceMonth = month;
            created.amount = value;
            created.status = "PENDING";
            contribution = contributions.save(created);
        }
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

    private boolean upsertDirectReceipt(String eventType, String gatewayPaymentId, JsonNode payment) {
        if (!isDirectReceiptCandidate(payment)) {
            return false;
        }
        DirectReceipt receipt = directReceipts.findByGatewayAndGatewayPaymentId("ASAAS", gatewayPaymentId).orElse(null);
        boolean created = false;
        if (receipt == null) {
            receipt = new DirectReceipt();
            receipt.gateway = "ASAAS";
            receipt.gatewayPaymentId = gatewayPaymentId;
            receipt.createdAt = LocalDateTime.now();
            created = true;
        }

        String previousStatus = receipt.status;
        BigDecimal previousAmount = receipt.amount;
        LocalDateTime previousReceivedAt = receipt.receivedAt;
        String previousReceiptUrl = receipt.receiptUrl;
        String previousDescription = receipt.description;

        LocalDateTime receivedAt = directReceiptDate(payment);
        String description = directReceiptDescription(payment);
        receipt.externalReference = text(payment, "externalReference");
        receipt.category = "RECEBIMENTO_DIRETO";
        receipt.description = description;
        receipt.amount = decimal(payment, "value", BigDecimal.ZERO);
        receipt.receivedAt = receivedAt;
        receipt.referenceMonth = YearMonth.from(receivedAt).toString();
        receipt.status = directReceiptStatus(eventType, payment);
        receipt.receiptUrl = text(payment, "transactionReceiptUrl");
        receipt.payloadJson = write(payment);
        receipt.updatedAt = LocalDateTime.now();
        directReceipts.save(receipt);

        return created
            || !Objects.equals(previousStatus, receipt.status)
            || !Objects.equals(previousAmount, receipt.amount)
            || !Objects.equals(previousReceivedAt, receipt.receivedAt)
            || !Objects.equals(previousReceiptUrl, receipt.receiptUrl)
            || !Objects.equals(previousDescription, receipt.description);
    }

    private void markDirectReceiptLinked(String gatewayPaymentId) {
        directReceipts.findByGatewayAndGatewayPaymentId("ASAAS", gatewayPaymentId).ifPresent(receipt -> {
            receipt.status = "LINKED";
            receipt.updatedAt = LocalDateTime.now();
            directReceipts.save(receipt);
        });
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
            String suffix = externalReference.substring(index + marker.length());
            int end = 0;
            while (end < suffix.length() && Character.isDigit(suffix.charAt(end))) {
                end++;
            }
            if (end == 0) {
                return null;
            }
            Integer number = Integer.parseInt(suffix.substring(0, end));
            return houses.findByNumber(number).orElse(null);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /** "VILA-2026-05-HOUSE-01" (the Vila) or "C7-2026-05-HOUSE-01" (another condominium): the month in the middle. */
    private String monthFromExternalReference(String externalReference) {
        if (externalReference == null) {
            return null;
        }
        Matcher matcher = CHARGE_REFERENCE.matcher(externalReference);
        return matcher.lookingAt() ? matcher.group(1) : null;
    }

    private String storedExternalReference(JsonNode payment, String gatewayPaymentId) {
        String externalReference = text(payment, "externalReference");
        return externalReference == null || externalReference.isBlank()
            ? "ASAAS-" + gatewayPaymentId
            : externalReference;
    }

    private boolean isAdditionalExternalReference(String externalReference) {
        return externalReference != null && externalReference.contains("-EXTRA-");
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
            LocalDateTime paidMoment = paidMoment(payment);
            charge.status = "PAID";
            charge.paidAt = charge.paidAt == null ? paidMoment : charge.paidAt;
            charge.receiptUrl = text(payment, "transactionReceiptUrl");
            contribution.status = "PAID";
            contribution.paidAmount = decimal(payment, "value", charge.value);
            contribution.paymentDate = contribution.paymentDate == null ? paidMoment : contribution.paymentDate;
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

    private boolean isDirectReceiptCandidate(JsonNode payment) {
        String billingType = text(payment, "billingType");
        return billingType == null || billingType.isBlank() || "PIX".equalsIgnoreCase(billingType);
    }

    private String directReceiptStatus(String eventType, JsonNode payment) {
        if ("PAYMENT_RECEIVED".equals(eventType) || "PAYMENT_CONFIRMED".equals(eventType)) {
            return "PAID";
        }
        if ("PAYMENT_DELETED".equals(eventType)) {
            return "CANCELLED";
        }
        return normalizeGatewayStatus(text(payment, "status"));
    }

    /** Real payment date reported by Asaas; falls back to now when the payload carries none (live webhooks). */
    private LocalDateTime paidMoment(JsonNode payment) {
        for (String field : List.of("confirmedDate", "clientPaymentDate", "paymentDate", "creditDate")) {
            String value = text(payment, field);
            if (value != null && !value.isBlank()) {
                try {
                    return parseGatewayDate(value);
                } catch (RuntimeException ignored) {
                    // unparseable date: try the next field
                }
            }
        }
        return LocalDateTime.now();
    }

    private LocalDateTime directReceiptDate(JsonNode payment) {
        for (String field : List.of("confirmedDate", "clientPaymentDate", "paymentDate", "creditDate", "dateCreated", "dueDate")) {
            String value = text(payment, field);
            if (value != null && !value.isBlank()) {
                return parseGatewayDate(value);
            }
        }
        return LocalDateTime.now();
    }

    private LocalDateTime parseGatewayDate(String value) {
        String date = value.length() >= 10 ? value.substring(0, 10) : value;
        return LocalDate.parse(date).atStartOfDay();
    }

    private String directReceiptDescription(JsonNode payment) {
        String payerName = directReceiptPayerName(payment);
        if (payerName != null && !payerName.isBlank()) {
            return "Recebimento direto - " + payerName;
        }
        String description = text(payment, "description");
        if (description == null || description.isBlank()) {
            return "Recebimento direto via Asaas";
        }
        if (description.toLowerCase().contains("caixinha da vila")) {
            return "Recebimento direto via Asaas";
        }
        return "Recebimento direto - " + description;
    }

    private String directReceiptPayerName(JsonNode payment) {
        for (String field : List.of("customerName", "payerName", "holderName")) {
            String value = text(payment, field);
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        JsonNode payer = payment == null ? null : payment.get("payer");
        String payerName = text(payer, "name");
        if (payerName != null && !payerName.isBlank()) {
            return payerName.trim();
        }
        JsonNode customer = payment == null ? null : payment.get("customer");
        if (customer != null && customer.isObject()) {
            String customerName = text(customer, "name");
            if (customerName != null && !customerName.isBlank()) {
                return customerName.trim();
            }
        }
        String customerId = text(payment, "customer");
        return gatewayClient.findCustomerName(customerId).orElse(null);
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

    /**
     * The token must match ASAAS_WEBHOOK_TOKEN or, while accept-stored-webhook-secret is on, the secret kept in the
     * settings table. With neither configured every call is refused (it used to be accepted).
     */
    private void validateWebhookToken(String token) {
        String stored = acceptStoredSecret ? storedSecret() : null;
        String fromEnvironment = isBlank(configuredToken) ? null : configuredToken;
        if (token == null || !(sameSecret(token, fromEnvironment) || sameSecret(token, stored))) {
            throw new InvalidWebhookTokenException();
        }
    }

    private String storedSecret() {
        return settingsRepository.findAll().stream()
            .findFirst()
            .map(s -> s.webhookSecret)
            .filter(s -> !isBlank(s))
            .orElse(null);
    }

    private static boolean sameSecret(String provided, String expected) {
        return expected != null
            && MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
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
