package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Houses vote to approve or reject a budget.
 *
 * Participating houses are the active houses with an active resident. The voting stays open, even once a
 * majority is there, until every house has voted, the deadline passes or the admin closes it. It then passes
 * when more than half of the houses voted and yes beats no.
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
    private final AuditService audit;
    private final ServiceOrderRepository services;
    private final PushService push;
    private final AppUserRepository users;
    private final ReportLifecycle lifecycle;
    private final ProblemReportRepository reports;

    private static final ZoneId VILLAGE_ZONE = ZoneId.of("America/Sao_Paulo");

    BudgetVotingService(
        BudgetRepository budgets,
        BudgetVoteRepository votes,
        ResidentRepository residents,
        HouseRepository houses,
        DashboardEventService dashboardEvents,
        AuditService audit,
        ServiceOrderRepository services,
        PushService push,
        AppUserRepository users,
        ReportLifecycle lifecycle,
        ProblemReportRepository reports
    ) {
        this.reports = reports;
        this.lifecycle = lifecycle;
        this.users = users;
        this.push = push;
        this.services = services;
        this.audit = audit;
        this.budgets = budgets;
        this.votes = votes;
        this.residents = residents;
        this.houses = houses;
        this.dashboardEvents = dashboardEvents;
    }

    @Transactional
    public BudgetVotingSummary summary(Long budgetId, AppUser viewer) {
        expireDue(today());
        Budget budget = budgets.findById(budgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        return summarize(budget, votes.findByBudgetId(budget.id), participants(), houseLabels(), viewer);
    }

    @Transactional
    public List<BudgetVotingSummary> summaries(AppUser viewer) {
        expireDue(today());
        Map<Long, Resident> participants = participants();
        Map<Long, String> labels = houseLabels();
        Map<Long, List<BudgetVote>> votesByBudget = votes.findAll().stream()
            .collect(Collectors.groupingBy(vote -> vote.budgetId));
        return budgets.findAll().stream()
            .map(budget -> summarize(budget, votesByBudget.getOrDefault(budget.id, List.of()), participants, labels, viewer))
            .toList();
    }

    // A vote that arrives after the deadline closes the voting and is then refused: the closing must be kept.
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public BudgetVotingSummary vote(Long budgetId, String choice, AppUser voter) {
        String normalized = choice == null ? "" : choice.trim().toUpperCase();
        if (!APPROVE.equals(normalized) && !REJECT.equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voto inválido. Use APROVAR ou RECUSAR.");
        }
        Budget budget = lockOpenBudget(budgetId);
        if (budget.votingDeadline != null && budget.votingDeadline.isBefore(today())) {
            closeByTally(budget, "o prazo terminou");
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "O prazo desta votação terminou, então ela foi encerrada: orçamento " + ("APROVADO".equals(budget.status) ? "aprovado" : "recusado") + ".");
        }
        Map<Long, Resident> participants = participants();
        Resident resident = voterResident(voter, participants);
        if (resident == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Somente moradores das casas participantes podem votar.");
        }

        if (APPROVE.equals(normalized) && budget.serviceId != null) {
            // Quotes for the same service compete: a house approves at most one of them, so moving its "yes" to this
            // quote takes it back from the others and only one quote can ever reach the majority.
            for (Budget sibling : budgets.findByServiceIdOrderByAmountAsc(budget.serviceId)) {
                if (!sibling.id.equals(budget.id) && OPEN_STATUS.equals(sibling.status)) {
                    votes.findByBudgetIdAndHouseId(sibling.id, resident.houseId)
                        .filter(existing -> APPROVE.equals(existing.vote))
                        .ifPresent(votes::delete);
                }
            }
        }

        if (APPROVE.equals(normalized) && budget.problemReportId != null && budget.competes) {
            // Budgets of the same job compete too: a house approves only one of them.
            for (Budget rival : budgets.findByProblemReportId(budget.problemReportId)) {
                if (!rival.id.equals(budget.id) && rival.competes && OPEN_STATUS.equals(rival.status)) {
                    votes.findByBudgetIdAndHouseId(rival.id, resident.houseId)
                        .filter(existing -> APPROVE.equals(existing.vote))
                        .ifPresent(votes::delete);
                }
            }
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

        // A majority (for or against) does not close the voting: every house can still vote or change its vote until all
        // of them have voted, the deadline passes or the admin closes it.
        if (tally(votes.findByBudgetId(budget.id), participants).pending() == 0) {
            closeByTally(budget, null);
        }
        return summarize(budget, votes.findByBudgetId(budget.id), participants, houseLabels(), voter);
    }

    @Transactional
    public BudgetVotingSummary close(Long budgetId, AppUser admin) {
        Budget budget = lockOpenBudget(budgetId);
        closeByTally(budget, null);
        return summarize(budget, votes.findByBudgetId(budget.id), participants(), houseLabels(), admin);
    }

    /** Closes every voting whose deadline (the last day to vote) is before {@code today}. Returns how many were closed. */
    @Transactional
    public int expireDue(LocalDate today) {
        int closed = 0;
        for (Budget due : budgets.findByStatusAndVotingDeadlineBefore(OPEN_STATUS, today)) {
            Budget budget = budgets.findByIdForUpdate(due.id).orElse(null);
            if (budget != null && OPEN_STATUS.equals(budget.status)) {
                closeByTally(budget, "o prazo terminou");
                closed++;
            }
        }
        return closed;
    }

    /**
     * One reminder a day, on the last day and the day before, to the houses that have not voted yet. The reminder
     * only reaches phones that registered for notices. Returns how many votings had someone to remind.
     */
    @Transactional
    public int remindPending(LocalDate today) {
        int reminded = 0;
        Map<Long, Resident> participants = participants();
        for (Budget budget : budgets.findByStatus(OPEN_STATUS)) {
            if (budget.votingDeadline == null || today.equals(budget.remindedOn)) {
                continue;
            }
            long daysLeft = ChronoUnit.DAYS.between(today, budget.votingDeadline);
            if (daysLeft < 0 || daysLeft > 1) {
                continue;
            }
            Set<Long> voted = countedVotes(votes.findByBudgetId(budget.id), participants).stream()
                .map(vote -> vote.houseId)
                .collect(Collectors.toSet());
            List<Long> pendingUsers = participants.entrySet().stream()
                .filter(entry -> !voted.contains(entry.getKey()))
                .map(entry -> users.findByResidentId(entry.getValue().id))
                .flatMap(Optional::stream)
                .map(user -> user.id)
                .toList();
            if (!pendingUsers.isEmpty()) {
                push.notifyUsers(pendingUsers, "Falta o voto da sua casa",
                    budget.title + (daysLeft == 0 ? " encerra hoje." : " encerra amanhã."),
                    Map.of("type", "BUDGET", "id", budget.id));
                reminded++;
            }
            budget.remindedOn = today;
            budgets.save(budget);
        }
        return reminded;
    }

    static LocalDate today() {
        return LocalDate.now(VILLAGE_ZONE);
    }

    /** Passes when more than half of the houses voted and yes beats no; otherwise it is refused. */
    private void closeByTally(Budget budget, String reason) {
        Tally tally = tally(votes.findByBudgetId(budget.id), participants());
        boolean passed = tally.approve() + tally.reject() >= tally.needed() && tally.approve() > tally.reject();
        if (reason != null) {
            audit.record("BUDGET_EXPIRED", "BUDGET", budget.id, budget.title + " - " + reason);
        }
        decide(budget, passed ? "APROVADO" : "REJEITADO");
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
        audit.record("BUDGET_" + status, "BUDGET", budget.id, budget.title + " - " + AuditService.money(budget.amount));
        push.notifyResidents(
            "APROVADO".equals(status) ? "Orçamento aprovado" : "Orçamento recusado",
            budget.title + " - " + AuditService.money(budget.amount),
            Map.of("type", "BUDGET", "id", budget.id));
        if ("APROVADO".equals(status) && budget.serviceId != null) {
            chooseForService(budget);
        }
        if (budget.problemReportId != null) {
            followProblem(budget, status);
        }
        if ("APROVADO".equals(status) && budget.serviceId == null) {
            openService(budget);
        }
        dashboardEvents.publishDashboardChanged();
    }

    /**
     * An approved budget is a job to carry out: it becomes a service right away, with what the houses voted (supplier,
     * value, what will be done), so nobody has to type it again. A quote of an existing service goes to that service.
     */
    private void openService(Budget budget) {
        ProblemReport origin = budget.problemReportId == null ? null : reports.findById(budget.problemReportId).orElse(null);
        LocalDateTime now = LocalDateTime.now();
        ServiceOrder service = new ServiceOrder();
        service.title = budget.title;
        service.description = budget.scope == null || budget.scope.isBlank() ? budget.title : budget.scope;
        service.category = origin == null ? null : origin.category;
        service.priority = origin == null ? "MEDIA" : origin.priority;
        service.status = "APROVADO";
        service.expectedValue = budget.amount;
        service.supplier = budget.supplier;
        service.supplierDocument = budget.supplierDocument;
        service.plannedDate = budget.expectedDate;
        service.approvedBudgetId = budget.id;
        service.problemReportId = budget.problemReportId;
        service.createdAt = now;
        service.updatedAt = now;
        ServiceOrder saved = services.save(service);
        budget.serviceId = saved.id;
        budgets.save(budget);
        if (origin != null) {
            if (origin.serviceId == null) {
                origin.serviceId = saved.id;
                reports.save(origin);
            }
            lifecycle.note(origin.id, ProblemReportEvent.SERVICE, "Virou o serviço #" + saved.id + ": " + saved.title);
        }
        audit.record("SERVICE_CREATED", "SERVICE", saved.id, saved.title + " - do orçamento aprovado #" + budget.id + " - previsto "
            + AuditService.money(saved.expectedValue));
    }

    /**
     * The problem the budget was generated for hears about the result. When a budget wins, the budgets that competed
     * with it (same job) are closed as not chosen; when one is refused and nothing else is going, the problem is open again.
     */
    private void followProblem(Budget budget, String status) {
        String money = budget.title + " - " + AuditService.money(budget.amount);
        if ("APROVADO".equals(status)) {
            lifecycle.note(budget.problemReportId, ProblemReportEvent.BUDGET, "Orçamento aprovado pelas casas: " + money + ".");
            if (budget.competes) {
                for (Budget rival : budgets.findByProblemReportId(budget.problemReportId)) {
                    if (!rival.id.equals(budget.id) && rival.competes && OPEN_STATUS.equals(rival.status)) {
                        closeAsNotChosen(rival, budget);
                    }
                }
            }
        } else {
            lifecycle.note(budget.problemReportId, ProblemReportEvent.BUDGET, "Orçamento recusado: " + money + ".");
            lifecycle.reopenIfIdle(budget.problemReportId, "Nenhum orçamento ativo: o problema voltou para os abertos.");
        }
    }

    /** A budget of the same job that lost to the approved one: closed without a push "recusado", it just was not chosen. */
    private void closeAsNotChosen(Budget rival, Budget winner) {
        LocalDateTime now = LocalDateTime.now();
        rival.status = "REJEITADO";
        rival.votingClosedAt = now;
        rival.updatedAt = now;
        budgets.save(rival);
        audit.record("BUDGET_REJEITADO", "BUDGET", rival.id, rival.title + " - outro orçamento do mesmo trabalho foi aprovado");
        lifecycle.note(rival.problemReportId, ProblemReportEvent.BUDGET,
            "Orçamento não escolhido: " + rival.title + " - " + AuditService.money(rival.amount) + " (" + winner.supplier + " foi aprovado).");
    }

    /**
     * An approved quote becomes the budget of its service (which moves from planned to approved) and the other
     * quotes that were still being voted are closed as not chosen.
     */
    private void chooseForService(Budget chosen) {
        services.findById(chosen.serviceId).ifPresent(service -> {
            boolean open = !"FINALIZADO".equals(service.status) && !"CANCELADO".equals(service.status);
            if (open && service.approvedBudgetId == null) {
                service.approvedBudgetId = chosen.id;
                if ("PLANEJADO".equals(service.status)) {
                    service.status = "APROVADO";
                }
                if (service.expectedValue == null) {
                    service.expectedValue = chosen.amount;
                }
                if (service.supplier == null || service.supplier.isBlank()) {
                    service.supplier = chosen.supplier;
                    service.supplierDocument = chosen.supplierDocument;
                }
                service.updatedAt = LocalDateTime.now();
                services.save(service);
            }
        });
        for (Budget sibling : budgets.findByServiceIdOrderByAmountAsc(chosen.serviceId)) {
            if (!sibling.id.equals(chosen.id) && OPEN_STATUS.equals(sibling.status)) {
                decide(sibling, "REJEITADO");
            }
        }
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
            houseList,
            budget.votingDeadline
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
