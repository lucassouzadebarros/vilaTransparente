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

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Charging the units from the web panel: each condominium's rules (Pix or boleto with Pix, late fee, interest, the name of
 * the charge) reach Asaas, a batch charges unit by unit, and the month shows what each unit owes. The Vila keeps charging
 * exactly as before. Asaas here is a small fake server that records what it receives.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "portal.asaas.base-url=http://127.0.0.1:18973/v3",
    "portal.asaas.api-key=" + BillingTest.VILA_KEY,
    "portal.secrets.key=segredo-dos-testes-de-cobranca"
})
class BillingTest {
    static final String VILA_KEY = "$aact_chave_da_vila_cobranca_0001";
    static final String CONDO_KEY = "$aact_chave_do_jardim_cobranca_0002";
    private static final Set<String> VALID = Set.of(VILA_KEY, CONDO_KEY);

    record Call(String method, String path, String key, String body) {
    }

    private static HttpServer asaas;
    private static final List<Call> calls = new CopyOnWriteArrayList<>();
    private static final AtomicInteger ids = new AtomicInteger();

    @BeforeAll
    static void fakeAsaas() throws IOException {
        asaas = HttpServer.create(new InetSocketAddress("127.0.0.1", 18973), 0);
        asaas.createContext("/v3", exchange -> {
            String path = exchange.getRequestURI().getPath().substring(3);
            String method = exchange.getRequestMethod();
            String key = exchange.getRequestHeaders().getFirst("access_token");
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(method, path, key, body));
            if (!VALID.contains(key)) {
                answer(exchange, 401, "{\"errors\":[{\"code\":\"invalid_access_token\"}]}");
            } else if (path.equals("/customers") && method.equals("GET") || path.equals("/payments") && method.equals("GET")) {
                answer(exchange, 200, "{\"data\":[]}");
            } else if (path.startsWith("/customers")) {
                answer(exchange, 200, "{\"id\":\"cus_" + ids.incrementAndGet() + "\"}");
            } else if (path.equals("/payments") && method.equals("POST")) {
                String id = "pay_" + ids.incrementAndGet();
                answer(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"PENDING\",\"invoiceUrl\":\"https://asaas.test/i/" + id + "\"}");
            } else if (path.endsWith("/pixQrCode")) {
                answer(exchange, 200, "{\"encodedImage\":\"QUFB\",\"payload\":\"00020126pix\",\"expirationDate\":\"2027-12-31 23:59:59\"}");
            } else if (path.startsWith("/payments/")) {
                answer(exchange, 200, "{\"id\":\"" + path.substring(10) + "\",\"status\":\"PENDING\",\"value\":0}");
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
    @Autowired SecretBox secrets;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired GatewayConnectionRepository connections;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired ContributionRepository contributions;
    @Autowired PixChargeRepository pixCharges;
    @Autowired SettingsRepository settings;
    @Autowired AuditEntryRepository auditEntries;
    @Autowired WebhookEventRepository webhookEvents;
    @Autowired PixService pix;
    @Autowired WebhookService webhooks;

    private final List<Runnable> cleanup = new ArrayList<>();
    private long jardim;
    private String manager;
    private final String nextMonth = YearMonth.now().plusMonths(1).toString();
    private final String lastMonth = YearMonth.now().minusMonths(1).toString();

    @BeforeEach
    void aCondominiumWithThreeUnits() {
        calls.clear();
        if (!condominiums.existsById(TenantContext.VILA)) {
            jdbc.update("insert into condominiums(id, name, slug, status, created_at) values (?, 'Vila', ?, 'ACTIVE', current_timestamp)",
                TenantContext.VILA, "vila-" + UUID.randomUUID());
            cleanup.add(() -> condominiums.deleteById(TenantContext.VILA));
            Long next = jdbc.queryForObject("select max(id) + 1 from condominiums", Long.class);
            jdbc.execute("alter table condominiums alter column id restart with " + next);
        }
        jardim = condominiums.save(new Condominium("Residencial Jardim", "jardim-" + UUID.randomUUID())).id;
        long id = jardim;
        cleanup.add(() -> {
            connections.findByCondominiumId(id).ifPresent(connections::delete);
            webhookEvents.findAll().stream().filter(event -> event.condominiumId == id).forEach(webhookEvents::delete);
            TenantContext.runAs(id, () -> {
                pixCharges.deleteAll();
                contributions.deleteAll();
                residents.deleteAll();
                houses.deleteAll();
                settings.deleteAll();
                auditEntries.deleteAll();
            });
            condominiums.deleteById(id);
        });

        GatewayConnection connection = new GatewayConnection();
        connection.condominiumId = jardim;
        connection.apiKeySealed = secrets.seal(CONDO_KEY);
        connection.apiKeyHint = "0002";
        connection.routeKey = UUID.randomUUID().toString();
        connection.webhookTokenHash = SecretBox.digest("token");
        connections.save(connection);

        TenantContext.runAs(jardim, () -> {
            House one = houses.save(new House(1, "Casa 1"));
            House two = houses.save(new House(2, "Casa 2"));
            houses.save(new House(3, "Casa 3"));
            resident(one.id, "52998224725");
            // No full CPF: Asaas cannot have this person as a customer yet.
            resident(two.id, null);
        });
        AppUser account = new AppUser("Síndica", "sindica-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null);
        account.condominiumId = jardim;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));
        manager = "Bearer " + jwt.issue(saved);
    }

    private Resident resident(Long houseId, String cpf) {
        Resident resident = new Resident(houseId, "Morador " + houseId, "morador-" + UUID.randomUUID() + "@teste.dev", null, cpf == null ? "***.***.***-**" : null);
        resident.documentNumber = cpf;
        return residents.save(resident);
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

    private List<JsonNode> paymentsSent() throws Exception {
        List<JsonNode> sent = new ArrayList<>();
        for (Call call : calls) {
            if (call.method().equals("POST") && call.path().equals("/payments")) {
                sent.add(json.readTree(call.body()));
            }
        }
        return sent;
    }

    @Test
    void theRulesOfTheCondominiumReachAsaasWithItsOwnKey() throws Exception {
        JsonNode rules = call(put("/api/settings/billing"), manager,
            "{\"billingType\":\"BOLETO\",\"finePercent\":2,\"interestPercent\":1,\"chargeTitle\":\" Taxa  condominial \"}", 200);
        assertThat(rules.get("billingType").asText()).isEqualTo("BOLETO");
        assertThat(rules.get("chargeTitle").asText()).isEqualTo("Taxa condominial");

        call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\"}", 200);

        List<JsonNode> sent = paymentsSent();
        assertThat(sent).hasSize(1);
        JsonNode payment = sent.get(0);
        assertThat(payment.get("billingType").asText()).isEqualTo("BOLETO");
        assertThat(payment.get("fine").get("value").decimalValue()).isEqualByComparingTo("2");
        assertThat(payment.get("fine").get("type").asText()).isEqualTo("PERCENTAGE");
        assertThat(payment.get("interest").get("value").decimalValue()).isEqualByComparingTo("1");
        assertThat(payment.get("description").asText()).isEqualTo("Taxa condominial - Casa 1 - " + nextMonth);
        assertThat(payment.get("externalReference").asText()).isEqualTo("C" + jardim + "-" + nextMonth + "-HOUSE-01");
        assertThat(calls).allMatch(c -> c.key().equals(CONDO_KEY));
    }

    @Test
    void theRulesAreCheckedBeforeTheyAreKept() throws Exception {
        call(put("/api/settings/billing"), manager, "{\"billingType\":\"PIX\",\"finePercent\":2.5,\"interestPercent\":1,\"chargeTitle\":\"Taxa\"}", 400);
        call(put("/api/settings/billing"), manager, "{\"billingType\":\"PIX\",\"finePercent\":2,\"interestPercent\":11,\"chargeTitle\":\"Taxa\"}", 400);
        call(put("/api/settings/billing"), manager, "{\"billingType\":\"CARTAO\",\"finePercent\":0,\"interestPercent\":0,\"chargeTitle\":\"Taxa\"}", 400);
        call(put("/api/settings/billing"), manager, "{\"billingType\":\"PIX\",\"finePercent\":0,\"interestPercent\":0,\"chargeTitle\":\"Tx\"}", 400);

        // Nothing changed: a new condominium charges by Pix, with no fee and no interest, as the Vila does.
        JsonNode current = call(get("/api/settings"), manager, "", 200);
        assertThat(current.get("billingType").asText()).isEqualTo("PIX");
        assertThat(current.get("finePercent").decimalValue()).isZero();
        assertThat(current.get("chargeTitle").asText()).isEqualTo("Taxa condominial");
    }

    @Test
    void withoutFeeOrInterestNothingIsSentAndTheAccountKeepsItsOwnSettings() throws Exception {
        call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\"}", 200);

        JsonNode payment = paymentsSent().get(0);
        assertThat(payment.get("billingType").asText()).isEqualTo("PIX");
        assertThat(payment.has("fine")).isFalse();
        assertThat(payment.has("interest")).isFalse();
    }

    @Test
    void oneUnitFailingDoesNotStopTheOthersAndAskingTwiceChargesOnce() throws Exception {
        JsonNode first = call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\",\"amount\":150}", 200);

        assertThat(first.get("created").asInt()).isEqualTo(1);
        assertThat(first.get("failed")).hasSize(1);
        assertThat(first.get("failed").get(0).get("houseLabel").asText()).isEqualTo("Casa 2");
        assertThat(first.get("failed").get(0).get("reason").asText()).contains("CPF");
        assertThat(first.get("skipped")).hasSize(1);
        assertThat(first.get("skipped").get(0).get("houseLabel").asText()).isEqualTo("Casa 3");
        // The unit that failed left nothing behind.
        assertThat(TenantContext.callAs(jardim, () -> contributions.findByReferenceMonthOrderByHouseIdAsc(nextMonth))).hasSize(1);

        JsonNode second = call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\"}", 200);
        assertThat(second.get("created").asInt()).isZero();
        assertThat(second.get("alreadyCharged").asInt()).isEqualTo(1);
        assertThat(paymentsSent()).hasSize(1);
    }

    @Test
    void aDueDateInThePastIsRefusedBeforeAsaasIsAsked() throws Exception {
        JsonNode refused = call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + lastMonth + "\"}", 400);

        assertThat(refused.get("error").asText()).contains("vencimento já passou");
        assertThat(calls).isEmpty();
    }

    @Test
    void theMonthShowsEachUnitAndTheTotals() throws Exception {
        call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\",\"amount\":200}", 200);
        JsonNode open = call(get("/api/admin/billing").param("month", nextMonth), manager, "", 200);
        assertThat(open.get("rows").get(0).get("status").asText()).isEqualTo("PENDING");
        assertThat(open.get("totals").get("open").decimalValue()).isEqualByComparingTo("200");

        // Asaas says it is late (PAYMENT_OVERDUE).
        TenantContext.runAs(jardim, () -> contributions.findByReferenceMonthOrderByHouseIdAsc(nextMonth).forEach(contribution -> {
            contribution.status = "OVERDUE";
            contributions.save(contribution);
        }));
        JsonNode month = call(get("/api/admin/billing").param("month", nextMonth), manager, "", 200);

        assertThat(month.get("pixConnected").asBoolean()).isTrue();
        assertThat(month.get("unitsToCharge").asInt()).isEqualTo(1);
        JsonNode rows = month.get("rows");
        assertThat(rows).hasSize(3);
        assertThat(rows.get(0).get("houseLabel").asText()).isEqualTo("Casa 1");
        assertThat(rows.get(0).get("status").asText()).isEqualTo("OVERDUE");
        assertThat(rows.get(0).get("invoiceUrl").asText()).startsWith("https://asaas.test/i/");
        assertThat(rows.get(1).get("status").asText()).isEqualTo("NOT_CHARGED");
        assertThat(rows.get(2).get("status").asText()).isEqualTo("NO_RESIDENT");
        assertThat(month.get("totals").get("expected").decimalValue()).isEqualByComparingTo("200");
        assertThat(month.get("totals").get("overdue").decimalValue()).isEqualByComparingTo("200");

        TenantContext.runAs(jardim, () -> contributions.findByReferenceMonthOrderByHouseIdAsc(nextMonth).forEach(contribution -> {
            contribution.status = "PAID";
            contribution.paidAmount = new BigDecimal("204.00");
            contributions.save(contribution);
        }));
        JsonNode paid = call(get("/api/admin/billing").param("month", nextMonth), manager, "", 200);
        assertThat(paid.get("rows").get(0).get("status").asText()).isEqualTo("PAID");
        assertThat(paid.get("totals").get("received").decimalValue()).isEqualByComparingTo("204.00");
        assertThat(paid.get("totals").get("overdue").decimalValue()).isZero();
    }

    @Test
    void aNoticeWithTheCondominiumsReferenceLandsInTheRightMonth() {
        String paymentId = "pay_aviso_" + UUID.randomUUID();
        String earlier = YearMonth.now().minusMonths(2).toString();
        JsonNode notice = json.createObjectNode()
            .put("id", "evt_" + UUID.randomUUID())
            .put("event", "PAYMENT_CREATED")
            .set("payment", json.createObjectNode()
                .put("id", paymentId)
                .put("customer", "cus_x")
                .put("value", 99)
                .put("billingType", "PIX")
                .put("status", "PENDING")
                .put("dueDate", YearMonth.now().minusMonths(1).atDay(5).toString())
                .put("externalReference", "C" + jardim + "-" + earlier + "-HOUSE-01"));

        TenantContext.runAs(jardim, () -> webhooks.processVerified(notice));

        assertThat(TenantContext.callAs(jardim, () -> contributions.findByReferenceMonthOrderByHouseIdAsc(earlier))).hasSize(1);
    }

    @Test
    void theVilaChargesExactlyAsBefore() {
        long number = 9000 + System.nanoTime() % 900;
        String vilaTitleBefore = TenantContext.callAs(TenantContext.VILA, () -> {
            Settings current = settings.findAll().stream().findFirst().orElseGet(() -> settings.save(new Settings()));
            String before = current.chargeTitle;
            // What V28 writes for the Vila.
            current.chargeTitle = "Caixinha da Vila";
            settings.save(current);
            return before;
        });
        cleanup.add(() -> TenantContext.runAs(TenantContext.VILA, () -> settings.findAll().stream().findFirst().ifPresent(current -> {
            current.chargeTitle = vilaTitleBefore;
            settings.save(current);
        })));
        House house = TenantContext.callAs(TenantContext.VILA, () -> houses.save(new House((int) number, "Casa " + number)));
        Resident resident = TenantContext.callAs(TenantContext.VILA, () -> resident(house.id, "52998224725"));
        cleanup.add(() -> TenantContext.runAs(TenantContext.VILA, () -> {
            contributions.findByReferenceMonthOrderByHouseIdAsc(nextMonth).stream()
                .filter(contribution -> contribution.houseId.equals(house.id))
                .forEach(contribution -> {
                    pixCharges.findByContributionId(contribution.id).ifPresent(pixCharges::delete);
                    contributions.delete(contribution);
                });
            residents.deleteById(resident.id);
            houses.deleteById(house.id);
        }));

        PixChargeResponse charge = TenantContext.callAs(TenantContext.VILA, () -> pix.generateStandardCharge(nextMonth, new BigDecimal("50"), null, resident.id));

        assertThat(charge.externalReference()).isEqualTo("VILA-" + nextMonth + "-HOUSE-" + number);
        JsonNode sent = TenantContext.callAs(TenantContext.VILA, () -> {
            try {
                return paymentsSent().get(0);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(sent.get("description").asText()).isEqualTo("Caixinha da Vila - Casa " + number + " - " + nextMonth);
        assertThat(sent.get("billingType").asText()).isEqualTo("PIX");
        assertThat(sent.has("fine")).isFalse();
        assertThat(sent.has("interest")).isFalse();
        assertThat(calls).allMatch(c -> c.key().equals(VILA_KEY));
    }

    @Test
    void onlyAConnectedCondominiumsAdministrationCharges() throws Exception {
        AppUser resident = new AppUser("Morador", "morador-" + UUID.randomUUID() + "@teste.dev", "x", "RESIDENT", null);
        resident.condominiumId = jardim;
        AppUser saved = users.save(resident);
        cleanup.add(() -> users.deleteById(saved.id));
        String token = "Bearer " + jwt.issue(saved);
        call(get("/api/admin/billing").param("month", nextMonth), token, "", 403);
        call(post("/api/admin/billing/generate"), token, "{\"month\":\"" + nextMonth + "\"}", 403);
        call(put("/api/settings/billing"), token, "{\"billingType\":\"PIX\",\"finePercent\":0,\"interestPercent\":0,\"chargeTitle\":\"Taxa\"}", 403);

        connections.findByCondominiumId(jardim).ifPresent(connections::delete);
        JsonNode refused = call(post("/api/admin/billing/generate"), manager, "{\"month\":\"" + nextMonth + "\"}", 409);
        assertThat(refused.get("error").asText()).contains("Conecte a conta Asaas");
        assertThat(calls).isEmpty();
    }
}
