package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A condominium connects its own Asaas account from the panel: the key is checked and sealed, Asaas is asked to send the
 * notices to the condominium's own address, every call goes out with that condominium's key, and the Vila keeps the
 * server's key and its old address. Asaas here is a small fake server that records what it receives.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "portal.asaas.base-url=http://127.0.0.1:18972/v3",
    "portal.asaas.api-key=" + GatewayConnectionTest.VILA_KEY,
    "portal.secrets.key=segredo-dos-testes",
    "portal.public-api-url=https://api.teste.dev/"
})
class GatewayConnectionTest {
    static final String VILA_KEY = "$aact_chave_da_vila_no_servidor_0001";
    static final String CONDO_KEY = "$aact_chave_do_bela_vista_0001";
    static final String OTHER_KEY = "$aact_chave_do_bela_vista_0002";
    private static final Set<String> VALID = Set.of(VILA_KEY, CONDO_KEY, OTHER_KEY);

    record Call(String method, String path, String key, String body) {
    }

    private static HttpServer asaas;
    private static final List<Call> calls = new CopyOnWriteArrayList<>();
    private static int webhooks;

    @BeforeAll
    static void fakeAsaas() throws IOException {
        asaas = HttpServer.create(new InetSocketAddress("127.0.0.1", 18972), 0);
        asaas.createContext("/v3", exchange -> {
            String path = exchange.getRequestURI().getPath().substring(3);
            String key = exchange.getRequestHeaders().getFirst("access_token");
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(exchange.getRequestMethod(), path, key, body));
            if (!VALID.contains(key)) {
                answer(exchange, 401, "{\"errors\":[{\"code\":\"invalid_access_token\"}]}");
            } else if (path.equals("/finance/balance")) {
                answer(exchange, 200, "{\"balance\":321.45}");
            } else if (path.equals("/myAccount/commercialInfo")) {
                answer(exchange, 200, "{\"companyName\":\"Condomínio Bela Vista\"}");
            } else if (path.equals("/webhooks") && exchange.getRequestMethod().equals("POST")) {
                answer(exchange, 200, "{\"id\":\"wh_" + (++webhooks) + "\"}");
            } else if (path.startsWith("/webhooks/") && exchange.getRequestMethod().equals("DELETE")) {
                answer(exchange, 200, "{\"deleted\":true}");
            } else if (path.startsWith("/customers/")) {
                answer(exchange, 200, "{\"name\":\"Pessoa Pagadora\"}");
            } else {
                answer(exchange, 404, "{}");
            }
        });
        asaas.start();
    }

    private static void answer(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @AfterAll
    static void stopFakeAsaas() {
        asaas.stop(0);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired GatewayConnectionRepository connections;
    @Autowired WebhookEventRepository webhookEvents;
    @Autowired DirectReceiptRepository receipts;
    @Autowired AuditEntryRepository auditEntries;
    @Autowired PixGatewayClient gateway;

    private final List<Runnable> cleanup = new ArrayList<>();
    private Condominium belaVista;
    private String manager;
    private String vilaAdmin;

    @BeforeEach
    void aCondominiumWithItsAdministrator() {
        calls.clear();
        if (!condominiums.existsById(TenantContext.VILA)) {
            jdbc.update("insert into condominiums(id, name, slug, status, created_at) values (?, 'Vila', ?, 'ACTIVE', current_timestamp)",
                TenantContext.VILA, "vila-" + UUID.randomUUID());
            cleanup.add(() -> condominiums.deleteById(TenantContext.VILA));
            Long next = jdbc.queryForObject("select max(id) + 1 from condominiums", Long.class);
            jdbc.execute("alter table condominiums alter column id restart with " + next);
        }
        belaVista = condominiums.save(new Condominium("Residencial Bela Vista", "bela-vista-" + UUID.randomUUID()));
        long id = belaVista.id;
        cleanup.add(() -> {
            connections.findByCondominiumId(id).ifPresent(connections::delete);
            webhookEvents.findAll().stream().filter(event -> event.condominiumId == id).forEach(webhookEvents::delete);
            TenantContext.runAs(id, () -> {
                receipts.deleteAll();
                auditEntries.deleteAll();
            });
            condominiums.deleteById(id);
        });
        manager = "Bearer " + jwt.issue(account(id));
        vilaAdmin = "Bearer " + jwt.issue(account(TenantContext.VILA));
    }

    private AppUser account(long condominium) {
        AppUser account = new AppUser("Gestão", "gestao-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null);
        account.condominiumId = condominium;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));
        return saved;
    }

    @AfterEach
    void removeWhatThisTestCreated() {
        Collections.reverse(cleanup);
        cleanup.forEach(Runnable::run);
        cleanup.clear();
    }

    private JsonNode call(MockHttpServletRequestBuilder request, String authorization, String body, int expected) throws Exception {
        request.contentType(MediaType.APPLICATION_JSON).content(body);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        String answer = mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return answer.isBlank() ? null : json.readTree(answer);
    }

    private JsonNode connect(String key) throws Exception {
        return call(post("/api/payments/asaas/connect"), manager, "{\"apiKey\":\"" + key + "\"}", 200);
    }

    private JsonNode webhookCreated() throws Exception {
        Call created = calls.stream().filter(c -> c.method().equals("POST") && c.path().equals("/webhooks")).reduce((a, b) -> b).orElseThrow();
        return json.readTree(created.body());
    }

    @Test
    void connectingChecksTheKeySealsItAndSetsUpTheNoticesOfTheCondominium() throws Exception {
        JsonNode status = connect("  " + CONDO_KEY + " ");

        assertThat(status.get("connected").asBoolean()).isTrue();
        assertThat(status.get("source").asText()).isEqualTo("PAINEL");
        assertThat(status.get("accountName").asText()).isEqualTo("Condomínio Bela Vista");
        assertThat(status.get("keyHint").asText()).isEqualTo("0001");
        assertThat(status.toString()).doesNotContain(CONDO_KEY);

        JsonNode webhook = webhookCreated();
        assertThat(webhook.get("url").asText()).startsWith("https://api.teste.dev/api/webhooks/asaas/c/");
        assertThat(webhook.get("authToken").asText()).hasSizeGreaterThanOrEqualTo(32);
        assertThat(webhook.get("events").toString()).contains("PAYMENT_RECEIVED", "PAYMENT_CONFIRMED");
        assertThat(calls).filteredOn(c -> c.path().equals("/webhooks")).allMatch(c -> c.key().equals(CONDO_KEY));

        String stored = jdbc.queryForObject("select api_key_sealed from gateway_connections where condominium_id = ?", String.class, belaVista.id);
        assertThat(stored).startsWith("v1:").doesNotContain(CONDO_KEY).doesNotContain("bela_vista");
        assertThat(call(get("/api/session"), manager, "", 200).get("condominium").get("pixConnected").asBoolean()).isTrue();
    }

    @Test
    void everyCallToAsaasGoesWithTheKeyOfItsOwnCondominium() throws Exception {
        connect(CONDO_KEY);
        calls.clear();

        TenantContext.runAs(belaVista.id, gateway::getBalance);
        TenantContext.runAs(TenantContext.VILA, gateway::getBalance);

        assertThat(calls).extracting(Call::key).containsExactly(CONDO_KEY, VILA_KEY);
        // A condominium without an account reaches no one's.
        assertThatThrownBy(() -> TenantContext.runAs(987654L, gateway::getBalance))
            .isInstanceOfSatisfying(ResponseStatusException.class, refused -> assertThat(refused.getStatusCode().value()).isEqualTo(409));
        assertThat(calls).hasSize(2);
    }

    @Test
    void aKeyAsaasRefusesLeavesNothingBehind() throws Exception {
        JsonNode refused = call(post("/api/payments/asaas/connect"), manager, "{\"apiKey\":\"$aact_uma_chave_que_nao_existe_99\"}", 400);

        assertThat(refused.get("error").asText()).contains("não aceitou");
        assertThat(connections.findByCondominiumId(belaVista.id)).isEmpty();
        assertThat(calls).noneMatch(c -> c.path().equals("/webhooks"));
        call(post("/api/payments/asaas/connect"), manager, "{\"apiKey\":\"curta\"}", 400);
    }

    @Test
    void theNoticesEnterOnlyWithTheirTokenAndLandInTheirCondominium() throws Exception {
        connect(CONDO_KEY);
        JsonNode webhook = webhookCreated();
        String path = webhook.get("url").asText().replace("https://api.teste.dev", "");
        String token = webhook.get("authToken").asText();
        String eventId = "evt_" + UUID.randomUUID();
        String notice = "{\"id\":\"" + eventId + "\",\"event\":\"PAYMENT_RECEIVED\",\"payment\":{\"id\":\"pay_" + UUID.randomUUID()
            + "\",\"customer\":\"cus_teste\",\"value\":15.5,\"netValue\":15.0,\"billingType\":\"PIX\",\"status\":\"RECEIVED\","
            + "\"paymentDate\":\"2026-10-28\",\"dateCreated\":\"2026-10-28\",\"description\":\"Mensalidade\"}}";

        mvc.perform(post(path).header("asaas-access-token", "outro-token").contentType(MediaType.APPLICATION_JSON).content(notice))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/webhooks/asaas/c/rota-que-nao-existe").header("asaas-access-token", token).contentType(MediaType.APPLICATION_JSON).content(notice))
            .andExpect(status().isUnauthorized());
        mvc.perform(post(path).header("asaas-access-token", token).contentType(MediaType.APPLICATION_JSON).content(notice))
            .andExpect(status().isOk());

        Long stamped = jdbc.queryForObject("select condominium_id from webhook_events where event_id = ?", Long.class, eventId);
        assertThat(stamped).isEqualTo(belaVista.id);
        assertThat(call(get("/api/payments/asaas"), manager, "", 200).get("lastEventAt").isNull()).isFalse();
    }

    @Test
    void disconnectingRemovesTheNoticesAndThePixAgain() throws Exception {
        connect(CONDO_KEY);
        String webhookId = connections.findByCondominiumId(belaVista.id).orElseThrow().webhookId;

        JsonNode status = call(delete("/api/payments/asaas"), manager, "", 200);

        assertThat(status.get("connected").asBoolean()).isFalse();
        assertThat(calls).anyMatch(c -> c.method().equals("DELETE") && c.path().equals("/webhooks/" + webhookId) && c.key().equals(CONDO_KEY));
        assertThat(connections.findByCondominiumId(belaVista.id)).isEmpty();
        assertThatThrownBy(() -> TenantContext.runAs(belaVista.id, gateway::getBalance)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void connectingAgainWithAnotherKeyReplacesTheFirstConnection() throws Exception {
        connect(CONDO_KEY);
        String firstWebhook = connections.findByCondominiumId(belaVista.id).orElseThrow().webhookId;

        connect(OTHER_KEY);

        assertThat(calls).anyMatch(c -> c.method().equals("DELETE") && c.path().equals("/webhooks/" + firstWebhook));
        assertThat(connections.findByCondominiumId(belaVista.id).orElseThrow().apiKeyHint).isEqualTo("0002");
        calls.clear();
        TenantContext.runAs(belaVista.id, gateway::getBalance);
        assertThat(calls).extracting(Call::key).containsExactly(OTHER_KEY);
    }

    @Test
    void theVilaKeepsTheServerKeyAndCannotBeConnectedFromThePanel() throws Exception {
        JsonNode status = call(get("/api/payments/asaas"), vilaAdmin, "", 200);
        assertThat(status.get("connected").asBoolean()).isTrue();
        assertThat(status.get("source").asText()).isEqualTo("SERVIDOR");

        call(post("/api/payments/asaas/connect"), vilaAdmin, "{\"apiKey\":\"" + CONDO_KEY + "\"}", 409);
        assertThat(connections.findByCondominiumId(TenantContext.VILA)).isEmpty();
        assertThat(calls).isEmpty();
    }

    @Test
    void onlyTheAdministrationSeesOrChangesTheConnection() throws Exception {
        AppUser resident = new AppUser("Morador", "morador-" + UUID.randomUUID() + "@teste.dev", "x", "RESIDENT", null);
        resident.condominiumId = belaVista.id;
        AppUser saved = users.save(resident);
        cleanup.add(() -> users.deleteById(saved.id));
        String token = "Bearer " + jwt.issue(saved);

        call(get("/api/payments/asaas"), token, "", 403);
        call(post("/api/payments/asaas/connect"), token, "{\"apiKey\":\"" + CONDO_KEY + "\"}", 403);
        call(get("/api/payments/asaas"), null, "", 401);
    }
}
