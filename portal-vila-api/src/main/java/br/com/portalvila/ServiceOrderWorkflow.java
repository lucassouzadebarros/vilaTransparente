package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * The chain from a problem to the money: a budget is generated for the problem, goes to the houses' vote, and an approved
 * budget becomes a service, which is paid by the finish action. {@link SpendingRules} keeps the chain from being skipped
 * above the limit the village set.
 */
@Service
class ServiceOrderWorkflow {
    private static final Set<String> VALID_STATUSES = Set.of("PLANEJADO", "APROVADO", "EM_ANDAMENTO", "FINALIZADO", "CANCELADO");
    private static final Set<String> CLOSED_STATUSES = Set.of("FINALIZADO", "CANCELADO");

    private final ServiceOrderRepository services;
    private final BudgetRepository budgets;
    private final ExpenseRepository expenses;
    private final DashboardEventService dashboardEvents;
    private final BudgetVotingService voting;
    private final AuditService audit;
    private final ProblemReportRepository reports;
    private final PushService push;
    private final SpendingRules rules;
    private final ReportLifecycle lifecycle;

    ServiceOrderWorkflow(
        ServiceOrderRepository services,
        BudgetRepository budgets,
        ExpenseRepository expenses,
        DashboardEventService dashboardEvents,
        BudgetVotingService voting,
        AuditService audit,
        ProblemReportRepository reports,
        PushService push,
        SpendingRules rules,
        ReportLifecycle lifecycle
    ) {
        this.lifecycle = lifecycle;
        this.rules = rules;
        this.push = push;
        this.reports = reports;
        this.audit = audit;
        this.services = services;
        this.budgets = budgets;
        this.expenses = expenses;
        this.dashboardEvents = dashboardEvents;
        this.voting = voting;
    }

    @Transactional(readOnly = true)
    public List<ServiceOrder> listServices(String status) {
        if (status != null && !status.isBlank()) {
            return services.findByStatusOrderByCreatedAtDesc(status);
        }
        return services.findAll().stream()
            .sorted((a, b) -> b.createdAt.compareTo(a.createdAt))
            .toList();
    }

    /**
     * A new service is always open. Finishing books the payment on the cash box and cancelling is audited, so both have
     * their own actions. Above the village's limit a service is born from an approved budget (it then takes the problem,
     * the value and the supplier from it); below it, it can be created directly.
     */
    @Transactional
    public ServiceOrder saveService(ServiceOrder incoming) {
        validateService(incoming);
        incoming.id = null;
        Budget backing = backingBudget(incoming.approvedBudgetId);
        if (backing != null) {
            if (incoming.problemReportId == null) {
                incoming.problemReportId = backing.problemReportId;
            }
            if (incoming.expectedValue == null) {
                incoming.expectedValue = backing.amount;
            }
        }
        incoming.status = openStatus(incoming.status, incoming.approvedBudgetId);
        incoming.finalValue = null;
        incoming.completedDate = null;
        incoming.emergencyReason = null;
        if (incoming.priority == null || incoming.priority.isBlank()) {
            incoming.priority = "MEDIA";
        }
        rules.assertServiceAllowed(incoming.expectedValue, incoming.approvedBudgetId);
        ProblemReport origin = incoming.problemReportId == null ? null : lifecycle.openForBudget(incoming.problemReportId);
        incoming.updatedAt = LocalDateTime.now();
        ServiceOrder saved = services.save(incoming);
        reconcileServiceBudget(saved, null);
        if (origin != null) {
            if (origin.serviceId == null) {
                origin.serviceId = saved.id;
                reports.save(origin);
            }
            lifecycle.underAnalysis(origin);
            audit.record("REPORT_TO_SERVICE", "REPORT", origin.id, origin.title + " -> serviço #" + saved.id);
            lifecycle.note(origin.id, ProblemReportEvent.SERVICE, "Virou o serviço #" + saved.id + ": " + saved.title);
        }
        audit.record("SERVICE_CREATED", "SERVICE", saved.id, saved.title + valueNote(saved.expectedValue));
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public ServiceOrder updateService(Long id, ServiceOrder incoming) {
        validateService(incoming);
        ServiceOrder service = services.findById(id).orElseThrow();
        Long previousBudgetId = service.approvedBudgetId;
        service.title = incoming.title;
        service.description = incoming.description;
        service.category = incoming.category;
        service.priority = incoming.priority == null || incoming.priority.isBlank() ? "MEDIA" : incoming.priority;
        if (CLOSED_STATUSES.contains(service.status)) {
            // Finished or cancelled stays that way, and the paid value and date stay as the finish action recorded them.
            if (incoming.status != null && !incoming.status.isBlank() && !service.status.equals(normalizeStatus(incoming.status))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Um serviço finalizado ou cancelado não muda de situação por aqui.");
            }
        } else {
            service.status = openStatus(incoming.status == null || incoming.status.isBlank() ? service.status : incoming.status, incoming.approvedBudgetId);
            rules.assertServiceAllowed(incoming.expectedValue, incoming.approvedBudgetId);
            service.finalValue = null;
            service.completedDate = null;
        }
        service.expectedValue = incoming.expectedValue;
        service.supplier = incoming.supplier;
        service.supplierDocument = incoming.supplierDocument;
        service.plannedDate = incoming.plannedDate;
        service.approvedBudgetId = incoming.approvedBudgetId;
        service.notes = incoming.notes;
        service.updatedAt = LocalDateTime.now();
        ServiceOrder saved = services.save(service);
        reconcileServiceBudget(saved, previousBudgetId);
        audit.record("SERVICE_UPDATED", "SERVICE", saved.id, saved.title + valueNote(saved.expectedValue) + " - " + saved.status);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public void cancelService(Long id) {
        ServiceOrder service = services.findById(id).orElseThrow();
        if ("FINALIZADO".equals(service.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este serviço já foi finalizado e tem pagamento registrado. Corrija os dados pelo serviço em vez de cancelar.");
        }
        service.status = "CANCELADO";
        service.updatedAt = LocalDateTime.now();
        services.save(service);
        // Quotes still being voted for a cancelled service have nothing left to decide.
        for (Budget quote : budgets.findByServiceIdAndStatus(service.id, "EM_ANALISE")) {
            quote.status = "CANCELADO";
            quote.votingClosedAt = LocalDateTime.now();
            quote.updatedAt = LocalDateTime.now();
            budgets.save(quote);
            audit.record("BUDGET_CANCELADO", "BUDGET", quote.id, quote.title + " - serviço #" + service.id + " cancelado");
        }
        if (service.problemReportId != null) {
            reports.findById(service.problemReportId).ifPresent(report -> {
                report.serviceId = services.findByProblemReportId(report.id).stream()
                    .filter(other -> !"CANCELADO".equals(other.status))
                    .map(other -> other.id)
                    .findFirst()
                    .orElse(null);
                reports.save(report);
            });
            boolean reopened = lifecycle.reopenIfIdle(service.problemReportId,
                "O serviço #" + service.id + " foi cancelado e não há mais orçamento ou serviço ativo: o problema voltou para os abertos.");
            if (!reopened) {
                lifecycle.note(service.problemReportId, ProblemReportEvent.SERVICE, "O serviço #" + service.id + " foi cancelado.");
            }
        }
        audit.record("SERVICE_CANCELLED", "SERVICE", service.id, service.title);
        dashboardEvents.publishDashboardChanged();
    }

    /**
     * Every new budget goes to the houses' vote. It can be generated for a problem (and then competes with the other
     * budgets of that problem, or not, when it is another job) or stand alone. A budget still tied to a service (the
     * older way: quotes inside a service) keeps working.
     */
    @Transactional
    public Budget saveBudget(Budget budget) {
        // A new budget is always a new row: sending an id must never overwrite one that was already voted.
        Long forService = budget.serviceId;
        Long forReport = budget.problemReportId;
        boolean competes = budget.competes;
        budget.id = null;
        budget.createdAt = LocalDateTime.now();
        budget.serviceId = null;
        budget.problemReportId = null;
        budget.status = "EM_ANALISE";
        budget.votingClosedAt = null;
        budget.scope = blankToNull(budget.scope);
        budget.remindedOn = null;
        validateBudget(budget);
        validateDeadline(budget.votingDeadline);
        ProblemReport report = null;
        if (forReport != null) {
            report = lifecycle.openForBudget(forReport);
            if (competes && budgets.findByProblemReportId(report.id).stream()
                .anyMatch(other -> other.competes && "APROVADO".equals(other.status))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Este problema já tem um orçamento aprovado para o mesmo trabalho. Se este é outro trabalho, marque que ele não concorre com os outros.");
            }
            budget.problemReportId = report.id;
        }
        if (forService != null) {
            ServiceOrder service = services.findById(forService)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Serviço não encontrado."));
            if (CLOSED_STATUSES.contains(service.status) || service.approvedBudgetId != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Este serviço já está decidido ou encerrado e não recebe novas cotações.");
            }
            budget.serviceId = service.id;
        }
        budget.updatedAt = LocalDateTime.now();
        Budget saved = budgets.save(budget);
        if (report != null) {
            lifecycle.underAnalysis(report);
            lifecycle.note(report.id, ProblemReportEvent.BUDGET, "Orçamento gerado: " + saved.title + " - " + AuditService.money(saved.amount)
                + " (" + saved.supplier + ")" + (saved.competes ? "" : ", outro trabalho"));
        }
        audit.record("BUDGET_CREATED", "BUDGET", saved.id, saved.title + " - " + AuditService.money(saved.amount)
            + (saved.problemReportId == null ? "" : " (problema #" + saved.problemReportId + ")")
            + (saved.serviceId == null ? "" : " (cotação do serviço #" + saved.serviceId + ")"));
        push.notifyResidents("Nova votação", saved.title + " - " + AuditService.money(saved.amount) + ". Vote no aplicativo.",
            Map.of("type", "BUDGET", "id", saved.id));
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    /** Keeps the budget's links (problem, service) and whether it competes as they are: they are set once, when it is generated. */
    @Transactional
    public Budget updateBudget(Long id, Budget incoming) {
        Budget budget = budgets.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        validateBudget(incoming);
        String previousStatus = budget.status;
        String nextStatus = incoming.status == null || incoming.status.isBlank() ? previousStatus : incoming.status;
        boolean reopening = "EM_ANALISE".equals(nextStatus) && !"EM_ANALISE".equals(previousStatus);
        if (!nextStatus.equals(previousStatus)) {
            if ("APROVADO".equals(nextStatus) || "REJEITADO".equals(nextStatus)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A aprovação ou recusa é decidida pela votação das casas.");
            }
            if (reopening && "APROVADO".equals(previousStatus)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Orçamento aprovado não volta para votação. Cancele e cadastre um novo.");
            }
        }
        // People voted on this title, supplier and amount: changing them restarts the voting.
        String incomingScope = blankToNull(incoming.scope);
        boolean termsChanged = !budget.title.equals(incoming.title)
            || !budget.supplier.equals(incoming.supplier)
            || budget.amount.compareTo(incoming.amount) != 0
            || !Objects.equals(blankToNull(budget.scope), incomingScope);
        if (reopening) {
            voting.resetVotes(budget);
        } else if (termsChanged && voting.hasVotes(budget.id)) {
            if ("EM_ANALISE".equals(previousStatus)) {
                voting.resetVotes(budget);
            } else if (!"CANCELADO".equals(previousStatus)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este orçamento já foi votado. Para mudar título, fornecedor ou valor, cadastre um novo orçamento.");
            }
        }
        budget.title = incoming.title;
        budget.supplier = incoming.supplier;
        budget.supplierDocument = incoming.supplierDocument;
        budget.phone = incoming.phone;
        budget.amount = incoming.amount;
        budget.budgetDate = incoming.budgetDate;
        budget.validUntil = incoming.validUntil;
        budget.expectedDate = incoming.expectedDate;
        budget.documentId = incoming.documentId;
        budget.status = nextStatus;
        if ("EM_ANALISE".equals(nextStatus)) {
            LocalDate deadline = incoming.votingDeadline;
            if (!Objects.equals(deadline, budget.votingDeadline)) {
                validateDeadline(deadline);
            } else if (reopening && deadline != null && deadline.isBefore(BudgetVotingService.today())) {
                // A reopened voting would otherwise close again at once because of its old deadline.
                deadline = null;
            }
            budget.votingDeadline = deadline;
            budget.remindedOn = null;
        }
        budget.scope = incomingScope;
        budget.notes = incoming.notes;
        budget.updatedAt = LocalDateTime.now();
        Budget saved = budgets.save(budget);
        audit.record("BUDGET_UPDATED", "BUDGET", saved.id, saved.title + " - " + AuditService.money(saved.amount));
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public void cancelBudget(Long id) {
        Budget budget = budgets.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        budget.status = "CANCELADO";
        budget.updatedAt = LocalDateTime.now();
        budgets.save(budget);
        audit.record("BUDGET_CANCELADO", "BUDGET", budget.id, budget.title + " - " + AuditService.money(budget.amount));
        if (budget.problemReportId != null) {
            boolean reopened = lifecycle.reopenIfIdle(budget.problemReportId,
                "O orçamento \"" + budget.title + "\" foi cancelado e não há mais orçamento ou serviço ativo: o problema voltou para os abertos.");
            if (!reopened) {
                lifecycle.note(budget.problemReportId, ProblemReportEvent.BUDGET, "Orçamento cancelado: " + budget.title + ".");
            }
        }
        dashboardEvents.publishDashboardChanged();
    }

    @Transactional
    public ServiceOrder finishService(Long id, FinishServiceRequest request) {
        ServiceOrder service = services.findById(id).orElseThrow();
        if ("CANCELADO".equals(service.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este serviço foi cancelado e não pode ser finalizado.");
        }
        if (request.finalValue().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o valor final pago, maior que zero.");
        }
        // Finishing again may fix the note or the supplier, but must not book the same payment twice.
        if (request.generateExpense() && !expenses.findByServiceOrderId(service.id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A despesa deste serviço já foi lançada. Finalize sem gerar despesa para só atualizar os dados.");
        }
        // What is paid has to stay close to what the houses approved, in any state the service is in.
        boolean emergency = rules.assertPaymentAllowed(service, request.finalValue(), request.emergencyReason());
        service.status = "FINALIZADO";
        service.finalValue = request.finalValue();
        service.completedDate = request.completedDate();
        service.supplier = request.supplier();
        service.supplierDocument = request.supplierDocument();
        service.notes = request.notes();
        service.emergencyReason = emergency ? request.emergencyReason().trim() : null;
        service.updatedAt = LocalDateTime.now();
        service = services.save(service);

        if (request.generateExpense()) {
            Expense expense = new Expense();
            expense.description = "Serviço finalizado: " + service.title;
            expense.category = service.category;
            expense.amount = request.finalValue();
            expense.expenseDate = request.completedDate();
            expense.supplier = request.supplier();
            expense.paymentMethod = "PIX";
            expense.notes = request.notes();
            expense.documentId = request.documentId();
            expense.serviceOrderId = service.id;
            expense.budgetId = service.approvedBudgetId;
            expense.exceptionReason = service.emergencyReason;
            expenses.save(expense);
        }
        audit.record("SERVICE_FINISHED", "SERVICE", service.id,
            service.title + " - pago " + AuditService.money(request.finalValue())
                + (service.expectedValue == null ? "" : " (previsto " + AuditService.money(service.expectedValue) + ")")
                + (request.generateExpense() ? " - despesa lançada" : " - sem despesa")
                + (emergency ? " - EMERGÊNCIA sem votação: " + service.emergencyReason : ""));
        if (service.problemReportId != null) {
            lifecycle.resolveIfDone(service.problemReportId, service.id);
        }
        dashboardEvents.publishDashboardChanged();
        return service;
    }

    private Budget backingBudget(Long approvedBudgetId) {
        if (approvedBudgetId == null) {
            return null;
        }
        return budgets.findById(approvedBudgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento vinculado não encontrado."));
    }

    private static void validateDeadline(LocalDate deadline) {
        if (deadline != null && deadline.isBefore(BudgetVotingService.today())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O prazo da votação não pode estar no passado.");
        }
    }

    private static String valueNote(BigDecimal value) {
        return value == null ? "" : " - previsto " + AuditService.money(value);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String normalizeStatus(String status) {
        String value = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!VALID_STATUSES.contains(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Situação do serviço inválida.");
        }
        return value;
    }

    /** The situation a service can have while it is open. "Aprovado" follows the budget the houses approved. */
    private static String openStatus(String requested, Long approvedBudgetId) {
        String status = requested == null || requested.isBlank() ? "PLANEJADO" : normalizeStatus(requested);
        if ("FINALIZADO".equals(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Para finalizar um serviço use a ação \"Finalizar\": é ela que lança o pagamento no caixa.");
        }
        if ("CANCELADO".equals(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Para cancelar um serviço use a ação \"Cancelar serviço\".");
        }
        if ("EM_ANDAMENTO".equals(status)) {
            return status;
        }
        return approvedBudgetId != null ? "APROVADO" : "PLANEJADO";
    }

    private void validateService(ServiceOrder service) {
        if (service == null || service.title == null || service.title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título do serviço obrigatório.");
        }
        if (service.description == null || service.description.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrição do serviço obrigatória.");
        }
    }

    private void validateBudget(Budget budget) {
        if (budget == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dados do orçamento obrigatórios.");
        }
        if (budget.title == null || budget.title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título do orçamento obrigatório.");
        }
        if (budget.supplier == null || budget.supplier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fornecedor do orçamento obrigatório.");
        }
        if (budget.amount == null || budget.amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valor do orçamento deve ser maior que zero.");
        }
    }

    private void reconcileServiceBudget(ServiceOrder service, Long previousBudgetId) {
        if (previousBudgetId != null && !previousBudgetId.equals(service.approvedBudgetId)) {
            budgets.findById(previousBudgetId).ifPresent(previous -> {
                if (service.id.equals(previous.serviceId)) {
                    previous.serviceId = null;
                    previous.updatedAt = LocalDateTime.now();
                    budgets.save(previous);
                }
            });
        }
        if (service.approvedBudgetId == null) {
            return;
        }
        Budget budget = budgets.findById(service.approvedBudgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento vinculado não encontrado."));
        if (!"APROVADO".equals(budget.status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Somente orçamentos aprovados podem ser vinculados a um serviço.");
        }
        if (budget.serviceId != null && !budget.serviceId.equals(service.id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este orçamento já está vinculado ao serviço #" + budget.serviceId + ".");
        }
        budget.serviceId = service.id;
        budget.updatedAt = LocalDateTime.now();
        budgets.save(budget);
    }
}
