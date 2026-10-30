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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Paying a bill by Pix from the condominium's Asaas account: guarded by the person's password, the daily limit and one
 * Pix at a time per bill; checked by Asaas here before the money leaves; settled with the receipt only once Asaas
 * confirms it. Asaas is a small fake server that records what it receives.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "portal.asaas.base-url=http://127.0.0.1:18977/v3",
    "portal.secrets.key=segredo-dos-testes-de-pix",
    "portal.public-api-url=https://api.teste.dev"
})
class PixTransfersTest {
    static final String CONDO_KEY = "$aact_chave_do_jardim_pix_0003";
    static final String PASSWORD = "SenhaDoPix123";

    record Call(String method, String path, String body) {
    }

    private static HttpServer asaas;
    private static final List<Call> calls = new CopyOnWriteArrayList<>();
    private static final AtomicInteger ids = new AtomicInteger();
    /** What the fake answers when asked about a transfer: its status, and the receipt once it is done. */
    private static final Map<String, String> statuses = new ConcurrentHashMap<>();
    /** Transfers Asaas holds until someone types the account's token. */
    private static final java.util.Set<String> unauthorized = ConcurrentHashMap.newKeySet();
    /** Pix refunds the fake lists: money given back for Pix sent here, and money this account gave back. */
    private static final List<String> refunds = new CopyOnWriteArrayList<>();
    private static final List<String> givenBack = new CopyOnWriteArrayList<>();
    private static final ObjectMapper READER = new ObjectMapper();
    /** The "copia e cola" codes the fake knows, and what Asaas reads in each. */
    private static final Map<String, String> codes = Map.of(
        "CODIGO-MERCADO", "{\"payload\":\"CODIGO-MERCADO\",\"pixKey\":\"vendas@loja.exemplo\",\"value\":189.90,\"totalValue\":189.90,"
            + "\"canBePaidWithDifferentValue\":false,\"expirationDate\":\"2030-10-30 11:00:00\",\"canBePaid\":true,"
            + "\"receiver\":{\"name\":\"LOJA EXEMPLO LTDA\",\"tradingName\":\"Loja Exemplo\",\"cpfCnpj\":\"12.345.678/0001-90\",\"ispbName\":\"Banco Exemplo\"}}",
        "CODIGO-LIVRE", "{\"payload\":\"CODIGO-LIVRE\",\"value\":0,\"canBePaidWithDifferentValue\":true,\"canBePaid\":true,"
            + "\"receiver\":{\"name\":\"Feira do Bairro\",\"cpfCnpj\":\"***.456.789-**\",\"ispbName\":\"Banco Exemplo\"}}",
        "CODIGO-VENCIDO", "{\"payload\":\"CODIGO-VENCIDO\",\"value\":30,\"canBePaid\":false,\"cannotBePaidReason\":\"QR Code expirado.\","
            + "\"receiver\":{\"name\":\"Loja Antiga\"}}",
        "CODIGO-RECUSA", "{\"payload\":\"CODIGO-RECUSA\",\"value\":444,\"canBePaid\":true,\"receiver\":{\"name\":\"Loja Sem Saldo\"}}"
    );

    @BeforeAll
    static void fakeAsaas() throws IOException {
        asaas = HttpServer.create(new InetSocketAddress("127.0.0.1", 18977), 0);
        asaas.createContext("/v3", exchange -> {
            String path = exchange.getRequestURI().getPath().substring(3);
            String method = exchange.getRequestMethod();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(method, path, body));
            if (!CONDO_KEY.equals(exchange.getRequestHeaders().getFirst("access_token"))) {
                answer(exchange, 401, "{\"errors\":[{\"code\":\"invalid_access_token\"}]}");
            } else if (path.equals("/finance/balance")) {
                answer(exchange, 200, "{\"balance\":4321.10}");
            } else if (path.equals("/transfers") && method.equals("POST")) {
                if (body.contains("\"value\":666")) {
                    answer(exchange, 400, "{\"errors\":[{\"description\":\"Saldo insuficiente para a transferência.\"}]}");
                    return;
                }
                if (body.contains("\"value\":777")) {
                    answer(exchange, 400, "{\"errors\":[{\"description\":\"A chave de API fornecida não possui permissão para realizar operações de saque via API.\"}]}");
                    return;
                }
                String id = "tra_" + ids.incrementAndGet();
                statuses.put(id, "PENDING");
                if (body.contains("\"value\":555")) {
                    unauthorized.add(id); // this account asks for the token before the transfer goes
                }
                answer(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"PENDING\",\"transferFee\":0,\"authorized\":" + !unauthorized.contains(id) + "}");
            } else if (path.startsWith("/transfers/") && method.equals("GET")) {
                String id = path.substring("/transfers/".length());
                String status = statuses.getOrDefault(id, "PENDING");
                String receipt = status.equals("DONE") ? ",\"transactionReceiptUrl\":\"https://www.asaas.com/comprovantes/" + id + "\",\"effectiveDate\":\"" + LocalDate.now()
                    + "\",\"endToEndIdentifier\":\"E2E" + id + "\"" : "";
                String reason = status.equals("FAILED") ? ",\"failReason\":\"Chave Pix não encontrada\"" : "";
                answer(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"" + status + "\",\"authorized\":" + !unauthorized.contains(id) + receipt + reason + "}");
            } else if (path.equals("/pix/transactions") && method.equals("GET")) {
                String query = exchange.getRequestURI().getQuery();
                List<String> listed = query.contains("type=DEBIT_REFUND") ? refunds : query.contains("type=CREDIT_REFUND") ? givenBack : List.of();
                answer(exchange, 200, "{\"hasMore\":false,\"data\":[" + String.join(",", listed) + "]}");
            } else if (path.equals("/pix/addressKeys/external") && method.equals("GET")) {
                String query = exchange.getRequestURI().getQuery();
                if (query.contains("key=21987650000") && query.contains("type=PHONE")) {
                    answer(exchange, 200, "{\"type\":\"PHONE\",\"key\":\"21987650000\",\"owner\":{\"name\":\"Casa do Construtor Ltda\",\"cpfCnpj\":\"12.***.***/0001-**\"},"
                        + "\"financialInstitution\":{\"name\":\"Banco Exemplo\"}}");
                } else if (query.contains("key=52998224725") && query.contains("type=CPF")) {
                    answer(exchange, 200, "{\"type\":\"CPF\",\"key\":\"52998224725\",\"owner\":{\"name\":\"Maria da Silva\",\"cpfCnpj\":\"***.982.247-**\"},\"ispbName\":\"Banco Exemplo\"}");
                } else {
                    answer(exchange, 404, "{\"errors\":[{\"description\":\"Chave não encontrada.\"}]}");
                }
            } else if (path.equals("/pix/qrCodes/decode") && method.equals("POST")) {
                String code = READER.readTree(body).path("payload").asText();
                String read = codes.get(code);
                answer(exchange, read == null ? 400 : 200, read == null ? "{\"errors\":[{\"description\":\"QR Code inválido.\"}]}" : read);
            } else if (path.equals("/pix/qrCodes/pay") && method.equals("POST")) {
                if (body.contains("CODIGO-RECUSA")) {
                    answer(exchange, 400, "{\"errors\":[{\"description\":\"Saldo insuficiente para pagar o QR Code.\"}]}");
                    return;
                }
                String id = "pix_" + ids.incrementAndGet();
                statuses.put(id, "AWAITING_CRITICAL_ACTION_AUTHORIZATION");
                answer(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"AWAITING_CRITICAL_ACTION_AUTHORIZATION\",\"type\":\"DEBIT\"}");
            } else if (path.startsWith("/pix/transactions/") && method.equals("GET")) {
                String id = path.substring("/pix/transactions/".length());
                String status = statuses.getOrDefault(id, "AWAITING_REQUEST");
                String receipt = status.equals("DONE") ? ",\"transactionReceiptUrl\":\"https://www.asaas.com/comprovantes/" + id + "\",\"effectiveDate\":\"" + LocalDate.now() + " 10:00:00\"" : "";
                String reason = status.equals("REFUSED") ? ",\"refusalReason\":\"Recusado pelo banco do recebedor\"" : "";
                answer(exchange, 200, "{\"id\":\"" + id + "\",\"status\":\"" + status + "\"" + receipt + reason + "}");
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
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired GatewayConnectionRepository connections;
    @Autowired PixValidationRepository validations;
    @Autowired PixTransferRepository transfers;
    @Autowired PayableRepository payables;
    @Autowired SupplierRepository suppliers;
    @Autowired ExpenseRepository expenses;
    @Autowired PortalDocumentRepository documents;
    @Autowired SettingsRepository settings;
    @Autowired AuditEntryRepository auditEntries;
    @Autowired WebhookEventRepository webhookEvents;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired PixTransferService pix;
    @Autowired BudgetRepository budgets;
    @Autowired ServiceOrderRepository services;
    @Autowired DirectReceiptRepository directReceipts;
    @Autowired FinancialService financial;
    @MockBean PushService push;

    private final List<Runnable> cleanup = new ArrayList<>();
    private long jardim;
    private String admin;
    private String sindico;
    private Long withKey;
    private Long withoutKey;
    private final String noticeRoute = UUID.randomUUID().toString();

    @BeforeEach
    void aConnectedCondominiumWithSuppliers() {
        calls.clear();
        statuses.clear();
        unauthorized.clear();
        refunds.clear();
        givenBack.clear();
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
            validations.findByCondominiumId(id).ifPresent(validations::delete);
            webhookEvents.findAll().stream().filter(event -> event.condominiumId == id).forEach(webhookEvents::delete);
            TenantContext.runAs(id, () -> {
                transfers.deleteAll();
                payables.deleteAll();
                expenses.deleteAll();
                directReceipts.deleteAll();
                services.deleteAll();
                budgets.deleteAll();
                documents.deleteAll();
                suppliers.deleteAll();
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
        connection.apiKeyHint = "0003";
        connection.routeKey = noticeRoute;
        connection.webhookTokenHash = SecretBox.digest("token-dos-avisos");
        connections.save(connection);

        TenantContext.runAs(jardim, () -> {
            Settings row = new Settings();
            row.villageName = "Residencial Jardim";
            settings.save(row);
            withKey = supplier("Pinta Bem", "12345678000190", "CNPJ");
            withoutKey = supplier("Sem Chave", null, null);
        });
        admin = token(account("Administração", "ADMIN", null));
        Long ana = TenantContext.callAs(jardim, () -> {
            House house = houses.save(new House(1, "Casa 1"));
            return residents.save(new Resident(house.id, "Ana Síndica", "ana-" + UUID.randomUUID() + "@teste.dev", null, null)).id;
        });
        sindico = token(account("Ana Síndica", "SINDICO", ana));
    }

    private Long supplier(String name, String key, String type) {
        Supplier supplier = new Supplier();
        supplier.name = name;
        supplier.pixKey = key;
        supplier.pixKeyType = type;
        return suppliers.save(supplier).id;
    }

    private AppUser account(String name, String role, Long residentId) {
        AppUser user = new AppUser(name, name.toLowerCase().replace(' ', '-') + "-" + UUID.randomUUID() + "@teste.dev", encoder.encode(PASSWORD), role, residentId);
        user.condominiumId = jardim;
        AppUser saved = users.save(user);
        cleanup.add(() -> users.deleteById(saved.id));
        return saved;
    }

    private String token(AppUser user) {
        return "Bearer " + jwt.issue(user);
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

    private long bill(String description, String amount, Long supplierId) throws Exception {
        JsonNode created = call(post("/api/payables"), admin, "{\"description\":\"" + description + "\",\"amount\":" + amount + ",\"dueDate\":\""
            + LocalDate.now().plusDays(5) + "\",\"supplierId\":" + supplierId + "}", 200);
        return created.get(0).get("id").asLong();
    }

    private JsonNode payByPix(long billId, String who, String password, int expected) throws Exception {
        return call(post("/api/payables/" + billId + "/pix"), who, "{\"password\":\"" + password + "\"}", expected);
    }

    private List<Call> transfersSent() {
        return calls.stream().filter(call -> call.method().equals("POST") && call.path().equals("/transfers")).toList();
    }

    private Map<String, String> validation(String route, String token, String body) throws Exception {
        var request = post("/api/webhooks/asaas/saque/" + route).contentType(MediaType.APPLICATION_JSON).content(body);
        if (token != null) {
            request.header("asaas-access-token", token);
        }
        String answer = mvc.perform(request).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readValue(answer, Map.class);
    }

    @Test
    void aBillIsPaidByPixAndSettledWithTheReceiptWhenAsaasConfirms() throws Exception {
        long billId = bill("Pintura do muro", "800", withKey);
        JsonNode status = call(get("/api/payables/pix"), admin, "", 200);
        assertThat(status.get("available").asBoolean()).isTrue();
        assertThat(status.get("dailyLimit").decimalValue()).isEqualByComparingTo("3000.00");
        assertThat(status.get("balance").decimalValue()).isEqualByComparingTo("4321.10");

        // Without the right password nothing goes to Asaas.
        payByPix(billId, admin, "senha-errada", 403);
        assertThat(transfersSent()).isEmpty();

        JsonNode sent = payByPix(billId, admin, PASSWORD, 200);
        assertThat(sent.get("pixStatus").asText()).isEqualTo("PENDING");
        assertThat(sent.get("status").asText()).isEqualTo(Payable.APPROVED);
        JsonNode body = json.readTree(transfersSent().get(0).body());
        assertThat(body.get("pixAddressKey").asText()).isEqualTo("12345678000190");
        assertThat(body.get("pixAddressKeyType").asText()).isEqualTo("CNPJ");
        assertThat(body.get("value").decimalValue()).isEqualByComparingTo("800");
        assertThat(body.get("operationType").asText()).isEqualTo("PIX");
        assertThat(body.get("externalReference").asText()).startsWith("PIX-");

        // While it is on its way, nobody pays, changes or cancels the bill another way, nor sends it twice.
        payByPix(billId, admin, PASSWORD, 409);
        call(post("/api/payables/" + billId + "/pay"), admin, "{\"method\":\"PIX\"}", 409);
        call(post("/api/payables/" + billId + "/cancel"), admin, "{\"reason\":\"Desisti\"}", 409);
        assertThat(transfersSent()).hasSize(1);

        // Asaas asks before sending: this one was requested here.
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        JsonNode validation = call(post("/api/payments/pix-validation"), admin, "", 200);
        String url = validation.get("url").asText();
        assertThat(url).startsWith("https://api.teste.dev/api/webhooks/asaas/saque/");
        String route = url.substring(url.lastIndexOf('/') + 1);
        String token = validation.get("token").asText();
        assertThat(validation(route, token, "{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"" + transferId + "\",\"value\":800,\"bankAccount\":{\"pixAddressKey\":\"12345678000190\"}}}"))
            .containsEntry("status", "APPROVED");
        // Anything else is refused: another value, an unknown transfer, another kind of withdrawal.
        assertThat(validation(route, token, "{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"" + transferId + "\",\"value\":8000}}")).containsEntry("status", "REFUSED");
        assertThat(validation(route, token, "{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"tra_999\",\"value\":800,\"bankAccount\":{\"pixAddressKey\":\"99999999000199\"}}}"))
            .containsEntry("status", "REFUSED");
        assertThat(validation(route, token, "{\"type\":\"BILL\",\"bill\":{\"id\":\"bill_1\",\"value\":800}}")).containsEntry("status", "REFUSED");
        mvc.perform(post("/api/webhooks/asaas/saque/" + route).header("asaas-access-token", "outro").contentType(MediaType.APPLICATION_JSON)
            .content("{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"" + transferId + "\",\"value\":800}}")).andExpect(status().isUnauthorized());

        // Asaas confirms it (asked every few minutes): the bill is paid with Asaas's receipt.
        statuses.put(transferId, "DONE");
        assertThat(TenantContext.callAs(jardim, pix::refreshInFlight)).isEqualTo(1);
        Payable paid = TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow());
        assertThat(paid.status).isEqualTo(Payable.PAID);
        assertThat(paid.paymentMethod).isEqualTo("PIX");
        assertThat(paid.receiptDocumentId).isNotNull();
        Expense expense = TenantContext.callAs(jardim, () -> expenses.findById(paid.expenseId).orElseThrow());
        assertThat(expense.amount).isEqualByComparingTo("800.00");
        assertThat(expense.documentId).isEqualTo(paid.receiptDocumentId);
        // The receipt is Asaas's own link: opening it goes straight there.
        JsonNode access = call(get("/api/documents/" + paid.receiptDocumentId + "/access"), admin, "", 200);
        assertThat(access.get("url").asText()).isEqualTo("https://www.asaas.com/comprovantes/" + transferId);
        // Asking again changes nothing.
        assertThat(TenantContext.callAs(jardim, pix::refreshInFlight)).isZero();
    }

    @Test
    void asaasMayAskBeforeItsAnswerGetsBack() throws Exception {
        long billId = bill("Bomba d'água", "450", withKey);
        PixTransfer waiting = TenantContext.callAs(jardim, () -> {
            PixTransfer transfer = new PixTransfer();
            transfer.payableId = billId;
            transfer.amount = new BigDecimal("450.00");
            transfer.pixKey = "12345678000190";
            transfer.pixKeyType = "CNPJ";
            transfer.requestedBy = "admin@teste.dev";
            transfer.requestedAt = java.time.LocalDateTime.now(PixTransferService.ZONE);
            return transfers.save(transfer);
        });
        JsonNode validation = call(post("/api/payments/pix-validation"), admin, "", 200);
        String url = validation.get("url").asText();
        String route = url.substring(url.lastIndexOf('/') + 1);
        // The same value to the same key (written another way) is the request waiting: approved, and its id is kept.
        assertThat(validation(route, validation.get("token").asText(),
            "{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"tra_77\",\"value\":450.00,\"bankAccount\":{\"pixAddressKey\":\"12.345.678/0001-90\"}}}"))
            .containsEntry("status", "APPROVED");
        assertThat(TenantContext.callAs(jardim, () -> transfers.findById(waiting.id).orElseThrow().gatewayTransferId)).isEqualTo("tra_77");
        // Showing the address again gives the same token; making a new one replaces it.
        JsonNode again = call(get("/api/payments/pix-validation"), admin, "", 200);
        assertThat(again.get("token").asText()).isEqualTo(validation.get("token").asText());
        assertThat(again.get("lastCheckAt").isNull()).isFalse();
        call(get("/api/payments/pix-validation"), sindico, "", 403);
    }

    @Test
    void aPixThatDoesNotGoOutLeavesTheBillOpen() throws Exception {
        // Asaas refuses at once: the bill stays to pay, and can be paid again or another way.
        long refused = bill("Conta grande", "666", withKey);
        JsonNode error = payByPix(refused, admin, PASSWORD, 502);
        assertThat(error.get("error").asText()).contains("Saldo insuficiente");
        PixTransfer failed = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(refused).orElseThrow());
        assertThat(failed.status).isEqualTo(PixTransfer.FAILED);
        call(post("/api/payables/" + refused + "/pay"), admin, "{\"method\":\"TED\"}", 200);

        // Asaas fails it later, by its notice: the bill stays open, and a new Pix can go.
        long billId = bill("Jardinagem", "300", withKey);
        payByPix(billId, admin, PASSWORD, 200);
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        mvc.perform(post("/api/webhooks/asaas/c/" + noticeRoute).header("asaas-access-token", "token-dos-avisos").contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"evt_" + UUID.randomUUID() + "\",\"event\":\"TRANSFER_FAILED\",\"transfer\":{\"id\":\"" + transferId
                + "\",\"status\":\"FAILED\",\"failReason\":\"Chave Pix não encontrada\"}}"))
            .andExpect(status().isOk());
        JsonNode list = call(get("/api/payables"), admin, "", 200);
        JsonNode open = null;
        for (JsonNode item : list) {
            if (item.get("id").asLong() == billId) {
                open = item;
            }
        }
        assertThat(open.get("status").asText()).isEqualTo(Payable.APPROVED);
        assertThat(open.get("pixStatus").asText()).isEqualTo(PixTransfer.FAILED);
        assertThat(open.get("pixFailReason").asText()).isEqualTo("Chave Pix não encontrada");

        payByPix(billId, admin, PASSWORD, 200);
        String retry = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        mvc.perform(post("/api/webhooks/asaas/c/" + noticeRoute).header("asaas-access-token", "token-dos-avisos").contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"evt_" + UUID.randomUUID() + "\",\"event\":\"TRANSFER_DONE\",\"transfer\":{\"id\":\"" + retry
                + "\",\"status\":\"DONE\",\"transactionReceiptUrl\":\"https://www.asaas.com/comprovantes/" + retry + "\",\"effectiveDate\":\"" + LocalDate.now() + "\"}}"))
            .andExpect(status().isOk());
        assertThat(TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow().status)).isEqualTo(Payable.PAID);
    }

    @Test
    void refusalsSayWhatToDoAndPhoneKeysGoAsAsaasExpects() throws Exception {
        // A phone key is the 11 digits with the area code: a +55 typed in front is dropped, a short number is refused.
        JsonNode phone = call(post("/api/suppliers"), admin, "{\"name\":\"Vidraceiro\",\"pixKey\":\"+55 (21) 98765-4321\",\"pixKeyType\":\"PHONE\"}", 200);
        assertThat(phone.get("pixKey").asText()).isEqualTo("21987654321");
        JsonNode shortNumber = call(post("/api/suppliers"), admin, "{\"name\":\"Fixo\",\"pixKey\":\"(21) 8765-4321\",\"pixKeyType\":\"PHONE\"}", 400);
        assertThat(shortNumber.get("error").asText()).contains("celular com DDD");

        // An account where Asaas never released withdrawals through the API: the refusal says what to do.
        long refused = bill("Vidros da portaria", "777", phone.get("id").asLong());
        JsonNode error = payByPix(refused, admin, PASSWORD, 502);
        assertThat(error.get("error").asText()).contains("Peça ao suporte do Asaas para liberar transferências");
        assertThat(TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(refused).orElseThrow().failReason))
            .contains("Peça ao suporte do Asaas");
        assertThat(PixTransferService.explain("Asaas: A chave informada não foi encontrada.")).contains("cadastro do fornecedor");

        // A phone key saved with the country code before this rule still goes to Asaas as it expects.
        Long older = TenantContext.callAs(jardim, () -> supplier("Eletricista antigo", "5521912345678", "PHONE"));
        payByPix(bill("Tomadas", "120", older), admin, PASSWORD, 200);
        JsonNode body = json.readTree(transfersSent().get(transfersSent().size() - 1).body());
        assertThat(body.get("pixAddressKey").asText()).isEqualTo("21912345678");
        assertThat(body.get("pixAddressKeyType").asText()).isEqualTo("PHONE");
    }

    private JsonNode readCode(String code, int expected) throws Exception {
        return call(post("/api/payables/pix-code/read"), admin, "{\"code\":\"" + code + "\"}", expected);
    }

    private JsonNode payCode(String code, String amount, String password, int expected) throws Exception {
        return call(post("/api/payables/pix-code"), admin, "{\"code\":\"" + code + "\",\"amount\":" + amount
            + ",\"description\":\"Roldanas do portão\",\"category\":\"Manutenção\",\"password\":\"" + password + "\"}", expected);
    }

    private List<Call> codesPaid() {
        return calls.stream().filter(call -> call.method().equals("POST") && call.path().equals("/pix/qrCodes/pay")).toList();
    }

    @Test
    void aCopyAndPasteCodeIsReadPaidAndSettledWithTheReceipt() throws Exception {
        // Reading says who receives it and how much; nothing is paid.
        JsonNode read = readCode("CODIGO-MERCADO\\n", 200);
        assertThat(read.get("receiverName").asText()).isEqualTo("Loja Exemplo");
        assertThat(read.get("value").decimalValue()).isEqualByComparingTo("189.90");
        assertThat(read.get("valueFixed").asBoolean()).isTrue();
        assertThat(read.get("canBePaid").asBoolean()).isTrue();
        JsonNode expired = readCode("CODIGO-VENCIDO", 200);
        assertThat(expired.get("canBePaid").asBoolean()).isFalse();
        assertThat(expired.get("reason").asText()).contains("QR Code expirado");
        assertThat(readCode("isso nao e um codigo", 400).get("error").asText()).contains("QR Code inválido");
        call(post("/api/payables/pix-code/read"), sindico, "{\"code\":\"CODIGO-MERCADO\"}", 403);
        assertThat(codesPaid()).isEmpty();

        // Without the right password nothing goes to Asaas.
        payCode("CODIGO-MERCADO", "null", "senha-errada", 403);
        assertThat(codesPaid()).isEmpty();

        // Paid: the bill is recorded and approved at once, with the code's value (a fixed one cannot change), to its receiver.
        JsonNode bill = payCode("CODIGO-MERCADO", "1", PASSWORD, 200);
        assertThat(bill.get("status").asText()).isEqualTo(Payable.APPROVED);
        assertThat(bill.get("amount").decimalValue()).isEqualByComparingTo("189.90");
        assertThat(bill.get("supplierName").asText()).isEqualTo("Loja Exemplo");
        assertThat(bill.get("pixKind").asText()).isEqualTo(PixTransfer.CODE);
        // Asaas holds it until someone types the account's token: the list says so.
        assertThat(bill.get("pixStatus").asText()).isEqualTo(PayableView.AWAITING_AUTHORIZATION);
        JsonNode sent = json.readTree(codesPaid().get(0).body());
        assertThat(sent.get("qrCode").get("payload").asText()).isEqualTo("CODIGO-MERCADO");
        assertThat(sent.get("value").decimalValue()).isEqualByComparingTo("189.90");
        long billId = bill.get("id").asLong();

        // The same code is not paid twice, nor the bill another way meanwhile.
        assertThat(payCode("CODIGO-MERCADO", "null", PASSWORD, 409).get("error").asText()).contains("já está sendo pago");
        call(post("/api/payables/" + billId + "/pay"), admin, "{\"method\":\"PIX\"}", 409);
        assertThat(codesPaid()).hasSize(1);

        // Asaas asks before paying: this payment of a code was requested here; another value or kind is refused.
        String transactionId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        JsonNode validation = call(post("/api/payments/pix-validation"), admin, "", 200);
        String url = validation.get("url").asText();
        String route = url.substring(url.lastIndexOf('/') + 1);
        String token = validation.get("token").asText();
        assertThat(validation(route, token, "{\"type\":\"PIX_QR_CODE\",\"pixQrCode\":{\"id\":\"" + transactionId + "\",\"value\":189.9,"
            + "\"externalAccount\":{\"addressKey\":\"vendas@loja.exemplo\"}}}")).containsEntry("status", "APPROVED");
        assertThat(validation(route, token, "{\"type\":\"PIX_QR_CODE\",\"pixQrCode\":{\"id\":\"" + transactionId + "\",\"value\":1899}}"))
            .containsEntry("status", "REFUSED");
        assertThat(validation(route, token, "{\"type\":\"TRANSFER\",\"transfer\":{\"id\":\"" + transactionId + "\",\"value\":189.9}}"))
            .containsEntry("status", "REFUSED");
        assertThat(validation(route, token, "{\"type\":\"PIX_QR_CODE\",\"pixQrCode\":{\"id\":\"pix_999\",\"value\":189.9,"
            + "\"externalAccount\":{\"addressKey\":\"outra@loja.exemplo\"}}}")).containsEntry("status", "REFUSED");

        // Asaas confirms it: paid with Asaas's receipt, an expense to the code's receiver.
        statuses.put(transactionId, "DONE");
        assertThat(TenantContext.callAs(jardim, pix::refreshInFlight)).isEqualTo(1);
        Payable paid = TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow());
        assertThat(paid.status).isEqualTo(Payable.PAID);
        assertThat(paid.supplierId).isNull();
        Expense expense = TenantContext.callAs(jardim, () -> expenses.findById(paid.expenseId).orElseThrow());
        assertThat(expense.supplier).isEqualTo("Loja Exemplo");
        assertThat(expense.amount).isEqualByComparingTo("189.90");
        assertThat(expense.documentId).isEqualTo(paid.receiptDocumentId);
        JsonNode access = call(get("/api/documents/" + paid.receiptDocumentId + "/access"), admin, "", 200);
        assertThat(access.get("url").asText()).isEqualTo("https://www.asaas.com/comprovantes/" + transactionId);
        assertThat(payCode("CODIGO-MERCADO", "null", PASSWORD, 409).get("error").asText()).contains("já foi pago pelo Portal");
    }

    @Test
    void aCodeThatDoesNotGoOutCancelsItsBill() throws Exception {
        // Asaas refuses at once: the bill of the code is cancelled with the reason (the code is spent).
        JsonNode error = payCode("CODIGO-RECUSA", "null", PASSWORD, 502);
        assertThat(error.get("error").asText()).contains("Saldo insuficiente");
        Payable refused = TenantContext.callAs(jardim, () -> payables.findAll().stream().filter(found -> found.amount.compareTo(new BigDecimal("444")) == 0)
            .findFirst().orElseThrow());
        assertThat(refused.status).isEqualTo(Payable.CANCELLED);
        assertThat(refused.cancelReason).contains("copia e cola").contains("Saldo insuficiente");

        // A code without a value takes the one typed; a code Asaas cannot pay is not paid.
        assertThat(payCode("CODIGO-LIVRE", "null", PASSWORD, 400).get("error").asText()).contains("informe quanto pagar");
        assertThat(payCode("CODIGO-VENCIDO", "null", PASSWORD, 409).get("error").asText()).contains("QR Code expirado");
        JsonNode bill = payCode("CODIGO-LIVRE", "50", PASSWORD, 200);
        assertThat(bill.get("amount").decimalValue()).isEqualByComparingTo("50.00");
        long billId = bill.get("id").asLong();

        // Asaas refuses it later: the bill is cancelled, with Asaas's reason.
        String transactionId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        statuses.put(transactionId, "REFUSED");
        TenantContext.callAs(jardim, pix::refreshInFlight);
        Payable cancelled = TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow());
        assertThat(cancelled.status).isEqualTo(Payable.CANCELLED);
        assertThat(cancelled.cancelReason).contains("Recusado pelo banco do recebedor");
        PixTransfer failed = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow());
        assertThat(failed.status).isEqualTo(PixTransfer.FAILED);

        // Above the approval value a second person must approve first, and the day's limit counts codes too.
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":false,\"approvalAbove\":40,\"pixDailyLimit\":3000}", 200);
        assertThat(payCode("CODIGO-LIVRE", "60", PASSWORD, 409).get("error").asText()).contains("aprovação de outra pessoa");
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":false,\"approvalAbove\":null,\"pixDailyLimit\":100}", 200);
        assertThat(payCode("CODIGO-MERCADO", "null", PASSWORD, 409).get("error").asText()).contains("limite de Pix por dia");
        assertThat(codesPaid()).hasSize(2);
    }

    private JsonNode readKey(String type, String key, int expected) throws Exception {
        return call(post("/api/payables/pix-key/read"), admin, "{\"type\":\"" + type + "\",\"key\":\"" + key + "\"}", expected);
    }

    private JsonNode payKey(String type, String key, String amount, boolean save, String password, int expected) throws Exception {
        return call(post("/api/payables/pix-key"), admin, "{\"type\":\"" + type + "\",\"key\":\"" + key + "\",\"amount\":" + amount
            + ",\"description\":\"Cimento e areia\",\"category\":\"Obras\",\"saveSupplier\":" + save + ",\"supplierName\":\"Casa do Construtor\",\"password\":\""
            + password + "\"}", expected);
    }

    @Test
    void aKeyTypedAtTheMomentShowsItsHolderAndIsPaidLikeInABank() throws Exception {
        // Before paying, the holder of the key: name, masked document, bank.
        JsonNode holder = readKey("PHONE", "+55 (21) 98765-0000", 200);
        assertThat(holder.get("ownerName").asText()).isEqualTo("Casa do Construtor Ltda");
        assertThat(holder.get("ownerDocument").asText()).isEqualTo("12.***.***/0001-**");
        assertThat(holder.get("bank").asText()).isEqualTo("Banco Exemplo");
        assertThat(holder.get("key").asText()).isEqualTo("21987650000");
        assertThat(holder.get("supplierId").isNull()).isTrue();
        assertThat(readKey("EMAIL", "ninguem@exemplo.com", 404).get("error").asText()).contains("Não achei essa chave Pix");
        readKey("BANCO", "123", 400);
        call(post("/api/payables/pix-key/read"), sindico, "{\"type\":\"PHONE\",\"key\":\"21987650000\"}", 403);

        // Without the right password nothing goes to Asaas.
        payKey("PHONE", "21987650000", "250", true, "senha-errada", 403);
        assertThat(transfersSent()).isEmpty();

        // Paid: the bill is recorded and approved at once, the key kept as a supplier when asked.
        JsonNode bill = payKey("PHONE", "(21) 98765-0000", "250", true, PASSWORD, 200);
        assertThat(bill.get("status").asText()).isEqualTo(Payable.APPROVED);
        assertThat(bill.get("supplierName").asText()).isEqualTo("Casa do Construtor");
        assertThat(bill.get("supplierHasPix").asBoolean()).isTrue();
        assertThat(bill.get("pixKind").asText()).isEqualTo(PixTransfer.KEY);
        JsonNode sent = json.readTree(transfersSent().get(0).body());
        assertThat(sent.get("pixAddressKey").asText()).isEqualTo("21987650000");
        assertThat(sent.get("pixAddressKeyType").asText()).isEqualTo("PHONE");
        assertThat(sent.get("value").decimalValue()).isEqualByComparingTo("250");
        long billId = bill.get("id").asLong();
        long supplierId = bill.get("supplierId").asLong();

        // The same Pix twice in a row is a double click: refused. Another value to the same key uses the same supplier.
        assertThat(payKey("PHONE", "21987650000", "250", true, PASSWORD, 409).get("error").asText()).contains("Um Pix igual");
        assertThat(readKey("PHONE", "21987650000", 200).get("supplierId").asLong()).isEqualTo(supplierId);
        assertThat(payKey("PHONE", "21987650000", "80", true, PASSWORD, 200).get("supplierId").asLong()).isEqualTo(supplierId);
        assertThat(TenantContext.callAs(jardim, () -> suppliers.findAll().stream().filter(found -> "21987650000".equals(found.pixKey)).count())).isEqualTo(1);

        // Asaas confirms it: paid with the receipt, an expense to the supplier.
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        statuses.put(transferId, "DONE");
        TenantContext.callAs(jardim, pix::refreshInFlight);
        Payable paid = TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow());
        assertThat(paid.status).isEqualTo(Payable.PAID);
        assertThat(TenantContext.callAs(jardim, () -> expenses.findById(paid.expenseId).orElseThrow().supplier)).isEqualTo("Casa do Construtor");

        // Not kept as a supplier: the bill goes to the holder's name. Refused at once: that bill is cancelled.
        JsonNode refused = payKey("CPF", "529.982.247-25", "666", false, PASSWORD, 502);
        assertThat(refused.get("error").asText()).contains("Saldo insuficiente");
        Payable cancelled = TenantContext.callAs(jardim, () -> payables.findAll().stream().filter(found -> found.amount.compareTo(new BigDecimal("666")) == 0)
            .findFirst().orElseThrow());
        assertThat(cancelled.status).isEqualTo(Payable.CANCELLED);
        assertThat(cancelled.cancelReason).startsWith("O Pix não saiu:");
        JsonNode toMaria = payKey("CPF", "52998224725", "90", false, PASSWORD, 200);
        assertThat(toMaria.get("supplierId").isNull()).isTrue();
        assertThat(toMaria.get("supplierName").asText()).isEqualTo("Maria da Silva");
        // Asaas fails it later: cancelled too, with its reason.
        long mariaBill = toMaria.get("id").asLong();
        String mariaTransfer = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(mariaBill).orElseThrow().gatewayTransferId);
        statuses.put(mariaTransfer, "FAILED");
        TenantContext.callAs(jardim, pix::refreshInFlight);
        assertThat(TenantContext.callAs(jardim, () -> payables.findById(mariaBill).orElseThrow().status)).isEqualTo(Payable.CANCELLED);
    }

    /** A refund as Asaas lists it: its own id and value, and the Pix it gives money back for. */
    private static String refund(String id, String status, String value, String originalId, String endToEndId) {
        return "{\"id\":\"" + id + "\",\"status\":\"" + status + "\",\"value\":" + value + ",\"effectiveDate\":\"" + LocalDate.now() + " 09:30:00\","
            + "\"transactionReceiptUrl\":\"https://www.asaas.com/comprovantes/" + id + "\",\"originalTransaction\":{\"id\":\"" + originalId + "\","
            + "\"endToEndIdentifier\":" + (endToEndId == null ? "null" : "\"" + endToEndId + "\"") + "}}";
    }

    private JsonNode listed(long billId) throws Exception {
        for (JsonNode item : call(get("/api/payables"), admin, "", 200)) {
            if (item.get("id").asLong() == billId) {
                return item;
            }
        }
        throw new AssertionError("conta " + billId + " fora da lista");
    }

    @Test
    void aPixThatComesBackEntersTheCashBoxAndTheBillSaysSo() throws Exception {
        long billId = bill("Pintura do muro", "800", withKey);
        payByPix(billId, admin, PASSWORD, 200);
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        statuses.put(transferId, "DONE");
        TenantContext.callAs(jardim, pix::refreshInFlight);
        Long expenseId = TenantContext.callAs(jardim, () -> payables.findById(billId).orElseThrow().expenseId);

        // Refunds of other Pix, one still on its way, and money this account gave back are not this bill's.
        refunds.add(refund("ref_outro", "DONE", "40", "tra_999", "E2Eoutro"));
        refunds.add(refund("ref_andando", "REQUESTED", "300", transferId, "E2E" + transferId));
        givenBack.add(refund("ref_devolvido", "DONE", "-25", "pay_1", "E2E" + transferId + "x"));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isZero();
        assertThat(listed(billId).get("refundedAmount").isNull()).isTrue();

        // Part of it came back: an income "Estorno do Pix" in the cash box, seen by everyone; the bill and its expense stay.
        refunds.add(refund("ref_1", "DONE", "300", transferId, "E2E" + transferId));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isEqualTo(1);
        JsonNode bill = listed(billId);
        assertThat(bill.get("status").asText()).isEqualTo(Payable.PAID);
        assertThat(bill.get("refundedAmount").decimalValue()).isEqualByComparingTo("300");
        assertThat(bill.get("refundedAt").isNull()).isFalse();
        DirectReceipt income = TenantContext.callAs(jardim, () -> directReceipts.findByGatewayAndGatewayPaymentId("ASAAS", "ref_1").orElseThrow());
        assertThat(income.category).isEqualTo(DirectReceipt.PIX_REFUND);
        assertThat(income.description).isEqualTo("Estorno do Pix: Pintura do muro");
        assertThat(income.amount).isEqualByComparingTo("300");
        assertThat(income.receiptUrl).isEqualTo("https://www.asaas.com/comprovantes/ref_1");
        Expense expense = TenantContext.callAs(jardim, () -> expenses.findById(expenseId).orElseThrow());
        assertThat(expense.amount).isEqualByComparingTo("800");
        assertThat(expense.notes).contains("Estornado em").contains("R$ 300,00");
        List<MovementResponse> movements = TenantContext.callAs(jardim, () -> financial.dashboard(java.time.YearMonth.now().toString()).movements());
        assertThat(movements).anySatisfy(movement -> {
            assertThat(movement.type()).isEqualTo(DirectReceipt.PIX_REFUND);
            assertThat(movement.description()).isEqualTo("Estorno do Pix: Pintura do muro");
            assertThat(movement.amount()).isEqualByComparingTo("300");
        });

        // Asking again takes nothing twice; the rest coming back later is taken too, and then the Pix is no longer watched.
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isZero();
        refunds.add(refund("ref_2", "DONE", "500", transferId, "E2E" + transferId));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isEqualTo(1);
        assertThat(listed(billId).get("refundedAmount").decimalValue()).isEqualByComparingTo("800");
        long asked = calls.stream().filter(call -> call.path().equals("/pix/transactions")).count();
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isZero();
        assertThat(calls.stream().filter(call -> call.path().equals("/pix/transactions")).count()).isEqualTo(asked);
        assertThat(TenantContext.callAs(jardim, () -> directReceipts.findAll().stream()
            .filter(found -> DirectReceipt.PIX_REFUND.equals(found.category)).count())).isEqualTo(2);
    }

    @Test
    void aPaidCodeThatComesBackIsFoundByItsAsaasId() throws Exception {
        long billId = payCode("CODIGO-MERCADO", "null", PASSWORD, 200).get("id").asLong();
        String transactionId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        statuses.put(transactionId, "DONE");
        TenantContext.callAs(jardim, pix::refreshInFlight);
        refunds.add(refund("ref_codigo", "DONE", "189.90", transactionId, null));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isEqualTo(1);
        assertThat(listed(billId).get("refundedAmount").decimalValue()).isEqualByComparingTo("189.90");
    }

    @Test
    void aPixSettledByANoticeWithoutItsIdIsStillFound() throws Exception {
        long billId = bill("Jardinagem", "300", withKey);
        payByPix(billId, admin, PASSWORD, 200);
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        mvc.perform(post("/api/webhooks/asaas/c/" + noticeRoute).header("asaas-access-token", "token-dos-avisos").contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"evt_" + UUID.randomUUID() + "\",\"event\":\"TRANSFER_DONE\",\"transfer\":{\"id\":\"" + transferId
                + "\",\"status\":\"DONE\",\"effectiveDate\":\"" + LocalDate.now() + "\"}}"))
            .andExpect(status().isOk());
        assertThat(TenantContext.callAs(jardim, () -> transfers.findByGatewayTransferId(transferId).orElseThrow().endToEndId)).isNull();

        // The refund names only the end-to-end id: Asaas is asked for it once, and the refund is found.
        statuses.put(transferId, "DONE");
        refunds.add(refund("ref_aviso", "DONE", "300", "outro-id", "E2E" + transferId));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isEqualTo(1);
        assertThat(TenantContext.callAs(jardim, () -> transfers.findByGatewayTransferId(transferId).orElseThrow().endToEndId)).isEqualTo("E2E" + transferId);
    }

    @Test
    void whatCameBackDoesNotCountAgainstTheApprovedBudget() throws Exception {
        Long serviceId = TenantContext.callAs(jardim, () -> {
            Budget budget = new Budget();
            budget.title = "Portão novo";
            budget.supplier = "Pinta Bem";
            budget.amount = new BigDecimal("1000.00");
            budget.status = "APROVADO";
            budget = budgets.save(budget);
            ServiceOrder service = new ServiceOrder();
            service.title = "Troca do portão";
            service.description = "Portão da entrada";
            service.approvedBudgetId = budget.id;
            service = services.save(service);
            budget.serviceId = service.id;
            budgets.save(budget);
            return service.id;
        });
        String forService = "{\"description\":\"Portão - pagamento\",\"amount\":1000,\"dueDate\":\"" + LocalDate.now().plusDays(5)
            + "\",\"supplierId\":" + withKey + ",\"serviceOrderId\":" + serviceId + "}";
        long billId = call(post("/api/payables"), admin, forService, 200).get(0).get("id").asLong();
        payByPix(billId, admin, PASSWORD, 200);
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        statuses.put(transferId, "DONE");
        TenantContext.callAs(jardim, pix::refreshInFlight);

        // Paid in full: another bill of the same value goes beyond the budget.
        assertThat(call(post("/api/payables"), admin, forService, 409).get("error").asText()).contains("orçamento aprovado");

        // The Pix came back: that money was not spent on the job, and the bill can be paid again.
        refunds.add(refund("ref_portao", "DONE", "1000", transferId, "E2E" + transferId));
        assertThat(TenantContext.callAs(jardim, pix::refreshRefunds)).isEqualTo(1);
        call(post("/api/payables"), admin, forService, 200);
    }

    @Test
    void manyKeyLookupsInARowArePaused() throws Exception {
        for (int i = 0; i < 20; i++) {
            readKey("EMAIL", "pessoa" + i + "@exemplo.com", 404);
        }
        assertThat(readKey("EMAIL", "mais-uma@exemplo.com", 429).get("error").asText()).contains("Muitas consultas de chave");
    }

    @Test
    void aTransferWaitingForTheTokenSaysSo() throws Exception {
        long billId = bill("Portão eletrônico", "555", withKey);
        assertThat(payByPix(billId, admin, PASSWORD, 200).get("pixStatus").asText()).isEqualTo(PayableView.AWAITING_AUTHORIZATION);
        // Someone typed the token in Asaas: it is on its way again.
        String transferId = TenantContext.callAs(jardim, () -> transfers.findFirstByPayableIdOrderByIdDesc(billId).orElseThrow().gatewayTransferId);
        unauthorized.remove(transferId);
        assertThat(TenantContext.callAs(jardim, pix::refreshInFlight)).isEqualTo(1);
        JsonNode list = call(get("/api/payables"), admin, "", 200);
        for (JsonNode item : list) {
            if (item.get("id").asLong() == billId) {
                assertThat(item.get("pixStatus").asText()).isEqualTo(PixTransfer.PENDING);
                assertThat(item.get("pixKind").asText()).isEqualTo(PixTransfer.KEY);
            }
        }
    }

    @Test
    void theDailyLimitAndWhoMayPayAreKept() throws Exception {
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":false,\"approvalAbove\":null,\"pixDailyLimit\":1000}", 200);
        long first = bill("Eletricista", "800", withKey);
        long second = bill("Encanador", "300", withKey);
        payByPix(first, admin, PASSWORD, 200);
        JsonNode over = payByPix(second, admin, PASSWORD, 409);
        assertThat(over.get("error").asText()).contains("limite de Pix por dia").contains("R$ 800,00");

        // A supplier without a Pix key, and a bill still waiting for approval, cannot be paid by Pix.
        payByPix(bill("Sem chave", "50", withoutKey), admin, PASSWORD, 409);
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":false,\"approvalAbove\":40,\"pixDailyLimit\":1000}", 200);
        payByPix(bill("Grande", "60", withKey), admin, PASSWORD, 409);

        // The síndico pays by Pix only when allowed to pay bills, with the síndico's own password.
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":false,\"approvalAbove\":null,\"pixDailyLimit\":5000}", 200);
        payByPix(second, sindico, PASSWORD, 403);
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":true,\"approvalAbove\":null,\"pixDailyLimit\":5000}", 200);
        assertThat(payByPix(second, sindico, PASSWORD, 200).get("pixStatus").asText()).isEqualTo("PENDING");

        // With no limit, Pix is off.
        call(put("/api/settings/payments"), admin, "{\"sindicoCanPay\":true,\"approvalAbove\":null,\"pixDailyLimit\":null}", 200);
        JsonNode status = call(get("/api/payables/pix"), admin, "", 200);
        assertThat(status.get("available").asBoolean()).isFalse();
        assertThat(status.get("reason").asText()).contains("desligado");
        payByPix(bill("Depois", "10", withKey), admin, PASSWORD, 409);
    }
}
