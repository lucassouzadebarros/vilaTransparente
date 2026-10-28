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
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dividing the month among the units by ideal fraction instead of the same value for all, and charging water and gas by
 * the meter: each unit's reading, what it used since the month before and the one-off charge of it, never twice.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "portal.asaas.base-url=http://127.0.0.1:18975/v3",
    "portal.asaas.api-key=$aact_chave_da_vila_rateio_0001",
    "portal.secrets.key=segredo-dos-testes-de-rateio"
})
class ApportionmentAndReadingsTest {
    static final String CONDO_KEY = "$aact_chave_do_jardim_rateio_0002";

    record Call(String method, String path, String body) {
    }

    private static HttpServer asaas;
    private static final List<Call> calls = new CopyOnWriteArrayList<>();
    private static final AtomicInteger ids = new AtomicInteger();

    @BeforeAll
    static void fakeAsaas() throws IOException {
        asaas = HttpServer.create(new InetSocketAddress("127.0.0.1", 18975), 0);
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
    @Autowired MeterReadingRepository readings;
    @Autowired SettingsRepository settings;
    @Autowired AuditEntryRepository auditEntries;

    private final List<Runnable> cleanup = new ArrayList<>();
    private long jardim;
    private String manager;
    private Long casa1;
    private Long casa2;
    private Long casa3;
    private final String nextMonth = YearMonth.now().plusMonths(1).toString();
    private final LocalDate nextMonthDue = YearMonth.now().plusMonths(1).atDay(15);
    private final String lastMonth = YearMonth.now().minusMonths(1).toString();
    private final String monthBefore = YearMonth.now().minusMonths(2).toString();

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
                readings.deleteAll();
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
            casa1 = houses.save(new House(1, "Casa 1")).id;
            casa2 = houses.save(new House(2, "Casa 2")).id;
            casa3 = houses.save(new House(3, "Casa 3")).id;
            resident(casa1, "52998224725");
            resident(casa2, "11144477735");
        });
        AppUser account = new AppUser("Síndica", "sindica-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null);
        account.condominiumId = jardim;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));
        manager = "Bearer " + jwt.issue(saved);
    }

    private void resident(Long houseId, String cpf) {
        Resident resident = new Resident(houseId, "Morador " + houseId, "morador-" + UUID.randomUUID() + "@teste.dev", null, null);
        resident.documentNumber = cpf;
        residents.save(resident);
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
    void theMonthIsDividedByIdealFraction() throws Exception {
        // Any weight works: here the area of each unit, in m².
        JsonNode set = call(put("/api/admin/billing/fractions"),
            "[{\"houseId\":" + casa1 + ",\"fraction\":120},{\"houseId\":" + casa2 + ",\"fraction\":60},{\"houseId\":" + casa3 + ",\"fraction\":20}]", 200);
        assertThat(set.get("sum").decimalValue()).isEqualByComparingTo("200");

        call(put("/api/settings/billing"), rules(",\"chargeMode\":\"FRACTION\",\"monthlyTotal\":1000"), 200);
        JsonNode view = call(get("/api/admin/billing/fractions"), "", 200);
        assertThat(view.get("units").get(0).get("share").decimalValue()).isEqualByComparingTo("60");
        assertThat(view.get("units").get(0).get("amount").decimalValue()).isEqualByComparingTo("600");
        assertThat(view.get("units").get(2).get("amount").decimalValue()).isEqualByComparingTo("100");

        JsonNode result = call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\"}", 200);

        assertThat(result.get("created").asInt()).isEqualTo(2);
        assertThat(result.get("skipped").get(0).get("houseLabel").asText()).isEqualTo("Casa 3");
        assertThat(paymentsSent()).extracting(payment -> payment.get("value").decimalValue().stripTrailingZeros().toPlainString())
            .containsExactly("600", "300");
        JsonNode month = call(get("/api/admin/billing").param("month", nextMonth), "", 200);
        assertThat(month.get("chargeMode").asText()).isEqualTo("FRACTION");
        assertThat(month.get("totals").get("expected").decimalValue()).isEqualByComparingTo("900");
    }

    @Test
    void aTotalGivenWhenIssuingTakesThePlaceOfTheConfiguredOne() throws Exception {
        call(put("/api/admin/billing/fractions"), "[{\"houseId\":" + casa1 + ",\"fraction\":0.5},{\"houseId\":" + casa2 + ",\"fraction\":0.5}]", 200);
        call(put("/api/settings/billing"), rules(",\"chargeMode\":\"FRACTION\",\"monthlyTotal\":1000"), 200);

        call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\",\"total\":1500}", 200);

        assertThat(paymentsSent().get(0).get("value").decimalValue()).isEqualByComparingTo("750");
    }

    @Test
    void theRateioIsCheckedFirst() throws Exception {
        call(put("/api/settings/billing"), rules(",\"chargeMode\":\"FRACTION\""), 400);
        call(put("/api/admin/billing/fractions"), "[{\"houseId\":" + casa1 + ",\"fraction\":-1}]", 400);
        call(put("/api/settings/billing"), rules(",\"chargeMode\":\"FRACTION\",\"monthlyTotal\":1000"), 200);
        // No unit has a fraction yet: nothing goes out.
        JsonNode refused = call(post("/api/admin/billing/generate"), "{\"month\":\"" + nextMonth + "\"}", 400);
        assertThat(refused.get("error").asText()).contains("frações ideais");
        assertThat(calls).isEmpty();
    }

    @Test
    void waterIsChargedByWhatEachUnitUsedAndNeverTwice() throws Exception {
        JsonNode first = call(put("/api/admin/readings").param("month", monthBefore).param("kind", "water"),
            "{\"unitPrice\":10,\"readings\":[{\"houseId\":" + casa1 + ",\"reading\":100},{\"houseId\":" + casa2 + ",\"previousReading\":40,\"reading\":50}]}", 200);
        assertThat(first.get("rows").get(0).get("consumption").isNull()).isTrue();
        assertThat(first.get("rows").get(1).get("amount").decimalValue()).isEqualByComparingTo("100");

        JsonNode second = call(put("/api/admin/readings").param("month", lastMonth).param("kind", "WATER"),
            "{\"unitPrice\":10,\"readings\":[{\"houseId\":" + casa1 + ",\"reading\":112.5}]}", 200);
        JsonNode row = second.get("rows").get(0);
        assertThat(row.get("previousReading").decimalValue()).isEqualByComparingTo("100");
        assertThat(row.get("previousFromHistory").asBoolean()).isTrue();
        assertThat(row.get("consumption").decimalValue()).isEqualByComparingTo("12.5");
        assertThat(row.get("amount").decimalValue()).isEqualByComparingTo("125");
        assertThat(second.get("unitPrice").decimalValue()).isEqualByComparingTo("10");

        JsonNode charged = call(post("/api/admin/readings/charge").param("month", lastMonth).param("kind", "WATER"),
            "{\"dueDate\":\"" + nextMonthDue + "\"}", 200);
        assertThat(charged.get("created").asInt()).isEqualTo(1);
        JsonNode payment = paymentsSent().get(0);
        assertThat(payment.get("value").decimalValue()).isEqualByComparingTo("125");
        assertThat(payment.get("description").asText())
            .isEqualTo("Água de " + YearMonth.parse(lastMonth).format(DateTimeFormatter.ofPattern("MM/yyyy")) + ": 12,5 m³ - Casa 1 - " + nextMonth);
        assertThat(payment.get("externalReference").asText()).contains("-EXTRA-");

        JsonNode again = call(post("/api/admin/readings/charge").param("month", lastMonth).param("kind", "WATER"),
            "{\"dueDate\":\"" + nextMonthDue + "\"}", 200);
        assertThat(again.get("created").asInt()).isZero();
        assertThat(again.get("alreadyCharged").asInt()).isEqualTo(1);
        assertThat(paymentsSent()).hasSize(1);

        JsonNode view = call(get("/api/admin/readings").param("month", lastMonth).param("kind", "WATER"), "", 200);
        assertThat(view.get("rows").get(0).get("chargeStatus").asText()).isEqualTo("PENDING");
        // A charged reading does not change any more.
        call(put("/api/admin/readings").param("month", lastMonth).param("kind", "WATER"),
            "{\"unitPrice\":10,\"readings\":[{\"houseId\":" + casa1 + ",\"reading\":130}]}", 409);
        // The first reading of a unit only starts the count.
        JsonNode beforeCharge = call(post("/api/admin/readings/charge").param("month", monthBefore).param("kind", "WATER"),
            "{\"dueDate\":\"" + nextMonthDue + "\"}", 200);
        assertThat(beforeCharge.get("skipped").get(0).get("reason").asText()).contains("Primeira leitura");
    }

    @Test
    void readingsAreCheckedBeforeTheyAreKept() throws Exception {
        call(put("/api/admin/readings").param("month", monthBefore).param("kind", "GAS"),
            "{\"unitPrice\":8,\"readings\":[{\"houseId\":" + casa1 + ",\"reading\":50}]}", 200);

        JsonNode lower = call(put("/api/admin/readings").param("month", lastMonth).param("kind", "GAS"),
            "{\"unitPrice\":8,\"readings\":[{\"houseId\":" + casa1 + ",\"reading\":40}]}", 400);
        assertThat(lower.get("error").asText()).contains("menor que a anterior");
        call(put("/api/admin/readings").param("month", lastMonth).param("kind", "GAS"), "{\"readings\":[]}", 400);
        call(get("/api/admin/readings").param("month", lastMonth).param("kind", "LUZ"), "", 400);
        // Water and gas are kept apart.
        JsonNode water = call(get("/api/admin/readings").param("month", monthBefore).param("kind", "WATER"), "", 200);
        assertThat(water.get("rows").get(0).get("reading").isNull()).isTrue();
    }

    @Test
    void residentsDoNotSeeOrChangeReadingsOrFractions() throws Exception {
        AppUser resident = new AppUser("Morador", "morador-" + UUID.randomUUID() + "@teste.dev", "x", "RESIDENT", null);
        resident.condominiumId = jardim;
        AppUser saved = users.save(resident);
        cleanup.add(() -> users.deleteById(saved.id));
        String token = "Bearer " + jwt.issue(saved);

        mvc.perform(get("/api/admin/readings").param("month", lastMonth).param("kind", "WATER").header("Authorization", token))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/billing/fractions").contentType(MediaType.APPLICATION_JSON).content("[]").header("Authorization", token))
            .andExpect(status().isForbidden());
    }
}
