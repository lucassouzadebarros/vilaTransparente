package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.MalformedURLException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@CrossOrigin
@RequestMapping("/api/auth")
class AuthController {
    private final AppUserRepository users;
    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PixGatewayClient gatewayClient;
    private final PasswordResetService passwordResetService;
    private final CurrentUserService currentUser;
    private final LoginAttemptLimiter loginLimiter;
    private final AccountErasureService erasure;
    private final PlatformAdmins platformAdmins;
    private final CondominiumAccess access;

    AuthController(
        AppUserRepository users,
        ResidentRepository residents,
        HouseRepository houses,
        PasswordEncoder passwordEncoder,
        JwtService jwtService,
        PixGatewayClient gatewayClient,
        PasswordResetService passwordResetService,
        CurrentUserService currentUser,
        LoginAttemptLimiter loginLimiter,
        AccountErasureService erasure,
        PlatformAdmins platformAdmins,
        CondominiumAccess access
    ) {
        this.platformAdmins = platformAdmins;
        this.access = access;
        this.erasure = erasure;
        this.loginLimiter = loginLimiter;
        this.users = users;
        this.residents = residents;
        this.houses = houses;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.gatewayClient = gatewayClient;
        this.passwordResetService = passwordResetService;
        this.currentUser = currentUser;
    }

    /** The signed-in resident deletes their own account (Google Play requires this inside the app). The password confirms it. */
    @PostMapping("/delete-account")
    Map<String, String> deleteAccount(@Valid @RequestBody DeleteAccountRequest request, HttpServletRequest http) {
        AppUser user = currentUser.current();
        String attemptKey = LoginAttemptLimiter.key("delete", user.email, http);
        loginLimiter.check(attemptKey);
        try {
            erasure.eraseOwn(user, request.password());
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() == HttpStatus.FORBIDDEN) {
                loginLimiter.fail(attemptKey);
            }
            throw ex;
        }
        loginLimiter.succeed(attemptKey);
        return Map.of("status", "EXCLUIDA");
    }

    @PostMapping("/login")
    LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        String attemptKey = LoginAttemptLimiter.key("login", request.email(), http);
        loginLimiter.check(attemptKey);
        AppUser user = users.findByEmailIgnoreCase(request.email())
            .filter(u -> u.active)
            .filter(u -> passwordEncoder.matches(request.password(), u.passwordHash))
            .orElse(null);
        if (user == null) {
            loginLimiter.fail(attemptKey);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciais inválidas.");
        }
        loginLimiter.succeed(attemptKey);
        if (!platformAdmins.includes(user.email) && access.suspended(user.condominiumId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, CondominiumAccess.SUSPENDED_MESSAGE);
        }
        return new LoginResponse(jwtService.issue(user), user.name, user.email, user.role, user.residentId, user.mustChangePassword);
    }

    @PostMapping("/password-reset/request")
    PasswordResetResponse requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        return passwordResetService.requestReset(request);
    }

    @PostMapping("/password-reset/confirm")
    PasswordResetResponse confirmPasswordReset(@Valid @RequestBody PasswordResetConfirmRequest request, HttpServletRequest http) {
        String attemptKey = LoginAttemptLimiter.key("reset", request.email(), http);
        loginLimiter.check(attemptKey);
        try {
            PasswordResetResponse response = passwordResetService.confirmReset(request);
            loginLimiter.succeed(attemptKey);
            return response;
        } catch (ResponseStatusException ex) {
            loginLimiter.fail(attemptKey);
            throw ex;
        }
    }

    @PostMapping("/change-password")
    PasswordResetResponse changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        return passwordResetService.changePassword(currentUser.current(), request);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class DashboardController {
    private final FinancialService financialService;
    private final CurrentUserService currentUser;
    private final ReportService reportService;

    DashboardController(FinancialService financialService, CurrentUserService currentUser, ReportService reportService) {
        this.financialService = financialService;
        this.currentUser = currentUser;
        this.reportService = reportService;
    }

    @GetMapping("/reports/monthly")
    MonthlyReportResponse monthlyReport(@RequestParam(required = false) String month) {
        String referenceMonth = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        return currentUser.isAdmin()
            ? reportService.monthly(referenceMonth, true, null)
            : reportService.monthly(referenceMonth, false, currentUser.requiredResidentId());
    }

    @GetMapping("/dashboard")
    DashboardResponse dashboard(@RequestParam(required = false) String month) {
        String referenceMonth = month == null ? YearMonth.now().toString() : month;
        return currentUser.isAdmin()
            ? financialService.dashboard(referenceMonth)
            : financialService.dashboardForResident(referenceMonth, currentUser.requiredResidentId());
    }

    @GetMapping("/reports")
    DashboardResponse reports(@RequestParam(required = false) String month) {
        return dashboard(month);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/events")
class DashboardEventController {
    private final DashboardEventService events;

    DashboardEventController(DashboardEventService events) {
        this.events = events;
    }

    /**
     * Public (a browser event stream cannot send the login header) and carries no data, only "reload". It listens to
     * the condominium asked for; the app installed today does not ask, and it is the Vila's.
     */
    @GetMapping("/dashboard")
    ResponseEntity<SseEmitter> dashboard(HttpServletRequest request, @RequestParam(required = false) Long condominium) {
        if (request.getDispatcherType() != DispatcherType.REQUEST) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(events.subscribe(condominium == null ? TenantContext.VILA : condominium));
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/contributions")
class ContributionController {
    private final FinancialService financialService;
    private final ContributionRepository contributions;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final CurrentUserService currentUser;

    ContributionController(
        FinancialService financialService,
        ContributionRepository contributions,
        HouseRepository houses,
        ResidentRepository residents,
        CurrentUserService currentUser
    ) {
        this.financialService = financialService;
        this.contributions = contributions;
        this.houses = houses;
        this.residents = residents;
        this.currentUser = currentUser;
    }

    @GetMapping
    List<ContributionResponse> list(@RequestParam String month) {
        return currentUser.isAdmin()
            ? financialService.listContributions(month)
            : financialService.listContributionsForResident(month, currentUser.requiredResidentId());
    }

    @GetMapping("/{id}")
    ContributionResponse get(@PathVariable Long id) {
        Contribution contribution = contributions.findById(id).orElseThrow();
        currentUser.assertContributionAccess(contribution);
        return financialService.toContributionResponse(
            contribution,
            houses.findById(contribution.houseId).orElse(null),
            contribution.residentId == null ? null : residents.findById(contribution.residentId).orElse(null)
        );
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/contributions")
@PreAuthorize("hasRole('ADMIN')")
class AdminContributionController {
    private final FinancialService financialService;

    AdminContributionController(FinancialService financialService) {
        this.financialService = financialService;
    }

    @PostMapping("/monthly")
    List<ContributionResponse> generateMonthly(@Valid @RequestBody MonthlyChargeRequest request) {
        return financialService.generateMonthlyContributions(request.month(), request.amount());
    }

    @PostMapping("/{id}/manual-payment")
    ContributionResponse manualPayment(@PathVariable Long id, @Valid @RequestBody ManualPaymentRequest request) {
        return financialService.markManualPayment(id, request);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class PixController {
    private final PixService pixService;
    private final CurrentUserService currentUser;

    PixController(PixService pixService, CurrentUserService currentUser) {
        this.pixService = pixService;
        this.currentUser = currentUser;
    }

    @GetMapping({"/pix/charges", "/pix-charges"})
    List<PixChargeResponse> listCharges(@RequestParam String month) {
        return currentUser.isAdmin()
            ? pixService.listCharges(month)
            : pixService.listChargesForResident(month, currentUser.requiredResidentId());
    }

    @GetMapping({"/pix/charges/all", "/pix-charges/all"})
    List<PixChargeResponse> listAllCharges() {
        return pixService.listAllChargesForResident(currentUser.requiredResidentId());
    }

    @PostMapping({"/pix/charges/sync", "/pix-charges/sync"})
    List<PixChargeResponse> syncMyCharges() {
        return pixService.syncChargesForResident(currentUser.requiredResidentId());
    }

    @GetMapping({"/pix/charges/{id}", "/pix-charges/{id}"})
    PixChargeResponse getCharge(@PathVariable Long id) {
        PixChargeResponse response = pixService.getCharge(id);
        currentUser.assertHouseAccess(response.houseId());
        return response;
    }

    @PostMapping("/admin/pix/monthly-charges")
    @PreAuthorize("hasRole('ADMIN')")
    List<PixChargeResponse> generateCharges(@Valid @RequestBody MonthlyChargeRequest request) {
        return pixService.generateMonthlyCharges(request.month(), request.amount(), request.dueDate());
    }

    @PostMapping("/admin/pix/house-charge")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse generateHouseCharge(@Valid @RequestBody HouseMonthlyChargeRequest request) {
        return pixService.generateHouseCharge(request.month(), request.amount(), request.houseId(), request.dueDate());
    }

    @PostMapping("/admin/pix/charges/{id}/refresh-qrcode")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse refresh(@PathVariable Long id) {
        return pixService.refreshQrCode(id);
    }

    @PostMapping("/admin/pix/charges/{id}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse cancel(@PathVariable Long id, @Valid @RequestBody CancelRequest request) {
        return pixService.cancel(id, request);
    }

    @PostMapping("/admin/pix/reconcile")
    @PreAuthorize("hasRole('ADMIN')")
    List<PixChargeResponse> reconcile(@RequestParam String month) {
        return pixService.reconcile(month);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class WebhookController {
    private final WebhookService webhookService;
    private final WebhookEventRepository events;
    private final GatewayConnectionRepository connections;
    private final PaymentsService payments;

    WebhookController(WebhookService webhookService, WebhookEventRepository events, GatewayConnectionRepository connections, PaymentsService payments) {
        this.webhookService = webhookService;
        this.events = events;
        this.connections = connections;
        this.payments = payments;
    }

    /**
     * A condominium that connected its own Asaas account: the notices come to its own address, signed with its own
     * token, and are handled inside that condominium. A wrong address or token gets the same refusal.
     */
    @PostMapping("/webhooks/asaas/c/{routeKey}")
    WebhookResult asaasForCondominium(
        @PathVariable String routeKey,
        @RequestHeader(value = "asaas-access-token", required = false) String token,
        @RequestBody JsonNode payload
    ) {
        GatewayConnection connection = connections.findByRouteKey(routeKey)
            .filter(found -> token != null && MessageDigest.isEqual(
                SecretBox.digest(token).getBytes(StandardCharsets.UTF_8), found.webhookTokenHash.getBytes(StandardCharsets.UTF_8)))
            .orElseThrow(InvalidWebhookTokenException::new);
        payments.noticeArrived(connection);
        return TenantContext.callAs(connection.condominiumId, () -> webhookService.processVerified(payload));
    }

    /** Only the Vila has an Asaas account connected: its notices are the Vila's until each condominium has its own. */
    @PostMapping("/webhooks/asaas")
    WebhookResult asaas(@RequestHeader(value = "asaas-access-token", required = false) String token, @RequestBody JsonNode payload) {
        return TenantContext.callAs(TenantContext.VILA, () -> webhookService.processAsaas(token, payload));
    }

    @GetMapping("/admin/webhook-events")
    @PreAuthorize("hasRole('ADMIN')")
    List<WebhookEvent> eventLog() {
        return events.findTop100ByCondominiumIdOrderByCreatedAtDesc(TenantContext.current());
    }

    @PostMapping("/admin/direct-receipts/reprocess")
    @PreAuthorize("hasRole('ADMIN')")
    DirectReceiptReprocessResponse reprocessDirectReceipts() {
        return webhookService.reprocessDirectReceipts();
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/asaas")
@PreAuthorize("hasRole('ADMIN')")
class AsaasSyncController {
    private final AsaasSyncService syncService;
    private final PaymentExclusionService exclusionService;

    AsaasSyncController(AsaasSyncService syncService, PaymentExclusionService exclusionService) {
        this.syncService = syncService;
        this.exclusionService = exclusionService;
    }

    /** Dry run by default. Removes the payments from the portal and keeps them out of future syncs and webhooks. */
    @PostMapping("/exclude-payments")
    ExcludePaymentsReport excludePayments(
        @RequestParam(defaultValue = "false") boolean apply,
        @Valid @RequestBody ExcludePaymentsRequest request
    ) {
        return exclusionService.exclude(request.paymentIds(), request.reason(), apply);
    }

    /** Dry run by default: nothing is saved unless apply=true. */
    @PostMapping("/sync")
    AsaasSyncReport sync(
        @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(defaultValue = "false") boolean apply
    ) {
        return syncService.sync(from, to, apply);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/expenses")
class ExpenseController {
    private final ExpenseRepository expenses;
    private final DashboardEventService dashboardEvents;
    private final AuditService audit;
    private final SpendingRules rules;

    ExpenseController(ExpenseRepository expenses, DashboardEventService dashboardEvents, AuditService audit, SpendingRules rules) {
        this.expenses = expenses;
        this.dashboardEvents = dashboardEvents;
        this.audit = audit;
        this.rules = rules;
    }

    @GetMapping
    List<Expense> list() {
        return expenses.findAll();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    Expense create(@RequestBody Expense expense) {
        validate(expense);
        expense.id = null;
        if (expense.expenseDate == null) {
            expense.expenseDate = LocalDate.now();
        }
        rules.assertExpenseAllowed(expense);
        Expense saved = expenses.save(expense);
        audit.record("EXPENSE_CREATED", "EXPENSE", saved.id, saved.description + " - " + AuditService.money(saved.amount)
            + (saved.exceptionReason == null ? "" : " - SEM VOTAÇÃO: " + saved.exceptionReason));
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    void delete(@PathVariable Long id) {
        Expense existing = expenses.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Despesa não encontrada."));
        expenses.deleteById(id);
        audit.record("EXPENSE_DELETED", "EXPENSE", id, existing.description + " - " + AuditService.money(existing.amount));
        dashboardEvents.publishDashboardChanged();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Expense update(@PathVariable Long id, @RequestBody Expense incoming) {
        validate(incoming);
        Expense expense = expenses.findById(id).orElseThrow();
        String before = expense.description + " - " + AuditService.money(expense.amount);
        expense.description = incoming.description;
        expense.category = incoming.category;
        expense.amount = incoming.amount;
        expense.expenseDate = incoming.expenseDate == null ? expense.expenseDate : incoming.expenseDate;
        expense.supplier = incoming.supplier;
        expense.paymentMethod = incoming.paymentMethod;
        expense.notes = incoming.notes;
        expense.documentId = incoming.documentId;
        expense.serviceOrderId = incoming.serviceOrderId;
        expense.budgetId = incoming.budgetId;
        expense.exceptionReason = incoming.exceptionReason;
        rules.assertExpenseAllowed(expense);
        Expense saved = expenses.save(expense);
        audit.record("EXPENSE_UPDATED", "EXPENSE", saved.id, before + " -> " + saved.description + " - " + AuditService.money(saved.amount));
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    private static void validate(Expense expense) {
        if (expense == null || expense.description == null || expense.description.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe a descrição da despesa.");
        }
        if (expense.amount == null || expense.amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um valor maior que zero.");
        }
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/services")
class ServiceOrderController {
    private final ServiceOrderWorkflow workflow;
    private final ServiceOrderRepository services;
    private final BudgetRepository budgets;
    private final CurrentUserService currentUser;

    ServiceOrderController(ServiceOrderWorkflow workflow, ServiceOrderRepository services, BudgetRepository budgets, CurrentUserService currentUser) {
        this.workflow = workflow;
        this.services = services;
        this.budgets = budgets;
        this.currentUser = currentUser;
    }

    /** Admin and síndico edit these records and need the full number; the houses only see it masked. */
    private ServiceOrder forViewer(ServiceOrder service, boolean full) {
        if (!full) {
            service.supplierDocument = DocumentMask.mask(service.supplierDocument);
        }
        return service;
    }

    private Budget forViewer(Budget budget, boolean full) {
        if (!full) {
            budget.supplierDocument = DocumentMask.mask(budget.supplierDocument);
        }
        return budget;
    }

    @GetMapping
    List<ServiceOrder> list(@RequestParam(required = false) String status) {
        boolean full = currentUser.canManageBudgets();
        return workflow.listServices(status).stream().map(service -> forViewer(service, full)).toList();
    }

    @GetMapping("/{id}")
    ServiceOrder get(@PathVariable Long id) {
        return forViewer(services.findById(id).orElseThrow(), currentUser.canManageBudgets());
    }

    @PostMapping
    @PreAuthorize("@access.canManageBudgets()")
    ServiceOrder create(@RequestBody ServiceOrder service) {
        return workflow.saveService(service);
    }

    @PutMapping("/{id}")
    @PreAuthorize("@access.canManageBudgets()")
    ServiceOrder update(@PathVariable Long id, @RequestBody ServiceOrder service) {
        return workflow.updateService(id, service);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@access.canManageBudgets()")
    Map<String, String> delete(@PathVariable Long id) {
        workflow.cancelService(id);
        return Map.of("status", "CANCELADO");
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("@access.canManageBudgets()")
    Map<String, String> cancel(@PathVariable Long id) {
        workflow.cancelService(id);
        return Map.of("status", "CANCELADO");
    }

    @GetMapping("/{id}/budgets")
    List<Budget> budgets(@PathVariable Long id) {
        boolean full = currentUser.canManageBudgets();
        return budgets.findByServiceIdOrderByAmountAsc(id).stream().map(budget -> forViewer(budget, full)).toList();
    }

    @PostMapping("/{id}/finish")
    @PreAuthorize("hasRole('ADMIN')")
    ServiceOrder finish(@PathVariable Long id, @Valid @RequestBody FinishServiceRequest request) {
        return workflow.finishService(id, request);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/budgets")
class BudgetController {
    private final BudgetRepository budgets;
    private final ServiceOrderWorkflow workflow;
    private final BudgetVotingService voting;
    private final CurrentUserService currentUser;
    private final AuditService audit;

    BudgetController(
        BudgetRepository budgets,
        ServiceOrderWorkflow workflow,
        BudgetVotingService voting,
        CurrentUserService currentUser,
        AuditService audit
    ) {
        this.audit = audit;
        this.budgets = budgets;
        this.workflow = workflow;
        this.voting = voting;
        this.currentUser = currentUser;
    }

    private Budget forViewer(Budget budget) {
        if (!currentUser.canManageBudgets()) {
            budget.supplierDocument = DocumentMask.mask(budget.supplierDocument);
        }
        return budget;
    }

    @GetMapping
    List<Budget> list() {
        return budgets.findAll().stream().map(this::forViewer).toList();
    }

    @GetMapping("/votes")
    List<BudgetVotingSummary> votings() {
        return voting.summaries(currentUser.current());
    }

    @GetMapping("/{id}/votes")
    BudgetVotingSummary voting(@PathVariable Long id) {
        return voting.summary(id, currentUser.current());
    }

    @PostMapping("/{id}/vote")
    BudgetVotingSummary vote(@PathVariable Long id, @Valid @RequestBody BudgetVoteRequest request) {
        return voting.vote(id, request.vote(), currentUser.current());
    }

    @PostMapping("/{id}/close-voting")
    @PreAuthorize("@access.canManageBudgets()")
    BudgetVotingSummary closeVoting(@PathVariable Long id) {
        return voting.close(id, currentUser.current());
    }

    @PostMapping
    @PreAuthorize("@access.canManageBudgets()")
    Budget create(@RequestBody Budget budget) {
        return workflow.saveBudget(budget);
    }

    @GetMapping("/{id}")
    Budget get(@PathVariable Long id) {
        return forViewer(budgets.findById(id).orElseThrow());
    }

    @PutMapping("/{id}")
    @PreAuthorize("@access.canManageBudgets()")
    Budget update(@PathVariable Long id, @RequestBody Budget budget) {
        return workflow.updateBudget(id, budget);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@access.canManageBudgets()")
    Map<String, String> delete(@PathVariable Long id) {
        workflow.cancelBudget(id);
        return Map.of("status", "CANCELADO");
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/documents")
class DocumentController {
    private final PortalDocumentRepository documents;
    private final CurrentUserService currentUser;
    private final JwtService jwtService;
    private final DocumentStorage storage;

    DocumentController(
        PortalDocumentRepository documents,
        CurrentUserService currentUser,
        JwtService jwtService,
        DocumentStorage storage
    ) {
        this.documents = documents;
        this.currentUser = currentUser;
        this.jwtService = jwtService;
        this.storage = storage;
    }

    @GetMapping
    List<PortalDocument> list(@RequestParam(required = false) String relatedType, @RequestParam(required = false) Long relatedId) {
        if (relatedType != null && relatedId != null) {
            return documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc(relatedType, relatedId);
        }
        // Photos of problem reports belong to the report, not to the documents library.
        return documents.findAll().stream().filter(document -> !"PROBLEM_REPORT".equals(document.relatedType)).toList();
    }

    @PostMapping
    @PreAuthorize("@access.canManageBudgets()")
    PortalDocument create(@RequestBody PortalDocument document) {
        assertCanAttach(document.relatedType);
        document.id = null;
        document.uploadedBy = currentUser.current().id;
        return documents.save(document);
    }

    /** A signed, short-lived path the browser can open in a new tab, since a tab cannot send the login header. */
    @GetMapping("/{id}/access")
    Map<String, String> access(@PathVariable Long id) {
        if (!documents.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Documento não encontrado.");
        }
        return Map.of("path", "/api/documents/" + id + "/file?t=" + jwtService.issueDocumentToken(id));
    }

    @PostMapping("/upload")
    @PreAuthorize("@access.canManageBudgets()")
    PortalDocument upload(
        @RequestParam String name,
        @RequestParam(defaultValue = "DOCUMENT") String type,
        @RequestParam(required = false) String relatedType,
        @RequestParam(required = false) Long relatedId,
        @RequestParam(required = false) String description,
        @RequestParam(required = false) MultipartFile file
    ) throws IOException {
        assertCanAttach(relatedType);
        PortalDocument document = new PortalDocument();
        document.name = name;
        document.type = type;
        document.relatedType = relatedType;
        document.relatedId = relatedId;
        document.description = description;
        document.uploadedBy = currentUser.current().id;

        if (file == null || file.isEmpty()) {
            document.url = "local://" + name;
            return documents.save(document);
        }

        document.storagePath = storage.save(file, false).toString();
        document.url = "pending";
        PortalDocument saved = documents.save(document);
        saved.url = "/api/documents/" + saved.id + "/file";
        return documents.save(saved);
    }

    @GetMapping("/{id}/file")
    ResponseEntity<Resource> file(@PathVariable Long id, @RequestParam(name = "t", required = false) String accessToken) throws MalformedURLException {
        // Signed in: the request already runs in the account's condominium. A link opened in a new tab: the link's.
        long condominium = isSignedIn()
            ? TenantContext.current()
            : jwtService.documentTokenCondominium(accessToken, id).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Link do documento expirado. Abra o documento de novo pelo aplicativo."));
        PortalDocument document = TenantContext.callAs(condominium, () -> documents.findById(id)).orElseThrow();
        if (document.storagePath == null || document.storagePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Arquivo não encontrado.");
        }
        Path path = Paths.get(document.storagePath).toAbsolutePath().normalize();
        Resource resource = new UrlResource(path.toUri());
        if (!resource.exists() || !resource.isReadable()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Arquivo não encontrado.");
        }
        String filename = path.getFileName().toString();
        MediaType type = MediaType.parseMediaType(DocumentStorage.contentTypeOf(filename));
        return ResponseEntity.ok()
            .contentType(type)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
            .body(resource);
    }

    private static boolean isSignedIn() {
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
            && authentication.isAuthenticated()
            && !(authentication instanceof org.springframework.security.authentication.AnonymousAuthenticationToken);
    }

    /** The síndico only attaches documents to budgets and services; the rest stays with the admin. */
    private void assertCanAttach(String relatedType) {
        if (!currentUser.isAdmin() && !"BUDGET".equals(relatedType) && !"SERVICE".equals(relatedType)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "O síndico só anexa documentos de orçamentos e serviços.");
        }
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/problem-reports")
class ProblemReportController {
    private final ProblemReportRepository reports;
    private final ResidentRepository residents;
    private final CurrentUserService currentUser;
    private final PortalDocumentRepository documents;
    private final DocumentStorage storage;
    private final PushService push;
    private final ReportHistory history;

    private static final int MAX_PHOTOS = 3;
    private static final String PHOTO_TYPE = "PROBLEM_REPORT";

    ProblemReportController(
        ProblemReportRepository reports,
        ResidentRepository residents,
        CurrentUserService currentUser,
        PortalDocumentRepository documents,
        DocumentStorage storage,
        PushService push,
        ReportHistory history
    ) {
        this.reports = reports;
        this.residents = residents;
        this.currentUser = currentUser;
        this.documents = documents;
        this.storage = storage;
        this.push = push;
        this.history = history;
    }

    record CommentRequest(String message) {
    }

    /** The story of the report, oldest first. Every resident can read it. */
    @GetMapping("/{id}/events")
    List<ProblemReportEvent> events(@PathVariable Long id) {
        reports.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relato não encontrado."));
        return history.of(id);
    }

    /** The person who reported, the administrator and the síndico can write on a report. */
    @PostMapping("/{id}/comments")
    ProblemReportEvent comment(@PathVariable Long id, @RequestBody CommentRequest request) {
        ProblemReport report = reports.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relato não encontrado."));
        AppUser user = currentUser.current();
        boolean owner = user.id.equals(report.createdBy);
        if (!owner && !currentUser.canManageBudgets()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Só quem fez o relato, o administrador e o síndico comentam.");
        }
        String message = request == null || request.message() == null ? "" : request.message().trim();
        if (message.isEmpty() || message.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escreva um comentário de até 500 caracteres.");
        }
        ProblemReportEvent saved = history.record(report.id, ProblemReportEvent.COMMENT, message);
        report.updatedAt = LocalDateTime.now();
        reports.save(report);
        if (!owner) {
            push.notifyUser(report.createdBy, "Novo comentário no seu relato", "\"" + report.title + "\": " + message,
                Map.of("type", "REPORT", "id", report.id));
        }
        return saved;
    }

    /** The resident can withdraw a report nobody has started on yet; once it is under analysis the administrator decides. */
    @PostMapping("/{id}/cancel")
    ProblemReport cancel(@PathVariable Long id) {
        ProblemReport report = reports.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relato não encontrado."));
        AppUser user = currentUser.current();
        boolean admin = currentUser.isAdmin();
        if (!admin && !user.id.equals(report.createdBy)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Só quem fez o relato (ou o administrador) pode cancelá-lo.");
        }
        if (!admin && !"ABERTO".equals(report.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este relato já está sendo analisado. Escreva um comentário para a administração.");
        }
        if ("RESOLVIDO".equals(report.status) || "CANCELADO".equals(report.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este relato já foi encerrado.");
        }
        report.status = "CANCELADO";
        report.updatedAt = LocalDateTime.now();
        ProblemReport saved = reports.save(report);
        history.record(saved.id, ProblemReportEvent.STATUS, admin ? "Cancelado pela administração." : "Cancelado por quem fez o relato.");
        return saved;
    }

    @GetMapping
    List<ProblemReport> list(@RequestParam(required = false) String status) {
        List<ProblemReport> found = status != null && !status.isBlank()
            ? reports.findByStatusOrderByCreatedAtDesc(status)
            : reports.findAllByOrderByCreatedAtDesc();
        Map<Long, Long> photos = documents.findByRelatedType(PHOTO_TYPE).stream()
            .filter(document -> document.relatedId != null)
            .collect(java.util.stream.Collectors.groupingBy(document -> document.relatedId, java.util.stream.Collectors.counting()));
        found.forEach(report -> report.photoCount = photos.getOrDefault(report.id, 0L).intValue());
        return found;
    }

    /** The person who reported (or the admin) adds up to three photos to a report. */
    @PostMapping(value = "/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    PortalDocument addPhoto(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
        ProblemReport report = reports.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relato não encontrado."));
        assertCanChangePhotos(report);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha uma foto.");
        }
        if (documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc(PHOTO_TYPE, report.id).size() >= MAX_PHOTOS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cada relato aceita até " + MAX_PHOTOS + " fotos.");
        }
        PortalDocument document = new PortalDocument();
        document.name = "Foto do relato #" + report.id;
        document.type = "FOTO";
        document.relatedType = PHOTO_TYPE;
        document.relatedId = report.id;
        document.uploadedBy = currentUser.current().id;
        document.description = "Foto enviada junto com o relato.";
        document.storagePath = storage.save(file, true).toString();
        document.url = "pending";
        PortalDocument saved = documents.save(document);
        saved.url = "/api/documents/" + saved.id + "/file";
        return documents.save(saved);
    }

    @DeleteMapping("/{id}/photos/{documentId}")
    Map<String, String> removePhoto(@PathVariable Long id, @PathVariable Long documentId) {
        ProblemReport report = reports.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relato não encontrado."));
        assertCanChangePhotos(report);
        PortalDocument document = documents.findById(documentId)
            .filter(candidate -> PHOTO_TYPE.equals(candidate.relatedType) && report.id.equals(candidate.relatedId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Foto não encontrada."));
        storage.delete(document);
        documents.delete(document);
        return Map.of("status", "REMOVIDA");
    }

    private void assertCanChangePhotos(ProblemReport report) {
        AppUser user = currentUser.current();
        if (!currentUser.isAdmin() && !user.id.equals(report.createdBy)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Só quem fez o relato (ou o administrador) mexe nas fotos.");
        }
    }

    @PostMapping
    ProblemReport create(@RequestBody ProblemReport incoming) {
        validate(incoming);
        AppUser user = currentUser.current();
        ProblemReport report = new ProblemReport();
        report.title = incoming.title.trim();
        report.location = incoming.location.trim();
        report.category = incoming.category == null || incoming.category.isBlank() ? "Outro" : incoming.category.trim();
        report.priority = normalizePriority(incoming.priority);
        report.status = "ABERTO";
        report.description = incoming.description.trim();
        report.attachmentName = incoming.attachmentName == null || incoming.attachmentName.isBlank() ? null : incoming.attachmentName.trim();
        report.createdBy = user.id;
        if (user.residentId != null) {
            Resident resident = residents.findById(user.residentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Morador não encontrado."));
            report.residentId = resident.id;
            report.houseId = resident.houseId;
        }
        report.createdAt = LocalDateTime.now();
        report.updatedAt = LocalDateTime.now();
        ProblemReport saved = reports.save(report);
        history.record(saved.id, ProblemReportEvent.CREATED, "Relato registrado.");
        return saved;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    ProblemReport update(@PathVariable Long id, @RequestBody ProblemReport incoming) {
        ProblemReport report = reports.findById(id).orElseThrow();
        validate(incoming);
        report.title = incoming.title.trim();
        report.location = incoming.location.trim();
        report.category = incoming.category == null || incoming.category.isBlank() ? "Outro" : incoming.category.trim();
        report.priority = normalizePriority(incoming.priority);
        String previousStatus = report.status;
        report.status = normalizeStatus(incoming.status);
        report.description = incoming.description.trim();
        report.attachmentName = incoming.attachmentName == null || incoming.attachmentName.isBlank() ? null : incoming.attachmentName.trim();
        report.updatedAt = LocalDateTime.now();
        ProblemReport saved = reports.save(report);
        if (!previousStatus.equals(saved.status)) {
            history.record(saved.id, ProblemReportEvent.STATUS, "Situação alterada: " + statusLabel(previousStatus) + " → " + statusLabel(saved.status) + ".");
            push.notifyUser(saved.createdBy, "Seu relato foi atualizado",
                "\"" + saved.title + "\" agora está " + statusLabel(saved.status) + ".", Map.of("type", "REPORT", "id", saved.id));
        }
        return saved;
    }

    private void validate(ProblemReport report) {
        if (report == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dados do relato obrigatórios.");
        }
        if (report.title == null || report.title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título do problema obrigatório.");
        }
        if (report.location == null || report.location.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Local obrigatório.");
        }
        if (report.description == null || report.description.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrição obrigatória.");
        }
    }

    private String normalizePriority(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase();
        return switch (normalized) {
            case "BAIXA", "MEDIA", "ALTA", "URGENTE" -> normalized;
            default -> "MEDIA";
        };
    }

    private static String statusLabel(String status) {
        return switch (status) {
            case "EM_ANALISE" -> "em análise";
            case "RESOLVIDO" -> "resolvido";
            case "CANCELADO" -> "cancelado";
            default -> "aberto";
        };
    }

    private String normalizeStatus(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase();
        return switch (normalized) {
            case "ABERTO", "EM_ANALISE", "RESOLVIDO", "CANCELADO" -> normalized;
            default -> "ABERTO";
        };
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/residents")
class ResidentController {
    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final PixGatewayClient gatewayClient;
    private final PasswordResetService passwordResetService;
    private final HouseInviteService invites;
    private final LoginAttemptLimiter inviteLimiter;
    private final TransactionTemplate transaction;
    private final CondominiumAccess access;
    private final GatewayCredentials gatewayCredentials;

    ResidentController(
        ResidentRepository residents,
        HouseRepository houses,
        AppUserRepository users,
        PasswordEncoder passwordEncoder,
        PixGatewayClient gatewayClient,
        PasswordResetService passwordResetService,
        HouseInviteService invites,
        LoginAttemptLimiter inviteLimiter,
        PlatformTransactionManager transactionManager,
        CondominiumAccess access,
        GatewayCredentials gatewayCredentials
    ) {
        this.access = access;
        this.gatewayCredentials = gatewayCredentials;
        this.residents = residents;
        this.houses = houses;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.gatewayClient = gatewayClient;
        this.passwordResetService = passwordResetService;
        this.invites = invites;
        this.inviteLimiter = inviteLimiter;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * Not a list of houses any more: the public list went away with the open registration. Render's health check
     * (render.yaml, healthCheckPath) was pointed at this address, and a deploy whose check fails is thrown away, so it keeps
     * answering 200 with nothing in it. Point the check at /api/health and this can go.
     */
    @GetMapping("/registration-houses")
    List<HouseOption> legacyHealthCheck() {
        houses.count();
        return List.of();
    }

    /** For the administration: every active house, whether it already has a resident and whether it has an open invitation. */
    @GetMapping("/houses")
    @PreAuthorize("hasRole('ADMIN')")
    List<HouseOption> houseOptions() {
        java.util.Set<Long> invited = new java.util.HashSet<>();
        invites.open().forEach(invite -> invited.add(invite.houseId));
        return houses.findByActiveTrueOrderByNumberAsc().stream()
            .map(house -> new HouseOption(
                house.id,
                house.number,
                house.label,
                residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isEmpty(),
                invited.contains(house.id)
            ))
            .toList();
    }

    @PostMapping("/invites")
    @PreAuthorize("hasRole('ADMIN')")
    InviteIssuedResponse createInvite(@Valid @RequestBody CreateInviteRequest request) {
        HouseInviteService.Issued issued = invites.issue(request.houseId());
        return new InviteIssuedResponse(
            issued.invite().id,
            issued.house().id,
            issued.house().number,
            issued.house().label,
            HouseInviteService.display(issued.code()),
            issued.invite().expiresAt
        );
    }

    @GetMapping("/invites")
    @PreAuthorize("hasRole('ADMIN')")
    List<InviteResponse> openInvites() {
        return invites.open().stream()
            .map(invite -> {
                House house = houses.findById(invite.houseId).orElse(null);
                return new InviteResponse(
                    invite.id,
                    invite.houseId,
                    house == null ? null : house.number,
                    house == null ? "Casa" : house.label,
                    invite.createdAt,
                    invite.expiresAt,
                    invite.createdBy
                );
            })
            .toList();
    }

    @DeleteMapping("/invites/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Map<String, String> revokeInvite(@PathVariable Long id) {
        invites.revoke(id);
        return Map.of("status", "CANCELADO");
    }

    /**
     * Nobody is signed in on the two public invitation routes: they run in the condominium of the code typed. An
     * unknown code runs where it would anyway and fails the same way as any other.
     */
    private long condominiumOfCode(String code) {
        // A suspended condominium takes nobody new: its codes fail like any wrong code.
        return invites.condominiumOf(code).filter(condominium -> !access.suspended(condominium)).orElse(TenantContext.current());
    }

    /** Public: tells a person which house a code opens, and nothing else. Wrong, used and expired codes look the same. */
    @PostMapping("/invite-check")
    InviteCheckResponse checkInvite(@Valid @RequestBody InviteCheckRequest request, HttpServletRequest http) {
        String attemptKey = LoginAttemptLimiter.key("invite", null, http);
        inviteLimiter.check(attemptKey);
        return TenantContext.callAs(condominiumOfCode(request.code()), () -> {
            HouseInvite invite = invites.redeemable(request.code()).orElseThrow(() -> {
                inviteLimiter.fail(attemptKey);
                return new ResponseStatusException(HttpStatus.NOT_FOUND, HouseInviteService.INVALID_MESSAGE);
            });
            House house = houses.findById(invite.houseId).orElseThrow();
            return new InviteCheckResponse(house.label, house.number);
        });
    }

    /**
     * Public: the person creates their own access, for the house the code opens, and the code is spent. The transaction
     * opens inside the condominium of the code (a session keeps the condominium it was opened with).
     */
    @PostMapping("/register-with-invite")
    ResidentRegistrationResponse registerWithInvite(@Valid @RequestBody InviteRegistrationRequest request, HttpServletRequest http) {
        String attemptKey = LoginAttemptLimiter.key("invite", null, http);
        inviteLimiter.check(attemptKey);
        return TenantContext.callAs(condominiumOfCode(request.code()),
            () -> transaction.execute(status -> registerWithInviteHere(request, attemptKey)));
    }

    private ResidentRegistrationResponse registerWithInviteHere(InviteRegistrationRequest request, String attemptKey) {
        HouseInvite invite = invites.redeemable(request.code()).orElseThrow(() -> {
            inviteLimiter.fail(attemptKey);
            return new ResponseStatusException(HttpStatus.NOT_FOUND, HouseInviteService.INVALID_MESSAGE);
        });
        if (request.password().trim().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A senha precisa ter pelo menos 8 caracteres.");
        }
        House house = houses.findById(invite.houseId).orElseThrow();
        Resident saved = createResidentAccount(
            house.id,
            request.name(),
            request.email(),
            request.phone(),
            request.documentNumber(),
            request.password(),
            false
        );
        invites.markUsed(invite, saved.id);
        inviteLimiter.succeed(attemptKey);
        return new ResidentRegistrationResponse(
            saved.id,
            saved.houseId,
            house.number,
            house.label,
            saved.name,
            saved.email,
            saved.gatewayCustomerId
        );
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    List<Resident> list() {
        return residents.findAllByOrderByHouseIdAsc();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    Resident create(@RequestBody Resident resident) {
        String temporaryPassword = passwordResetService.newTemporaryPassword();
        Resident saved = createResidentAccount(
            resident.houseId,
            resident.name,
            resident.email,
            resident.phone,
            resident.documentNumber,
            temporaryPassword,
            true
        );
        saved.temporaryPassword = temporaryPassword;
        return saved;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Resident update(@PathVariable Long id, @RequestBody Resident incoming) {
        Resident resident = residents.findById(id).orElseThrow();
        users.findByEmailIgnoreCase(incoming.email)
            .filter(user -> user.residentId == null || !user.residentId.equals(id))
            .ifPresent(user -> {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "E-mail já cadastrado.");
            });
        resident.name = incoming.name;
        resident.email = incoming.email;
        resident.phone = incoming.phone;
        resident.status = incoming.status == null || incoming.status.isBlank() ? resident.status : incoming.status;
        if (incoming.documentNumber != null && !incoming.documentNumber.isBlank()) {
            resident.documentNumber = onlyDigits(incoming.documentNumber);
            resident.documentMasked = maskDocument(resident.documentNumber);
            resident.gatewayCustomerId = null;
        }
        syncGatewayCustomer(resident);
        resident = residents.save(resident);
        syncResidentUser(resident);
        return resident;
    }

    @PostMapping("/{id}/sync-asaas")
    @PreAuthorize("hasRole('ADMIN')")
    Resident syncAsaas(@PathVariable Long id) {
        Resident resident = residents.findById(id).orElseThrow();
        syncGatewayCustomer(resident);
        return residents.save(resident);
    }

    @PostMapping("/{id}/password-reset")
    @PreAuthorize("hasRole('ADMIN')")
    PasswordResetResponse requestPasswordReset(@PathVariable Long id) {
        Resident resident = residents.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Morador não encontrado."));
        return passwordResetService.requestResetForResident(resident.id);
    }

    /** A condominium without Pix still registers and edits its residents; it just has no customer in Asaas. */
    private void syncGatewayCustomer(Resident resident) {
        if (!gatewayCredentials.connectedHere()) {
            return;
        }
        GatewayCustomer customer = gatewayClient.createOrUpdateCustomer(resident);
        resident.gatewayCustomerId = customer.id();
    }

    private Resident createResidentAccount(
        Long houseId,
        String name,
        String email,
        String phone,
        String documentNumber,
        String password,
        boolean mustChangePassword
    ) {
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa não encontrada."));
        if (residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Casa ja possui morador cadastrado.");
        }
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        users.findByEmailIgnoreCase(normalizedEmail).ifPresent(user -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "E-mail já cadastrado.");
        });
        Resident resident = new Resident();
        resident.houseId = house.id;
        resident.name = name == null ? "" : name.trim();
        resident.email = normalizedEmail;
        resident.phone = phone == null ? "" : phone.trim();
        resident.documentNumber = documentNumber;
        resident.status = "ACTIVE";
        normalizeDocument(resident);
        validateDocument(resident.documentNumber);
        syncGatewayCustomer(resident);
        Resident saved = residents.save(resident);
        AppUser account = new AppUser(
            saved.name,
            saved.email,
            passwordEncoder.encode(password),
            "RESIDENT",
            saved.id
        );
        account.mustChangePassword = mustChangePassword;
        users.save(account);
        return saved;
    }

    private void syncResidentUser(Resident resident) {
        AppUser user = users.findByResidentId(resident.id).orElseGet(() -> {
            AppUser created = new AppUser();
            created.role = "RESIDENT";
            created.residentId = resident.id;
            // Nobody knows this password: the admin uses "enviar senha temporária" to give the resident access.
            created.passwordHash = passwordEncoder.encode(passwordResetService.newTemporaryPassword());
            created.mustChangePassword = true;
            return created;
        });
        user.name = resident.name;
        user.email = resident.email;
        user.active = "ACTIVE".equals(resident.status);
        users.save(user);
    }

    private void normalizeDocument(Resident resident) {
        if (resident.documentNumber != null && !resident.documentNumber.isBlank()) {
            resident.documentNumber = onlyDigits(resident.documentNumber);
            resident.documentMasked = maskDocument(resident.documentNumber);
        }
    }

    private void validateDocument(String document) {
        if (document == null || !(document.length() == 11 || document.length() == 14)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe CPF com 11 digitos ou CNPJ com 14 digitos.");
        }
    }

    private String onlyDigits(String value) {
        return value == null ? null : value.replaceAll("\\D", "");
    }

    private String maskDocument(String document) {
        if (document == null || document.isBlank()) {
            return null;
        }
        if (document.length() <= 11) {
            String suffix = document.length() < 2 ? document : document.substring(document.length() - 2);
            return "***.***.***-" + suffix;
        }
        String suffix = document.substring(Math.max(0, document.length() - 2));
        return "**.***.***/****-" + suffix;
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/houses")
@PreAuthorize("hasRole('ADMIN')")
class AdminHouseController {
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final AppUserRepository users;
    private final AuditService audit;

    AdminHouseController(HouseRepository houses, ResidentRepository residents, AppUserRepository users, AuditService audit) {
        this.houses = houses;
        this.residents = residents;
        this.users = users;
        this.audit = audit;
    }

    @PostMapping("/{houseId}/release")
    Resident release(@PathVariable Long houseId) {
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa não encontrada ou inativa."));
        Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE")
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, house.label + " não possui morador ativo para liberar."));

        resident.status = "INACTIVE";
        resident = residents.save(resident);

        users.findByResidentId(resident.id).ifPresent(user -> {
            user.active = false;
            // Whoever leaves the house stops being síndico.
            if (SindicoService.ROLE.equals(user.role)) {
                user.role = "RESIDENT";
            }
            users.save(user);
        });

        audit.record("HOUSE_RELEASED", "HOUSE", house.id, house.label + " liberada - morador: " + resident.name);
        return resident;
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/residents")
@PreAuthorize("hasRole('ADMIN')")
class AdminResidentErasureController {
    private final AccountErasureService erasure;

    AdminResidentErasureController(AccountErasureService erasure) {
        this.erasure = erasure;
    }

    /** Erases the personal data of a resident (a deletion request that came by e-mail). Financial records stay, without a name. */
    @PostMapping("/{id}/erase")
    Resident erase(@PathVariable Long id) {
        return erasure.eraseResident(id);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/sindico")
@PreAuthorize("hasRole('ADMIN')")
class AdminSindicoController {
    private final SindicoService sindico;

    AdminSindicoController(SindicoService sindico) {
        this.sindico = sindico;
    }

    @GetMapping
    SindicoResponse current() {
        return sindico.current();
    }

    @PutMapping
    SindicoResponse choose(@RequestBody ChooseSindicoRequest request) {
        return sindico.choose(request.residentId());
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/settings")
class SettingsController {
    private final FinancialService financialService;
    private final CondominiumRepository condominiums;

    SettingsController(FinancialService financialService, CondominiumRepository condominiums) {
        this.financialService = financialService;
        this.condominiums = condominiums;
    }

    @GetMapping
    SettingsResponse get() {
        return SettingsResponse.from(financialService.settings());
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    SettingsResponse update(@RequestBody Settings settings) {
        Settings saved = financialService.updateSettings(settings);
        // The condominium's name is the same everywhere: the platform panel shows the one the administration chose.
        condominiums.findById(TenantContext.current())
            .filter(condominium -> !condominium.name.equals(saved.villageName))
            .ifPresent(condominium -> {
                condominium.name = saved.villageName;
                condominiums.save(condominium);
            });
        return SettingsResponse.from(saved);
    }

    @PutMapping("/budget-rule")
    @PreAuthorize("hasRole('ADMIN')")
    SettingsResponse updateBudgetRule(@RequestBody BudgetRuleRequest request) {
        return SettingsResponse.from(financialService.updateBudgetRule(request.budgetRequiredAbove()));
    }
}

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(InvalidWebhookTokenException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    Map<String, String> invalidWebhook(InvalidWebhookTokenException ex) {
        return Map.of("error", ex.getMessage());
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> responseStatus(ResponseStatusException ex) {
        String reason = ex.getReason();
        if (reason == null || reason.isBlank()) {
            reason = "Não foi possível concluir a solicitação.";
        }
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("error", reason));
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    Map<String, String> uploadTooLarge() {
        return Map.of("error", "O arquivo é grande demais. O limite é de 10 MB.");
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    Map<String, String> notFound() {
            return Map.of("error", "Registro não encontrado.");
    }
}

/** For the platform's health check: answers 200 only while the database answers, and says nothing about the data. */
@RestController
@RequestMapping("/api/health")
class HealthController {
    private final HouseRepository houses;

    HealthController(HouseRepository houses) {
        this.houses = houses;
    }

    @GetMapping
    Map<String, String> health() {
        houses.count();
        return Map.of("status", "UP");
    }
}
