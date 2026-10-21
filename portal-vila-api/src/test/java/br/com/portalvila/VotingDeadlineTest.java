package br.com.portalvila;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

/** A voting has a last day: it closes by itself afterwards, and the houses that have not voted are reminded. */
@SpringBootTest
@ActiveProfiles("test")
class VotingDeadlineTest {
    @Autowired BudgetVotingService voting;
    @Autowired ServiceOrderWorkflow workflow;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired AppUserRepository users;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @MockBean PushService push;
    @MockBean PixGatewayClient gatewayClient;

    /** Voters by house number: houses 02, 03, 05 and 07 take part, so 3 yes votes approve. */
    final Map<Integer, AppUser> voters = new HashMap<>();

    @BeforeEach
    void setUp() {
        reset(push);
        votes.deleteAll();
        budgets.deleteAll();
        services.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        voters.clear();
        for (int number : new int[]{2, 3, 5, 7}) {
            House house = houses.save(new House(number, String.format("Casa %02d", number)));
            Resident resident = residents.save(new Resident(house.id, "Morador " + number, "morador" + number + "@test.dev", null, null));
            voters.put(number, users.save(new AppUser("Morador " + number, "morador" + number + "@test.dev", "x", "RESIDENT", resident.id)));
        }
    }

    private static LocalDate today() {
        return BudgetVotingService.today();
    }

    private Budget budget(String title, LocalDate deadline) {
        Budget budget = new Budget();
        budget.title = title;
        budget.supplier = "Fornecedor";
        budget.amount = new BigDecimal("1000.00");
        budget.votingDeadline = deadline;
        return workflow.saveBudget(budget);
    }

    /** Moves the deadline into the past, as if the days had gone by. */
    private void letDeadlinePass(Budget budget) {
        Budget stored = budgets.findById(budget.id).orElseThrow();
        stored.votingDeadline = today().minusDays(1);
        budgets.save(stored);
    }

    @Test
    void aVotingClosesByItselfWhenItsDeadlinePasses() {
        Budget passes = budget("Passa", today());
        voting.vote(passes.id, "APROVAR", voters.get(2));
        voting.vote(passes.id, "APROVAR", voters.get(3));
        voting.vote(passes.id, "RECUSAR", voters.get(5));
        Budget fails = budget("Nao passa", today());
        voting.vote(fails.id, "APROVAR", voters.get(2));
        Budget stillOpen = budget("Dentro do prazo", today());
        Budget noDeadline = budget("Sem prazo", null);

        // On the last day itself the voting is still open.
        assertThat(voting.expireDue(today())).isZero();

        letDeadlinePass(passes);
        letDeadlinePass(fails);
        assertThat(voting.expireDue(today())).isEqualTo(2);

        assertThat(budgets.findById(passes.id).orElseThrow().status).isEqualTo("APROVADO");
        assertThat(budgets.findById(fails.id).orElseThrow().status).isEqualTo("REJEITADO");
        assertThat(budgets.findById(stillOpen.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        assertThat(budgets.findById(noDeadline.id).orElseThrow().status).isEqualTo("EM_ANALISE");
        assertThat(budgets.findById(passes.id).orElseThrow().votingClosedAt).isNotNull();
    }

    @Test
    void readingTheVotingsClosesTheOnesThatAreDue() {
        Budget late = budget("Atrasada", today());
        letDeadlinePass(late);

        List<BudgetVotingSummary> summaries = voting.summaries(voters.get(2));

        BudgetVotingSummary summary = summaries.stream().filter(item -> item.budgetId().equals(late.id)).findFirst().orElseThrow();
        assertThat(summary.open()).isFalse();
        assertThat(summary.status()).isEqualTo("REJEITADO");
    }

    @Test
    void aVoteAfterTheDeadlineClosesTheVotingAndIsRefused() {
        Budget late = budget("Atrasada", today());
        letDeadlinePass(late);

        assertThatThrownBy(() -> voting.vote(late.id, "APROVAR", voters.get(2)))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                assertThat(ex.getReason()).contains("prazo");
            });

        // The closing is kept even though the request failed, and the late vote was not counted.
        assertThat(budgets.findById(late.id).orElseThrow().status).isEqualTo("REJEITADO");
        assertThat(votes.findByBudgetId(late.id)).isEmpty();
    }

    @Test
    void theDeadlineCannotBeInThePast() {
        Budget budget = new Budget();
        budget.title = "Velho";
        budget.supplier = "Fornecedor";
        budget.amount = BigDecimal.TEN;
        budget.votingDeadline = today().minusDays(1);
        assertThatThrownBy(() -> workflow.saveBudget(budget))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        Budget saved = budget("Novo", today().plusDays(5));
        assertThat(saved.votingDeadline).isEqualTo(today().plusDays(5));
        assertThat(voting.summary(saved.id, voters.get(2)).deadline()).isEqualTo(today().plusDays(5));

        Budget edit = new Budget();
        edit.title = saved.title;
        edit.supplier = saved.supplier;
        edit.amount = saved.amount;
        edit.status = saved.status;
        edit.votingDeadline = today().minusDays(2);
        assertThatThrownBy(() -> workflow.updateBudget(saved.id, edit))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        edit.votingDeadline = today().plusDays(9);
        assertThat(workflow.updateBudget(saved.id, edit).votingDeadline).isEqualTo(today().plusDays(9));
    }

    @Test
    @SuppressWarnings("unchecked")
    void housesThatHaveNotVotedAreRemindedOnceADay() {
        Budget closing = budget("Fecha amanha", today().plusDays(1));
        budget("Fecha em tres dias", today().plusDays(3));
        voting.vote(closing.id, "APROVAR", voters.get(2));
        voting.vote(closing.id, "RECUSAR", voters.get(3));

        assertThat(voting.remindPending(today())).isEqualTo(1);

        ArgumentCaptor<List<Long>> recipients = ArgumentCaptor.forClass(List.class);
        verify(push).notifyUsers(recipients.capture(), anyString(), anyString(), any());
        assertThat(recipients.getValue()).containsExactlyInAnyOrder(voters.get(5).id, voters.get(7).id);
        assertThat(budgets.findById(closing.id).orElseThrow().remindedOn).isEqualTo(today());

        // The same day nothing more goes out; the next day (the last one) the reminder comes again.
        reset(push);
        assertThat(voting.remindPending(today())).isZero();
        verify(push, never()).notifyUsers(anyList(), anyString(), anyString(), any());
        assertThat(voting.remindPending(today().plusDays(1))).isEqualTo(1);
    }
}
