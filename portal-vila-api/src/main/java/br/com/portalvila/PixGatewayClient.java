package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

interface PixGatewayClient {
    String ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

    GatewayCustomer createOrUpdateCustomer(Resident resident);
    GatewayCharge createPixCharge(CreatePixChargeRequest request);
    PixQrCode getPixQrCode(String gatewayPaymentId);
    GatewayPayment getPayment(String gatewayPaymentId);
    void cancelPayment(String gatewayPaymentId);
}

record GatewayCustomer(String id) {
}

record CreatePixChargeRequest(
    String customerId,
    String externalReference,
    String description,
    BigDecimal value,
    LocalDate dueDate
) {
}

record GatewayCharge(String id, String status, String invoiceUrl) {
}

record PixQrCode(String encodedImage, String payload, String expirationDate) {
}

record GatewayPayment(String id, String status, BigDecimal value, String receiptUrl) {
}

@Service
class AsaasPixGatewayClient implements PixGatewayClient {
    private final WebClient webClient;
    private final String apiKey;
    private final ObjectMapper objectMapper;

    AsaasPixGatewayClient(
        WebClient.Builder builder,
        ObjectMapper objectMapper,
        @Value("${portal.asaas.base-url}") String baseUrl,
        @Value("${portal.asaas.api-key:}") String apiKey,
        @Value("${portal.asaas.user-agent:Portal da Vila}") String userAgent
    ) {
        this.apiKey = apiKey;
        this.objectMapper = objectMapper;
        this.webClient = builder.baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.ACCEPT, "application/json")
            .defaultHeader(HttpHeaders.USER_AGENT, userAgent)
            .defaultHeader("access_token", apiKey == null ? "" : apiKey)
            .build();
    }

    @Override
    public GatewayCustomer createOrUpdateCustomer(Resident resident) {
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
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway nao respondeu dentro do tempo esperado.", ex);
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

    private Map<String, Object> customerPayload(Resident resident, String cpfCnpj) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", resident.name);
        payload.put("email", resident.email);
        payload.put("cpfCnpj", cpfCnpj);
        payload.put("externalReference", "VILA-HOUSE-" + String.format("%02d", resident.houseId));
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
            return "falha na comunicacao com o gateway.";
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
        requireApiKey();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClient.post()
                .uri("/payments")
                .bodyValue(Map.of(
                    "customer", request.customerId(),
                    "billingType", "PIX",
                    "value", request.value(),
                    "dueDate", request.dueDate().format(DateTimeFormatter.ISO_DATE),
                    "description", request.description(),
                    "externalReference", request.externalReference()
                ))
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));
            return new GatewayCharge(
                String.valueOf(response.get("id")),
                String.valueOf(response.getOrDefault("status", "PENDING")),
                response.get("invoiceUrl") == null ? null : String.valueOf(response.get("invoiceUrl"))
            );
        } catch (WebClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: " + asaasError(ex), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway nao respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public PixQrCode getPixQrCode(String gatewayPaymentId) {
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
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway nao respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public GatewayPayment getPayment(String gatewayPaymentId) {
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
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway nao respondeu dentro do tempo esperado.", ex);
        }
    }

    @Override
    public void cancelPayment(String gatewayPaymentId) {
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
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Asaas: o gateway nao respondeu dentro do tempo esperado.", ex);
        }
    }

    private void requireApiKey() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED, "Configure ASAAS_API_KEY para usar o gateway Asaas.");
        }
    }
}
