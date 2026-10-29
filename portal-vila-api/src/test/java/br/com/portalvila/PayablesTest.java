package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The condominium's bills: recorded, approved by a second person above the condominium's limit, paid outside the system
 * and turned into an expense with its receipt. The administration always pays; the síndico only when allowed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PayablesTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired PayableRepository payables;
    @Autowired SupplierRepository suppliers;
    @Autowired ExpenseRepository expenses;
    @Autowired BudgetRepository budgets;
    @Autowired ServiceOrderRepository services;
    @Autowired SettingsRepository settings;
    @Autowired PortalDocumentRepository documents;
    @Autowired AuditEntryRepository auditEntries;
    @MockBean PushService push;
    @MockBean PixGatewayClient gateway;

    private final List<Runnable> cleanup = new ArrayList<>();
    private long condo;
    private String admin;
    private String sindico;
    private Long sindicoUserId;
    private String morador;
    private final LocalDate due = LocalDate.now().plusDays(10);

    @BeforeEach
    void aCondominiumWithItsPeople() {
        clearInvocations(push);
        if (!condominiums.existsById(TenantContext.VILA)) {
            jdbc.update("insert into condominiums(id, name, slug, status, created_at) values (?, 'Vila', ?, 'ACTIVE', current_timestamp)",
                TenantContext.VILA, "vila-" + UUID.randomUUID());
            cleanup.add(() -> condominiums.deleteById(TenantContext.VILA));
            Long next = jdbc.queryForObject("select max(id) + 1 from condominiums", Long.class);
            jdbc.execute("alter table condominiums alter column id restart with " + next);
        }
        condo = condominiums.save(new Condominium("Residencial Ipê", "ipe-" + UUID.randomUUID())).id;
        long id = condo;
        cleanup.add(() -> {
            TenantContext.runAs(id, () -> {
                payables.deleteAll();
                expenses.deleteAll();
                suppliers.deleteAll();
                budgets.deleteAll();
                services.deleteAll();
                documents.deleteAll();
                residents.deleteAll();
                houses.deleteAll();
                settings.deleteAll();
                auditEntries.deleteAll();
            });
            condominiums.deleteById(id);
        });
        admin = token(account("Administração", "ADMIN", null));
        Resident ana = TenantContext.callAs(condo, () -> {
            House house = houses.save(new House(1, "Casa 1"));
            Resident resident = new Resident(house.id, "Ana Síndica", "ana-" + UUID.randomUUID() + "@teste.dev", null, null);
            return residents.save(resident);
        });
        AppUser sindicoAccount = account("Ana Síndica", "SINDICO", ana.id);
        sindicoUserId = sindicoAccount.id;
        sindico = token(sindicoAccount);
        morador = token(account("Morador", "RESIDENT", null));
    }

    private AppUser account(String name, String role, Long residentId) {
        AppUser user = new AppUser(name, name.toLowerCase().replace(' ', '-') + "-" + UUID.randomUUID() + "@teste.dev", "x", role, residentId);
        user.condominiumId = condo;
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

    private JsonNode call(MockHttpServletRequestBuilder request, String who, String body, int expected) throws Exception {
        request.contentType(MediaType.APPLICATION_JSON).content(body).header("Authorization", who);
        String answer = mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return answer.isBlank() ? null : json.readTree(answer);
    }

    private JsonNode bill(String who, String extra, int expected) throws Exception {
        return call(post("/api/payables"), who,
            "{\"description\":\"Limpeza da caixa d'água\",\"category\":\"Manutenção\",\"amount\":800,\"dueDate\":\"" + due + "\"" + extra + "}", expected);
    }

    private void rules(String body) throws Exception {
        call(put("/api/settings/payments"), admin, body, 200);
    }

    @Test
    void aBillBelowTheLimitIsPaidAndBecomesAnExpenseWithItsReceipt() throws Exception {
        JsonNode supplier = call(post("/api/suppliers"), admin,
            "{\"name\":\"Hidro Serviços\",\"document\":\"12.345.678/0001-90\",\"pixKey\":\"12.345.678/0001-90\",\"pixKeyType\":\"cnpj\"}", 200);
        assertThat(supplier.get("pixKey").asText()).isEqualTo("12345678000190");

        JsonNode created = bill(admin, ",\"supplierId\":" + supplier.get("id").asLong(), 200).get(0);
        assertThat(created.get("status").asText()).isEqualTo("APPROVED");
        assertThat(created.get("supplierHasPix").asBoolean()).isTrue();

        JsonNode paid = call(post("/api/payables/" + created.get("id").asLong() + "/pay"), admin,
            "{\"method\":\"pix\",\"paidAt\":\"" + LocalDate.now() + "\",\"receiptDocumentId\":77}", 200);

        assertThat(paid.get("status").asText()).isEqualTo("PAID");
        Expense expense = TenantContext.callAs(condo, () -> expenses.findById(paid.get("expenseId").asLong()).orElseThrow());
        assertThat(expense.amount).isEqualByComparingTo("800");
        assertThat(expense.supplier).isEqualTo("Hidro Serviços");
        assertThat(expense.paymentMethod).isEqualTo("PIX");
        assertThat(expense.documentId).isEqualTo(77L);
        call(post("/api/payables/" + created.get("id").asLong() + "/pay"), admin, "{\"method\":\"PIX\"}", 409);
    }

    @Test
    void aboveTheLimitASecondPersonApprovesAndNeverWhoeverRecordedIt() throws Exception {
        rules("{\"sindicoCanPay\":false,\"approvalAbove\":500}");
        JsonNode created = bill(admin, "", 200).get(0);
        long id = created.get("id").asLong();
        assertThat(created.get("status").asText()).isEqualTo("PENDING_APPROVAL");
        assertThat(created.get("canApprove").asBoolean()).isFalse();
        // The síndico is not allowed to pay yet: nobody was told.
        verify(push, never()).notifyUsers(anyList(), anyString(), anyString(), any(Map.class));

        call(post("/api/payables/" + id + "/approve"), admin, "", 409);
        call(post("/api/payables/" + id + "/pay"), admin, "{\"method\":\"PIX\"}", 409);
        call(post("/api/payables/" + id + "/approve"), sindico, "", 403);

        rules("{\"sindicoCanPay\":true,\"approvalAbove\":500}");
        JsonNode seen = call(get("/api/payables"), sindico, "", 200).get(0);
        assertThat(seen.get("canApprove").asBoolean()).isTrue();
        JsonNode approved = call(post("/api/payables/" + id + "/approve"), sindico, "", 200);
        assertThat(approved.get("status").asText()).isEqualTo("APPROVED");
        assertThat(approved.get("approvedBy").asText()).isEqualTo("Ana Síndica");

        JsonNode paid = call(post("/api/payables/" + id + "/pay"), sindico, "{\"method\":\"TED\"}", 200);
        assertThat(paid.get("paidBy").asText()).isEqualTo("Ana Síndica");

        // Recorded by the síndico above the limit: the administration is asked to approve.
        bill(sindico, "", 200);
        verify(push).notifyUsers(anyList(), eq("Conta para aprovar"), anyString(), any(Map.class));
    }

    @Test
    void installmentsAreSplitOneAMonthAndApprovedTogether() throws Exception {
        rules("{\"sindicoCanPay\":true,\"approvalAbove\":500}");
        JsonNode created = call(post("/api/payables"), admin,
            "{\"description\":\"Portão novo\",\"amount\":1000,\"dueDate\":\"" + due + "\",\"installments\":3}", 200);

        assertThat(created).hasSize(3);
        assertThat(created.get(0).get("amount").decimalValue()).isEqualByComparingTo("333.33");
        assertThat(created.get(2).get("amount").decimalValue()).isEqualByComparingTo("333.34");
        assertThat(created.get(2).get("dueDate").asText()).isEqualTo(due.plusMonths(2).toString());
        assertThat(created.get(1).get("installment").asInt()).isEqualTo(2);

        call(post("/api/payables/" + created.get(0).get("id").asLong() + "/approve"), sindico, "", 200);
        JsonNode list = call(get("/api/payables"), admin, "", 200);
        list.forEach(row -> assertThat(row.get("status").asText()).isEqualTo("APPROVED"));

        JsonNode paid = call(post("/api/payables/" + created.get(1).get("id").asLong() + "/pay"), admin, "{\"method\":\"BOLETO\"}", 200);
        String description = TenantContext.callAs(condo, () -> expenses.findById(paid.get("expenseId").asLong()).orElseThrow().description);
        assertThat(description).isEqualTo("Portão novo (parcela 2/3)");
    }

    @Test
    void aMonthlyBillCreatesNextMonthsWhenPaidAndStopsWhenCancelled() throws Exception {
        JsonNode created = call(post("/api/payables"), admin,
            "{\"description\":\"Limpeza mensal\",\"amount\":450,\"dueDate\":\"" + due + "\",\"monthly\":true}", 200).get(0);

        call(post("/api/payables/" + created.get("id").asLong() + "/pay"), admin, "{\"method\":\"PIX\"}", 200);

        JsonNode list = call(get("/api/payables"), admin, "", 200);
        assertThat(list).hasSize(2);
        JsonNode next = list.get(1);
        assertThat(next.get("dueDate").asText()).isEqualTo(due.plusMonths(1).toString());
        assertThat(next.get("status").asText()).isEqualTo("APPROVED");
        assertThat(next.get("recurrence").asText()).isEqualTo("MONTHLY");

        call(post("/api/payables/" + next.get("id").asLong() + "/cancel"), admin, "{\"reason\":\"contrato encerrado\"}", 200);
        assertThat(call(get("/api/payables"), admin, "", 200)).hasSize(2);
        call(post("/api/payables/" + next.get("id").asLong() + "/pay"), admin, "{\"method\":\"PIX\"}", 409);
        call(post("/api/payables"), admin, "{\"description\":\"Ambos\",\"amount\":10,\"dueDate\":\"" + due + "\",\"monthly\":true,\"installments\":2}", 400);
    }

    @Test
    void theSpendingRulesOfTheCondominiumApplyToBillsToo() throws Exception {
        TenantContext.runAs(condo, () -> {
            Settings row = settings.findAll().stream().findFirst().orElseGet(Settings::new);
            row.budgetRequiredAbove = new BigDecimal("300");
            settings.save(row);
        });
        JsonNode refused = bill(admin, "", 409);
        assertThat(refused.get("error").asText()).contains("justificativa");
        bill(admin, ",\"exceptionReason\":\"Vazamento grave, sem tempo para votar o orçamento.\"", 200);

        Budget budget = TenantContext.callAs(condo, () -> {
            Budget approved = new Budget();
            approved.title = "Pintura";
            approved.supplier = "Pinta Bem";
            approved.amount = new BigDecimal("700");
            approved.status = "APROVADO";
            return budgets.save(approved);
        });
        // 800 is within 10% above the approved 700? No: the cap is 770.
        bill(admin, ",\"budgetId\":" + budget.id, 409);
        call(post("/api/payables"), admin, "{\"description\":\"Pintura\",\"amount\":760,\"dueDate\":\"" + due + "\",\"budgetId\":" + budget.id + "}", 200);
        // The cap is for everything paid for the job, not bill by bill: 760 + 20 passes the 770.
        JsonNode summed = call(post("/api/payables"), admin, "{\"description\":\"Pintura extra\",\"amount\":20,\"dueDate\":\"" + due + "\",\"budgetId\":" + budget.id + "}", 409);
        assertThat(summed.get("error").asText()).contains("Somando").contains("R$ 760,00");

        ServiceOrder service = TenantContext.callAs(condo, () -> {
            ServiceOrder order = new ServiceOrder();
            order.title = "Bomba";
            order.description = "Troca da bomba";
            order.status = "FINALIZADO";
            ServiceOrder saved = services.save(order);
            Expense paid = new Expense();
            paid.description = "Bomba";
            paid.amount = new BigDecimal("200");
            paid.serviceOrderId = saved.id;
            expenses.save(paid);
            return saved;
        });
        // Another bill for a job already paid counts with what was paid: 200 + 200 passes the 300 limit without a vote.
        JsonNode twice = call(post("/api/payables"), admin,
            "{\"description\":\"Bomba\",\"amount\":200,\"dueDate\":\"" + due + "\",\"serviceOrderId\":" + service.id + "}", 409);
        assertThat(twice.get("error").asText()).contains("Somando").contains("justificativa");
    }

    @Test
    void theSindicoSeesTheBillsButOnlyPaysWhenAllowed() throws Exception {
        bill(admin, "", 200);
        assertThat(call(get("/api/payables"), sindico, "", 200)).hasSize(1);
        assertThat(call(get("/api/session"), sindico, "", 200).get("canPay").asBoolean()).isFalse();
        bill(sindico, "", 403);
        call(post("/api/suppliers"), sindico, "{\"name\":\"Fornecedor\"}", 403);
        call(post("/api/documents"), sindico, "{\"name\":\"nota.pdf\",\"type\":\"NOTA_FISCAL\",\"relatedType\":\"PAYABLE\",\"url\":\"local://nota.pdf\"}", 403);
        call(get("/api/payables"), morador, "", 403);
        call(put("/api/settings/payments"), sindico, "{\"sindicoCanPay\":true}", 403);

        rules("{\"sindicoCanPay\":true}");

        assertThat(call(get("/api/session"), sindico, "", 200).get("canPay").asBoolean()).isTrue();
        bill(sindico, "", 200);
        call(post("/api/suppliers"), sindico, "{\"name\":\"Fornecedor\"}", 200);
        call(post("/api/documents"), sindico, "{\"name\":\"nota.pdf\",\"type\":\"NOTA_FISCAL\",\"relatedType\":\"PAYABLE\",\"url\":\"local://nota.pdf\"}", 200);
        assertThat(call(get("/api/session"), admin, "", 200).get("canPay").asBoolean()).isTrue();
    }

    @Test
    void suppliersAreCheckedAndLeaveTheListWithoutLosingHistory() throws Exception {
        call(post("/api/suppliers"), admin, "{\"name\":\"X\"}", 400);
        call(post("/api/suppliers"), admin, "{\"name\":\"Ana\",\"document\":\"123\"}", 400);
        call(post("/api/suppliers"), admin, "{\"name\":\"Ana\",\"pixKey\":\"ana@\",\"pixKeyType\":\"EMAIL\"}", 400);
        call(post("/api/suppliers"), admin, "{\"name\":\"Ana\",\"pixKey\":\"ana@teste.dev\"}", 400);
        JsonNode phone = call(post("/api/suppliers"), admin, "{\"name\":\"Ana\",\"pixKey\":\"(21) 98888-7777\",\"pixKeyType\":\"PHONE\"}", 200);
        assertThat(phone.get("pixKey").asText()).isEqualTo("21988887777");

        long id = phone.get("id").asLong();
        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/suppliers/" + id), admin, "", 200);
        // An inactive supplier is no longer offered for new bills.
        bill(admin, ",\"supplierId\":" + id, 400);
        assertThat(call(get("/api/suppliers"), admin, "", 200).get(0).get("active").asBoolean()).isFalse();
    }
}
