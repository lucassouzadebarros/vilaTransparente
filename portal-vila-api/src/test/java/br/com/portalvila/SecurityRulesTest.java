package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Access rules and guards that protect the money screens, exercised through the real HTTP layer. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "portal.password-reset.debug=true")
class SecurityRulesTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ExpenseRepository expenses;
    @Autowired ContributionRepository contributions;
    @Autowired PortalDocumentRepository documents;
    @Autowired PasswordResetCodeRepository resetCodes;
    @Autowired SettingsRepository settings;
    @Autowired DirectReceiptRepository directReceipts;
    @Autowired WebhookEventRepository webhookEvents;
    @MockBean PixGatewayClient gatewayClient;

    @BeforeEach
    void cleanDatabase() {
        resetCodes.deleteAll();
        votes.deleteAll();
        budgets.deleteAll();
        services.deleteAll();
        expenses.deleteAll();
        documents.deleteAll();
        directReceipts.deleteAll();
        webhookEvents.deleteAll();
        contributions.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        settings.deleteAll();
    }

    private AppUser user(String email, String role, boolean active, Long residentId, String password) {
        AppUser user = new AppUser("Teste", email, encoder.encode(password), role, residentId);
        user.active = active;
        return users.save(user);
    }

    private AppUser admin() {
        return user("admin@teste.dev", "ADMIN", true, null, "SenhaAdmin1");
    }

    private AppUser resident(String email, boolean active) {
        House house = houses.findAll().stream().findFirst().orElseGet(() -> houses.save(new House(2, "Casa 02")));
        Resident resident = residents.save(new Resident(house.id, "Morador", email, null, "***.***.***-00"));
        return user(email, "RESIDENT", active, resident.id, "SenhaMorador1");
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwt.issue(user);
    }

    private static String loginBody(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    private int login(String email, String password, String address) throws Exception {
        return mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", address)
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(email, password)))
            .andReturn().getResponse().getStatus();
    }

    @Test
    void anonymousCallerCannotReadExpenses() throws Exception {
        mvc.perform(get("/api/expenses")).andExpect(status().isUnauthorized());
    }

    @Test
    void releasedHouseLosesAccessImmediately() throws Exception {
        AppUser morador = resident("casa2@teste.dev", true);
        String token = bearer(morador);
        mvc.perform(get("/api/expenses").header("Authorization", token)).andExpect(status().isOk());

        morador.active = false;
        users.save(morador);

        mvc.perform(get("/api/expenses").header("Authorization", token)).andExpect(status().isUnauthorized());
    }

    @Test
    void roleComesFromTheDatabaseNotFromTheToken() throws Exception {
        AppUser formerAdmin = admin();
        String token = bearer(formerAdmin);
        mvc.perform(get("/api/admin/webhook-events").header("Authorization", token)).andExpect(status().isOk());

        formerAdmin.role = "RESIDENT";
        users.save(formerAdmin);

        mvc.perform(get("/api/admin/webhook-events").header("Authorization", token)).andExpect(status().isForbidden());
    }

    @Test
    void postingABudgetWithAnIdNeverOverwritesAnApprovedOne() throws Exception {
        AppUser admin = admin();
        Budget approved = new Budget();
        approved.title = "Portão";
        approved.supplier = "Fornecedor X";
        approved.amount = BigDecimal.valueOf(1000);
        approved.status = "APROVADO";
        approved = budgets.save(approved);

        mvc.perform(post("/api/budgets")
                .header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":" + approved.id + ",\"title\":\"Portão\",\"supplier\":\"Fornecedor X\",\"amount\":99999}"))
            .andExpect(status().isOk());

        Budget untouched = budgets.findById(approved.id).orElseThrow();
        assertThat(untouched.amount).isEqualByComparingTo("1000");
        assertThat(untouched.status).isEqualTo("APROVADO");
        assertThat(budgets.count()).isEqualTo(2);
    }

    @Test
    void finishingAServiceTwiceBooksTheExpenseOnlyOnce() throws Exception {
        AppUser admin = admin();
        ServiceOrder service = new ServiceOrder();
        service.title = "Pintura";
        service.description = "Pintar o muro";
        service.status = "EM_ANDAMENTO";
        service = services.save(service);
        String body = "{\"finalValue\":500,\"completedDate\":\"2026-10-20\",\"supplier\":\"Pintor\",\"generateExpense\":true}";

        mvc.perform(post("/api/services/" + service.id + "/finish").header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        mvc.perform(post("/api/services/" + service.id + "/finish").header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());

        assertThat(expenses.findByServiceOrderId(service.id)).hasSize(1);
    }

    @Test
    void aCancelledServiceCannotBeFinished() throws Exception {
        AppUser admin = admin();
        ServiceOrder service = new ServiceOrder();
        service.title = "Poda";
        service.description = "Podar árvore";
        service.status = "CANCELADO";
        service = services.save(service);

        mvc.perform(post("/api/services/" + service.id + "/finish").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"finalValue\":100,\"completedDate\":\"2026-10-20\",\"supplier\":\"X\",\"generateExpense\":true}"))
            .andExpect(status().isConflict());
        assertThat(expenses.count()).isZero();
    }

    @Test
    void expensesNeedADescriptionAndAPositiveAmountAndIgnoreTheId() throws Exception {
        AppUser admin = admin();
        String auth = bearer(admin);
        mvc.perform(post("/api/expenses").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/expenses").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"description\":\"Lâmpada\",\"amount\":-5}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/expenses").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"description\":\"Lâmpada\",\"amount\":0}")).andExpect(status().isBadRequest());

        Expense first = new Expense();
        first.description = "Original";
        first.amount = BigDecimal.TEN;
        first = expenses.save(first);
        mvc.perform(post("/api/expenses").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":" + first.id + ",\"description\":\"Outra\",\"amount\":7}")).andExpect(status().isOk());

        assertThat(expenses.findById(first.id).orElseThrow().description).isEqualTo("Original");
        assertThat(expenses.count()).isEqualTo(2);
    }

    @Test
    void manualPaymentRefusesPaidCancelledAndNegativeValues() throws Exception {
        AppUser admin = admin();
        House house = houses.save(new House(3, "Casa 03"));
        Contribution paid = contribution(house.id, "PAID");
        Contribution cancelled = contribution(house.id, "CANCELLED");
        Contribution pending = contribution(house.id, "PENDING");
        String auth = bearer(admin);

        mvc.perform(post("/api/admin/contributions/" + paid.id + "/manual-payment").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"dinheiro\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/admin/contributions/" + cancelled.id + "/manual-payment").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"dinheiro\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/admin/contributions/" + pending.id + "/manual-payment").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"dinheiro\",\"paidAmount\":-10}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/contributions/" + pending.id + "/manual-payment").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"dinheiro\"}")).andExpect(status().isOk());
    }

    private Contribution contribution(Long houseId, String status) {
        Contribution contribution = new Contribution();
        contribution.houseId = houseId;
        contribution.referenceMonth = "2026-10";
        contribution.amount = BigDecimal.valueOf(200);
        contribution.status = status;
        return contributions.save(contribution);
    }

    @Test
    void repeatedWrongPasswordsFromOneAddressAreThrottled() throws Exception {
        user("trava@teste.dev", "RESIDENT", true, null, "SenhaCerta1");
        for (int attempt = 0; attempt < LoginAttemptLimiter.MAX_FAILURES; attempt++) {
            assertThat(login("trava@teste.dev", "errada" + attempt, "10.9.9.9")).isEqualTo(401);
        }
        assertThat(login("trava@teste.dev", "SenhaCerta1", "10.9.9.9")).isEqualTo(429);
        // The real owner, from another address, is not locked out by a stranger's guesses.
        assertThat(login("trava@teste.dev", "SenhaCerta1", "10.9.9.10")).isEqualTo(200);
    }

    @Test
    void askingForAResetNeverChangesThePasswordAndOnlyTheCodeDoes() throws Exception {
        user("reset@teste.dev", "RESIDENT", true, null, "SenhaAtual1");

        MvcResult asked = mvc.perform(post("/api/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"reset@teste.dev\"}"))
            .andExpect(status().isOk()).andReturn();
        String code = json.readTree(asked.getResponse().getContentAsString()).get("debugCode").asText();
        assertThat(code).matches("\\d{6}");

        assertThat(login("reset@teste.dev", "SenhaAtual1", "10.1.1.1")).isEqualTo(200);

        mvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"reset@teste.dev\",\"code\":\"000000\",\"password\":\"NovaSenha123\"}")).andExpect(status().isBadRequest());
        assertThat(resetCodes.findAll().get(0).attempts).isEqualTo(1);
        assertThat(login("reset@teste.dev", "SenhaAtual1", "10.1.1.1")).isEqualTo(200);

        mvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"reset@teste.dev\",\"code\":\"" + code + "\",\"password\":\"NovaSenha123\"}")).andExpect(status().isOk());
        assertThat(login("reset@teste.dev", "NovaSenha123", "10.1.1.2")).isEqualTo(200);
        assertThat(login("reset@teste.dev", "SenhaAtual1", "10.1.1.3")).isEqualTo(401);
    }

    @Test
    void askingForAResetOfAnUnknownEmailLooksTheSameAndCreatesNothing() throws Exception {
        MvcResult asked = mvc.perform(post("/api/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"ninguem@teste.dev\"}"))
            .andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(asked.getResponse().getContentAsString()).get("debugCode").isNull()).isTrue();
        assertThat(resetCodes.count()).isZero();
    }

    @Test
    void documentsOpenOnlyWithLoginOrASignedLinkForThatDocument() throws Exception {
        AppUser admin = admin();
        Path file = Files.createTempFile("nota", ".pdf");
        Files.writeString(file, "%PDF-1.4 teste");
        PortalDocument document = new PortalDocument();
        document.name = "Nota";
        document.type = "NOTA_FISCAL";
        document.url = "/api/documents/0/file";
        document.storagePath = file.toString();
        document = documents.save(document);
        PortalDocument other = new PortalDocument();
        other.name = "Outra";
        other.type = "NOTA_FISCAL";
        other.url = "x";
        other.storagePath = file.toString();
        other = documents.save(other);

        mvc.perform(get("/api/documents/" + document.id + "/file")).andExpect(status().isUnauthorized());

        MvcResult access = mvc.perform(get("/api/documents/" + document.id + "/access").header("Authorization", bearer(admin)))
            .andExpect(status().isOk()).andReturn();
        String path = json.readTree(access.getResponse().getContentAsString()).get("path").asText();
        mvc.perform(get(path)).andExpect(status().isOk());

        String token = path.substring(path.indexOf("t=") + 2);
        mvc.perform(get("/api/documents/" + other.id + "/file").param("t", token)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/documents/" + document.id + "/file").header("Authorization", bearer(admin))).andExpect(status().isOk());
        mvc.perform(get("/api/documents/" + document.id + "/access")).andExpect(status().isUnauthorized());
        Files.deleteIfExists(file);
    }

    @Test
    void housesSeeTheSupplierDocumentMaskedAndTheAdminSeesItWhole() throws Exception {
        AppUser admin = admin();
        AppUser morador = resident("casa@teste.dev", true);
        ServiceOrder service = new ServiceOrder();
        service.title = "Iluminação";
        service.description = "Trocar lâmpadas";
        service.supplier = "Fornecedor";
        service.supplierDocument = "10666269793";
        service = services.save(service);

        JsonNode asHouse = json.readTree(mvc.perform(get("/api/services/" + service.id).header("Authorization", bearer(morador)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode asAdmin = json.readTree(mvc.perform(get("/api/services/" + service.id).header("Authorization", bearer(admin)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(asHouse.get("supplierDocument").asText()).isEqualTo("***.***.***-93");
        assertThat(asAdmin.get("supplierDocument").asText()).isEqualTo("10666269793");
        // Reading must not have changed what is stored.
        assertThat(services.findById(service.id).orElseThrow().supplierDocument).isEqualTo("10666269793");
    }

    @Test
    void webhookNeedsTheConfiguredTokenOrTheStoredSecret() throws Exception {
        Settings stored = new Settings();
        stored.villageName = "Vila";
        stored.monthlyAmount = BigDecimal.TEN;
        stored.paymentDueDay = 10;
        stored.gatewayProvider = "ASAAS";
        stored.webhookSecret = "segredo-guardado-123";
        settings.save(stored);

        assertThat(webhook("test-webhook-token", "evt1")).isEqualTo(200);
        assertThat(webhook("segredo-guardado-123", "evt2")).isEqualTo(200);
        assertThat(webhook("dev-webhook-token", "evt3")).isEqualTo(401);
        assertThat(webhook("", "evt4")).isEqualTo(401);
        assertThat(webhook(null, "evt5")).isEqualTo(401);
    }

    private int webhook(String token, String eventId) throws Exception {
        var request = post("/api/webhooks/asaas").contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"" + eventId + "\",\"event\":\"PAYMENT_RECEIVED\",\"payment\":{\"id\":\"pay_" + eventId
                + "\",\"value\":10,\"status\":\"RECEIVED\",\"billingType\":\"PIX\",\"dueDate\":\"2026-10-10\","
                + "\"paymentDate\":\"2026-10-20\",\"customerName\":\"Teste\"}}");
        if (token != null) {
            request = request.header("asaas-access-token", token);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    @Test
    void aResidentCreatedByTheAdminGetsARandomPasswordAndMustChangeIt() throws Exception {
        AppUser admin = admin();
        House house = houses.save(new House(5, "Casa 05"));
        when(gatewayClient.createOrUpdateCustomer(any())).thenReturn(new GatewayCustomer("cus_teste"));

        MvcResult created = mvc.perform(post("/api/residents").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"houseId\":" + house.id + ",\"name\":\"Novo Morador\",\"email\":\"novo@teste.dev\","
                    + "\"phone\":\"21999999999\",\"documentNumber\":\"12345678909\"}"))
            .andExpect(status().isOk()).andReturn();
        String temporary = json.readTree(created.getResponse().getContentAsString()).get("temporaryPassword").asText();

        assertThat(temporary).hasSize(10).isNotEqualTo("123456");
        AppUser account = users.findByEmailIgnoreCase("novo@teste.dev").orElseThrow();
        assertThat(account.mustChangePassword).isTrue();
        assertThat(login("novo@teste.dev", "123456", "10.2.2.2")).isEqualTo(401);
        assertThat(login("novo@teste.dev", temporary, "10.2.2.3")).isEqualTo(200);
    }

    @Test
    void newPasswordsNeedEightCharacters() throws Exception {
        user("curta@teste.dev", "RESIDENT", true, null, "SenhaAtual1");
        MvcResult asked = mvc.perform(post("/api/auth/password-reset/request")
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"curta@teste.dev\"}")).andReturn();
        String code = json.readTree(asked.getResponse().getContentAsString()).get("debugCode").asText();
        mvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"curta@teste.dev\",\"code\":\"" + code + "\",\"password\":\"1234567\"}")).andExpect(status().isBadRequest());
    }
}
