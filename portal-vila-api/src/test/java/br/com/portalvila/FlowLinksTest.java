package br.com.portalvila;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Problem report -> service -> competing quotes -> chosen budget: the links between the three registrations. */
@SpringBootTest
@ActiveProfiles("test")
class FlowLinksTest {
    @Autowired BudgetVotingService voting;
    @Autowired ServiceOrderWorkflow workflow;
    @Autowired FinancialService financial;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ProblemReportRepository reports;
    @Autowired ExpenseRepository expenses;
    @Autowired SettingsRepository settings;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @MockBean PixGatewayClient gatewayClient;

    /** Voters by house number: houses 02, 03, 05 and 07 take part; the voting closes when all four have voted. */
    final Map<Integer, AppUser> voters = new HashMap<>();

    @BeforeEach
    void setUp() {
        votes.deleteAll();
        budgets.deleteAll();
        expenses.deleteAll();
        services.deleteAll();
        reports.deleteAll();
        settings.deleteAll();
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
    }

    private ProblemReport report(String status) {
        ProblemReport report = new ProblemReport();
        report.title = "Portão não fecha";
        report.location = "Portão";
        report.category = "Portão";
        report.description = "O portão fica aberto";
        report.status = status;
        return reports.save(report);
    }

    private ServiceOrder service(String title) {
        ServiceOrder service = new ServiceOrder();
        service.title = title;
        service.description = "Descrição";
        return service;
    }

    private Budget quote(Long serviceId, String amount) {
        Budget budget = new Budget();
        budget.title = "Cotação " + amount;
        budget.supplier = "Fornecedor " + amount;
        budget.amount = new BigDecimal(amount);
        budget.serviceId = serviceId;
        return workflow.saveBudget(budget);
    }

    private FinishServiceRequest finish(String value) {
        return new FinishServiceRequest(new BigDecimal(value), LocalDate.of(2026, 10, 20), "Fornecedor", null, null, true, null, null);
    }

    private static void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run)
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(status));
    }

    @Test
    void aReportStartsAServiceAndIsResolvedWhenItIsPaid() {
        ProblemReport report = report("ABERTO");
        ServiceOrder incoming = service("Consertar o portão");
        incoming.problemReportId = report.id;

        ServiceOrder created = workflow.saveService(incoming);

        ProblemReport linked = reports.findById(report.id).orElseThrow();
        assertThat(created.problemReportId).isEqualTo(report.id);
        assertThat(linked.serviceId).isEqualTo(created.id);
        assertThat(linked.status).isEqualTo("EM_ANALISE");

        workflow.finishService(created.id, finish("350.00"));
        assertThat(reports.findById(report.id).orElseThrow().status).isEqualTo("RESOLVIDO");
        assertThat(expenses.findByServiceOrderId(created.id)).hasSize(1);
    }

    @Test
    void aClosedOrUnknownReportCannotStartAService() {
        ServiceOrder resolved = service("Conserto");
        resolved.problemReportId = report("RESOLVIDO").id;
        assertStatus(() -> workflow.saveService(resolved), HttpStatus.CONFLICT);

        ServiceOrder unknown = service("Conserto");
        unknown.problemReportId = 999_999L;
        assertStatus(() -> workflow.saveService(unknown), HttpStatus.BAD_REQUEST);
        assertThat(services.count()).isZero();
    }

    @Test
    void cancellingTheServiceReopensTheReportAndClosesItsQuotes() {
        ProblemReport report = report("ABERTO");
        ServiceOrder incoming = service("Consertar o portão");
        incoming.problemReportId = report.id;
        ServiceOrder created = workflow.saveService(incoming);
        Budget quote = quote(created.id, "900.00");

        workflow.cancelService(created.id);

        ProblemReport reopened = reports.findById(report.id).orElseThrow();
        assertThat(reopened.status).isEqualTo("ABERTO");
        assertThat(reopened.serviceId).isNull();
        assertThat(budgets.findById(quote.id).orElseThrow().status).isEqualTo("CANCELADO");

        ServiceOrder again = service("Novo conserto");
        again.problemReportId = report.id;
        assertThat(workflow.saveService(again).id).isNotNull();
    }

    @Test
    void quotesForTheSameServiceCompeteAndTheWinnerBecomesItsBudget() {
        ServiceOrder created = workflow.saveService(service("Pintura do muro"));
        Budget dear = quote(created.id, "1000.00");
        Budget cheap = quote(created.id, "800.00");
        assertThat(dear.serviceId).isEqualTo(created.id);
        assertThat(cheap.serviceId).isEqualTo(created.id);

        voting.vote(dear.id, "APROVAR", voters.get(2));
        voting.vote(dear.id, "APROVAR", voters.get(3));
        assertThat(voting.summary(dear.id, voters.get(2)).approveVotes()).isEqualTo(2);

        // House 02 changes its mind: its yes moves to the cheaper quote and leaves the dear one.
        voting.vote(cheap.id, "APROVAR", voters.get(2));
        assertThat(voting.summary(dear.id, voters.get(2)).approveVotes()).isEqualTo(1);
        assertThat(voting.summary(dear.id, voters.get(2)).myVote()).isNull();

        voting.vote(cheap.id, "APROVAR", voters.get(5));
        BudgetVotingSummary majority = voting.vote(cheap.id, "APROVAR", voters.get(7));
        assertThat(majority.approveVotes()).isEqualTo(3);
        assertThat(majority.open()).isTrue();

        // House 03 was the last one: its yes leaves the dear quote and the voting closes.
        BudgetVotingSummary done = voting.vote(cheap.id, "APROVAR", voters.get(3));

        assertThat(done.status()).isEqualTo("APROVADO");
        ServiceOrder chosen = services.findById(created.id).orElseThrow();
        assertThat(chosen.approvedBudgetId).isEqualTo(cheap.id);
        assertThat(chosen.status).isEqualTo("APROVADO");
        assertThat(chosen.expectedValue).isEqualByComparingTo("800.00");
        assertThat(chosen.supplier).isEqualTo("Fornecedor 800.00");
        assertThat(budgets.findById(dear.id).orElseThrow().status).isEqualTo("REJEITADO");
    }

    @Test
    void aServiceThatIsDecidedOrClosedDoesNotTakeNewQuotes() {
        ServiceOrder created = workflow.saveService(service("Pintura do muro"));
        Budget first = quote(created.id, "1000.00");
        voting.vote(first.id, "APROVAR", voters.get(2));
        voting.vote(first.id, "APROVAR", voters.get(3));
        voting.vote(first.id, "APROVAR", voters.get(5));
        voting.vote(first.id, "APROVAR", voters.get(7));
        assertThat(services.findById(created.id).orElseThrow().approvedBudgetId).isEqualTo(first.id);

        Budget late = new Budget();
        late.title = "Tarde";
        late.supplier = "Outro";
        late.amount = BigDecimal.TEN;
        late.serviceId = created.id;
        assertStatus(() -> workflow.saveBudget(late), HttpStatus.CONFLICT);

        ServiceOrder cancelled = workflow.saveService(service("Poda"));
        workflow.cancelService(cancelled.id);
        Budget toCancelled = new Budget();
        toCancelled.title = "Poda";
        toCancelled.supplier = "Jardineiro";
        toCancelled.amount = BigDecimal.TEN;
        toCancelled.serviceId = cancelled.id;
        assertStatus(() -> workflow.saveBudget(toCancelled), HttpStatus.CONFLICT);

        Budget unknown = new Budget();
        unknown.title = "Poda";
        unknown.supplier = "Jardineiro";
        unknown.amount = BigDecimal.TEN;
        unknown.serviceId = 999_999L;
        assertStatus(() -> workflow.saveBudget(unknown), HttpStatus.BAD_REQUEST);
    }

    @Test
    void aLimitMakesBigServicesComeFromAnApprovedBudget() {
        // No rule set: anything can be created and started.
        ServiceOrder free = service("Troca de lâmpada");
        free.expectedValue = new BigDecimal("5000.00");
        free.status = "EM_ANDAMENTO";
        assertThat(workflow.saveService(free).status).isEqualTo("EM_ANDAMENTO");

        financial.updateBudgetRule(new BigDecimal("500.00"));
        assertThat(financial.settings().budgetRequiredAbove).isEqualByComparingTo("500.00");

        ServiceOrder big = service("Reforma do telhado");
        big.expectedValue = new BigDecimal("800.00");
        assertStatus(() -> workflow.saveService(big), HttpStatus.CONFLICT);

        ServiceOrder small = service("Reparo");
        small.expectedValue = new BigDecimal("400.00");
        assertThat(workflow.saveService(small).status).isEqualTo("PLANEJADO");

        // With the budget approved by the houses it can be created, taking the value from the budget.
        Budget budget = quote(null, "800.00");
        voting.vote(budget.id, "APROVAR", voters.get(2));
        voting.vote(budget.id, "APROVAR", voters.get(3));
        voting.vote(budget.id, "APROVAR", voters.get(5));
        voting.vote(budget.id, "APROVAR", voters.get(7));
        ServiceOrder fromBudget = service("Reforma do telhado");
        fromBudget.approvedBudgetId = budget.id;
        ServiceOrder created = workflow.saveService(fromBudget);
        assertThat(created.expectedValue).isEqualByComparingTo("800.00");
        assertThat(created.status).isEqualTo("APROVADO");

        // The rule can be switched off again, and a negative value is refused.
        financial.updateBudgetRule(null);
        assertThat(financial.settings().budgetRequiredAbove).isNull();
        assertStatus(() -> financial.updateBudgetRule(new BigDecimal("-1")), HttpStatus.BAD_REQUEST);
    }

    @Test
    void changingTheScopeRestartsTheVoting() {
        Budget budget = new Budget();
        budget.title = "Pintura";
        budget.supplier = "Pinturas Silva";
        budget.amount = new BigDecimal("1200.00");
        budget.scope = "  Pintar o muro da frente  ";
        Budget saved = workflow.saveBudget(budget);
        assertThat(saved.scope).isEqualTo("Pintar o muro da frente");

        voting.vote(saved.id, "APROVAR", voters.get(2));
        assertThat(voting.hasVotes(saved.id)).isTrue();

        Budget edit = new Budget();
        edit.title = saved.title;
        edit.supplier = saved.supplier;
        edit.amount = saved.amount;
        edit.status = saved.status;
        edit.scope = "Pintar o muro da frente e dos fundos";
        workflow.updateBudget(saved.id, edit);

        assertThat(voting.hasVotes(saved.id)).isFalse();
        assertThat(budgets.findById(saved.id).orElseThrow().scope).isEqualTo("Pintar o muro da frente e dos fundos");
    }
}
