package br.com.portalvila;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Problem -> budgets -> vote -> service -> payment, and the rules that keep money from skipping the vote above the limit.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BudgetFirstFlowTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired BudgetVotingService voting;
    @Autowired ServiceOrderWorkflow workflow;
    @Autowired FinancialService financial;
    @Autowired ReportService reportService;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ProblemReportRepository reports;
    @Autowired ProblemReportEventRepository events;
    @Autowired ExpenseRepository expenses;
    @Autowired SettingsRepository settings;
    @Autowired AppUserRepository users;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @MockBean PixGatewayClient gatewayClient;

    /** Voters by house number: houses 02, 03, 05 and 07 take part; the voting closes when all four have voted. */
    final Map<Integer, AppUser> voters = new HashMap<>();
    private String admin;

    /** The value limit lives in the shared test database: other test classes must not inherit it. */
    @AfterEach
    void clearLimit() {
        settings.deleteAll();
    }

    @BeforeEach
    void setUp() {
        events.deleteAll();
        votes.deleteAll();
        budgets.deleteAll();
        expenses.deleteAll();
        services.deleteAll();
        reports.deleteAll();
        settings.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        voters.clear();
        for (int number : new int[]{2, 3, 5, 7}) {
            House house = houses.save(new House(number, String.format("Casa %02d", number)));
            Resident resident = residents.save(new Resident(house.id, "Morador " + number, "morador" + number + "@test.dev", null, null));
            AppUser voter = new AppUser();
            voter.role = "RESIDENT";
            voter.residentId = resident.id;
            voters.put(number, voter);
        }
        admin = "Bearer " + jwt.issue(users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null)));
    }

    private ProblemReport report() {
        ProblemReport report = new ProblemReport();
        report.title = "Muro rachado";
        report.location = "Portão";
        report.category = "Estrutura";
        report.description = "Rachaduras no muro";
        return reports.save(report);
    }

    private Budget budgetFor(ProblemReport report, String supplier, String amount, boolean competes) {
        Budget budget = new Budget();
        budget.title = "Reparo do muro";
        budget.supplier = supplier;
        budget.amount = new BigDecimal(amount);
        budget.problemReportId = report.id;
        budget.competes = competes;
        return workflow.saveBudget(budget);
    }

    /** All four houses vote yes: the voting closes once the last one has voted. */
    private void approve(Budget budget) {
        for (int number : new int[]{2, 3, 5, 7}) {
            voting.vote(budget.id, "APROVAR", voters.get(number));
        }
    }

    /** The service the approval opened by itself, with what the houses voted. */
    private ServiceOrder serviceFrom(Budget budget) {
        Long serviceId = budgets.findById(budget.id).orElseThrow().serviceId;
        assertThat(serviceId).as("an approved budget becomes a service").isNotNull();
        return services.findById(serviceId).orElseThrow();
    }

    private FinishServiceRequest finish(String value, String reason) {
        return new FinishServiceRequest(new BigDecimal(value), LocalDate.of(2026, 10, 20), "Fornecedor", null, null, true, null, reason);
    }

    private static void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run)
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(status));
    }

    private ResultActions expense(String category, String amount, String extra) throws Exception {
        return mvc.perform(post("/api/expenses").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
            .content("{\"description\":\"Obra\",\"category\":\"" + category + "\",\"amount\":" + amount + extra + "}"));
    }

    @Test
    void aBudgetGeneratedForAProblemPutsItUnderAnalysisAndLeavesATrail() {
        ProblemReport report = report();

        Budget budget = budgetFor(report, "Pedreiro A", "900.00", true);

        assertThat(budget.problemReportId).isEqualTo(report.id);
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        assertThat(events.findByReportIdOrderByCreatedAtAscIdAsc(report.id)).extracting(event -> event.kind).containsExactly("BUDGET");
    }

    @Test
    void budgetsOfTheSameJobCompeteAndOnlyOneWins() {
        ProblemReport report = report();
        Budget cheap = budgetFor(report, "Pedreiro A", "800.00", true);
        Budget dear = budgetFor(report, "Pedreiro B", "1000.00", true);

        voting.vote(dear.id, "APROVAR", voters.get(2));
        voting.vote(dear.id, "APROVAR", voters.get(3));
        // House 02 moves its yes to the cheaper one: it leaves the other budget.
        voting.vote(cheap.id, "APROVAR", voters.get(2));
        assertThat(voting.summary(dear.id, voters.get(2)).approveVotes()).isEqualTo(1);
        voting.vote(cheap.id, "APROVAR", voters.get(5));
        voting.vote(cheap.id, "APROVAR", voters.get(7));
        // A majority is not the end: house 03 has not moved its yes yet, so nothing is decided.
        assertThat(budgets.findById(cheap.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        assertThat(budgets.findById(dear.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        voting.vote(cheap.id, "APROVAR", voters.get(3));

        assertThat(budgets.findById(cheap.id).orElseThrow().status).isEqualTo("APROVADO");
        assertThat(budgets.findById(dear.id).orElseThrow().status).isEqualTo("REJEITADO");
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("EM_ANALISE");

        // Another quote for the same job makes no sense now.
        assertStatus(() -> budgetFor(report, "Pedreiro C", "700.00", true), HttpStatus.CONFLICT);
        assertThat(events.findByReportIdOrderByCreatedAtAscIdAsc(report.id)).extracting(event -> event.message)
            .anyMatch(message -> message.contains("não escolhido"))
            .anyMatch(message -> message.contains("aprovado pelas casas"));
    }

    @Test
    void anotherJobDoesNotCompeteAndEachBudgetBecomesItsOwnService() {
        ProblemReport report = report();
        Budget paint = budgetFor(report, "Pintor", "600.00", true);
        Budget wiring = budgetFor(report, "Eletricista", "900.00", false);

        approve(paint);
        assertThat(budgets.findById(wiring.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        approve(wiring);

        ServiceOrder paintService = serviceFrom(paint);
        ServiceOrder wiringService = serviceFrom(wiring);
        assertThat(paintService.problemReportId).isEqualTo(report.id);
        assertThat(paintService.expectedValue).isEqualByComparingTo("600.00");
        assertThat(wiringService.problemReportId).isEqualTo(report.id);

        // Paying the first one does not resolve the problem: the second job is still open.
        workflow.finishService(paintService.id, finish("600.00", null));
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        workflow.finishService(wiringService.id, finish("900.00", null));
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("RESOLVIDO");
    }

    @Test
    void theProblemOpensAgainWhenNoBudgetOrServiceIsLeft() {
        ProblemReport report = report();
        Budget budget = budgetFor(report, "Pedreiro A", "800.00", true);

        voting.vote(budget.id, "RECUSAR", voters.get(2));
        voting.vote(budget.id, "RECUSAR", voters.get(3));
        voting.vote(budget.id, "RECUSAR", voters.get(5));
        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        voting.vote(budget.id, "RECUSAR", voters.get(7));

        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("REJEITADO");
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("ABERTO");

        Budget again = budgetFor(report, "Pedreiro B", "750.00", true);
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        workflow.cancelBudget(again.id);
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("ABERTO");

        // Cancelling twice is harmless.
        workflow.cancelBudget(again.id);
        assertThat(budgets.findById(again.id).orElseThrow().status).isEqualTo("CANCELADO");
    }

    @Test
    void aBudgetBehindALiveServiceCannotBeCancelledUntilTheServiceIs() {
        ProblemReport report = report();
        Budget budget = budgetFor(report, "Pedreiro A", "800.00", true);
        approve(budget);
        ServiceOrder service = serviceFrom(budget);

        assertStatus(() -> workflow.cancelBudget(budget.id), HttpStatus.CONFLICT);
        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("APROVADO");

        workflow.cancelService(service.id, "admin@test");
        workflow.cancelBudget(budget.id);
        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("CANCELADO");
    }

    @Test
    void aServiceAboveTheLimitNeedsAnApprovedBudgetAndAValue() {
        financial.updateBudgetRule(new BigDecimal("300.00"));
        ProblemReport report = report();

        ServiceOrder noValue = new ServiceOrder();
        noValue.title = "Sem valor";
        noValue.description = "d";
        noValue.problemReportId = report.id;
        assertStatus(() -> workflow.saveService(noValue), HttpStatus.CONFLICT);

        ServiceOrder big = new ServiceOrder();
        big.title = "Grande";
        big.description = "d";
        big.expectedValue = new BigDecimal("301.00");
        assertStatus(() -> workflow.saveService(big), HttpStatus.CONFLICT);

        ServiceOrder small = new ServiceOrder();
        small.title = "Pequeno";
        small.description = "d";
        small.expectedValue = new BigDecimal("300.00");
        small.problemReportId = report.id;
        assertThat(workflow.saveService(small).id).isNotNull();

        // Raising the value later does not get around the rule either.
        ServiceOrder raise = new ServiceOrder();
        raise.title = "Pequeno";
        raise.description = "d";
        raise.expectedValue = new BigDecimal("5000.00");
        ServiceOrder stored = services.findAll().get(0);
        assertStatus(() -> workflow.updateService(stored.id, raise), HttpStatus.CONFLICT);
    }

    @Test
    void thePaymentStaysWithinTenPercentOfTheApprovedBudget() {
        financial.updateBudgetRule(new BigDecimal("300.00"));
        ProblemReport report = report();
        Budget budget = budgetFor(report, "Pedreiro A", "800.00", true);
        approve(budget);
        ServiceOrder service = serviceFrom(budget);

        assertStatus(() -> workflow.finishService(service.id, finish("881.00", null)), HttpStatus.CONFLICT);
        assertStatus(() -> workflow.finishService(service.id, finish("4000.00", "curto")), HttpStatus.CONFLICT);
        assertThat(expenses.count()).isZero();

        ServiceOrder paid = workflow.finishService(service.id, finish("880.00", null));
        assertThat(paid.emergencyReason).isNull();
        assertThat(expenses.findByServiceOrderId(service.id)).singleElement().satisfies(expense -> {
            assertThat(expense.budgetId).isEqualTo(budget.id);
            assertThat(expense.exceptionReason).isNull();
        });
    }

    @Test
    void anEmergencyPaymentAboveTheLimitNeedsAPublicReason() {
        financial.updateBudgetRule(new BigDecimal("300.00"));
        ServiceOrder service = new ServiceOrder();
        service.title = "Cano estourado";
        service.description = "Vazamento";
        service.expectedValue = new BigDecimal("100.00");
        ServiceOrder created = workflow.saveService(service);

        // Started small, paid big, no vote: refused.
        assertStatus(() -> workflow.finishService(created.id, finish("4000.00", null)), HttpStatus.CONFLICT);

        String reason = "Cano principal estourou de madrugada e a rua ficou sem água";
        ServiceOrder paid = workflow.finishService(created.id, finish("4000.00", reason));
        assertThat(paid.emergencyReason).isEqualTo(reason);
        assertThat(expenses.findByServiceOrderId(created.id)).singleElement()
            .satisfies(expense -> assertThat(expense.exceptionReason).isEqualTo(reason));
    }

    @Test
    void aDirectExpenseAboveTheLimitNeedsAServiceABudgetOrAReason() throws Exception {
        financial.updateBudgetRule(new BigDecimal("300.00"));

        expense("Manutenção", "8000", "").andExpect(status().isConflict());
        expense("Manutenção", "8000", ",\"exceptionReason\":\"curta\"").andExpect(status().isConflict());
        expense("Manutenção", "300", "").andExpect(status().isOk());
        expense("Energia", "8000", "").andExpect(status().isOk());
        expense("Manutenção", "8000", ",\"exceptionReason\":\"Troca urgente do portão que não fechava mais\"").andExpect(status().isOk());

        // A reason typed where none is needed is not kept: the label "sem votação" would be wrong.
        expense("Manutenção", "100", ",\"exceptionReason\":\"Texto que não deveria ficar guardado\"").andExpect(status().isOk());
        assertThat(expenses.findAll()).filteredOn(expense -> expense.amount.compareTo(new BigDecimal("100")) == 0)
            .singleElement().satisfies(expense -> assertThat(expense.exceptionReason).isNull());

        // A finished service or an approved budget behind it is enough.
        ProblemReport report = report();
        Budget budget = budgetFor(report, "Pedreiro A", "800.00", true);
        approve(budget);
        expense("Manutenção", "800", ",\"budgetId\":" + budget.id).andExpect(status().isOk());
        expense("Manutenção", "800", ",\"budgetId\":999999").andExpect(status().isConflict());
    }

    @Test
    void theMonthlyReportShowsWhatWasSpentWithoutAVotedBudget() {
        ProblemReport report = report();
        Budget budget = budgetFor(report, "Pedreiro A", "800.00", true);

        Expense voted = new Expense();
        voted.description = "Obra votada";
        voted.category = "Manutenção";
        voted.amount = new BigDecimal("800.00");
        voted.budgetId = budget.id;
        expenses.save(voted);
        Expense routine = new Expense();
        routine.description = "Luz";
        routine.category = "Energia";
        routine.amount = new BigDecimal("150.00");
        expenses.save(routine);
        Expense loose = new Expense();
        loose.description = "Compra solta";
        loose.category = "Manutenção";
        loose.amount = new BigDecimal("250.00");
        expenses.save(loose);

        MonthlyReportResponse month = reportService.monthly(java.time.YearMonth.now().toString(), true, null);

        assertThat(month.unvotedCount()).isEqualTo(1);
        assertThat(month.unvotedTotal()).isEqualByComparingTo("250.00");
        assertThat(month.expenses()).filteredOn(line -> !line.voted()).extracting(ReportExpense::description).containsExactly("Compra solta");
    }
}
