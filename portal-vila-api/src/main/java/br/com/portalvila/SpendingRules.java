package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Where the money has to go through the houses. When the village sets a limit (Configurações), a service above it is
 * born from a budget the houses approved, what is paid cannot go much beyond that budget, and an expense typed straight
 * into the cash box needs a service or budget behind it. The only way around is an emergency, which needs a written
 * justification that everybody can read. With no limit set, none of this applies.
 */
@Component
class SpendingRules {
    /** What may be paid above the approved budget (freight, a small extra) before a new vote is needed. */
    static final BigDecimal TOLERANCE = new BigDecimal("0.10");
    static final int MIN_REASON = 20;
    private static final Set<String> ROUTINE = Set.of("energia", "água", "agua", "taxas");

    private final SettingsRepository settings;
    private final BudgetRepository budgets;
    private final ServiceOrderRepository services;

    SpendingRules(SettingsRepository settings, BudgetRepository budgets, ServiceOrderRepository services) {
        this.settings = settings;
        this.budgets = budgets;
        this.services = services;
    }

    Optional<BigDecimal> limit() {
        return settings.findAll().stream().findFirst().map(row -> row.budgetRequiredAbove);
    }

    /** Bills that repeat every month and cannot wait for a vote. */
    static boolean isRoutine(String category) {
        return category != null && ROUTINE.contains(category.trim().toLowerCase(Locale.ROOT));
    }

    static boolean validReason(String reason) {
        return reason != null && reason.trim().length() >= MIN_REASON;
    }

    /** A service is either small (its value is informed and within the limit) or backed by an approved budget. */
    void assertServiceAllowed(BigDecimal expectedValue, Long approvedBudgetId) {
        BigDecimal limit = limit().orElse(null);
        if (limit == null || approvedBudgetId != null) {
            return;
        }
        if (expectedValue == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Informe o valor previsto do serviço. Acima de " + AuditService.money(limit)
                    + " ele só nasce de um orçamento aprovado pelas casas.");
        }
        if (expectedValue.compareTo(limit) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Serviços acima de " + AuditService.money(limit) + " só nascem de um orçamento aprovado pelas casas. "
                    + "Gere o orçamento a partir do problema (ou em Orçamentos) e aguarde a votação.");
        }
    }

    /**
     * Checks a payment against the rules. Returns true when it is outside them but allowed because a valid emergency
     * justification came with it; the caller must record that justification.
     */
    boolean assertPaymentAllowed(ServiceOrder service, BigDecimal paid, String emergencyReason) {
        BigDecimal limit = limit().orElse(null);
        if (limit == null) {
            return false;
        }
        Budget approved = service.approvedBudgetId == null ? null : budgets.findById(service.approvedBudgetId).orElse(null);
        String problem;
        if (approved != null) {
            BigDecimal cap = approved.amount.multiply(BigDecimal.ONE.add(TOLERANCE));
            if (paid.compareTo(cap) <= 0) {
                return false;
            }
            problem = "O valor pago (" + AuditService.money(paid) + ") passa de 10% acima do orçamento aprovado ("
                + AuditService.money(approved.amount) + "). Gere e vote um novo orçamento para a diferença.";
        } else {
            if (paid.compareTo(limit) <= 0) {
                return false;
            }
            problem = "O valor pago (" + AuditService.money(paid) + ") passa de " + AuditService.money(limit)
                + " e este serviço não tem orçamento aprovado pelas casas.";
        }
        if (!validReason(emergencyReason)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                problem + " Se for uma emergência, escreva a justificativa (pelo menos " + MIN_REASON + " letras): ela aparece para todas as casas.");
        }
        return true;
    }

    /** An expense typed straight into the cash box, not coming from the finish action of a service. */
    void assertExpenseAllowed(Expense expense) {
        BigDecimal limit = limit().orElse(null);
        if (limit == null || expense.amount.compareTo(limit) <= 0 || isRoutine(expense.category)) {
            expense.exceptionReason = null;
            return;
        }
        boolean backedByService = expense.serviceOrderId != null
            && services.findById(expense.serviceOrderId).map(service -> "FINALIZADO".equals(service.status)).orElse(false);
        boolean backedByBudget = expense.budgetId != null
            && budgets.findById(expense.budgetId).map(budget -> "APROVADO".equals(budget.status)).orElse(false);
        if (backedByService || backedByBudget) {
            return;
        }
        if (!validReason(expense.exceptionReason)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Despesa acima de " + AuditService.money(limit) + " sem serviço nem orçamento aprovado precisa de justificativa "
                    + "(pelo menos " + MIN_REASON + " letras): ela aparece para todas as casas.");
        }
        expense.exceptionReason = expense.exceptionReason.trim();
    }
}
