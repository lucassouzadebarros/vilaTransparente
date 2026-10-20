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
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The monthly statement, the audit trail and the Asaas balance check. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReportAndAuditTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired ContributionRepository contributions;
    @Autowired ExpenseRepository expenses;
    @Autowired DirectReceiptRepository directReceipts;
    @Autowired AuditEntryRepository auditEntries;
    @MockBean PixGatewayClient gatewayClient;

    @BeforeEach
    void cleanDatabase() {
        auditEntries.deleteAll();
        expenses.deleteAll();
        directReceipts.deleteAll();
        contributions.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
    }

    private AppUser admin() {
        return users.save(new AppUser("Admin", "admin@relatorio.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null));
    }

    private AppUser resident(House house, String email) {
        Resident resident = residents.save(new Resident(house.id, "Morador " + email, email, null, "***.***.***-00"));
        return users.save(new AppUser(resident.name, email, encoder.encode("SenhaMorador1"), "RESIDENT", resident.id));
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwt.issue(user);
    }

    private Contribution paid(House house, Resident resident, String month, String amount, LocalDateTime when, boolean manual) {
        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident == null ? null : resident.id;
        contribution.referenceMonth = month;
        contribution.amount = new BigDecimal(amount);
        contribution.paidAmount = new BigDecimal(amount);
        contribution.status = "PAID";
        contribution.paymentDate = when;
        contribution.manualPayment = manual;
        return contributions.save(contribution);
    }

    private Expense expense(String description, String amount, String category, LocalDate date, Long documentId) {
        Expense expense = new Expense();
        expense.description = description;
        expense.amount = new BigDecimal(amount);
        expense.category = category;
        expense.expenseDate = date;
        expense.documentId = documentId;
        return expenses.save(expense);
    }

    private void directReceipt(String id, String amount, LocalDateTime when) {
        DirectReceipt receipt = new DirectReceipt();
        receipt.gatewayPaymentId = id;
        receipt.description = "Recebimento direto - Fulano de Tal";
        receipt.amount = new BigDecimal(amount);
        receipt.receivedAt = when;
        receipt.referenceMonth = when.toLocalDate().toString().substring(0, 7);
        receipt.status = "PAID";
        directReceipts.save(receipt);
    }

    private JsonNode report(String month, String authorization) throws Exception {
        return json.readTree(mvc.perform(get("/api/reports/monthly").param("month", month).header("Authorization", authorization))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void monthlyReportStartsWhereTheLastMonthEndedAndGroupsByCategory() throws Exception {
        AppUser admin = admin();
        House house = houses.save(new House(3, "Casa 03"));
        paid(house, null, "2026-09", "200.00", LocalDateTime.of(2026, 9, 17, 10, 0), false);
        expense("Energia setembro", "50.00", "Energia", LocalDate.of(2026, 9, 20), 1L);
        paid(house, null, "2026-10", "200.00", LocalDateTime.of(2026, 10, 7, 9, 0), true);
        directReceipt("pay_rel_1", "0.10", LocalDateTime.of(2026, 10, 20, 17, 4));
        expense("Limpeza da caixa d'água", "30.00", "Limpeza", LocalDate.of(2026, 10, 5), null);
        expense("Lâmpadas", "20.00", null, LocalDate.of(2026, 10, 9), 2L);

        JsonNode october = report("2026-10", bearer(admin));
        assertThat(october.get("transparencyEnabled").asBoolean()).isTrue();
        assertThat(october.get("openingBalance").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(october.get("totalIncome").decimalValue()).isEqualByComparingTo("200.10");
        assertThat(october.get("totalExpenses").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(october.get("closingBalance").decimalValue()).isEqualByComparingTo("300.10");
        assertThat(october.get("expensesWithoutDocument").asInt()).isEqualTo(1);

        JsonNode sources = october.get("incomeBySource");
        assertThat(sources.get(0).get("label").asText()).isEqualTo("Pagamento manual");
        assertThat(sources.get(1).get("label").asText()).isEqualTo("Recebimento direto");
        JsonNode categories = october.get("expensesByCategory");
        assertThat(categories.get(0).get("label").asText()).isEqualTo("Limpeza");
        assertThat(categories.get(0).get("amount").decimalValue()).isEqualByComparingTo("30.00");
        assertThat(categories.get(1).get("label").asText()).isEqualTo(ReportService.OTHER_CATEGORY);
        assertThat(october.get("incomes").toString()).contains("Fulano de Tal").contains("Contribuição - Casa 03");

        JsonNode september = report("2026-09", bearer(admin));
        assertThat(september.get("openingBalance").decimalValue()).isEqualByComparingTo("0");
        assertThat(september.get("closingBalance").decimalValue()).isEqualByComparingTo("150.00");
    }

    @Test
    void housesSeeTheStatementWithoutNamesAndOnlyAfterContributing() throws Exception {
        House contributing = houses.save(new House(4, "Casa 04"));
        House silent = houses.save(new House(5, "Casa 05"));
        AppUser donor = resident(contributing, "doador@relatorio.dev");
        AppUser observer = resident(silent, "observador@relatorio.dev");
        Resident donorResident = residents.findById(donor.residentId).orElseThrow();
        paid(contributing, donorResident, "2026-10", "200.00", LocalDateTime.of(2026, 10, 7, 9, 0), false);
        directReceipt("pay_rel_2", "0.10", LocalDateTime.of(2026, 10, 20, 17, 4));

        JsonNode asDonor = report("2026-10", bearer(donor));
        assertThat(asDonor.get("transparencyEnabled").asBoolean()).isTrue();
        assertThat(asDonor.get("incomes").toString()).doesNotContain("Fulano").doesNotContain("Casa 04");
        assertThat(asDonor.get("incomes").toString()).contains("Contribuição de uma casa");

        JsonNode asObserver = report("2026-10", bearer(observer));
        assertThat(asObserver.get("transparencyEnabled").asBoolean()).isFalse();
        assertThat(asObserver.get("totalIncome").decimalValue()).isEqualByComparingTo("0");
        assertThat(asObserver.get("incomes")).isEmpty();
    }

    @Test
    void aBadMonthIsRefused() throws Exception {
        mvc.perform(get("/api/reports/monthly").param("month", "outubro").header("Authorization", bearer(admin())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void moneyChangesLeaveAnAuditTrailOnlyTheAdminCanRead() throws Exception {
        AppUser admin = admin();
        House house = houses.save(new House(6, "Casa 06"));
        String auth = bearer(admin);

        String created = mvc.perform(post("/api/expenses").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Portão\",\"amount\":100,\"category\":\"Manutenção\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        long id = json.readTree(created).get("id").asLong();
        mvc.perform(put("/api/expenses/" + id).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"description\":\"Portão\",\"amount\":120,\"category\":\"Manutenção\"}")).andExpect(status().isOk());

        Contribution pending = new Contribution();
        pending.houseId = house.id;
        pending.referenceMonth = "2026-10";
        pending.amount = new BigDecimal("200");
        pending.status = "PENDING";
        pending = contributions.save(pending);
        mvc.perform(post("/api/admin/contributions/" + pending.id + "/manual-payment").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"dinheiro na mão\"}")).andExpect(status().isOk());
        mvc.perform(delete("/api/expenses/" + id).header("Authorization", auth)).andExpect(status().isOk());

        JsonNode trail = json.readTree(mvc.perform(get("/api/admin/audit").header("Authorization", auth))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(trail).hasSize(4);
        assertThat(trail.get(0).get("action").asText()).isEqualTo("EXPENSE_DELETED");
        assertThat(trail.get(1).get("action").asText()).isEqualTo("MANUAL_PAYMENT");
        assertThat(trail.get(1).get("summary").asText()).contains("Casa 06").contains("dinheiro na mão");
        assertThat(trail.get(2).get("summary").asText()).contains("R$ 100,00").contains("R$ 120,00");
        assertThat(trail.get(3).get("action").asText()).isEqualTo("EXPENSE_CREATED");
        assertThat(trail.get(0).get("actorEmail").asText()).isEqualTo("admin@relatorio.dev");
        assertThat(trail.get(0).get("actorRole").asText()).isEqualTo("ADMIN");

        AppUser morador = resident(house, "morador6@relatorio.dev");
        mvc.perform(get("/api/admin/audit").header("Authorization", bearer(morador))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/audit")).andExpect(status().isUnauthorized());
    }

    @Test
    void theAsaasBalanceCheckSaysWhetherTheTwoBooksAgree() throws Exception {
        AppUser admin = admin();
        House house = houses.save(new House(7, "Casa 07"));
        paid(house, null, LocalDate.now().toString().substring(0, 7), "200.00", LocalDateTime.now(), false);
        expense("Despesa", "40.00", "Outros", LocalDate.now(), null);
        String auth = bearer(admin);

        when(gatewayClient.getBalance()).thenReturn(new BigDecimal("150.00"));
        JsonNode below = json.readTree(mvc.perform(get("/api/admin/reconciliation").header("Authorization", auth))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(below.get("portalBalance").decimalValue()).isEqualByComparingTo("160.00");
        assertThat(below.get("difference").decimalValue()).isEqualByComparingTo("-10.00");
        assertThat(below.get("message").asText()).contains("abaixo").contains("R$ 10,00");

        when(gatewayClient.getBalance()).thenReturn(new BigDecimal("160.00"));
        JsonNode equal = json.readTree(mvc.perform(get("/api/admin/reconciliation").header("Authorization", auth))
            .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(equal.get("message").asText()).startsWith("Conferido");

        when(gatewayClient.getBalance()).thenThrow(new IllegalStateException("fora do ar"));
        JsonNode down = json.readTree(mvc.perform(get("/api/admin/reconciliation").header("Authorization", auth))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(down.get("asaasBalance").isNull()).isTrue();
        assertThat(down.get("message").asText()).contains("Não consegui consultar");
    }
}
