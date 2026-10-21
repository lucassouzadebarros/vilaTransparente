package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

record ReportLine(String label, BigDecimal amount, int count) {
}

record ReportIncome(LocalDate date, String source, String description, BigDecimal amount) {
}

/** {@code voted}: the money is behind a budget the houses approved, or is a routine bill (energy, water, fees). */
record ReportExpense(Long id, LocalDate date, String description, String category, String supplier, BigDecimal amount, boolean hasDocument, boolean voted, String exceptionReason) {
}

record MonthlyReportResponse(
    String month,
    boolean transparencyEnabled,
    BigDecimal openingBalance,
    BigDecimal totalIncome,
    BigDecimal totalExpenses,
    BigDecimal closingBalance,
    List<ReportLine> incomeBySource,
    List<ReportLine> expensesByCategory,
    List<ReportIncome> incomes,
    List<ReportExpense> expenses,
    int expensesWithoutDocument,
    BigDecimal unvotedTotal,
    int unvotedCount
) {
}

record ReconciliationResponse(BigDecimal portalBalance, BigDecimal asaasBalance, BigDecimal difference, LocalDateTime checkedAt, String message) {
}

/**
 * The monthly statement the houses read: where the money came from, where it went, and what was left, with the
 * balance at the start and at the end of the month. Months are by payment date (cash), so each month starts
 * where the previous one ended.
 */
@Service
class ReportService {
    static final String OTHER_CATEGORY = "Outros";

    private final ContributionRepository contributions;
    private final ExpenseRepository expenses;
    private final DirectReceiptRepository directReceipts;
    private final HouseRepository houses;
    private final FinancialService financialService;
    private final PixGatewayClient gatewayClient;

    ReportService(
        ContributionRepository contributions,
        ExpenseRepository expenses,
        DirectReceiptRepository directReceipts,
        HouseRepository houses,
        FinancialService financialService,
        PixGatewayClient gatewayClient
    ) {
        this.contributions = contributions;
        this.expenses = expenses;
        this.directReceipts = directReceipts;
        this.houses = houses;
        this.financialService = financialService;
        this.gatewayClient = gatewayClient;
    }

    @Transactional(readOnly = true)
    public MonthlyReportResponse monthly(String month, boolean admin, Long residentId) {
        YearMonth reference = parse(month);
        boolean enabled = admin || financialService.transparencyEnabledFor(residentId);
        if (!enabled) {
            return new MonthlyReportResponse(reference.toString(), false, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, List.of(), List.of(), List.of(), List.of(), 0, BigDecimal.ZERO, 0);
        }
        LocalDate start = reference.atDay(1);
        LocalDate end = reference.atEndOfMonth();

        Map<Long, String> houseLabels = houses.findAll().stream()
            .filter(house -> house.label != null)
            .collect(Collectors.toMap(house -> house.id, house -> house.label, (a, b) -> a));

        List<ReportIncome> allIncomes = new ArrayList<>();
        for (Contribution contribution : contributions.findAll()) {
            if (!"PAID".equals(contribution.status)) {
                continue;
            }
            allIncomes.add(new ReportIncome(
                paymentDate(contribution),
                contribution.manualPayment ? "Pagamento manual" : "Contribuição via Pix",
                admin ? "Contribuição - " + houseLabels.getOrDefault(contribution.houseId, "casa " + contribution.houseId) : "Contribuição de uma casa",
                paidValue(contribution)
            ));
        }
        for (DirectReceipt receipt : directReceipts.findByStatusOrderByReceivedAtDesc("PAID")) {
            allIncomes.add(new ReportIncome(
                receipt.receivedAt.toLocalDate(),
                "Recebimento direto",
                // The payer's name is for the admin only.
                admin ? receipt.description : "Recebimento direto",
                receipt.amount
            ));
        }
        List<Expense> allExpenses = expenses.findAll();

        BigDecimal opening = sumIncomes(allIncomes.stream().filter(income -> income.date().isBefore(start)).toList())
            .subtract(sumExpenses(allExpenses.stream().filter(expense -> expense.expenseDate.isBefore(start)).toList()));

        List<ReportIncome> monthIncomes = allIncomes.stream()
            .filter(income -> !income.date().isBefore(start) && !income.date().isAfter(end))
            .sorted(Comparator.comparing(ReportIncome::date).reversed())
            .toList();
        List<Expense> monthExpenses = allExpenses.stream()
            .filter(expense -> !expense.expenseDate.isBefore(start) && !expense.expenseDate.isAfter(end))
            .sorted(Comparator.comparing((Expense expense) -> expense.expenseDate).reversed().thenComparing(expense -> expense.id, Comparator.reverseOrder()))
            .toList();

        BigDecimal totalIncome = sumIncomes(monthIncomes);
        BigDecimal totalExpenses = sumExpenses(monthExpenses);

        Map<String, List<ReportIncome>> bySource = monthIncomes.stream()
            .collect(Collectors.groupingBy(ReportIncome::source, LinkedHashMap::new, Collectors.toList()));
        List<ReportLine> incomeBySource = bySource.entrySet().stream()
            .map(entry -> new ReportLine(entry.getKey(), sumIncomes(entry.getValue()), entry.getValue().size()))
            .sorted(Comparator.comparing(ReportLine::amount).reversed())
            .toList();

        Map<String, List<Expense>> byCategory = monthExpenses.stream()
            .collect(Collectors.groupingBy(expense -> category(expense.category), LinkedHashMap::new, Collectors.toList()));
        List<ReportLine> expensesByCategory = byCategory.entrySet().stream()
            .map(entry -> new ReportLine(entry.getKey(), sumExpenses(entry.getValue()), entry.getValue().size()))
            .sorted(Comparator.comparing(ReportLine::amount).reversed())
            .toList();

        List<ReportExpense> expenseLines = monthExpenses.stream()
            .map(expense -> new ReportExpense(expense.id, expense.expenseDate, expense.description, category(expense.category),
                expense.supplier, expense.amount, expense.documentId != null,
                expense.budgetId != null || SpendingRules.isRoutine(expense.category), expense.exceptionReason))
            .toList();
        List<ReportExpense> unvoted = expenseLines.stream().filter(line -> !line.voted()).toList();

        return new MonthlyReportResponse(
            reference.toString(),
            true,
            opening,
            totalIncome,
            totalExpenses,
            opening.add(totalIncome).subtract(totalExpenses),
            incomeBySource,
            expensesByCategory,
            monthIncomes,
            expenseLines,
            (int) expenseLines.stream().filter(line -> !line.hasDocument()).count(),
            unvoted.stream().map(ReportExpense::amount).reduce(BigDecimal.ZERO, BigDecimal::add),
            unvoted.size()
        );
    }

    /** Portal balance against the balance Asaas reports. Read only: it never changes either side. */
    public ReconciliationResponse reconcile() {
        BigDecimal portal = financialService.dashboard(YearMonth.now().toString()).balance();
        BigDecimal asaas = null;
        String message;
        try {
            asaas = gatewayClient.getBalance();
        } catch (RuntimeException ex) {
            return new ReconciliationResponse(portal, null, null, LocalDateTime.now(), "Não consegui consultar o saldo no Asaas agora. Tente de novo em instantes.");
        }
        if (asaas == null) {
            return new ReconciliationResponse(portal, null, null, LocalDateTime.now(), "O Asaas não informou o saldo.");
        }
        BigDecimal difference = asaas.subtract(portal);
        if (difference.abs().compareTo(new BigDecimal("0.01")) < 0) {
            message = "Conferido: o saldo do portal e o do Asaas batem.";
        } else {
            message = "O Asaas está " + AuditService.money(difference.abs()) + (difference.signum() < 0 ? " abaixo" : " acima")
                + " do portal. Taxas e saídas feitas fora do portal precisam ser lançadas como despesa.";
        }
        return new ReconciliationResponse(portal, asaas, difference, LocalDateTime.now(), message);
    }

    private static YearMonth parse(String month) {
        try {
            return YearMonth.parse(month);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o mês no formato AAAA-MM.");
        }
    }

    private static LocalDate paymentDate(Contribution contribution) {
        if (contribution.paymentDate != null) {
            return contribution.paymentDate.toLocalDate();
        }
        try {
            return YearMonth.parse(contribution.referenceMonth).atDay(1);
        } catch (RuntimeException ex) {
            return contribution.createdAt.toLocalDate();
        }
    }

    private static BigDecimal paidValue(Contribution contribution) {
        return contribution.paidAmount == null || contribution.paidAmount.signum() == 0 ? contribution.amount : contribution.paidAmount;
    }

    private static String category(String value) {
        return value == null || value.isBlank() || "Manual".equalsIgnoreCase(value.trim()) ? OTHER_CATEGORY : value.trim();
    }

    private static BigDecimal sumIncomes(List<ReportIncome> list) {
        return list.stream().map(ReportIncome::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal sumExpenses(List<Expense> list) {
        return list.stream().map(expense -> expense.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
