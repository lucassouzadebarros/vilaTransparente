package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Which Asaas account the current condominium works with. A condominium that connected its own account from the panel
 * uses that key; the Vila, until it is moved to the panel, keeps using the key in the server's settings (ASAAS_API_KEY),
 * exactly as before; any other condominium has none and gets no Pix.
 */
@Component
class GatewayCredentials {
    private final GatewayConnectionRepository connections;
    private final SecretBox secrets;
    private final String serverKey;

    GatewayCredentials(GatewayConnectionRepository connections, SecretBox secrets, @Value("${portal.asaas.api-key:}") String serverKey) {
        this.connections = connections;
        this.secrets = secrets;
        this.serverKey = serverKey;
    }

    boolean connected(long condominiumId) {
        return condominiumId == TenantContext.VILA || connections.existsByCondominiumId(condominiumId);
    }

    boolean connectedHere() {
        return connected(TenantContext.current());
    }

    /** The key for the current condominium's calls to Asaas, or null when it has none. */
    String apiKeyHere() {
        long condominium = TenantContext.current();
        return connections.findByCondominiumId(condominium)
            .map(connection -> secrets.open(connection.apiKeySealed))
            .orElse(condominium == TenantContext.VILA ? serverKey : null);
    }

    /** "PAINEL" (connected from the panel), "SERVIDOR" (the Vila's server settings) or null. */
    String sourceHere() {
        long condominium = TenantContext.current();
        if (connections.existsByCondominiumId(condominium)) {
            return "PAINEL";
        }
        return condominium == TenantContext.VILA ? "SERVIDOR" : null;
    }
}

/**
 * The few calls made with a key that is not yet connected: checking it, and setting up (or removing) the notices that
 * Asaas sends to this server. Always with the key given, never with the current condominium's.
 */
@Component
class AsaasAccountClient {
    /** The events the webhook handler understands: payments, and the transfers of bills paid by Pix. */
    static final List<String> EVENTS = List.of(
        "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED",
        "TRANSFER_PENDING", "TRANSFER_IN_BANK_PROCESSING", "TRANSFER_DONE", "TRANSFER_FAILED", "TRANSFER_CANCELLED");

    private final WebClient webClient;

    AsaasAccountClient(WebClient.Builder builder, @Value("${portal.asaas.base-url}") String baseUrl, @Value("${portal.asaas.user-agent:Portal da Vila}") String userAgent) {
        this.webClient = builder.clone().baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.ACCEPT, "application/json")
            .defaultHeader(HttpHeaders.USER_AGENT, userAgent)
            .build();
    }

    /** The account's name if the key works; a clear message if Asaas refuses it. */
    String verify(String apiKey) {
        try {
            webClient.get().uri("/finance/balance").header("access_token", apiKey)
                .retrieve().bodyToMono(JsonNode.class).block(Duration.ofSeconds(15));
        } catch (WebClientResponseException.Unauthorized | WebClientResponseException.Forbidden refused) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "O Asaas não aceitou esta chave. Confira se copiou a chave inteira, da conta de produção, gerada por um usuário administrador.");
        } catch (RuntimeException failed) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Não consegui falar com o Asaas agora. Tente de novo em instantes.");
        }
        try {
            JsonNode info = webClient.get().uri("/myAccount/commercialInfo").header("access_token", apiKey)
                .retrieve().bodyToMono(JsonNode.class).block(Duration.ofSeconds(15));
            if (info == null) {
                return null;
            }
            String name = info.path("companyName").asText("");
            return name.isBlank() ? info.path("name").asText(null) : name;
        } catch (RuntimeException optional) {
            return null; // the name is a nicety: the key already proved it works
        }
    }

    /** Asks Asaas to send this account's payment notices to {@code url}, signed with {@code token}. Returns its id. */
    String createWebhook(String apiKey, String url, String token, String email) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("name", "Portal da Vila");
        body.put("url", url);
        body.put("email", email);
        body.put("enabled", true);
        body.put("interrupted", false);
        body.put("apiVersion", 3);
        body.put("authToken", token);
        body.put("sendType", "SEQUENTIALLY");
        body.put("events", EVENTS);
        try {
            JsonNode created = webClient.post().uri("/webhooks").header("access_token", apiKey).bodyValue(body)
                .retrieve().bodyToMono(JsonNode.class).block(Duration.ofSeconds(15));
            return created == null ? null : created.path("id").asText(null);
        } catch (WebClientResponseException refused) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                "O Asaas recusou configurar o aviso de pagamentos desta conta. Detalhe: " + refused.getResponseBodyAsString());
        } catch (RuntimeException failed) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Não consegui falar com o Asaas agora. Tente de novo em instantes.");
        }
    }

    /** Best effort: a webhook that cannot be removed is left behind (its notices are refused here anyway). */
    void deleteWebhook(String apiKey, String webhookId) {
        if (webhookId == null || webhookId.isBlank()) {
            return;
        }
        try {
            webClient.delete().uri("/webhooks/{id}", webhookId).header("access_token", apiKey)
                .retrieve().toBodilessEntity().block(Duration.ofSeconds(15));
        } catch (RuntimeException ignored) {
            // nothing to undo: the route stops accepting it when the connection is removed
        }
    }
}

/** The panel of a condominium: its Asaas connection. Only its administration. */
@RestController
@RequestMapping("/api/payments/asaas")
class PaymentsController {
    private final PaymentsService payments;

    PaymentsController(PaymentsService payments) {
        this.payments = payments;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    PaymentsStatus status() {
        return payments.status();
    }

    @PostMapping("/connect")
    @PreAuthorize("hasRole('ADMIN')")
    PaymentsStatus connect(@RequestBody ConnectAsaasRequest request) {
        return payments.connect(request.apiKey(), PaymentsService.currentEmail());
    }

    @DeleteMapping
    @PreAuthorize("hasRole('ADMIN')")
    PaymentsStatus disconnect() {
        return payments.disconnect();
    }
}

/** Connecting and disconnecting a condominium's own Asaas account, from its panel. */
@Service
class PaymentsService {
    private static final String TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

    private final GatewayConnectionRepository connections;
    private final GatewayCredentials credentials;
    private final AsaasAccountClient asaas;
    private final SecretBox secrets;
    private final AuditService audit;
    private final String publicApiUrl;
    private final SecureRandom random = new SecureRandom();

    PaymentsService(
        GatewayConnectionRepository connections,
        GatewayCredentials credentials,
        AsaasAccountClient asaas,
        SecretBox secrets,
        AuditService audit,
        @Value("${portal.public-api-url:http://localhost:8080}") String publicApiUrl
    ) {
        this.connections = connections;
        this.credentials = credentials;
        this.asaas = asaas;
        this.secrets = secrets;
        this.audit = audit;
        this.publicApiUrl = publicApiUrl.replaceAll("/+$", "");
    }

    PaymentsStatus status() {
        long condominium = TenantContext.current();
        return connections.findByCondominiumId(condominium)
            .map(connection -> new PaymentsStatus(true, "PAINEL", connection.accountName, connection.apiKeyHint, connection.connectedAt, connection.lastEventAt))
            .orElseGet(() -> condominium == TenantContext.VILA
                ? new PaymentsStatus(true, "SERVIDOR", null, null, null, null)
                : new PaymentsStatus(false, null, null, null, null, null));
    }

    /**
     * Checks the key with Asaas, seals it, and has Asaas send this condominium's payment notices to its own address,
     * signed with a token of its own. Connecting again with another key replaces the previous connection.
     */
    PaymentsStatus connect(String rawKey, String adminEmail) {
        long condominium = TenantContext.current();
        if (condominium == TenantContext.VILA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A Vila usa a conta Asaas configurada no servidor. Mudar isso é um passo separado.");
        }
        secrets.requireReady();
        String apiKey = rawKey == null ? "" : rawKey.trim();
        if (apiKey.length() < 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cole a chave de API inteira, como o Asaas mostrou.");
        }
        String accountName = asaas.verify(apiKey);

        connections.findByCondominiumId(condominium).ifPresent(previous -> {
            asaas.deleteWebhook(secrets.open(previous.apiKeySealed), previous.webhookId);
            connections.delete(previous);
            connections.flush();
        });

        String routeKey = randomText(32);
        String token = randomText(48);
        String webhookId = asaas.createWebhook(apiKey, publicApiUrl + "/api/webhooks/asaas/c/" + routeKey, token, adminEmail);

        GatewayConnection connection = new GatewayConnection();
        connection.condominiumId = condominium;
        connection.apiKeySealed = secrets.seal(apiKey);
        connection.apiKeyHint = apiKey.substring(apiKey.length() - 4);
        connection.accountName = accountName;
        connection.webhookId = webhookId;
        connection.routeKey = routeKey;
        connection.webhookTokenHash = SecretBox.digest(token);
        connection.connectedBy = adminEmail;
        connections.save(connection);
        audit.record("PAYMENTS_CONNECTED", "GATEWAY", connection.id,
            "Conta Asaas conectada" + (accountName == null ? "" : ": " + accountName) + " (chave final " + connection.apiKeyHint + ")");
        return status();
    }

    PaymentsStatus disconnect() {
        long condominium = TenantContext.current();
        GatewayConnection connection = connections.findByCondominiumId(condominium)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Este condomínio não tem conta Asaas conectada pelo painel."));
        asaas.deleteWebhook(secrets.open(connection.apiKeySealed), connection.webhookId);
        connections.delete(connection);
        audit.record("PAYMENTS_DISCONNECTED", "GATEWAY", connection.id, "Conta Asaas desconectada (chave final " + connection.apiKeyHint + ")");
        return status();
    }

    private String randomText(int length) {
        StringBuilder text = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            text.append(TOKEN_ALPHABET.charAt(random.nextInt(TOKEN_ALPHABET.length())));
        }
        return text.toString();
    }

    static String currentEmail() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication == null ? null : authentication.getName();
    }

    /** Marks that a notice arrived (shown in the panel as "último aviso recebido"). */
    void noticeArrived(GatewayConnection connection) {
        connection.lastEventAt = LocalDateTime.now();
        connections.save(connection);
    }
}
