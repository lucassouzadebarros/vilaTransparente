package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One-off cleanup of the records created while testing in production. The app only cancels budgets, services
 * and reports, so this is the only way to really remove them. It takes only what is clearly a test (title starting
 * with "TESTE", plus the old "Orçamento de teste" quote) and stops if money or a real record points at them.
 * A dry run executes the same code and rolls back. Remove this file after the cleanup has been applied.
 */
@Service
class TestDataCleanupService {
    private static final String PREFIX = "TESTE";
    private static final String OLD_QUOTE_TITLE = "Orçamento de teste";
    private static final String OLD_QUOTE_SUPPLIER = "Fornecedor de teste";
    private static final int MAX_REPORTS = 1;
    private static final int MAX_SERVICES = 3;
    private static final int MAX_BUDGETS = 3;

    private final ProblemReportRepository reports;
    private final ProblemReportEventRepository events;
    private final ServiceOrderRepository services;
    private final BudgetRepository budgets;
    private final BudgetVoteRepository votes;
    private final PortalDocumentRepository documents;
    private final ExpenseRepository expenses;
    private final DocumentStorage storage;
    private final AuditService audit;
    private final DashboardEventService dashboardEvents;
    private final TransactionTemplate transaction;

    TestDataCleanupService(
        ProblemReportRepository reports,
        ProblemReportEventRepository events,
        ServiceOrderRepository services,
        BudgetRepository budgets,
        BudgetVoteRepository votes,
        PortalDocumentRepository documents,
        ExpenseRepository expenses,
        DocumentStorage storage,
        AuditService audit,
        DashboardEventService dashboardEvents,
        PlatformTransactionManager transactionManager
    ) {
        this.reports = reports;
        this.events = events;
        this.services = services;
        this.budgets = budgets;
        this.votes = votes;
        this.documents = documents;
        this.expenses = expenses;
        this.storage = storage;
        this.audit = audit;
        this.dashboardEvents = dashboardEvents;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    TestDataCleanupReport cleanup(boolean apply) {
        List<PortalDocument> removedDocuments = new ArrayList<>();
        TestDataCleanupReport report = transaction.execute(status -> {
            TestDataCleanupReport result = run(apply, removedDocuments);
            if (!apply) {
                status.setRollbackOnly();
            }
            return result;
        });
        if (apply && report != null) {
            // Stored files go only after the rows are really gone.
            removedDocuments.forEach(storage::delete);
            dashboardEvents.publishDashboardChanged();
        }
        return report;
    }

    private TestDataCleanupReport run(boolean apply, List<PortalDocument> removedDocuments) {
        List<ProblemReport> testReports = reports.findAll().stream().filter(r -> isTest(r.title)).toList();
        List<ServiceOrder> testServices = services.findAll().stream().filter(s -> isTest(s.title)).toList();
        List<Budget> testBudgets = budgets.findAll().stream().filter(this::isTestBudget).toList();
        Set<Long> reportIds = ids(testReports.stream().map(r -> r.id).toList());
        Set<Long> serviceIds = ids(testServices.stream().map(s -> s.id).toList());
        Set<Long> budgetIds = ids(testBudgets.stream().map(b -> b.id).toList());

        guard(testReports.size() <= MAX_REPORTS, "Achei " + testReports.size() + " relatos de teste (esperado ate " + MAX_REPORTS + ").");
        guard(testServices.size() <= MAX_SERVICES, "Achei " + testServices.size() + " servicos de teste (esperado ate " + MAX_SERVICES + ").");
        guard(testBudgets.size() <= MAX_BUDGETS, "Achei " + testBudgets.size() + " orcamentos de teste (esperado ate " + MAX_BUDGETS + ").");
        guard(expenses.findAll().stream().noneMatch(e -> serviceIds.contains(e.serviceOrderId) || budgetIds.contains(e.budgetId)),
            "Ha despesa ligada a servico ou orcamento de teste. Nada foi apagado.");
        guard(budgets.findAll().stream().noneMatch(b -> !budgetIds.contains(b.id) && serviceIds.contains(b.serviceId)),
            "Ha orcamento real ligado a servico de teste. Nada foi apagado.");
        guard(services.findAll().stream().noneMatch(s -> !serviceIds.contains(s.id)
                && (budgetIds.contains(s.approvedBudgetId) || reportIds.contains(s.problemReportId))),
            "Ha servico real ligado a orcamento ou relato de teste. Nada foi apagado.");

        List<TestDataItem> items = new ArrayList<>();
        testReports.forEach(r -> items.add(new TestDataItem("relato", r.id, r.title, r.status)));
        testServices.forEach(s -> items.add(new TestDataItem("servico", s.id, s.title, s.status)));
        testBudgets.forEach(b -> items.add(new TestDataItem("orcamento", b.id, b.title, b.status + " - " + AuditService.money(b.amount))));

        int deletedVotes = 0;
        for (Budget budget : testBudgets) {
            List<BudgetVote> budgetVotes = votes.findByBudgetId(budget.id);
            deletedVotes += budgetVotes.size();
            votes.deleteAll(budgetVotes);
        }
        List<PortalDocument> related = new ArrayList<>();
        budgetIds.forEach(id -> related.addAll(documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc("BUDGET", id)));
        serviceIds.forEach(id -> related.addAll(documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc("SERVICE", id)));
        reportIds.forEach(id -> related.addAll(documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc("PROBLEM_REPORT", id)));
        documents.deleteAll(related);
        int deletedEvents = 0;
        for (ProblemReport report : testReports) {
            List<ProblemReportEvent> reportEvents = events.findByReportIdOrderByCreatedAtAscIdAsc(report.id);
            deletedEvents += reportEvents.size();
            events.deleteAll(reportEvents);
        }
        // budgets.service_id references service_orders: quotes first, then the services.
        budgets.deleteAll(testBudgets);
        budgets.flush();
        reports.deleteAll(testReports);
        services.deleteAll(testServices);
        services.flush();
        reports.flush();

        if (apply) {
            removedDocuments.addAll(related);
            audit.record("TEST_DATA_CLEANUP", "SYSTEM", null, "Apagou dados de teste: " + testReports.size() + " relato(s), "
                + testServices.size() + " servico(s), " + testBudgets.size() + " orcamento(s)");
        }
        return new TestDataCleanupReport(apply, items, testReports.size(), testServices.size(), testBudgets.size(),
            deletedVotes, related.size(), deletedEvents);
    }

    private boolean isTestBudget(Budget budget) {
        return isTest(budget.title)
            || (OLD_QUOTE_TITLE.equalsIgnoreCase(budget.title) && OLD_QUOTE_SUPPLIER.equalsIgnoreCase(budget.supplier));
    }

    private static boolean isTest(String title) {
        return title != null && title.startsWith(PREFIX);
    }

    private static Set<Long> ids(List<Long> values) {
        return new HashSet<>(values);
    }

    private static void guard(boolean ok, String message) {
        if (!ok) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        }
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/cleanup")
@PreAuthorize("hasRole('ADMIN')")
class TestDataCleanupController {
    private final TestDataCleanupService service;

    TestDataCleanupController(TestDataCleanupService service) {
        this.service = service;
    }

    /** Dry run by default: nothing is removed unless apply=true. */
    @PostMapping("/test-data")
    TestDataCleanupReport cleanup(@RequestParam(defaultValue = "false") boolean apply) {
        return service.cleanup(apply);
    }
}

record TestDataItem(String type, Long id, String title, String detail) {
}

record TestDataCleanupReport(
    boolean applied,
    List<TestDataItem> items,
    int reports,
    int services,
    int budgets,
    int votes,
    int documents,
    int reportEvents
) {
}
