package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The test-data cleanup removes only what is clearly a test, simulates by default and stops when money points at it. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TestDataCleanupTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ProblemReportRepository reports;
    @Autowired ProblemReportEventRepository events;
    @Autowired ServiceOrderRepository services;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired PortalDocumentRepository documents;
    @Autowired ExpenseRepository expenses;
    @Autowired AuditEntryRepository audit;
    @MockBean PixGatewayClient gatewayClient;

    private String adminAuth;
    private AppUser resident;

    @BeforeEach
    void setUp() {
        votes.deleteAll();
        budgets.deleteAll();
        expenses.deleteAll();
        documents.deleteAll();
        events.deleteAll();
        reports.deleteAll();
        services.deleteAll();
        audit.deleteAll();
        users.deleteAll();
        adminAuth = "Bearer " + jwt.issue(users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null)));
        resident = users.save(new AppUser("Morador", "morador@teste.dev", encoder.encode("SenhaMorador1"), "RESIDENT", null));
    }

    private ServiceOrder service(String title, String status) {
        ServiceOrder service = new ServiceOrder();
        service.title = title;
        service.description = "x";
        service.status = status;
        return services.save(service);
    }

    private Budget budget(String title, String supplier, Long serviceId) {
        Budget budget = new Budget();
        budget.title = title;
        budget.supplier = supplier;
        budget.amount = new BigDecimal("10.00");
        budget.serviceId = serviceId;
        return budgets.save(budget);
    }

    private ProblemReport report(String title) {
        ProblemReport report = new ProblemReport();
        report.title = title;
        report.location = "Portão";
        report.category = "Outro";
        report.description = "x";
        return reports.save(report);
    }

    private void seedTestAndReal() {
        ServiceOrder realService = service("Iluminação", "FINALIZADO");
        Budget realBudget = budget("Orçamento real", "Julio", realService.id);
        realService.approvedBudgetId = realBudget.id;
        services.save(realService);
        Expense expense = new Expense();
        expense.description = "Serviço finalizado: Iluminação";
        expense.amount = new BigDecimal("400.00");
        expense.serviceOrderId = realService.id;
        expense.budgetId = realBudget.id;
        expenses.save(expense);
        report("Rachadura");

        ProblemReport testReport = report("TESTE revisao - apagar depois");
        ProblemReportEvent event = new ProblemReportEvent();
        event.reportId = testReport.id;
        event.kind = "COMMENT";
        event.message = "x";
        events.save(event);
        PortalDocument photo = new PortalDocument();
        photo.name = "foto.jpg";
        photo.type = "Foto";
        photo.url = "/x";
        photo.relatedType = "PROBLEM_REPORT";
        photo.relatedId = testReport.id;
        documents.save(photo);
        ServiceOrder testService = service("TESTE revisao - apagar depois", "PLANEJADO");
        service("TESTE fase A - cancelar (apagar)", "CANCELADO");
        budget("TESTE revisao - apagar depois", "Fornecedor TESTE B", testService.id);
        Budget oldQuote = budget("Orçamento de teste", "Fornecedor de teste", null);
        BudgetVote vote = new BudgetVote();
        vote.budgetId = oldQuote.id;
        vote.houseId = 1L;
        vote.residentId = 1L;
        vote.vote = "APROVAR";
        votes.save(vote);
    }

    private JsonNode call(String uri, String auth, int expectedStatus) throws Exception {
        String response = mvc.perform(post(uri).header("Authorization", auth))
            .andExpect(status().is(expectedStatus))
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return response.isBlank() ? null : json.readTree(response);
    }

    @Test
    void dryRunListsWhatWouldGoAndChangesNothing() throws Exception {
        seedTestAndReal();

        JsonNode report = call("/api/admin/cleanup/test-data", adminAuth, 200);

        assertThat(report.get("applied").asBoolean()).isFalse();
        assertThat(report.get("reports").asInt()).isEqualTo(1);
        assertThat(report.get("services").asInt()).isEqualTo(2);
        assertThat(report.get("budgets").asInt()).isEqualTo(2);
        assertThat(report.get("votes").asInt()).isEqualTo(1);
        assertThat(report.get("documents").asInt()).isEqualTo(1);
        assertThat(report.get("reportEvents").asInt()).isEqualTo(1);
        assertThat(report.get("items")).hasSize(5);
        assertThat(reports.count()).isEqualTo(2);
        assertThat(services.count()).isEqualTo(3);
        assertThat(budgets.count()).isEqualTo(3);
        assertThat(votes.count()).isEqualTo(1);
        assertThat(documents.count()).isEqualTo(1);
        assertThat(events.count()).isEqualTo(1);
        assertThat(audit.count()).isZero();
    }

    @Test
    void applyRemovesOnlyTestRecordsAndKeepsMoneyAndRealOnes() throws Exception {
        seedTestAndReal();

        JsonNode report = call("/api/admin/cleanup/test-data?apply=true", adminAuth, 200);

        assertThat(report.get("applied").asBoolean()).isTrue();
        assertThat(reports.findAll()).extracting(r -> r.title).containsExactly("Rachadura");
        assertThat(services.findAll()).extracting(s -> s.title).containsExactly("Iluminação");
        assertThat(budgets.findAll()).extracting(b -> b.title).containsExactly("Orçamento real");
        assertThat(votes.count()).isZero();
        assertThat(documents.count()).isZero();
        assertThat(events.count()).isZero();
        assertThat(expenses.count()).isEqualTo(1);
        assertThat(audit.findAll()).extracting(a -> a.action).containsExactly("TEST_DATA_CLEANUP");

        JsonNode again = call("/api/admin/cleanup/test-data?apply=true", adminAuth, 200);
        assertThat(again.get("items")).isEmpty();
    }

    @Test
    void stopsWhenAnExpenseIsLinkedToATestService() throws Exception {
        seedTestAndReal();
        ServiceOrder testService = services.findAll().stream().filter(s -> s.title.startsWith("TESTE revisao")).findFirst().orElseThrow();
        Expense expense = new Expense();
        expense.description = "ligada";
        expense.amount = new BigDecimal("5.00");
        expense.serviceOrderId = testService.id;
        expenses.save(expense);

        call("/api/admin/cleanup/test-data?apply=true", adminAuth, 409);

        assertThat(services.count()).isEqualTo(3);
        assertThat(budgets.count()).isEqualTo(3);
        assertThat(reports.count()).isEqualTo(2);
    }

    @Test
    void stopsWhenARealQuoteIsLinkedToATestService() throws Exception {
        seedTestAndReal();
        ServiceOrder testService = services.findAll().stream().filter(s -> s.title.startsWith("TESTE revisao")).findFirst().orElseThrow();
        budget("Cotação real", "Fornecedor real", testService.id);

        call("/api/admin/cleanup/test-data?apply=true", adminAuth, 409);

        assertThat(services.count()).isEqualTo(3);
    }

    @Test
    void onlyTheAdminCanCallIt() throws Exception {
        seedTestAndReal();
        String residentAuth = "Bearer " + jwt.issue(resident);

        call("/api/admin/cleanup/test-data?apply=true", residentAuth, 403);

        assertThat(services.count()).isEqualTo(3);
    }
}
