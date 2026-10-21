package br.com.portalvila;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Keeps a problem report in step with the budgets and services that come out of it: it goes under analysis when the
 * first budget is generated, back to open when nothing is left going, and is resolved when everything that came out
 * of it is done and paid. A problem can have several budgets (quotes for one job, or separate jobs) and several services.
 */
@Service
class ReportLifecycle {
    private static final List<String> CLOSED = List.of("RESOLVIDO", "CANCELADO");

    private final ProblemReportRepository reports;
    private final BudgetRepository budgets;
    private final ServiceOrderRepository services;
    private final ReportHistory history;
    private final PushService push;
    private final AuditService audit;

    ReportLifecycle(
        ProblemReportRepository reports,
        BudgetRepository budgets,
        ServiceOrderRepository services,
        ReportHistory history,
        PushService push,
        AuditService audit
    ) {
        this.reports = reports;
        this.budgets = budgets;
        this.services = services;
        this.history = history;
        this.push = push;
        this.audit = audit;
    }

    /** The problem an open budget can be generated for. */
    ProblemReport openForBudget(Long reportId) {
        ProblemReport report = reports.findById(reportId)
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "Problema não encontrado."));
        if (CLOSED.contains(report.status)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT, "Este problema já foi encerrado.");
        }
        return report;
    }

    /** First budget (or service) generated: the problem goes under analysis. */
    void underAnalysis(ProblemReport report) {
        if ("ABERTO".equals(report.status)) {
            report.status = "EM_ANALISE";
            report.updatedAt = LocalDateTime.now();
            reports.save(report);
        }
    }

    void note(Long reportId, String kind, String message) {
        history.record(reportId, kind, message);
    }

    /** Nothing left going for this problem (no budget being voted, no approved budget waiting, no live service): back to open. */
    boolean reopenIfIdle(Long reportId, String why) {
        return reports.findById(reportId).map(report -> {
            if (!"EM_ANALISE".equals(report.status)) {
                return false;
            }
            boolean pendingBudget = budgets.findByProblemReportId(report.id).stream().anyMatch(budget ->
                "EM_ANALISE".equals(budget.status) || ("APROVADO".equals(budget.status) && budget.serviceId == null));
            boolean liveService = services.findByProblemReportId(report.id).stream().anyMatch(service -> !"CANCELADO".equals(service.status));
            if (pendingBudget || liveService) {
                return false;
            }
            report.status = "ABERTO";
            report.serviceId = null;
            report.updatedAt = LocalDateTime.now();
            reports.save(report);
            history.record(report.id, ProblemReportEvent.STATUS, why);
            return true;
        }).orElse(false);
    }

    /** A service of this problem was paid: it is resolved only when no budget or service is left pending. */
    void resolveIfDone(Long reportId, Long finishedServiceId) {
        reports.findById(reportId).ifPresent(report -> {
            if (CLOSED.contains(report.status)) {
                return;
            }
            boolean pendingBudget = budgets.findByProblemReportId(report.id).stream().anyMatch(budget ->
                "EM_ANALISE".equals(budget.status) || ("APROVADO".equals(budget.status) && budget.serviceId == null));
            boolean openService = services.findByProblemReportId(report.id).stream()
                .anyMatch(service -> !"FINALIZADO".equals(service.status) && !"CANCELADO".equals(service.status));
            if (pendingBudget || openService) {
                history.record(report.id, ProblemReportEvent.STATUS,
                    "O serviço #" + finishedServiceId + " foi pago, mas ainda há orçamento ou serviço deste problema pendente.");
                return;
            }
            report.status = "RESOLVIDO";
            report.updatedAt = LocalDateTime.now();
            reports.save(report);
            audit.record("REPORT_RESOLVED", "REPORT", report.id, report.title + " - resolvido pelo serviço #" + finishedServiceId);
            history.record(report.id, ProblemReportEvent.STATUS, "Resolvido: o serviço #" + finishedServiceId + " foi finalizado e pago.");
            push.notifyUser(report.createdBy, "Seu relato foi resolvido", "\"" + report.title + "\" foi resolvido.",
                Map.of("type", "REPORT", "id", report.id));
        });
    }
}
