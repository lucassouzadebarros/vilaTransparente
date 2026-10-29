package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Who the condominium pays. The administration and the síndico see them; whoever pays the bills keeps them. */
@RestController
@RequestMapping("/api/suppliers")
class SupplierController {
    private final PayableService payables;

    SupplierController(PayableService payables) {
        this.payables = payables;
    }

    @GetMapping
    @PreAuthorize("@access.canManageBudgets()")
    List<Supplier> list() {
        return payables.suppliers();
    }

    @PostMapping
    @PreAuthorize("@access.canPay()")
    Supplier create(@RequestBody SupplierRequest request) {
        return payables.saveSupplier(null, request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("@access.canPay()")
    Supplier update(@PathVariable Long id, @RequestBody SupplierRequest request) {
        return payables.saveSupplier(id, request);
    }

    /** Leaves the list of suppliers to choose from; the bills already paid to it stay as they are. */
    @DeleteMapping("/{id}")
    @PreAuthorize("@access.canPay()")
    Supplier deactivate(@PathVariable Long id) {
        return payables.deactivateSupplier(id);
    }
}

/**
 * The condominium's bills: the administration and the síndico follow them; whoever may pay (the administration, and the
 * síndico when the condominium allows) records, approves and pays them.
 */
@RestController
@RequestMapping("/api/payables")
class PayableController {
    private final PayableService payables;

    PayableController(PayableService payables) {
        this.payables = payables;
    }

    @GetMapping
    @PreAuthorize("@access.canManageBudgets()")
    List<PayableView> list() {
        return payables.list();
    }

    @PostMapping
    @PreAuthorize("@access.canPay()")
    List<PayableView> create(@RequestBody PayableRequest request) {
        return payables.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("@access.canPay()")
    PayableView update(@PathVariable Long id, @RequestBody PayableRequest request) {
        return payables.update(id, request);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("@access.canPay()")
    PayableView approve(@PathVariable Long id) {
        return payables.approve(id);
    }

    @PostMapping("/{id}/pay")
    @PreAuthorize("@access.canPay()")
    PayableView pay(@PathVariable Long id, @RequestBody PayPayableRequest request) {
        return payables.pay(id, request);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("@access.canPay()")
    PayableView cancel(@PathVariable Long id, @RequestBody CancelRequest request) {
        return payables.cancel(id, request == null ? null : request.reason());
    }
}

@Service
class PayableService {
    private static final Set<String> PIX_KEY_TYPES = Set.of("CPF", "CNPJ", "EMAIL", "PHONE", "EVP");
    static final Set<String> METHODS = Set.of("PIX", "TED", "BOLETO", "DINHEIRO", "CARTAO", "OUTRO");
    private static final int MAX_INSTALLMENTS = 60;

    private final PayableRepository payables;
    private final SupplierRepository suppliers;
    private final SettingsRepository settingsRepository;
    private final ExpenseRepository expenses;
    private final BudgetRepository budgets;
    private final ServiceOrderRepository services;
    private final SpendingRules rules;
    private final AppUserRepository users;
    private final CurrentUserService currentUser;
    private final AuditService audit;
    private final PushService push;
    private final DashboardEventService dashboardEvents;

    PayableService(
        PayableRepository payables,
        SupplierRepository suppliers,
        SettingsRepository settingsRepository,
        ExpenseRepository expenses,
        BudgetRepository budgets,
        ServiceOrderRepository services,
        SpendingRules rules,
        AppUserRepository users,
        CurrentUserService currentUser,
        AuditService audit,
        PushService push,
        DashboardEventService dashboardEvents
    ) {
        this.payables = payables;
        this.suppliers = suppliers;
        this.settingsRepository = settingsRepository;
        this.expenses = expenses;
        this.budgets = budgets;
        this.services = services;
        this.rules = rules;
        this.users = users;
        this.currentUser = currentUser;
        this.audit = audit;
        this.push = push;
        this.dashboardEvents = dashboardEvents;
    }

    // ---- Suppliers

    @Transactional(readOnly = true)
    List<Supplier> suppliers() {
        return suppliers.findAllByOrderByNameAsc();
    }

    @Transactional
    Supplier saveSupplier(Long id, SupplierRequest request) {
        Supplier supplier = id == null ? new Supplier()
            : suppliers.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fornecedor não encontrado."));
        String name = trimmed(request.name());
        if (name == null || name.length() < 2 || name.length() > 160) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o nome do fornecedor.");
        }
        String document = request.document() == null ? null : request.document().replaceAll("\\D", "");
        if (document != null && !document.isEmpty() && document.length() != 11 && document.length() != 14) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O CPF tem 11 números e o CNPJ, 14.");
        }
        String pixKey = trimmed(request.pixKey());
        String pixKeyType = pixKey == null ? null : request.pixKeyType() == null ? null : request.pixKeyType().trim().toUpperCase(Locale.ROOT);
        if (pixKey != null) {
            if (pixKeyType == null || !PIX_KEY_TYPES.contains(pixKeyType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diga o tipo da chave Pix: CPF, CNPJ, e-mail, telefone ou aleatória.");
            }
            pixKey = normalizedPixKey(pixKey, pixKeyType);
        }
        supplier.name = name;
        supplier.document = document == null || document.isEmpty() ? null : document;
        supplier.pixKey = pixKey;
        supplier.pixKeyType = pixKeyType;
        supplier.phone = trimmed(request.phone());
        supplier.email = trimmed(request.email());
        supplier.notes = trimmed(request.notes());
        supplier.active = true;
        Supplier saved = suppliers.save(supplier);
        audit.record(id == null ? "SUPPLIER_CREATED" : "SUPPLIER_UPDATED", "SUPPLIER", saved.id,
            saved.name + (saved.pixKey == null ? "" : " - Pix " + pixKeyLabel(saved.pixKeyType)));
        return saved;
    }

    @Transactional
    Supplier deactivateSupplier(Long id) {
        Supplier supplier = suppliers.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fornecedor não encontrado."));
        supplier.active = false;
        audit.record("SUPPLIER_DEACTIVATED", "SUPPLIER", supplier.id, supplier.name);
        return suppliers.save(supplier);
    }

    /** The key as Asaas expects it: digits for CPF, CNPJ and phone, lower case for e-mail. */
    private static String normalizedPixKey(String key, String type) {
        String value = switch (type) {
            case "CPF", "CNPJ", "PHONE" -> key.replaceAll("\\D", "");
            case "EMAIL" -> key.toLowerCase(Locale.ROOT);
            default -> key;
        };
        boolean valid = switch (type) {
            case "CPF" -> value.length() == 11;
            case "CNPJ" -> value.length() == 14;
            case "PHONE" -> value.length() >= 10 && value.length() <= 13;
            case "EMAIL" -> value.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+");
            default -> value.length() >= 32 && value.length() <= 36;
        };
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A chave Pix não parece um " + pixKeyLabel(type) + " válido.");
        }
        return value;
    }

    private static String pixKeyLabel(String type) {
        return switch (type == null ? "" : type) {
            case "CPF" -> "CPF";
            case "CNPJ" -> "CNPJ";
            case "EMAIL" -> "e-mail";
            case "PHONE" -> "telefone";
            default -> "chave aleatória";
        };
    }

    // ---- Bills

    @Transactional(readOnly = true)
    List<PayableView> list() {
        AppUser me = currentUser.current();
        boolean canPay = currentUser.canPay();
        Map<Long, Supplier> supplierById = suppliers.findAll().stream().collect(Collectors.toMap(found -> found.id, Function.identity()));
        Map<String, String> names = new java.util.HashMap<>();
        return payables.findAllByOrderByDueDateAscIdAsc().stream()
            .map(payable -> view(payable, me, canPay, supplierById, names))
            .toList();
    }

    /**
     * Records a bill: one, split in installments (one a month), repeating every month, or a down payment and the rest
     * (at once or in installments). Above the condominium's approval value it waits for a second person; below, whoever
     * records it has already approved it.
     */
    @Transactional
    List<PayableView> create(PayableRequest request) {
        AppUser me = currentUser.current();
        int installments = request.installments() == null ? 1 : request.installments();
        boolean monthly = Boolean.TRUE.equals(request.monthly());
        if (installments < 1 || installments > MAX_INSTALLMENTS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "De 1 a " + MAX_INSTALLMENTS + " parcelas.");
        }
        if (monthly && (installments > 1 || request.downPayment() != null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Uma conta que se repete todo mês não tem parcelas nem entrada.");
        }
        Payable template = new Payable();
        apply(template, request);
        if (template.dueDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o vencimento.");
        }
        BigDecimal down = request.downPayment() == null ? null : request.downPayment().setScale(2, RoundingMode.HALF_UP);
        LocalDate restFrom = template.dueDate;
        if (down != null) {
            if (down.signum() <= 0 || down.compareTo(template.amount) >= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A entrada precisa ser maior que zero e menor que o valor total.");
            }
            restFrom = request.restDueDate() == null ? template.dueDate.plusMonths(1) : request.restDueDate();
            if (restFrom.isBefore(template.dueDate)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O restante não pode vencer antes da entrada.");
            }
        }
        boolean waits = needsApproval(template.amount);
        String groupKey = installments > 1 || monthly || down != null ? UUID.randomUUID().toString() : null;
        List<Payable> created = new ArrayList<>();
        if (down != null) {
            Payable entry = copy(template);
            entry.description = withSuffix(template.description, " - entrada");
            entry.amount = down;
            created.add(payables.save(prepared(entry, me, waits, groupKey, false)));
        }
        BigDecimal rest = down == null ? template.amount : template.amount.subtract(down);
        BigDecimal part = rest.divide(BigDecimal.valueOf(installments), 2, RoundingMode.DOWN);
        for (int number = 1; number <= installments; number++) {
            Payable payable = copy(template);
            if (down != null) {
                payable.description = withSuffix(template.description, " - restante");
            }
            payable.amount = number < installments ? part : rest.subtract(part.multiply(BigDecimal.valueOf(installments - 1)));
            payable.dueDate = restFrom.plusMonths(number - 1L);
            payable.installment = installments > 1 ? number : null;
            payable.installments = installments > 1 ? installments : null;
            created.add(payables.save(prepared(payable, me, waits, groupKey, monthly)));
        }
        Payable first = created.get(0);
        audit.record("PAYABLE_CREATED", "PAYABLE", first.id, template.description + " - " + AuditService.money(template.amount)
            + (down != null ? " - entrada " + AuditService.money(down) + " e o restante" : "")
            + (installments > 1 ? " em " + installments + " parcelas" : "") + (monthly ? " todo mês" : "")
            + supplierSuffix(first.supplierId) + (waits ? " - aguarda aprovação" : ""));
        if (waits) {
            notifyApprovers(me, first, template.amount);
        }
        Map<Long, Supplier> supplierById = suppliers.findAll().stream().collect(Collectors.toMap(found -> found.id, Function.identity()));
        Map<String, String> names = new java.util.HashMap<>();
        return created.stream().map(payable -> view(payable, me, true, supplierById, names)).toList();
    }

    /** Changes a bill not yet paid. Raising it above the approval value sends it back to approval. */
    @Transactional
    PayableView update(Long id, PayableRequest request) {
        AppUser me = currentUser.current();
        Payable payable = open(id);
        BigDecimal before = payable.amount;
        apply(payable, request);
        if (payable.dueDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o vencimento.");
        }
        if (Payable.APPROVED.equals(payable.status) && payable.amount.compareTo(before) > 0 && needsApproval(payable.amount)) {
            payable.status = Payable.PENDING_APPROVAL;
            payable.approvedBy = null;
            payable.approvedAt = null;
            payable.createdBy = me.email;
            notifyApprovers(me, payable, payable.amount);
        }
        payable.updatedAt = LocalDateTime.now();
        Payable saved = payables.save(payable);
        audit.record("PAYABLE_UPDATED", "PAYABLE", saved.id, saved.description + " - " + AuditService.money(before) + " -> "
            + AuditService.money(saved.amount));
        return view(saved, me, true, Map.of(), new java.util.HashMap<>());
    }

    /** A second person approves (never whoever recorded it). Every installment of the same bill is approved together. */
    @Transactional
    PayableView approve(Long id) {
        AppUser me = currentUser.current();
        Payable payable = payables.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta não encontrada."));
        if (!Payable.PENDING_APPROVAL.equals(payable.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta não está esperando aprovação.");
        }
        if (me.email.equalsIgnoreCase(payable.createdBy)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Quem lançou a conta não pode aprová-la. Peça a outra pessoa que paga as contas do condomínio.");
        }
        List<Payable> group = payable.groupKey == null ? List.of(payable) : payables.findByGroupKeyAndStatus(payable.groupKey, Payable.PENDING_APPROVAL);
        for (Payable each : group) {
            each.status = Payable.APPROVED;
            each.approvedBy = me.email;
            each.approvedAt = LocalDateTime.now();
            each.updatedAt = LocalDateTime.now();
            payables.save(each);
        }
        audit.record("PAYABLE_APPROVED", "PAYABLE", payable.id, payable.description + " - " + AuditService.money(payable.amount)
            + (group.size() > 1 ? " (" + group.size() + " parcelas)" : ""));
        return view(payable, me, true, Map.of(), new java.util.HashMap<>());
    }

    /**
     * Records a payment made outside the system (bank app, cash): the bill becomes an expense of the cash box, with the
     * receipt, under the same spending rules as any expense. A monthly bill creates next month's, already approved.
     */
    @Transactional
    PayableView pay(Long id, PayPayableRequest request) {
        AppUser me = currentUser.current();
        Payable payable = payables.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta não encontrada."));
        switch (payable.status) {
            case Payable.PENDING_APPROVAL -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta ainda espera a aprovação de outra pessoa.");
            case Payable.PAID -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta já foi paga.");
            case Payable.CANCELLED -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta foi cancelada.");
            default -> {
            }
        }
        LocalDate paidAt = request.paidAt() == null ? BudgetVotingService.today() : request.paidAt();
        if (paidAt.isAfter(BudgetVotingService.today())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A data do pagamento não pode ser no futuro.");
        }
        String method = request.method() == null ? "" : request.method().trim().toUpperCase(Locale.ROOT);
        if (!METHODS.contains(method)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diga como foi pago: Pix, TED, boleto, dinheiro, cartão ou outro.");
        }

        Expense expense = new Expense();
        expense.description = payable.description + (payable.installments == null ? "" : " (parcela " + payable.installment + "/" + payable.installments + ")");
        expense.category = payable.category;
        expense.amount = payable.amount;
        expense.expenseDate = paidAt;
        expense.supplier = payable.supplierId == null ? null : suppliers.findById(payable.supplierId).map(found -> found.name).orElse(null);
        expense.paymentMethod = method;
        expense.notes = trimmed(request.notes()) == null ? payable.notes : trimmed(request.notes());
        expense.documentId = request.receiptDocumentId() != null ? request.receiptDocumentId() : payable.documentId;
        expense.budgetId = payable.budgetId;
        expense.serviceOrderId = payable.serviceOrderId;
        expense.exceptionReason = payable.exceptionReason;
        rules.assertExpenseAllowed(expense);
        if (expense.exceptionReason == null) {
            // A small bill can be within the limit on its own and still need the justification the whole job took.
            expense.exceptionReason = payable.exceptionReason;
        }
        Expense savedExpense = expenses.save(expense);
        startService(payable.serviceOrderId);
        audit.record("EXPENSE_CREATED", "EXPENSE", savedExpense.id, savedExpense.description + " - " + AuditService.money(savedExpense.amount)
            + (savedExpense.exceptionReason == null ? "" : " - SEM VOTAÇÃO: " + savedExpense.exceptionReason));

        payable.status = Payable.PAID;
        payable.paidBy = me.email;
        payable.paidAt = paidAt;
        payable.paymentMethod = method;
        payable.receiptDocumentId = request.receiptDocumentId();
        payable.expenseId = savedExpense.id;
        payable.updatedAt = LocalDateTime.now();
        Payable saved = payables.save(payable);
        audit.record("PAYABLE_PAID", "PAYABLE", saved.id, saved.description + " - " + AuditService.money(saved.amount) + " - " + method
            + " em " + paidAt);

        if (Payable.MONTHLY.equals(payable.recurrence)) {
            Payable next = copy(payable);
            next.dueDate = payable.dueDate.plusMonths(1);
            next.status = Payable.APPROVED;
            next.groupKey = payable.groupKey;
            next.recurrence = Payable.MONTHLY;
            next.createdBy = payable.createdBy;
            next.approvedBy = payable.approvedBy;
            next.approvedAt = LocalDateTime.now();
            payables.save(next);
        }
        dashboardEvents.publishDashboardChanged();
        return view(saved, me, true, Map.of(), new java.util.HashMap<>());
    }

    /** A bill not yet paid leaves the list, with the reason. A monthly one stops repeating. */
    @Transactional
    PayableView cancel(Long id, String reason) {
        AppUser me = currentUser.current();
        Payable payable = open(id);
        String why = trimmed(reason);
        if (why == null || why.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diga por que a conta foi cancelada.");
        }
        payable.status = Payable.CANCELLED;
        payable.cancelledBy = me.email;
        payable.cancelledAt = LocalDateTime.now();
        payable.cancelReason = why;
        payable.updatedAt = LocalDateTime.now();
        Payable saved = payables.save(payable);
        audit.record("PAYABLE_CANCELLED", "PAYABLE", saved.id, saved.description + " - " + AuditService.money(saved.amount) + " - motivo: " + why);
        return view(saved, me, true, Map.of(), new java.util.HashMap<>());
    }

    // ---- Helpers

    private Payable open(Long id) {
        Payable payable = payables.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta não encontrada."));
        if (Payable.PAID.equals(payable.status) || Payable.CANCELLED.equals(payable.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta já foi " + (Payable.PAID.equals(payable.status) ? "paga." : "cancelada."));
        }
        return payable;
    }

    /** The fields a person types, checked against the suppliers, the budgets and the spending rules. */
    private void apply(Payable payable, PayableRequest request) {
        String description = trimmed(request.description());
        if (description == null || description.length() < 3 || description.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descreva a conta (3 a 200 letras).");
        }
        if (request.amount() == null || request.amount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um valor maior que zero.");
        }
        if (request.supplierId() != null && suppliers.findById(request.supplierId()).filter(found -> found.active).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fornecedor não encontrado.");
        }
        // The job the bill pays for: a service (with the budget the houses approved for it), or a budget on its own.
        ServiceOrder service = null;
        if (request.serviceOrderId() != null) {
            service = services.findById(request.serviceOrderId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Serviço não encontrado."));
            if ("CANCELADO".equals(service.status)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Este serviço foi cancelado.");
            }
        }
        Long budgetId = request.budgetId() != null ? request.budgetId() : service == null ? null : service.approvedBudgetId;
        Budget budget = null;
        if (budgetId != null) {
            budget = budgets.findById(budgetId)
                .filter(found -> "APROVADO".equals(found.status))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha um orçamento aprovado pelas unidades."));
            if (service == null && budget.serviceId != null) {
                // An approved budget became a service: the bill belongs to that service.
                service = services.findById(budget.serviceId).filter(found -> !"CANCELADO".equals(found.status)).orElse(null);
            }
        }
        String reason = trimmed(request.exceptionReason());
        boolean beyond = beyondApproved(payable.id, service, budget, request.amount(), reason);
        Expense check = new Expense();
        check.description = description;
        check.category = trimmed(request.category());
        check.amount = request.amount();
        check.budgetId = budgetId;
        check.serviceOrderId = service == null ? null : service.id;
        check.exceptionReason = reason;
        rules.assertExpenseAllowed(check);

        payable.description = description;
        payable.category = check.category;
        payable.amount = request.amount().setScale(2, RoundingMode.HALF_UP);
        payable.dueDate = request.dueDate();
        payable.supplierId = request.supplierId();
        payable.budgetId = budgetId;
        payable.serviceOrderId = check.serviceOrderId;
        payable.documentId = request.documentId();
        payable.exceptionReason = beyond ? reason : check.exceptionReason;
        payable.notes = trimmed(request.notes());
    }

    /**
     * Everything paid or still to pay for the same job, with this bill, stays within what the houses approved (with 10%
     * of room) or, for a small service with no budget, within the limit. Beyond that it takes an emergency
     * justification, which everybody reads; with one, it returns true.
     */
    private boolean beyondApproved(Long billId, ServiceOrder service, Budget budget, BigDecimal amount, String reason) {
        BigDecimal cap = budget != null ? budget.amount.multiply(BigDecimal.ONE.add(SpendingRules.TOLERANCE)) : service == null ? null : rules.limit().orElse(null);
        if (cap == null) {
            return false;
        }
        Map<Long, BigDecimal> spent = new java.util.HashMap<>();
        Map<Long, BigDecimal> pending = new java.util.HashMap<>();
        List<Expense> paid = new ArrayList<>(service == null ? List.of() : expenses.findByServiceOrderId(service.id));
        List<Payable> bills = new ArrayList<>(service == null ? List.of() : payables.findByServiceOrderId(service.id));
        if (budget != null) {
            paid.addAll(expenses.findByBudgetId(budget.id));
            bills.addAll(payables.findByBudgetId(budget.id));
        }
        paid.forEach(expense -> spent.put(expense.id, expense.amount));
        bills.stream()
            .filter(bill -> !bill.id.equals(billId) && (Payable.PENDING_APPROVAL.equals(bill.status) || Payable.APPROVED.equals(bill.status)))
            .forEach(bill -> pending.put(bill.id, bill.amount));
        BigDecimal committed = spent.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add)
            .add(pending.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        if (committed.add(amount).compareTo(cap) <= 0) {
            return false;
        }
        if (SpendingRules.validReason(reason)) {
            return true;
        }
        String where = budget != null
            ? "passa de " + AuditService.money(cap) + " (o orçamento aprovado pelas unidades, " + AuditService.money(budget.amount) + ", mais 10%)"
            : "passa de " + AuditService.money(cap) + ", o limite sem votação";
        String what = committed.signum() == 0 ? "O valor " : "Somando com o que já foi lançado para " + (service != null ? "este serviço" : "este orçamento")
            + " (" + AuditService.money(committed) + "), o total ";
        throw new ResponseStatusException(HttpStatus.CONFLICT, what + where + ". Se for uma emergência, escreva a justificativa (pelo menos "
            + SpendingRules.MIN_REASON + " letras): ela aparece para todas as unidades.");
    }

    /** Money went to the job (a down payment, an installment): a service still waiting to start is now under way. */
    private void startService(Long serviceId) {
        if (serviceId == null) {
            return;
        }
        services.findById(serviceId)
            .filter(service -> "PLANEJADO".equals(service.status) || "APROVADO".equals(service.status))
            .ifPresent(service -> {
                service.status = "EM_ANDAMENTO";
                service.updatedAt = LocalDateTime.now();
                services.save(service);
            });
    }

    /** Who recorded it, the group it belongs to, and whether it still waits for a second person. */
    private static Payable prepared(Payable payable, AppUser me, boolean waits, String groupKey, boolean monthly) {
        payable.groupKey = groupKey;
        payable.recurrence = monthly ? Payable.MONTHLY : null;
        payable.createdBy = me.email;
        if (waits) {
            payable.status = Payable.PENDING_APPROVAL;
        } else {
            payable.status = Payable.APPROVED;
            payable.approvedBy = me.email;
            payable.approvedAt = LocalDateTime.now();
        }
        return payable;
    }

    /** "Pintura do portão - entrada": the description with what part it is, kept within the 200 letters. */
    private static String withSuffix(String description, String suffix) {
        int room = 200 - suffix.length();
        return (description.length() > room ? description.substring(0, room).trim() : description) + suffix;
    }

    private static Payable copy(Payable source) {
        Payable copy = new Payable();
        copy.supplierId = source.supplierId;
        copy.description = source.description;
        copy.category = source.category;
        copy.amount = source.amount;
        copy.dueDate = source.dueDate;
        copy.budgetId = source.budgetId;
        copy.serviceOrderId = source.serviceOrderId;
        copy.documentId = source.documentId;
        copy.exceptionReason = source.exceptionReason;
        copy.notes = source.notes;
        return copy;
    }

    private boolean needsApproval(BigDecimal amount) {
        BigDecimal above = settingsRepository.findAll().stream().findFirst().map(found -> found.approvalAbove).orElse(null);
        return above != null && amount.compareTo(above) > 0;
    }

    /** Everyone else who may pay hears that a bill waits for them. */
    private void notifyApprovers(AppUser me, Payable payable, BigDecimal total) {
        boolean sindicoPays = settingsRepository.findAll().stream().findFirst().map(found -> found.sindicoCanPay).orElse(false);
        List<Long> approvers = users.findByCondominiumId(TenantContext.current()).stream()
            .filter(user -> user.active && !user.email.equalsIgnoreCase(me.email))
            .filter(user -> "ADMIN".equals(user.role) || sindicoPays && "SINDICO".equals(user.role))
            .map(user -> user.id)
            .toList();
        if (!approvers.isEmpty()) {
            push.notifyUsers(approvers, "Conta para aprovar", payable.description + " - " + AuditService.money(total) + ", lançada por " + me.name + ".",
                Map.of("type", "PAYABLE", "id", payable.id));
        }
    }

    private String supplierSuffix(Long supplierId) {
        return supplierId == null ? "" : suppliers.findById(supplierId).map(found -> " - " + found.name).orElse("");
    }

    private PayableView view(Payable payable, AppUser me, boolean canPay, Map<Long, Supplier> supplierById, Map<String, String> names) {
        Supplier supplier = payable.supplierId == null ? null
            : supplierById.containsKey(payable.supplierId) ? supplierById.get(payable.supplierId) : suppliers.findById(payable.supplierId).orElse(null);
        boolean open = Payable.PENDING_APPROVAL.equals(payable.status) || Payable.APPROVED.equals(payable.status);
        return new PayableView(
            payable.id,
            payable.description,
            payable.category,
            payable.amount,
            payable.dueDate,
            payable.status,
            open && payable.dueDate.isBefore(BudgetVotingService.today()),
            payable.supplierId,
            supplier == null ? null : supplier.name,
            supplier != null && supplier.pixKey != null,
            payable.installment,
            payable.installments,
            payable.recurrence,
            payable.budgetId,
            payable.serviceOrderId,
            payable.documentId,
            payable.exceptionReason,
            payable.notes,
            nameOf(payable.createdBy, names),
            payable.createdAt,
            nameOf(payable.approvedBy, names),
            payable.approvedAt,
            nameOf(payable.paidBy, names),
            payable.paidAt,
            payable.paymentMethod,
            payable.receiptDocumentId,
            payable.expenseId,
            nameOf(payable.cancelledBy, names),
            payable.cancelReason,
            canPay && Payable.PENDING_APPROVAL.equals(payable.status) && !me.email.equalsIgnoreCase(payable.createdBy)
        );
    }

    private String nameOf(String email, Map<String, String> names) {
        if (email == null) {
            return null;
        }
        return names.computeIfAbsent(email.toLowerCase(Locale.ROOT), key -> users.findByEmailIgnoreCase(key).map(user -> user.name).orElse(email));
    }

    private static String trimmed(String value) {
        if (value == null) {
            return null;
        }
        String clean = value.trim().replaceAll("\\s+", " ");
        return clean.isEmpty() ? null : clean;
    }
}
