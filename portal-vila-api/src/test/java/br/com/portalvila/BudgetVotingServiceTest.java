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

@SpringBootTest
@ActiveProfiles("test")
class BudgetVotingServiceTest {
    @Autowired
    BudgetVotingService voting;

    @Autowired
    ServiceOrderWorkflow workflow;

    @Autowired
    BudgetRepository budgets;

    @Autowired
    BudgetVoteRepository votes;

    @Autowired
    ServiceOrderRepository services;

    @Autowired
    HouseRepository houses;

    @Autowired
    ResidentRepository residents;

    @Autowired
    SettingsRepository settings;

    @MockBean
    PixGatewayClient gatewayClient;

    /** Voters by house number: houses 02, 03, 05 and 07 take part. */
    final Map<Integer, AppUser> voters = new HashMap<>();
    AppUser admin;
    AppUser formerResident;

    @BeforeEach
    void setUp() {
        votes.deleteAll();
        budgets.deleteAll();
        services.deleteAll();
        settings.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        voters.clear();

        for (int number : new int[]{2, 3, 5, 7}) {
            House house = houses.save(new House(number, String.format("Casa %02d", number)));
            Resident resident = residents.save(new Resident(house.id, "Morador " + number, "morador" + number + "@test.dev", null, null));
            voters.put(number, user(resident.id, "RESIDENT"));
        }
        // An active house nobody registered for, and a house whose resident left: neither takes part.
        houses.save(new House(9, "Casa 09"));
        House house10 = houses.save(new House(10, "Casa 10"));
        Resident left = new Resident(house10.id, "Antigo", "antigo@test.dev", null, null);
        left.status = "INACTIVE";
        formerResident = user(residents.save(left).id, "RESIDENT");
        admin = user(null, "ADMIN");
    }

    @Test
    void approvesWhenThreeOfTheFourHousesSayYes() {
        Budget budget = newBudget("1200.00");
        assertThat(budget.status).isEqualTo("EM_ANALISE");

        BudgetVotingSummary start = voting.summary(budget.id, voters.get(2));
        assertThat(start.participatingHouses()).isEqualTo(4);
        assertThat(start.votesToApprove()).isEqualTo(3);
        assertThat(start.pendingVotes()).isEqualTo(4);
        assertThat(start.canVote()).isTrue();
        assertThat(start.houses()).extracting(BudgetVoteHouse::houseLabel)
            .containsExactly("Casa 02", "Casa 03", "Casa 05", "Casa 07");

        assertForbidden(() -> voting.vote(budget.id, "APROVAR", admin));
        assertForbidden(() -> voting.vote(budget.id, "APROVAR", formerResident));
        assertThat(voting.summary(budget.id, admin).cannotVoteReason()).contains("moradores");

        voting.vote(budget.id, "APROVAR", voters.get(2));
        voting.vote(budget.id, "aprovar", voters.get(3));
        BudgetVotingSummary partial = voting.vote(budget.id, "RECUSAR", voters.get(5));
        assertThat(partial.open()).isTrue();
        assertThat(partial.approveVotes()).isEqualTo(2);
        assertThat(partial.rejectVotes()).isEqualTo(1);
        assertThat(partial.pendingVotes()).isEqualTo(1);
        assertThat(partial.myVote()).isEqualTo("RECUSAR");
        assertThat(partial.houses()).extracting(BudgetVoteHouse::voted).containsExactly(true, true, true, false);

        BudgetVotingSummary done = voting.vote(budget.id, "APROVAR", voters.get(7));
        assertThat(done.open()).isFalse();
        assertThat(done.status()).isEqualTo("APROVADO");
        assertThat(done.approveVotes()).isEqualTo(3);
        assertThat(done.closedAt()).isNotNull();
        assertThat(done.canVote()).isFalse();
        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("APROVADO");

        assertThatThrownBy(() -> voting.vote(budget.id, "RECUSAR", voters.get(5)))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void aMajorityDoesNotCloseTheVotingWhileAHouseCanStillVote() {
        Budget budget = newBudget("1500.00");
        voting.vote(budget.id, "APROVAR", voters.get(2));
        voting.vote(budget.id, "APROVAR", voters.get(3));

        BudgetVotingSummary majority = voting.vote(budget.id, "APROVAR", voters.get(5));

        assertThat(majority.approveVotes()).isEqualTo(3);
        assertThat(majority.open()).isTrue();
        assertThat(majority.status()).isEqualTo("EM_ANALISE");
        assertThat(voting.summary(budget.id, voters.get(7)).canVote()).isTrue();

        // The house that was left can still vote, even against: the last vote closes it and the result is the same.
        BudgetVotingSummary last = voting.vote(budget.id, "RECUSAR", voters.get(7));
        assertThat(last.open()).isFalse();
        assertThat(last.status()).isEqualTo("APROVADO");
        assertThat(last.approveVotes()).isEqualTo(3);
        assertThat(last.rejectVotes()).isEqualTo(1);

        // Without the last house, the deadline (or the admin) closes it and the majority decides.
        Budget waiting = newBudget("1600.00", BudgetVotingService.today());
        voting.vote(waiting.id, "APROVAR", voters.get(2));
        voting.vote(waiting.id, "APROVAR", voters.get(3));
        voting.vote(waiting.id, "APROVAR", voters.get(5));
        assertThat(voting.expireDue(BudgetVotingService.today().plusDays(1))).isEqualTo(1);
        assertThat(budgets.findById(waiting.id).orElseThrow().status).isEqualTo("APROVADO");
    }

    @Test
    void aLostVoteAlsoWaitsForEveryHouse() {
        Budget budget = newBudget("800.00");

        voting.vote(budget.id, "RECUSAR", voters.get(2));
        voting.vote(budget.id, "RECUSAR", voters.get(3));
        BudgetVotingSummary lost = voting.vote(budget.id, "RECUSAR", voters.get(5));
        assertThat(lost.open()).isTrue();
        assertThat(lost.rejectVotes()).isEqualTo(3);

        BudgetVotingSummary result = voting.vote(budget.id, "APROVAR", voters.get(7));

        assertThat(result.status()).isEqualTo("REJEITADO");
        assertThat(result.rejectVotes()).isEqualTo(3);
        assertThat(result.approveVotes()).isEqualTo(1);
    }

    @Test
    void housesCanChangeTheirVoteAndTheAdminCanCloseEarly() {
        Budget budget = newBudget("500.00");
        voting.vote(budget.id, "APROVAR", voters.get(2));
        BudgetVotingSummary changed = voting.vote(budget.id, "RECUSAR", voters.get(2));
        assertThat(changed.approveVotes()).isZero();
        assertThat(changed.rejectVotes()).isEqualTo(1);
        assertThat(votes.findByBudgetId(budget.id)).hasSize(1);

        voting.vote(budget.id, "APROVAR", voters.get(3));
        voting.vote(budget.id, "APROVAR", voters.get(5));
        BudgetVotingSummary closed = voting.close(budget.id, admin);
        assertThat(closed.status()).isEqualTo("APROVADO");

        // Without a majority of houses voting, closing early does not approve.
        Budget quiet = newBudget("90.00");
        voting.vote(quiet.id, "APROVAR", voters.get(2));
        assertThat(voting.close(quiet.id, admin).status()).isEqualTo("REJEITADO");
    }

    @Test
    void aNewResidentOfTheHouseVotesAgain() {
        Budget budget = newBudget("300.00");
        voting.vote(budget.id, "APROVAR", voters.get(7));

        Resident previous = residents.findById(voters.get(7).residentId).orElseThrow();
        previous.status = "INACTIVE";
        residents.save(previous);
        Resident next = residents.save(new Resident(previous.houseId, "Novo", "novo7@test.dev", null, null));

        BudgetVotingSummary summary = voting.summary(budget.id, user(next.id, "RESIDENT"));
        assertThat(summary.approveVotes()).isZero();
        assertThat(summary.myVote()).isNull();
        assertThat(summary.canVote()).isTrue();
    }

    @Test
    void editingTheTermsRestartsTheVotingAndOnlyVotesDecide() {
        Budget budget = newBudget("1000.00");
        voting.vote(budget.id, "APROVAR", voters.get(2));

        Budget notesOnly = copy(budget);
        notesOnly.notes = "Inclui material";
        workflow.updateBudget(budget.id, notesOnly);
        assertThat(voting.hasVotes(budget.id)).isTrue();

        Budget cheaper = copy(budget);
        cheaper.amount = new BigDecimal("900.00");
        workflow.updateBudget(budget.id, cheaper);
        assertThat(voting.hasVotes(budget.id)).isFalse();
        assertThat(budgets.findById(budget.id).orElseThrow().status).isEqualTo("EM_ANALISE");

        Budget forced = copy(cheaper);
        forced.status = "APROVADO";
        assertBadRequest(() -> workflow.updateBudget(budget.id, forced));

        voting.vote(budget.id, "APROVAR", voters.get(2));
        voting.vote(budget.id, "APROVAR", voters.get(3));
        voting.vote(budget.id, "APROVAR", voters.get(5));
        voting.vote(budget.id, "APROVAR", voters.get(7));
        Budget approved = budgets.findById(budget.id).orElseThrow();
        assertThat(approved.status).isEqualTo("APROVADO");

        // An approved budget without a service can still get notes, but not a new amount.
        Budget approvedNotes = copy(approved);
        approvedNotes.notes = "Pagar na entrega";
        assertThat(workflow.updateBudget(budget.id, approvedNotes).status).isEqualTo("APROVADO");
        Budget pricier = copy(approved);
        pricier.amount = new BigDecimal("1500.00");
        assertBadRequest(() -> workflow.updateBudget(budget.id, pricier));
        Budget reopen = copy(approved);
        reopen.status = "EM_ANALISE";
        assertBadRequest(() -> workflow.updateBudget(budget.id, reopen));
    }

    @Test
    void budgetsAreLinkedOnlyFromTheServiceOnceApproved() {
        ServiceOrder wall = workflow.saveService(service("Pintura do muro", null));

        // A stand-alone budget is not tied to any service until the service picks it, and editing it never links it:
        // the service id sent on edit is ignored.
        Budget budget = new Budget();
        budget.title = "Pintura";
        budget.supplier = "Pinturas Silva";
        budget.amount = new BigDecimal("2500.00");
        budget = workflow.saveBudget(budget);
        assertThat(budget.serviceId).isNull();
        Budget withService = copy(budget);
        withService.serviceId = wall.id;
        assertThat(workflow.updateBudget(budget.id, withService).serviceId).isNull();

        // A budget still being voted on cannot be picked in the service.
        Long budgetId = budget.id;
        assertBadRequest(() -> workflow.updateService(wall.id, service("Pintura do muro", budgetId)));

        voting.vote(budgetId, "APROVAR", voters.get(2));
        voting.vote(budgetId, "APROVAR", voters.get(3));
        voting.vote(budgetId, "APROVAR", voters.get(5));
        voting.vote(budgetId, "APROVAR", voters.get(7));
        assertThat(services.findById(wall.id).orElseThrow().approvedBudgetId).isNull();

        // Approved, the budget became its own service, carrying what the houses voted.
        Long ownService = budgets.findById(budgetId).orElseThrow().serviceId;
        assertThat(ownService).isNotNull().isNotEqualTo(wall.id);
        ServiceOrder opened = services.findById(ownService).orElseThrow();
        assertThat(opened.approvedBudgetId).isEqualTo(budgetId);
        assertThat(opened.status).isEqualTo("APROVADO");
        assertThat(opened.expectedValue).isEqualByComparingTo("2500.00");
        assertThat(opened.supplier).isEqualTo("Pinturas Silva");

        // Once linked, another service cannot take it.
        assertBadRequest(() -> workflow.updateService(wall.id, service("Pintura do muro", budgetId)));
        assertBadRequest(() -> workflow.saveService(service("Outro serviço", budgetId)));
        assertThat(services.findById(wall.id).orElseThrow().approvedBudgetId).isNull();
    }

    private ServiceOrder service(String title, Long approvedBudgetId) {
        ServiceOrder service = new ServiceOrder();
        service.title = title;
        service.description = "Descrição";
        service.approvedBudgetId = approvedBudgetId;
        return service;
    }

    private Budget newBudget(String amount) {
        return newBudget(amount, null);
    }

    private Budget newBudget(String amount, LocalDate votingDeadline) {
        Budget budget = new Budget();
        budget.title = "Orçamento " + amount;
        budget.supplier = "Fornecedor";
        budget.amount = new BigDecimal(amount);
        budget.votingDeadline = votingDeadline;
        budget.status = "APROVADO"; // ignored: new budgets always go to the vote
        return workflow.saveBudget(budget);
    }

    private Budget copy(Budget source) {
        Budget copy = new Budget();
        copy.serviceId = source.serviceId;
        copy.title = source.title;
        copy.supplier = source.supplier;
        copy.amount = source.amount;
        copy.status = source.status;
        copy.notes = source.notes;
        return copy;
    }

    private static AppUser user(Long residentId, String role) {
        AppUser user = new AppUser();
        user.role = role;
        user.residentId = residentId;
        return user;
    }

    private static void assertForbidden(Runnable action) {
        assertThatThrownBy(action::run)
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private static void assertBadRequest(Runnable action) {
        assertThatThrownBy(action::run)
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }
}
