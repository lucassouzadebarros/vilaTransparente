package br.com.portalvila;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@CrossOrigin
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
class AdminTransparencyController {
    private final AuditService audit;
    private final ReportService reports;

    AdminTransparencyController(AuditService audit, ReportService reports) {
        this.audit = audit;
        this.reports = reports;
    }

    /** The 200 latest changes to money and access, newest first. */
    @GetMapping("/audit")
    List<AuditEntry> audit() {
        return audit.latest();
    }

    /** Portal balance against the Asaas balance. */
    @GetMapping("/reconciliation")
    ReconciliationResponse reconciliation() {
        return reports.reconcile();
    }
}
