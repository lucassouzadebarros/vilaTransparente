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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The rest of charging from the panel: a one-off charge (for every unit or one), which never takes the place of the
 * month's own charge; charging again a unit whose charge was cancelled; the reserve fund added to the monthly fee; and
 * the reminders by the app. Asaas here is a small fake server; the phone notices are recorded, not sent.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "portal.asaas.base-url=http://127.0.0.1:18974/v3",
    "portal.asaas.api-key=$aact_chave_da_vila_extras_0001",
    "portal.secrets.key=segredo-dos-testes-de-extras"
})
class BillingExtrasTest {
    static final String CONDO_KEY = "$aact_chave_do_jardim_extras_0002";

    record Call(String method, String path, String body) {
    }

    private static HttpServer asaas;
    private static final List<Call> calls = new CopyOnWriteArrayList<>();
    private static final AtomicInteger ids = new AtomicInteger();

    @BeforeAll
    static void fakeAsaas() throws IOException {
        asaas = HttpServer.create(new InetSocketAddress("127.0.0.1", 18974), 0);
        asaas.createContext("/v3", exchange -> {
            String path = exchange.getRequestURI().getPath().substring(3);
            String method = exchange.getRequestMethod();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(method, path, body));
            if (path.equals("/customers") && method.equals("GET") || path.equals("/payments") && method.equals("GET")) {
                answer(exchange, "{\"data\":[]}");
            } else if (path.startsWith("/customers")) {
                answer(exchange, "{\"id\":\"cus_" + ids.incrementAndGet() + "\"}");
            } else if (path.equals("/payments") && method.equals("POST")) {
                String id = "pay_" + ids.incrementAndGet();
                answer(exchange, "{\"id\":\"" + id + "\",\"status\":\"PENDING\",\"invoiceUrl\":\"https://asaas.test/i/" + id + "\"}");
            } else if (path.endsWith("/pixQrCode")) {
                answer(exchange, "{\"encodedImage\":\"QUFB\",\"payload\":\"00020126pix\",\"expirationDate\":\"2027-12-31 23:59:59\"}");
            } else if (method.equals("DELETE")) {
                answer(exchange, "{\"deleted\":true}");
            } else {
                answer(exchange, "{\"id\":\"" + path.substring(10) + "\",\"status\":\"PENDING\",\"value\":0}");
            }
        });
        asaas.start();
    }

    private static void answer(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
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
    @Autowired BillingService billing;
    @MockBean PushService push;

    private final List<Runnable> cleanup = new ArrayList<>();
    private long jardim;
    private String manager;
    private Long anaUserId;
    private Long casaUm;
    private final String nextMonth = YearMonth.now().plusMonths(1).toString();
    private final LocalDate nextMonthDue = YearMonth.now().plusMonths(1).atDay(15);

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

        Resident ana = TenantContext.callAs(jardim, () -> {
            House one = houses.save(new House(1, "Casa 1"));
            casaUm = one.id;
            House two = houses.save(new House(2, "Casa 2"));
            houses.save(new House(3, "Casa 3"));
            resident(two.id, null);
            return resident(one.id, "52998224725");
        });
        AppUser anaAccount = new AppUser("Ana", ana.email, "x", "RESIDENT", ana.id);
        anaAccount.condominiumId = jardim;
        anaUserId = users.save(anaAccount).id;
        cleanup.add(() -> users.deleteById(anaUserId));

        AppUser account = new AppUser("Síndica", "sindica-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null);
        account.condominiumId = jardim;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));
        manager = "Bearer " + jwt.issue(saved);
        clearInvocations(push);
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

    private JsonNode call(MockHttpServletRequestBuilder request, String body, int expected) throws Exception {
        request.contentType(MediaType.APPLICATION_JSON).content(body).header("Authorization", manager);
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

    private String rules(String extra) {
        return "{\"billingType\":\"PIX\",\"finePercent\":0,\"interestPercent\":0,\"chargeTitle\":\"Taxa condominial\"" + extra + "}";
    }

    @Test
    void aOneOffChargeSitsNextToTheMonthsOwnChargeAndNeverTakesItsPlace() throws Exception {
        JsonNode extra = call(post("/api/admin/billing/extra"),
            "{\"description\":\" Chamada de capital:  pintura \",\"amount\":50,\"dueDate\":\"" + nextMonthDue + "\"}", 200);

        assertThat(extra.get("created").asInt()).isEqualTo(1);
        assertThat(extra.get("failed").get(0).get("houseLabel").asText()).isEqualTo("Casa 2");
        assertThat(extra.get("skipped").get(0).get("houseLabel").asText()).isEqualTo("Casa 3");
        JsonNode sent = paymentsSent().get(0);
        assertThat(sent.get("description").asText()).isEqualTo("Chamada de capital: pintura - Casa 1 - " + nextMonth);
        assertThat(sent.get("externalReference").asText()).startsWith("C" + jardim + "-" + nextMonth + "-HOUSE-01-EXTRA-");
        assertThat(sent.get("value").decimalValue()).isEqualByComparingTo("50");

        // The month's own charge still goes out for Casa 1.
        JsonNode month = call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\"}", 200);
        assertThat(month.get("created").asInt()).isEqualTo(1);
        assertThat(paymentsSent()).hasSize(2);
        assertThat(paymentsSent().get(1).get("externalReference").asText()).isEqualTo("C" + jardim + "-" + nextMonth + "-HOUSE-01");

        JsonNode view = call(get("/api/admin/billing").param("month", nextMonth), "", 200);
        List<JsonNode> casaUmRows = new ArrayList<>();
        view.get("rows").forEach(row -> {
            if (row.get("houseLabel").asText().equals("Casa 1")) {
                casaUmRows.add(row);
            }
        });
        assertThat(casaUmRows).hasSize(2);
        assertThat(casaUmRows.get(0).get("extra").asBoolean()).isTrue();
        assertThat(casaUmRows.get(0).get("description").asText()).isEqualTo("Chamada de capital: pintura");
        assertThat(casaUmRows.get(1).get("extra").asBoolean()).isFalse();
        assertThat(view.get("totals").get("expected").decimalValue()).isEqualByComparingTo("150");
    }

    @Test
    void aUnitWhoseChargeWasCancelledCanBeChargedAgain() throws Exception {
        call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\"}", 200);
        Long chargeId = TenantContext.callAs(jardim, () -> pixCharges.findAll().get(0).id);
        call(post("/api/admin/pix/charges/" + chargeId + "/cancel"), "{\"reason\":\"valor errado\"}", 200);

        JsonNode again = call(post("/api/admin/billing/extra"),
            "{\"houseId\":" + casaUm + ",\"description\":\"Taxa condominial\",\"amount\":120,\"dueDate\":\"" + nextMonthDue + "\"}", 200);

        assertThat(again.get("created").asInt()).isEqualTo(1);
        assertThat(again.get("failed")).isEmpty();
        JsonNode rows = call(get("/api/admin/billing").param("month", nextMonth), "", 200).get("rows");
        assertThat(rows.get(0).get("status").asText()).isEqualTo("CANCELLED");
        assertThat(rows.get(1).get("status").asText()).isEqualTo("PENDING");
        assertThat(rows.get(1).get("amount").decimalValue()).isEqualByComparingTo("120");

        // A unit without a resident cannot be picked.
        Long casaTres = TenantContext.callAs(jardim, () -> houses.findByNumber(3).orElseThrow().id);
        call(post("/api/admin/billing/extra"),
            "{\"houseId\":" + casaTres + ",\"description\":\"Taxa\",\"amount\":10,\"dueDate\":\"" + nextMonthDue + "\"}", 400);
    }

    @Test
    void aOneOffChargeIsCheckedFirst() throws Exception {
        call(post("/api/admin/billing/extra"), "{\"description\":\"ab\",\"amount\":10,\"dueDate\":\"" + nextMonthDue + "\"}", 400);
        call(post("/api/admin/billing/extra"),
            "{\"description\":\"Pintura\",\"amount\":10,\"dueDate\":\"" + LocalDate.now().minusDays(2) + "\"}", 400);
        call(post("/api/admin/billing/extra"), "{\"description\":\"Pintura\",\"amount\":0,\"dueDate\":\"" + nextMonthDue + "\"}", 400);
        assertThat(calls).isEmpty();
    }

    @Test
    void theReserveFundIsAddedToTheMonthlyFeeAndKeptApart() throws Exception {
        call(put("/api/settings/billing"), rules(",\"reserveFundPercent\":10"), 200);

        call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\",\"amount\":200}", 200);

        JsonNode sent = paymentsSent().get(0);
        assertThat(sent.get("value").decimalValue()).isEqualByComparingTo("220");
        assertThat(sent.get("description").asText()).isEqualTo("Taxa condominial + fundo de reserva - Casa 1 - " + nextMonth);
        JsonNode view = call(get("/api/admin/billing").param("month", nextMonth), "", 200);
        assertThat(view.get("rows").get(0).get("reserveAmount").decimalValue()).isEqualByComparingTo("20");
        assertThat(view.get("totals").get("reserve").decimalValue()).isEqualByComparingTo("20");

        // A one-off charge carries no reserve fund.
        call(post("/api/admin/billing/extra"), "{\"houseId\":" + casaUm + ",\"description\":\"Pintura\",\"amount\":50,\"dueDate\":\"" + nextMonthDue + "\"}", 200);
        assertThat(paymentsSent().get(1).get("value").decimalValue()).isEqualByComparingTo("50");

        call(put("/api/settings/billing"), rules(",\"reserveFundPercent\":31"), 400);
        call(put("/api/settings/billing"), rules(",\"reminderDaysBefore\":0"), 400);
    }

    @Test
    void remindersGoOnlyWhenTurnedOnOnTheRightDaysAndOncePerDay() throws Exception {
        call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\"}", 200);
        LocalDate due = TenantContext.callAs(jardim, () -> pixCharges.findAll().get(0).dueDate);

        // Off by default: nothing goes out.
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due.minusDays(3)))).isZero();
        verify(push, never()).notifyUsers(anyList(), anyString(), anyString(), anyMap());

        call(put("/api/settings/billing"), rules(",\"remindersEnabled\":true,\"reminderDaysBefore\":3"), 200);

        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due.minusDays(5)))).isZero();
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due.minusDays(3)))).isEqualTo(1);
        verify(push).notifyUsers(eq(List.of(anaUserId)), eq("Taxa condominial"), contains("vence em 3 dias"), any(Map.class));
        // The same day again: no second notice.
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due.minusDays(3)))).isZero();
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due))).isEqualTo(1);
        verify(push).notifyUsers(anyList(), anyString(), contains("vence hoje"), anyMap());
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due.plusDays(1)))).isEqualTo(1);
        verify(push).notifyUsers(anyList(), eq("Taxa condominial em atraso"), contains("venceu ontem"), anyMap());

        // Paid: no more reminders.
        TenantContext.runAs(jardim, () -> contributions.findAll().forEach(contribution -> {
            contribution.status = "PAID";
            contributions.save(contribution);
        }));
        assertThat(TenantContext.callAs(jardim, () -> billing.remind(due))).isZero();
        verify(push, times(3)).notifyUsers(anyList(), anyString(), anyString(), anyMap());
    }

    @Test
    void theNewRulesKeepWhatTheyHadWhenLeftOut() throws Exception {
        call(put("/api/settings/billing"), rules(",\"reserveFundPercent\":5,\"remindersEnabled\":true,\"reminderDaysBefore\":2"), 200);

        JsonNode kept = call(put("/api/settings/billing"), rules(""), 200);

        assertThat(kept.get("reserveFundPercent").decimalValue()).isEqualByComparingTo("5");
        assertThat(kept.get("remindersEnabled").asBoolean()).isTrue();
        assertThat(kept.get("reminderDaysBefore").asInt()).isEqualTo(2);
    }
}
