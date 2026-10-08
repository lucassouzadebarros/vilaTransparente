package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Houses vote to approve or reject a budget.
 *
 * Participating houses are the active houses with an active resident. A budget is approved as soon as
 * more than half of them vote yes, and rejected as soon as that can no longer happen. The admin can also
 * close the voting early: it then passes when more than half of the houses voted and yes beats no.
 */
@Service
class BudgetVotingService {
    static final String APPROVE = "APROVAR";
    static final String REJECT = "RECUSAR";
    static final String OPEN_STATUS = "EM_ANALISE";

    private final BudgetRepository budgets;
    private final BudgetVoteRepository votes;
    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final DashboardEventService dashboardEvents;

    BudgetVotingService(
        BudgetRepository budgets,
        BudgetVoteRepository votes,
        ResidentRepository residents,
        HouseRepository houses,
        DashboardEventService dashboardEvents
    ) {
        this.budgets = budgets;
        this.votes = votes;
        this.residents = residents;
        this.houses = houses;
        this.dashboardEvents = dashboardEvents;
    }

    @Transactional(readOnly = true)
    public BudgetVotingSummary summary(Long budgetId, AppUser viewer) {
        Budget budget = budgets.findById(budgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        return summarize(budget, votes.findByBudgetId(budget.id), participants(), houseLabels(), viewer);
    }

    @Transactional(readOnly = true)
    public List<BudgetVotingSummary> summaries(AppUser viewer) {
        Map<Long, Resident> participants = participants();
        Map<Long, String> labels = houseLabels();
        Map<Long, List<BudgetVote>> votesByBudget = votes.findAll().stream()
            .collect(Collectors.groupingBy(vote -> vote.budgetId));
        return budgets.findAll().stream()
            .map(budget -> summarize(budget, votesByBudget.getOrDefault(budget.id, List.of()), participants, labels, viewer))
            .toList();
    }

    @Transactional
    public BudgetVotingSummary vote(Long budgetId, String choice, AppUser voter) {
        String normalized = choice == null ? "" : choice.trim().toUpperCase();
        if (!APPROVE.equals(normalized) && !REJECT.equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voto inválido. Use APROVAR ou RECUSAR.");
        }
        Budget budget = lockOpenBudget(budgetId);
        Map<Long, Resident> participants = participants();
        Resident resident = voterResident(voter, participants);
        if (resident == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Somente moradores das casas participantes podem votar.");
        }

        BudgetVote vote = votes.findByBudgetIdAndHouseId(budget.id, resident.houseId).orElseGet(() -> {
            BudgetVote created = new BudgetVote();
            created.budgetId = budget.id;
            created.houseId = resident.houseId;
            return created;
        });
        vote.residentId = resident.id;
        vote.vote = normalized;
        vote.updatedAt = LocalDateTime.now();
        votes.save(vote);

        Tally tally = tally(votes.findByBudgetId(budget.id), participants);
        if (tally.approve() >= tally.needed()) {
            decide(budget, "APROVADO");
        } else if (tally.approve() + tally.pending() < tally.needed()) {
            decide(budget, "REJEITADO");
        }
        return summarize(budget, votes.findByBudgetId(budget.id), participants, houseLabels(), voter);
    }

    @Transactional
    public BudgetVotingSummary close(Long budgetId, AppUser admin) {
        Budget budget = lockOpenBudget(budgetId);
        Map<Long, Resident> participants = participants();
        Tally tally = tally(votes.findByBudgetId(budget.id), participants);
        boolean passed = tally.approve() + tally.reject() >= tally.needed() && tally.approve() > tally.reject();
        decide(budget, passed ? "APROVADO" : "REJEITADO");
        return summarize(budget, votes.findByBudgetId(budget.id), participants, houseLabels(), admin);
    }

    boolean hasVotes(Long budgetId) {
        return votes.existsByBudgetId(budgetId);
    }

    /** Starts the voting over: used when the budget changes or is reopened. */
    void resetVotes(Budget budget) {
        votes.deleteByBudgetId(budget.id);
        budget.votingClosedAt = null;
    }

    private Budget lockOpenBudget(Long budgetId) {
        Budget budget = budgets.findByIdForUpdate(budgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        if (!OPEN_STATUS.equals(budget.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A votação deste orçamento já foi encerrada.");
        }
        return budget;
    }

    private void decide(Budget budget, String status) {
        LocalDateTime now = LocalDateTime.now();
        budget.status = status;
        budget.votingClosedAt = now;
        budget.updatedAt = now;
        budgets.save(budget);
        dashboardEvents.publishDashboardChanged();
    }

    private BudgetVotingSummary summarize(
        Budget budget,
        List<BudgetVote> budgetVotes,
        Map<Long, Resident> participants,
        Map<Long, String> labels,
        AppUser viewer
    ) {
        boolean open = OPEN_STATUS.equals(budget.status);
        // While open only the current resident of each participating house counts; once closed the votes are frozen.
        List<BudgetVote> counted = open ? countedVotes(budgetVotes, participants) : budgetVotes;
        int approve = (int) counted.stream().filter(vote -> APPROVE.equals(vote.vote)).count();
        int reject = counted.size() - approve;
        int participating = participants.size();
        int pending = open ? Math.max(0, participating - counted.size()) : 0;

        Resident voter = voterResident(viewer, participants);
        String myVote = voter == null ? null : counted.stream()
            .filter(vote -> vote.houseId.equals(voter.houseId) && vote.residentId.equals(voter.id))
            .map(vote -> vote.vote)
            .findFirst()
            .orElse(null);
        String cannotVoteReason = !open
            ? "A votação deste orçamento foi encerrada."
            : voter == null ? "Somente moradores das casas participantes podem votar." : null;

        Set<Long> votedHouses = counted.stream().map(vote -> vote.houseId).collect(Collectors.toSet());
        Set<Long> listedHouses = new HashSet<>(votedHouses);
        if (open) {
            listedHouses.addAll(participants.keySet());
        }
        List<BudgetVoteHouse> houseList = listedHouses.stream()
            .map(houseId -> new BudgetVoteHouse(houseId, labels.getOrDefault(houseId, "Casa " + houseId), votedHouses.contains(houseId)))
            .sorted(Comparator.comparing(BudgetVoteHouse::houseLabel))
            .toList();

        return new BudgetVotingSummary(
            budget.id,
            budget.status,
            open,
            participating,
            votesNeeded(participating),
            approve,
            reject,
            pending,
            myVote,
            cannotVoteReason == null,
            cannotVoteReason,
            budget.votingClosedAt,
            houseList
        );
    }

    private Tally tally(List<BudgetVote> budgetVotes, Map<Long, Resident> participants) {
        List<BudgetVote> counted = countedVotes(budgetVotes, participants);
        int approve = (int) counted.stream().filter(vote -> APPROVE.equals(vote.vote)).count();
        int reject = counted.size() - approve;
        int participating = participants.size();
        return new Tally(approve, reject, Math.max(0, participating - counted.size()), votesNeeded(participating));
    }

    private List<BudgetVote> countedVotes(List<BudgetVote> budgetVotes, Map<Long, Resident> participants) {
        List<BudgetVote> counted = new ArrayList<>();
        for (BudgetVote vote : budgetVotes) {
            Resident current = participants.get(vote.houseId);
            if (current != null && current.id.equals(vote.residentId)) {
                counted.add(vote);
            }
        }
        return counted;
    }

    /** More than half of the participating houses: 3 of 4, 3 of 5, 4 of 6. */
    private static int votesNeeded(int participating) {
        return participating / 2 + 1;
    }

    private Resident voterResident(AppUser user, Map<Long, Resident> participants) {
        if (user == null || user.residentId == null) {
            return null;
        }
        return participants.values().stream()
            .filter(resident -> resident.id.equals(user.residentId))
            .findFirst()
            .orElse(null);
    }

    /** Active houses that have an active resident, keyed by house id. */
    private Map<Long, Resident> participants() {
        Set<Long> activeHouses = houses.findByActiveTrueOrderByNumberAsc().stream()
            .map(house -> house.id)
            .collect(Collectors.toSet());
        Map<Long, Resident> byHouse = new LinkedHashMap<>();
        for (Resident resident : residents.findByStatusOrderByCreatedAtDesc("ACTIVE")) {
            if (activeHouses.contains(resident.houseId)) {
                byHouse.putIfAbsent(resident.houseId, resident);
            }
        }
        return byHouse;
    }

    private Map<Long, String> houseLabels() {
        return houses.findAll().stream().collect(Collectors.toMap(house -> house.id, house -> house.label, (a, b) -> a));
    }

    private record Tally(int approve, int reject, int pending, int needed) {
    }
}
