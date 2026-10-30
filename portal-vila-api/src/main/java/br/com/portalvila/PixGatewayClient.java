package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

interface PixGatewayClient {
    String ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

    GatewayCustomer createOrUpdateCustomer(Resident resident);
    GatewayCharge createPixCharge(CreatePixChargeRequest request);
    Optional<GatewayCharge> findPaymentByExternalReference(String externalReference);
    List<GatewayCharge> listPixPaymentsByCustomerAndDueDateRange(String customerId, LocalDate start, LocalDate end);
    Optional<String> findCustomerName(String customerId);
    PixQrCode getPixQrCode(String gatewayPaymentId);
    GatewayPayment getPayment(String gatewayPaymentId);
    void cancelPayment(String gatewayPaymentId);
    List<JsonNode> listPixPaymentsCreatedBetween(LocalDate start, LocalDate end);
    List<JsonNode> listPixPaymentsReceivedBetween(LocalDate start, LocalDate end);
    BigDecimal getBalance();
    List<GatewayTransaction> listFinancialTransactions(LocalDate start, LocalDate end);
    /** Sends a Pix from the condominium's account to a key. Asaas answers at once; it is settled later (see getTransfer). */
    GatewayTransfer createPixTransfer(BigDecimal value, String pixKey, String pixKeyType, String description, String externalReference);
    GatewayTransfer getTransfer(String gatewayTransferId);
    /** What a Pix "copia e cola" code is: who receives it, the value, until when it can be paid. Nothing is paid. */
    PixCode decodePixCode(String payload);
    /** Pays a "copia e cola" code from the condominium's account. Like a transfer, it is settled later (see getPixTransaction). */
    GatewayTransfer payPixCode(String payload, BigDecimal value, String description);
    GatewayTransfer getPixTransaction(String gatewayTransactionId);
    /** Who holds a Pix key (name, masked CPF/CNPJ, bank), asked before sending, as a bank app shows it. Nothing is paid. */
    PixKeyOwner lookupPixKey(String pixKey, String pixKeyType);
    /** The Pix refunds of the account, each pointing to the Pix it gives money back for. Asaas sends no notice for them. */
    List<GatewayRefund> listPixRefunds();
}

/**
 * Money given back for a Pix: its own id and value, and the Pix it refers to (Asaas's id and the Central Bank's
 * end-to-end id). Only DONE ones have reached the account.
 */
record GatewayRefund(String id, String status, BigDecimal value, LocalDate effectiveDate, String receiptUrl, String originalId, String originalEndToEndId) {
    static GatewayRefund from(JsonNode node) {
        JsonNode original = node.path("originalTransaction");
        String effective = GatewayTransfer.text(node, "effectiveDate");
        return new GatewayRefund(
            GatewayTransfer.text(node, "id"),
            GatewayTransfer.text(node, "status"),
            node.hasNonNull("value") ? node.get("value").decimalValue().abs() : null,
            effective == null || effective.length() < 10 ? null : LocalDate.parse(effective.substring(0, 10)),
            GatewayTransfer.text(node, "transactionReceiptUrl"),
            GatewayTransfer.text(original, "id"),
            GatewayTransfer.text(original, "endToEndIdentifier")
        );
    }
}

/** The holder of a Pix key as the Pix directory tells it: the document comes masked ("***.202.745-**"). */
record PixKeyOwner(String name, String document, String bank) {
}

/**
 * A Pix leaving the account as Asaas sees it, in the statuses of a transfer: PENDING, BANK_PROCESSING, DONE, FAILED or
 * CANCELLED; the receipt once it is done. awaitingAuthorization: Asaas holds it until someone types the account's token.
 */
record GatewayTransfer(String id, String status, BigDecimal value, BigDecimal fee, String failReason, String receiptUrl, String endToEndId,
                       LocalDate effectiveDate, boolean awaitingAuthorization) {
    static GatewayTransfer from(JsonNode node) {
        String status = text(node, "status");
        return new GatewayTransfer(
            text(node, "id"),
            status,
            node.hasNonNull("value") ? node.get("value").decimalValue() : null,
            node.hasNonNull("transferFee") ? node.get("transferFee").decimalValue() : null,
            text(node, "failReason"),
            text(node, "transactionReceiptUrl"),
            text(node, "endToEndIdentifier"),
            date(node, "effectiveDate"),
            "PENDING".equals(status) && node.hasNonNull("authorized") && !node.get("authorized").asBoolean()
        );
    }

    /** A paid code (a Pix transaction of Asaas), told in the statuses of a transfer. */
    static GatewayTransfer fromPixTransaction(JsonNode node) {
        String status = text(node, "status");
        String asTransfer = switch (status == null ? "" : status) {
            case "DONE" -> "DONE";
            case "REQUESTED" -> "BANK_PROCESSING";
            case "REFUSED" -> "FAILED";
            case "CANCELLED" -> "CANCELLED";
            case "" -> null;
            default -> "PENDING"; // waiting for the balance, a risk check, the schedule, the token or to be sent
        };
        return new GatewayTransfer(
            text(node, "id"),
            asTransfer,
            node.hasNonNull("value") ? node.get("value").decimalValue() : null,
            node.hasNonNull("chargedFeeValue") ? node.get("chargedFeeValue").decimalValue() : null,
            text(node, "refusalReason"),
            text(node, "transactionReceiptUrl"),
            text(node, "endToEndIdentifier"),
            date(node, "effectiveDate"),
            "AWAITING_CRITICAL_ACTION_AUTHORIZATION".equals(status)
        );
    }

    private static LocalDate date(JsonNode node, String field) {
        String value = text(node, field);
        return value == null || value.length() < 10 ? null : LocalDate.parse(value.substring(0, 10));
    }

    static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }
}

/**
 * A "copia e cola" code read by Asaas. value is what is due now (with any fine, interest or discount of a code with a due
 * date); valueFixed: it can be paid only with that value. expiresAt as Asaas writes it ("2026-10-30 11:00:00").
 */
record PixCode(String payload, String pixKey, String receiverName, String receiverDocument, String bank, BigDecimal value, boolean valueFixed,
               String expiresAt, String description, boolean canBePaid, String cannotBePaidReason) {
    static PixCode from(JsonNode node) {
        JsonNode receiver = node.path("receiver");
        String trading = GatewayTransfer.text(receiver, "tradingName");
        BigDecimal total = node.hasNonNull("totalValue") ? node.get("totalValue").decimalValue() : null;
        BigDecimal value = total != null && total.signum() > 0 ? total : node.hasNonNull("value") ? node.get("value").decimalValue() : null;
        boolean differentValue = node.path("canBePaidWithDifferentValue").asBoolean(false);
        return new PixCode(
            GatewayTransfer.text(node, "payload"),
            GatewayTransfer.text(node, "pixKey"),
            trading != null ? trading : GatewayTransfer.text(receiver, "name"),
            GatewayTransfer.text(receiver, "cpfCnpj"),
            GatewayTransfer.text(receiver, "ispbName"),
            value != null && value.signum() > 0 ? value : null,
            value != null && value.signum() > 0 && !differentValue,
            GatewayTransfer.text(node, "expirationDate"),
            GatewayTransfer.text(node, "description"),
            node.path("canBePaid").asBoolean(true),
            GatewayTransfer.text(node, "cannotBePaidReason")
        );
    }
}

record GatewayCustomer(String id) {
}

/**
 * billingType: PIX, or BOLETO (a boleto that also carries a Pix QR code). finePercent and interestPercent: what Asaas adds
 * after the due date; zero or empty sends nothing, so the account's own settings in Asaas stay as they are.
 */
record CreatePixChargeRequest(
    String customerId,
    String externalReference,
    String description,
    BigDecimal value,
    LocalDate dueDate,
    String billingType,
    BigDecimal finePercent,
    BigDecimal interestPercent
) {
    CreatePixChargeRequest(String customerId, String externalReference, String description, BigDecimal value, LocalDate dueDate) {
        this(customerId, externalReference, description, value, dueDate, Settings.BILLING_PIX, null, null);
    }
}

record GatewayCharge(String id, String status, String invoiceUrl, BigDecimal value, LocalDate dueDate, String externalReference) {
}

record PixQrCode(String encodedImage, String payload, String expirationDate) {
}

record GatewayPayment(String id, String status, BigDecimal value, String receiptUrl) {
}

record GatewayTransaction(String id, LocalDate date, String type, BigDecimal value, BigDecimal balance, String description, String paymentId) {
}

@Service
class AsaasPixGatewayClient implements PixGatewayClient {
    private static final int PAGE_SIZE = 50;
    private static final int MAX_PAGES = 200;

    private final WebClient webClient;
    private final GatewayCredentials credentials;
    private final ObjectMapper objectMapper;

    AsaasPixGatewayClient(
        WebClient.Builder builder,
        ObjectMapper objectMapper,
        @Value("${portal.asaas.base-url}") String baseUrl,
        GatewayCredentials credentials,
        @Value("${portal.asaas.user-agent:Portal da Vila}") String userAgent
    ) {
        this.credentials = credentials;
        this.objectMapper = objectMapper;
        this.webClient = builder.baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.ACCEPT, "application/json")
            .defaultHeader(HttpHeaders.USER_AGENT, userAgent)
            // Each call carries the key of the condominium it is made for (its own account, or the Vila's server key).
            .filter((request, next) -> next.exchange(ClientRequest.from(request).header("access_token", keyHere()).build()))
            .build();
    }

    @Override
    public GatewayCustomer createOrUpdateCustomer(Resident resident) {
        requireVila();
        requireApiKey();
        String cpfCnpj = cpfCnpj(resident);
        Map<String, Object> payload = customerPayload(resident, cpfCnpj);
        try {
            String existingId = resident.gatewayCustomerId;
            if (existingId == null || existingId.isBlank()) {
                existingId = findCustomerIdByCpfCnpj(cpfCnpj);
            }
            Map<String, Object> response = saveCustomer(existingId, payload);
            return new GatewayCustomer(String.valueOf(response.getOrDefault("id", existingId)));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    private Map<String, Object> saveCustomer(String existingId, Map<String, Object> payload) {
        if (existingId == null || existingId.isBlank()) {
            return createCustomer(payload);
        }
        try {
            return updateCustomer(existingId, payload);
        } catch (WebClientResponseException ex) {
            if (!isMissingGatewayCustomer(ex)) {
                throw ex;
            }
            return createCustomer(payload);
        }
    }

    private Map<String, Object> createCustomer(Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        Map<String, Object> response = webClient.post()
            .uri("/customers")
            .bodyValue(payload)
            .retrieve()
            .bodyToMono(Map.class)
            .block(Duration.ofSeconds(15));
        return response;
    }

    private Map<String, Object> updateCustomer(String existingId, Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        Map<String, Object> response = webClient.put()
            .uri("/customers/{id}", existingId)
            .bodyValue(payload)
            .retrieve()
            .bodyToMono(Map.class)
            .block(Duration.ofSeconds(15));
        return response;
    }

    private boolean isMissingGatewayCustomer(WebClientResponseException ex) {
        if (ex.getStatusCode().value() == 404) {
            return true;
        }
        String message = asaasError(ex).toLowerCase();
        return message.contains("nao encontrado")
            || message.contains("não encontrado")
            || message.contains("not found")
            || message.contains("customer not found");
    }

    private String findCustomerIdByCpfCnpj(String cpfCnpj) {
        @SuppressWarnings("unchecked")
        Map<String, Object> response = webClient.get()
            .uri(builder -> builder.path("/customers").queryParam("cpfCnpj", cpfCnpj).build())
            .retrieve()
            .bodyToMono(Map.class)
            .block(Duration.ofSeconds(15));
        Object data = response == null ? null : response.get("data");
        if (data instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> customer) {
            Object id = customer.get("id");
            return id == null ? null : String.valueOf(id);
        }
        return null;
    }

    @Override
    public Optional<String> findCustomerName(String customerId) {
        requireVila();
        if (keyHere().isBlank() || customerId == null || customerId.isBlank()) {
            return Optional.empty();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.get()
                .uri("/customers/{id}", customerId)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(10));
            Object name = response == null ? null : response.get("name");
            return name == null || String.valueOf(name).isBlank()
                ? Optional.empty()
                : Optional.of(String.valueOf(name));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    private Map<String, Object> customerPayload(Resident resident, String cpfCnpj) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", resident.name);
        payload.put("email", resident.email);
        payload.put("cpfCnpj", cpfCnpj);
        payload.put("externalReference", PixService.referencePrefix() + "-HOUSE-" + String.format("%02d", resident.houseId));
        return payload;
    }

    private String cpfCnpj(Resident resident) {
        String cpfCnpj = resident.documentNumber == null || resident.documentNumber.isBlank()
            ? resident.documentMasked
            : resident.documentNumber;
        if (cpfCnpj == null || cpfCnpj.contains("*")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cadastre CPF/CNPJ completo do morador antes de sincronizar com o Asaas.");
        }
        return cpfCnpj;
    }

    private String asaasError(WebClientResponseException ex) {
        String body = ex.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return "falha na comunicação com o gateway.";
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode errors = root.path("errors");
            if (errors.isArray() && errors.size() > 0) {
                JsonNode first = errors.get(0);
                String description = first.path("description").asText("");
                if (!description.isBlank()) {
                    return description;
                }
            }
        } catch (Exception ignored) {
        }
        return body.length() > 300 ? body.substring(0, 300) : body;
    }

    @Override
    public GatewayCharge createPixCharge(CreatePixChargeRequest request) {
        requireVila();
        requireApiKey();

        Map<String, Object> body = new HashMap<>();
        body.put("customer", request.customerId());
        body.put("billingType", Settings.BILLING_BOLETO.equals(request.billingType()) ? Settings.BILLING_BOLETO : Settings.BILLING_PIX);
        body.put("value", request.value());
        body.put("dueDate", request.dueDate().format(DateTimeFormatter.ISO_DATE));
        body.put("description", request.description());
        body.put("externalReference", request.externalReference());
        if (request.finePercent() != null && request.finePercent().signum() > 0) {
            body.put("fine", Map.of("value", request.finePercent(), "type", "PERCENTAGE"));
        }
        if (request.interestPercent() != null && request.interestPercent().signum() > 0) {
            body.put("interest", Map.of("value", request.interestPercent()));
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.post()
                .uri("/payments")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            return new GatewayCharge(
                String.valueOf(response.get("id")),
                String.valueOf(response.getOrDefault("status", "PENDING")),
                response.get("invoiceUrl") == null ? null : String.valueOf(response.get("invoiceUrl")),
                request.value(),
                request.dueDate(),
                request.externalReference()
            );
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public Optional<GatewayCharge> findPaymentByExternalReference(String externalReference) {
        requireVila();
        requireApiKey();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.get()
                .uri(builder -> builder.path("/payments")
                    .queryParam("externalReference", externalReference)
                    .queryParam("limit", 10)
                    .build())
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            Object data = response == null ? null : response.get("data");
            if (data instanceof List<?> list) {
                return list.stream()
                    .filter(Map.class::isInstance)
                    .map(item -> toGatewayCharge((Map<?, ?>) item))
                    .filter(charge -> !"CANCELLED".equals(charge.status()) && !"DELETED".equals(charge.status()))
                    .findFirst();
            }
            return Optional.empty();
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public List<GatewayCharge> listPixPaymentsByCustomerAndDueDateRange(String customerId, LocalDate start, LocalDate end) {
        requireVila();
        requireApiKey();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.get()
                .uri(builder -> builder.path("/payments")
                    .queryParam("customer", customerId)
                    .queryParam("billingType", "PIX")
                    .queryParam("dueDate[ge]", start.format(DateTimeFormatter.ISO_DATE))
                    .queryParam("dueDate[le]", end.format(DateTimeFormatter.ISO_DATE))
                    .queryParam("limit", 100)
                    .build())
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            Object data = response == null ? null : response.get("data");
            if (data instanceof List<?> list) {
                return list.stream()
                    .filter(Map.class::isInstance)
                    .map(item -> toGatewayCharge((Map<?, ?>) item))
                    .filter(charge -> !"CANCELLED".equals(charge.status()) && !"DELETED".equals(charge.status()))
                    .toList();
            }
            return List.of();
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    private GatewayCharge toGatewayCharge(Map<?, ?> response) {
        Object status = response.get("status");
        return new GatewayCharge(
            String.valueOf(response.get("id")),
            status == null ? "PENDING" : String.valueOf(status),
            response.get("invoiceUrl") == null ? null : String.valueOf(response.get("invoiceUrl")),
            response.get("value") == null ? null : new BigDecimal(String.valueOf(response.get("value"))),
            response.get("dueDate") == null ? null : LocalDate.parse(String.valueOf(response.get("dueDate"))),
            response.get("externalReference") == null ? null : String.valueOf(response.get("externalReference"))
        );
    }

    @Override
    public PixQrCode getPixQrCode(String gatewayPaymentId) {
        requireVila();
        requireApiKey();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.get()
                .uri("/payments/{id}/pixQrCode", gatewayPaymentId)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            return new PixQrCode(
                String.valueOf(response.get("encodedImage")),
                String.valueOf(response.get("payload")),
                String.valueOf(response.get("expirationDate"))
            );
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public GatewayPayment getPayment(String gatewayPaymentId) {
        requireVila();
        requireApiKey();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.get()
                .uri("/payments/{id}", gatewayPaymentId)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            return new GatewayPayment(
                String.valueOf(response.get("id")),
                String.valueOf(response.get("status")),
                new BigDecimal(String.valueOf(response.getOrDefault("value", "0"))),
                response.get("transactionReceiptUrl") == null ? null : String.valueOf(response.get("transactionReceiptUrl"))
            );
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public void cancelPayment(String gatewayPaymentId) {
        requireVila();
        requireApiKey();
        try {
            webClient.delete()
                .uri("/payments/{id}", gatewayPaymentId)
                .retrieve()
                .bodyToMono(Void.class)
                .block(Duration.ofSeconds(15));
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public List<JsonNode> listPixPaymentsCreatedBetween(LocalDate start, LocalDate end) {
        requireVila();
        Map<String, String> filters = new HashMap<>();
        filters.put("billingType", "PIX");
        filters.put("dateCreated[ge]", start.format(DateTimeFormatter.ISO_DATE));
        filters.put("dateCreated[le]", end.format(DateTimeFormatter.ISO_DATE));
        return fetchAllPages("/payments", filters);
    }

    @Override
    public List<JsonNode> listPixPaymentsReceivedBetween(LocalDate start, LocalDate end) {
        requireVila();
        Map<String, String> filters = new HashMap<>();
        filters.put("billingType", "PIX");
        filters.put("paymentDate[ge]", start.format(DateTimeFormatter.ISO_DATE));
        filters.put("paymentDate[le]", end.format(DateTimeFormatter.ISO_DATE));
        return fetchAllPages("/payments", filters);
    }

    @Override
    public BigDecimal getBalance() {
        requireVila();
        requireApiKey();
        try {
            JsonNode response = webClient.get()
                .uri("/finance/balance")
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(15));
            JsonNode balance = response == null ? null : response.get("balance");
            if (balance == null || balance.isNull()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: resposta de saldo sem o campo balance.");
            }
            return balance.decimalValue();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public List<GatewayTransaction> listFinancialTransactions(LocalDate start, LocalDate end) {
        requireVila();
        Map<String, String> filters = new HashMap<>();
        filters.put("startDate", start.format(DateTimeFormatter.ISO_DATE));
        filters.put("finishDate", end.format(DateTimeFormatter.ISO_DATE));
        filters.put("order", "asc");
        return fetchAllPages("/financialTransactions", filters).stream()
            .map(item -> new GatewayTransaction(
                item.path("id").asText(null),
                item.hasNonNull("date") ? LocalDate.parse(item.get("date").asText().substring(0, 10)) : null,
                item.path("type").asText(""),
                item.hasNonNull("value") ? item.get("value").decimalValue() : BigDecimal.ZERO,
                item.hasNonNull("balance") ? item.get("balance").decimalValue() : null,
                item.path("description").asText(""),
                item.path("paymentId").asText(null)
            ))
            .toList();
    }

    @Override
    public GatewayTransfer createPixTransfer(BigDecimal value, String pixKey, String pixKeyType, String description, String externalReference) {
        requireVila();
        requireApiKey();
        Map<String, Object> body = new HashMap<>();
        body.put("value", value);
        body.put("pixAddressKey", pixKey);
        body.put("pixAddressKeyType", pixKeyType);
        body.put("operationType", "PIX");
        body.put("description", description);
        body.put("externalReference", externalReference);
        try {
            JsonNode response = webClient.post()
                .uri("/transfers")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(20));
            if (response == null || !response.hasNonNull("id")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: a transferência não voltou com um identificador.");
            }
            return GatewayTransfer.from(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public GatewayTransfer getTransfer(String gatewayTransferId) {
        requireVila();
        requireApiKey();
        try {
            JsonNode response = webClient.get()
                .uri("/transfers/{id}", gatewayTransferId)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(15));
            if (response == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: a consulta da transferência veio vazia.");
            }
            return GatewayTransfer.from(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public PixCode decodePixCode(String payload) {
        requireVila();
        requireApiKey();
        try {
            JsonNode response = webClient.post()
                .uri("/pix/qrCodes/decode")
                .bodyValue(Map.of("payload", payload))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(15));
            if (response == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: a leitura do código veio vazia.");
            }
            return PixCode.from(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            // A code Asaas cannot read is the person's mistake (a piece missing in the copy), not the gateway's.
            HttpStatus status = ex.getStatusCode().is4xxClientError() ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY;
            throw new ResponseStatusException(status, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public GatewayTransfer payPixCode(String payload, BigDecimal value, String description) {
        requireVila();
        requireApiKey();
        Map<String, Object> body = new HashMap<>();
        body.put("qrCode", Map.of("payload", payload));
        body.put("value", value);
        body.put("description", description);
        try {
            JsonNode response = webClient.post()
                .uri("/pix/qrCodes/pay")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(20));
            if (response == null || !response.hasNonNull("id")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o pagamento do código não voltou com um identificador.");
            }
            return GatewayTransfer.fromPixTransaction(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    /**
     * Both kinds of Pix refund: the one that gives back a Pix this account sent, and the one this account gives back. Only
     * the first can point to a Pix sent here, so asking for both does no harm and does not depend on how Asaas names them.
     */
    @Override
    public List<GatewayRefund> listPixRefunds() {
        requireVila();
        List<GatewayRefund> refunds = new ArrayList<>();
        for (String type : List.of("DEBIT_REFUND", "CREDIT_REFUND")) {
            fetchAllPages("/pix/transactions", Map.of("type", type)).stream().map(GatewayRefund::from).forEach(refunds::add);
        }
        return refunds;
    }

    @Override
    public PixKeyOwner lookupPixKey(String pixKey, String pixKeyType) {
        requireVila();
        requireApiKey();
        try {
            JsonNode response = webClient.get()
                .uri(builder -> builder.path("/pix/addressKeys/external").queryParam("type", pixKeyType).queryParam("key", pixKey).build())
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(15));
            if (response == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: a consulta da chave veio vazia.");
            }
            JsonNode owner = response.path("owner");
            String bank = GatewayTransfer.text(response.path("financialInstitution"), "name");
            return new PixKeyOwner(
                GatewayTransfer.text(owner, "name"),
                GatewayTransfer.text(owner, "cpfCnpj"),
                bank != null ? bank : GatewayTransfer.text(response, "ispbName")
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            // A key that does not exist is the person's typing, not the gateway failing; too many lookups wait a little.
            if (ex.getStatusCode().value() == 429) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "O Asaas pediu uma pausa nas consultas de chave. Tente de novo em alguns minutos.", ex);
            }
            HttpStatus status = ex.getStatusCode().is4xxClientError() ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY;
            throw new ResponseStatusException(status, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public GatewayTransfer getPixTransaction(String gatewayTransactionId) {
        requireVila();
        requireApiKey();
        try {
            JsonNode response = webClient.get()
                .uri("/pix/transactions/{id}", gatewayTransactionId)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(15));
            if (response == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: a consulta do pagamento do código veio vazia.");
            }
            return GatewayTransfer.fromPixTransaction(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    private List<JsonNode> fetchAllPages(String path, Map<String, String> filters) {
        requireApiKey();
        List<JsonNode> all = new ArrayList<>();
        try {
            int offset = 0;
            for (int page = 0; page < MAX_PAGES; page++) {
                int currentOffset = offset;
                JsonNode response = webClient.get()
                    .uri(builder -> {
                        builder.path(path);
                        filters.forEach(builder::queryParam);
                        return builder.queryParam("offset", currentOffset).queryParam("limit", PAGE_SIZE).build();
                    })
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(30));
                JsonNode data = response == null ? null : response.get("data");
                if (data == null || !data.isArray()) {
                    return all;
                }
                data.forEach(all::add);
                if (!response.path("hasMore").asBoolean(false)) {
                    return all;
                }
                offset += PAGE_SIZE;
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: listagem excedeu o limite de páginas; reduza o período.");
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway não respondeu dentro do tempo esperado.", ex);
        }
    }

    /** Before any call to Asaas: the condominium must have an account connected (the Vila has the server's). */
    private void requireVila() {
        if (!credentials.connectedHere()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O Pix ainda não está ligado a este condomínio. Conecte a conta Asaas em Configurações.");
        }
    }

    private void requireApiKey() {
        String key = credentials.apiKeyHere();
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED, "Configure ASAAS_API_KEY para usar o gateway Asaas.");
        }
    }

    private String keyHere() {
        String key = credentials.apiKeyHere();
        return key == null ? "" : key;
    }
}
