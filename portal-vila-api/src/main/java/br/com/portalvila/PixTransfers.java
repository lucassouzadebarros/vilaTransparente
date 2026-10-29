package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Before paying by Pix: whether it can be done here, how much of the day's limit is used, and the Asaas balance. */
record PixPaymentStatus(boolean available, String reason, BigDecimal dailyLimit, BigDecimal usedToday, BigDecimal balance) {
}

/** Paying by Pix asks for the person's own password again: a stolen session alone cannot move money. */
record PayByPixRequest(String password) {
}

/** What the administration types in Asaas (Integrações > Mecanismos de segurança) so Asaas checks each withdrawal here. */
record PixValidationView(boolean configured, String url, String token, LocalDateTime lastCheckAt) {
}

@RestController
@RequestMapping("/api/payables")
class PixPaymentController {
    private final PixTransferService pix;

    PixPaymentController(PixTransferService pix) {
        this.pix = pix;
    }

    @GetMapping("/pix")
    @PreAuthorize("@access.canManageBudgets()")
    PixPaymentStatus status() {
        return pix.status();
    }

    @PostMapping("/{id}/pix")
    @PreAuthorize("@access.canPay()")
    PayableView pay(@PathVariable Long id, @RequestBody PayByPixRequest request) {
        return pix.pay(id, request == null ? null : request.password());
    }

    /** Reads a "copia e cola" code with Asaas: who receives it and how much. Nothing is paid. */
    @PostMapping("/pix-code/read")
    @PreAuthorize("@access.canPay()")
    PixCodeView readCode(@RequestBody ReadPixCodeRequest request) {
        return pix.readCode(request == null ? null : request.code());
    }

    /** Pays a "copia e cola" code: the bill is recorded, approved and paid at once, with the person's password. */
    @PostMapping("/pix-code")
    @PreAuthorize("@access.canPay()")
    PayableView payCode(@RequestBody PayPixCodeRequest request) {
        return pix.payCode(request);
    }

    /** Who holds a Pix key typed at the moment (name, masked document, bank), before paying it. Nothing is paid. */
    @PostMapping("/pix-key/read")
    @PreAuthorize("@access.canPay()")
    PixKeyView readKey(@RequestBody ReadPixKeyRequest request) {
        return pix.readKey(request);
    }

    /** Pays a key typed at the moment, as in a bank app: the bill is recorded, approved and paid at once, with the password. */
    @PostMapping("/pix-key")
    @PreAuthorize("@access.canPay()")
    PayableView payKey(@RequestBody PayPixKeyRequest request) {
        return pix.payKey(request);
    }
}

@RestController
@RequestMapping("/api")
class PixValidationController {
    private final PixTransferService pix;

    PixValidationController(PixTransferService pix) {
        this.pix = pix;
    }

    @GetMapping("/payments/pix-validation")
    @PreAuthorize("hasRole('ADMIN')")
    PixValidationView view() {
        return pix.validationView();
    }

    @PostMapping("/payments/pix-validation")
    @PreAuthorize("hasRole('ADMIN')")
    PixValidationView create() {
        return pix.createValidation(PaymentsService.currentEmail());
    }

    /** Asaas asks whether a withdrawal may leave the account. A wrong address or token gets the same refusal as a notice. */
    @PostMapping("/webhooks/asaas/saque/{routeKey}")
    Map<String, String> validate(
        @PathVariable String routeKey,
        @RequestHeader(value = "asaas-access-token", required = false) String token,
        @RequestBody JsonNode payload
    ) {
        return pix.validate(routeKey, token, payload);
    }
}

/**
 * Paying a bill by Pix from the condominium's Asaas account: to the supplier's key, or by a "copia e cola" code (which
 * records its own bill). The request is kept before Asaas is called, so Asaas can check it here before the money
 * leaves; the bill is settled (expense, receipt) only when Asaas confirms it, by its notice or by asking it every few
 * minutes. Guards: the person's password, the daily limit, one Pix at a time per bill, and only bills already approved,
 * to a supplier with a Pix key or to the receiver the code names.
 */
@Service
class PixTransferService {
    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Logger log = LoggerFactory.getLogger(PixTransferService.class);
    private static final String TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final Set<String> FINAL = Set.of(PixTransfer.DONE, PixTransfer.FAILED, PixTransfer.CANCELLED);

    private final PixTransferRepository transfers;
    private final PixValidationRepository validations;
    private final PayableRepository payables;
    private final SupplierRepository suppliers;
    private final SettingsRepository settings;
    private final PortalDocumentRepository documents;
    private final AppUserRepository users;
    private final PayableService payableService;
    private final PixGatewayClient gateway;
    private final GatewayCredentials credentials;
    private final CurrentUserService currentUser;
    private final PasswordEncoder passwordEncoder;
    private final SecretBox secrets;
    private final AuditService audit;
    private final PushService push;
    private final TransactionTemplate transaction;
    private final String publicApiUrl;
    private final SecureRandom random = new SecureRandom();

    PixTransferService(
        PixTransferRepository transfers,
        PixValidationRepository validations,
        PayableRepository payables,
        SupplierRepository suppliers,
        SettingsRepository settings,
        PortalDocumentRepository documents,
        AppUserRepository users,
        PayableService payableService,
        PixGatewayClient gateway,
        GatewayCredentials credentials,
        CurrentUserService currentUser,
        PasswordEncoder passwordEncoder,
        SecretBox secrets,
        AuditService audit,
        PushService push,
        PlatformTransactionManager transactionManager,
        @Value("${portal.public-api-url:http://localhost:8080}") String publicApiUrl
    ) {
        this.transfers = transfers;
        this.validations = validations;
        this.payables = payables;
        this.suppliers = suppliers;
        this.settings = settings;
        this.documents = documents;
        this.users = users;
        this.payableService = payableService;
        this.gateway = gateway;
        this.credentials = credentials;
        this.currentUser = currentUser;
        this.passwordEncoder = passwordEncoder;
        this.secrets = secrets;
        this.audit = audit;
        this.push = push;
        this.transaction = new TransactionTemplate(transactionManager);
        this.publicApiUrl = publicApiUrl.replaceAll("/+$", "");
    }

    // ---- Paying

    PixPaymentStatus status() {
        BigDecimal limit = settings.findAll().stream().findFirst().map(row -> row.pixDailyLimit).orElse(null);
        String reason = !credentials.connectedHere()
            ? "O condomínio ainda não tem a conta Asaas conectada."
            : limit == null ? "O Pix pelo Asaas está desligado: defina o limite por dia em Configurações." : null;
        BigDecimal balance = null;
        if (reason == null) {
            try {
                balance = gateway.getBalance();
            } catch (RuntimeException unavailable) {
                // The balance is a help, not a condition: Asaas refuses a Pix without funds anyway.
            }
        }
        return new PixPaymentStatus(reason == null, reason, limit, usedToday(), balance);
    }

    /** What left (or is leaving) by Pix today: every transfer requested today that did not fail. */
    private BigDecimal usedToday() {
        return transfers.findByRequestedAtGreaterThanEqual(today().atStartOfDay()).stream()
            .filter(transfer -> !PixTransfer.FAILED.equals(transfer.status) && !PixTransfer.CANCELLED.equals(transfer.status))
            .map(transfer -> transfer.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Paying by Pix asks for the person's own password again: a stolen session alone cannot move money. */
    private AppUser checkPassword(String password, Long payableId) {
        AppUser me = currentUser.current();
        if (password == null || password.isBlank() || me.passwordHash == null || !passwordEncoder.matches(password, me.passwordHash)) {
            audit.record("PIX_PASSWORD_REFUSED", "PAYABLE", payableId, "Senha errada ao pagar por Pix (" + me.email + ")");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Senha incorreta. Para mandar um Pix, confirme com a senha da sua conta.");
        }
        return me;
    }

    PayableView pay(Long payableId, String password) {
        AppUser me = checkPassword(password, payableId);
        // 1. The request is kept (and committed) before Asaas is called: Asaas checks it here about five seconds later.
        PixTransfer requested = transaction.execute(status -> request(payableId, me));
        Payable bill = payables.findById(payableId).orElseThrow();
        GatewayTransfer answer;
        try {
            answer = gateway.createPixTransfer(requested.amount, requested.pixKey, requested.pixKeyType,
                trimTo("Pagamento: " + bill.description, 140), "PIX-" + requested.id);
        } catch (RuntimeException refused) {
            throw notSent(requested, bill, refused);
        }
        accepted(requested, bill, answer);
        return payableService.viewOf(payables.findById(payableId).orElseThrow());
    }

    /** Asaas refused it at once: the request failed (a code's bill is cancelled: the code is spent) and the error says why. */
    private ResponseStatusException notSent(PixTransfer requested, Payable bill, RuntimeException refused) {
        String why = explain(refused instanceof ResponseStatusException status && status.getReason() != null ? status.getReason() : "o Asaas não respondeu.");
        transaction.executeWithoutResult(status -> {
            transfers.findById(requested.id).ifPresent(transfer -> {
                transfer.status = PixTransfer.FAILED;
                transfer.failReason = why;
                transfer.updatedAt = LocalDateTime.now();
                transfers.save(transfer);
                audit.record("PIX_FAILED", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(transfer.amount) + " - " + why);
            });
            if (requested.ownBill) {
                payables.findById(bill.id).ifPresent(found -> payableService.cancelUnpaid(found, notSentReason(requested) + why, requested.requestedBy));
            }
        });
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "O Pix não saiu. " + why, refused);
    }

    /** 2. Asaas took it: from here it follows Asaas (notices, or asking every few minutes). */
    private void accepted(PixTransfer requested, Payable bill, GatewayTransfer answer) {
        transaction.executeWithoutResult(status -> transfers.findById(requested.id).ifPresent(transfer -> {
            if (transfer.gatewayTransferId == null) {
                transfer.gatewayTransferId = answer.id();
            }
            audit.record("PIX_SENT", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(transfer.amount) + " - Asaas " + answer.id());
            apply(transfer, answer);
        }));
    }

    /** The settings row, locked: two Pix at the same time are counted against the day's limit one after the other. */
    private Settings lockedSettings() {
        Settings row = settings.findAllForUpdate().stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Configure o condomínio antes de pagar por Pix."));
        if (!credentials.connectedHere()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O condomínio ainda não tem a conta Asaas conectada.");
        }
        if (row.pixDailyLimit == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O Pix pelo Asaas está desligado: defina o limite por dia em Configurações.");
        }
        return row;
    }

    private void checkDailyLimit(Settings row, BigDecimal amount) {
        BigDecimal used = usedToday();
        if (used.add(amount).compareTo(row.pixDailyLimit) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Passa do limite de Pix por dia (" + AuditService.money(row.pixDailyLimit)
                + "): hoje já saiu " + AuditService.money(used) + ". Pague amanhã, aumente o limite em Configurações ou pague por fora.");
        }
    }

    private PixTransfer request(Long payableId, AppUser me) {
        Settings row = lockedSettings();
        Payable bill = payables.findByIdForUpdate(payableId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta não encontrada."));
        switch (bill.status) {
            case Payable.PENDING_APPROVAL -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta ainda espera a aprovação de outra pessoa.");
            case Payable.PAID -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta já foi paga.");
            case Payable.CANCELLED -> throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta conta foi cancelada.");
            default -> {
            }
        }
        if (transfers.existsByPayableIdAndStatusIn(bill.id, PixTransfer.IN_FLIGHT)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Um Pix desta conta já está a caminho pelo Asaas.");
        }
        Supplier supplier = bill.supplierId == null ? null : suppliers.findById(bill.supplierId).orElse(null);
        if (supplier == null || supplier.pixKey == null || supplier.pixKeyType == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cadastre a chave Pix do fornecedor desta conta para pagar por Pix.");
        }
        checkDailyLimit(row, bill.amount);
        PixTransfer transfer = new PixTransfer();
        transfer.payableId = bill.id;
        transfer.amount = bill.amount;
        transfer.pixKey = PayableService.asaasPixKey(supplier.pixKey, supplier.pixKeyType);
        transfer.pixKeyType = supplier.pixKeyType;
        transfer.requestedBy = me.email;
        transfer.requestedAt = LocalDateTime.now(ZONE);
        transfer.updatedAt = LocalDateTime.now();
        PixTransfer saved = transfers.save(transfer);
        audit.record("PIX_REQUESTED", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(bill.amount) + " para " + supplier.name);
        return saved;
    }

    // ---- Paying a "copia e cola" code

    PixCodeView readCode(String code) {
        PixCode read = gateway.decodePixCode(cleanCode(code));
        return new PixCodeView(read.receiverName(), read.receiverDocument(), read.bank(), read.value(), read.valueFixed(), read.expiresAt(),
            read.description(), read.canBePaid(), read.canBePaid() ? null : cannotPay(read));
    }

    /**
     * The code is read again by Asaas (what it says now, not what the screen showed), its bill is recorded and approved
     * with the request kept, and only then Asaas pays it. A code already paid here, or on its way, is not paid again.
     */
    PayableView payCode(PayPixCodeRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cole o código Pix copia e cola.");
        }
        AppUser me = checkPassword(request.password(), null);
        String payload = cleanCode(request.code());
        PixCode read = gateway.decodePixCode(payload);
        if (!read.canBePaid()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, cannotPay(read));
        }
        BigDecimal chosen = read.valueFixed() ? read.value() : request.amount() != null ? request.amount() : read.value();
        if (chosen == null || chosen.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este código não traz o valor: informe quanto pagar.");
        }
        BigDecimal amount = chosen.setScale(2, java.math.RoundingMode.HALF_UP);
        PixTransfer requested = transaction.execute(status -> requestCode(request, read, payload, amount, me));
        Payable bill = payables.findById(requested.payableId).orElseThrow();
        GatewayTransfer answer;
        try {
            answer = gateway.payPixCode(payload, amount, trimTo("Pagamento: " + bill.description, 140));
        } catch (RuntimeException refused) {
            throw notSent(requested, bill, refused);
        }
        accepted(requested, bill, answer);
        return payableService.viewOf(payables.findById(bill.id).orElseThrow());
    }

    private PixTransfer requestCode(PayPixCodeRequest request, PixCode read, String payload, BigDecimal amount, AppUser me) {
        Settings row = lockedSettings();
        transfers.findByRequestedAtGreaterThanEqual(LocalDateTime.now(ZONE).minusDays(90)).stream()
            .filter(earlier -> PixTransfer.CODE.equals(earlier.kind) && payload.equals(earlier.qrPayload))
            .filter(earlier -> PixTransfer.DONE.equals(earlier.status) || PixTransfer.IN_FLIGHT.contains(earlier.status))
            .findFirst()
            .ifPresent(earlier -> {
                throw new ResponseStatusException(HttpStatus.CONFLICT, PixTransfer.DONE.equals(earlier.status)
                    ? "Este código já foi pago pelo Portal em " + earlier.requestedAt.toLocalDate().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")) + "."
                    : "Este código já está sendo pago pelo Portal.");
            });
        checkDailyLimit(row, amount);
        String receiver = read.receiverName() == null ? "o recebedor do código" : read.receiverName();
        Payable bill = payableService.recordForImmediatePix(new PayableRequest(null, request.description(), request.category(), amount,
            BudgetVotingService.today(), null, null, null, request.serviceOrderId(), null, request.exceptionReason(), request.notes(), null, null),
            me, "Pix copia e cola", receiver);
        PixTransfer transfer = new PixTransfer();
        transfer.kind = PixTransfer.CODE;
        transfer.ownBill = true;
        transfer.payableId = bill.id;
        transfer.amount = amount;
        transfer.pixKey = read.pixKey();
        transfer.qrPayload = payload;
        transfer.receiverName = read.receiverName() == null ? null : trimTo(read.receiverName(), 160);
        transfer.requestedBy = me.email;
        transfer.requestedAt = LocalDateTime.now(ZONE);
        transfer.updatedAt = LocalDateTime.now();
        PixTransfer saved = transfers.save(transfer);
        audit.record("PIX_REQUESTED", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(amount) + " - Pix copia e cola para " + receiver);
        return saved;
    }

    /** The code as pasted, without the line breaks a copy may bring. */
    private static String cleanCode(String code) {
        String payload = code == null ? "" : code.replaceAll("[\\r\\n\\t]", "").trim();
        if (payload.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cole o código Pix copia e cola.");
        }
        if (payload.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isso não parece um código Pix copia e cola.");
        }
        return payload;
    }

    private static String cannotPay(PixCode read) {
        return "O Asaas não aceita pagar este código" + (read.cannotBePaidReason() == null ? "." : ": " + read.cannotBePaidReason());
    }

    private static String notSentReason(PixTransfer transfer) {
        return PixTransfer.CODE.equals(transfer.kind) ? "O Pix copia e cola não saiu: " : "O Pix não saiu: ";
    }

    // ---- Paying a key typed at the moment, as in a bank app

    /** A holder looked up lately: paying right after does not ask the Pix directory again (lookups are counted there). */
    private record LookedUp(PixKeyOwner owner, long at) {
    }

    private static final long LOOKUP_MEMORY_MS = 30 * 60_000L;
    private static final long LOOKUP_WINDOW_MS = 10 * 60_000L;
    private static final int LOOKUPS_PER_WINDOW = 20;
    private static final long REPEAT_WINDOW_MINUTES = 2;
    private final Map<String, LookedUp> lookedUp = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> lookupsBy = new ConcurrentHashMap<>();

    PixKeyView readKey(ReadPixKeyRequest request) {
        AppUser me = currentUser.current();
        String type = keyType(request == null ? null : request.type());
        String key = PayableService.normalizedPixKey(requireKey(request == null ? null : request.key()), type);
        PixKeyOwner owner = lookup(me, type, key);
        Supplier supplier = payableService.supplierWithKey(key, type).orElse(null);
        return new PixKeyView(type, key, owner.name(), owner.document(), owner.bank(), supplier == null ? null : supplier.id, supplier == null ? null : supplier.name);
    }

    /**
     * The key's holder is the one shown before (looked up again if it was a while ago), the bill is recorded and approved
     * with the request kept (to the supplier with that key, or a new one when asked), and only then the Pix goes.
     */
    PayableView payKey(PayPixKeyRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe a chave Pix.");
        }
        AppUser me = checkPassword(request.password(), null);
        String type = keyType(request.type());
        String key = PayableService.normalizedPixKey(requireKey(request.key()), type);
        if (request.amount() == null || request.amount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe quanto pagar.");
        }
        BigDecimal amount = request.amount().setScale(2, java.math.RoundingMode.HALF_UP);
        PixKeyOwner owner = lookup(me, type, key);
        PixTransfer requested = transaction.execute(status -> requestKey(request, type, key, owner, amount, me));
        Payable bill = payables.findById(requested.payableId).orElseThrow();
        GatewayTransfer answer;
        try {
            answer = gateway.createPixTransfer(amount, key, type, trimTo("Pagamento: " + bill.description, 140), "PIX-" + requested.id);
        } catch (RuntimeException refused) {
            throw notSent(requested, bill, refused);
        }
        accepted(requested, bill, answer);
        return payableService.viewOf(payables.findById(bill.id).orElseThrow());
    }

    private PixTransfer requestKey(PayPixKeyRequest request, String type, String key, PixKeyOwner owner, BigDecimal amount, AppUser me) {
        Settings row = lockedSettings();
        // The same Pix sent twice in a row is a double click, not a second purchase.
        LocalDateTime recent = LocalDateTime.now(ZONE).minusMinutes(REPEAT_WINDOW_MINUTES);
        boolean repeated = transfers.findByRequestedAtGreaterThanEqual(recent).stream()
            .anyMatch(earlier -> PixTransfer.KEY.equals(earlier.kind) && key.equals(earlier.pixKey) && amount.compareTo(earlier.amount) == 0
                && (PixTransfer.DONE.equals(earlier.status) || PixTransfer.IN_FLIGHT.contains(earlier.status)));
        if (repeated) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Um Pix igual (mesma chave e mesmo valor) acabou de sair. Se for outro pagamento, espere "
                + REPEAT_WINDOW_MINUTES + " minutos e mande de novo.");
        }
        checkDailyLimit(row, amount);
        Supplier supplier = payableService.supplierWithKey(key, type).orElse(null);
        if (supplier == null && Boolean.TRUE.equals(request.saveSupplier())) {
            String name = request.supplierName() == null || request.supplierName().isBlank() ? owner.name() : request.supplierName().trim();
            supplier = payableService.saveSupplier(null, new SupplierRequest(trimTo(name, 160), null, key, type, null, null, null));
        }
        String receiver = supplier != null ? supplier.name : owner.name();
        Payable bill = payableService.recordForImmediatePix(new PayableRequest(supplier == null ? null : supplier.id, request.description(), request.category(),
            amount, BudgetVotingService.today(), null, null, null, request.serviceOrderId(), null, request.exceptionReason(), request.notes(), null, null),
            me, "Pix para chave " + keyLabel(type), receiver);
        PixTransfer transfer = new PixTransfer();
        transfer.kind = PixTransfer.KEY;
        transfer.ownBill = true;
        transfer.payableId = bill.id;
        transfer.amount = amount;
        transfer.pixKey = key;
        transfer.pixKeyType = type;
        transfer.receiverName = trimTo(owner.name(), 160);
        transfer.requestedBy = me.email;
        transfer.requestedAt = LocalDateTime.now(ZONE);
        transfer.updatedAt = LocalDateTime.now();
        PixTransfer saved = transfers.save(transfer);
        audit.record("PIX_REQUESTED", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(amount) + " para " + owner.name()
            + " (chave " + keyLabel(type) + ")");
        return saved;
    }

    /** Who holds the key: remembered for a while, otherwise asked to the Pix directory, at most so many times per person. */
    private PixKeyOwner lookup(AppUser me, String type, String key) {
        long now = System.currentTimeMillis();
        String memo = TenantContext.current() + ":" + type + ":" + key;
        LookedUp known = lookedUp.get(memo);
        if (known != null && now - known.at() < LOOKUP_MEMORY_MS) {
            return known.owner();
        }
        throttleLookups(TenantContext.current() + ":" + me.email, now);
        PixKeyOwner owner;
        try {
            owner = gateway.lookupPixKey(key, type);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFound(), ex);
            }
            throw ex;
        }
        if (owner.name() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFound());
        }
        lookedUp.values().removeIf(entry -> now - entry.at() >= LOOKUP_MEMORY_MS);
        lookedUp.put(memo, new LookedUp(owner, now));
        return owner;
    }

    /** Asking the Pix directory for many keys in a row looks like someone sweeping keys: a few minutes' pause. */
    private void throttleLookups(String who, long now) {
        Deque<Long> times = lookupsBy.computeIfAbsent(who, ignored -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && now - times.peekFirst() >= LOOKUP_WINDOW_MS) {
                times.pollFirst();
            }
            if (times.size() >= LOOKUPS_PER_WINDOW) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Muitas consultas de chave em pouco tempo. Espere alguns minutos e tente de novo.");
            }
            times.addLast(now);
        }
    }

    private static String notFound() {
        return "Não achei essa chave Pix. Confira a chave e o tipo (CPF, CNPJ, celular, e-mail ou aleatória).";
    }

    private static String keyType(String type) {
        String value = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        if (!PayableService.PIX_KEY_TYPES.contains(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Diga o tipo da chave Pix: CPF, CNPJ, celular, e-mail ou aleatória.");
        }
        return value;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe a chave Pix.");
        }
        return key.trim();
    }

    private static String keyLabel(String type) {
        return switch (type) {
            case "PHONE" -> "celular";
            case "EMAIL" -> "e-mail";
            case "EVP" -> "aleatória";
            default -> type;
        };
    }

    /**
     * Asaas's refusals that need someone to act get a sentence saying what to do; the others go as Asaas wrote them.
     * The permission one comes from accounts where withdrawals through the API were never released.
     */
    static String explain(String reason) {
        String text = reason.toLowerCase(Locale.ROOT);
        if (text.contains("permissão para realizar operações de saque") || text.contains("saque via api")) {
            return "O Asaas ainda não liberou Pix pela API nesta conta. Peça ao suporte do Asaas para liberar transferências (saques) via API "
                + "na chave usada pelo Portal; depois é só pagar de novo.";
        }
        if (text.contains("chave informada não foi encontrada")) {
            return "O Asaas não encontrou a chave Pix do fornecedor. Confira a chave e o tipo no cadastro do fornecedor.";
        }
        return reason;
    }

    // ---- Following Asaas

    /** A transfer notice (TRANSFER_DONE, TRANSFER_FAILED...): ours is updated; anybody else's is not our business. */
    boolean applyNotice(JsonNode transfer) {
        String id = transfer.path("id").asText(null);
        if (id == null) {
            return false;
        }
        return transfers.findByGatewayTransferId(id).map(found -> apply(found, GatewayTransfer.from(transfer))).orElse(false);
    }

    /** Every few minutes, for each condominium: asks Asaas about the transfers still on their way. */
    int refreshInFlight() {
        int changed = 0;
        for (PixTransfer pending : transfers.findByStatusIn(PixTransfer.IN_FLIGHT)) {
            if (pending.gatewayTransferId == null) {
                continue; // the call to Asaas is still going, or never reached it: nothing to ask yet
            }
            try {
                GatewayTransfer answer = PixTransfer.CODE.equals(pending.kind)
                    ? gateway.getPixTransaction(pending.gatewayTransferId)
                    : gateway.getTransfer(pending.gatewayTransferId);
                Boolean moved = transaction.execute(status -> transfers.findById(pending.id).map(found -> apply(found, answer)).orElse(false));
                if (Boolean.TRUE.equals(moved)) {
                    changed++;
                }
            } catch (RuntimeException unavailable) {
                log.warn("Nao consegui consultar a transferencia {} no Asaas: {}", pending.gatewayTransferId, unavailable.getMessage());
            }
        }
        return changed;
    }

    /**
     * Follows what Asaas says. Done: the bill is paid, with the receipt. Failed or cancelled: a supplier's bill stays open;
     * a code's bill is cancelled (the code is spent: it is paid again with a new one, or another way).
     */
    private boolean apply(PixTransfer transfer, GatewayTransfer answer) {
        String status = answer.status() == null ? "" : answer.status().toUpperCase(Locale.ROOT);
        if (!Set.of(PixTransfer.PENDING, PixTransfer.BANK_PROCESSING, PixTransfer.DONE, PixTransfer.FAILED, PixTransfer.CANCELLED).contains(status)) {
            return false;
        }
        if (FINAL.contains(transfer.status)) {
            // Settled already; a late notice may still bring the receipt link.
            if (PixTransfer.DONE.equals(transfer.status) && transfer.receiptUrl == null && answer.receiptUrl() != null) {
                transfer.receiptUrl = answer.receiptUrl();
                transfers.save(transfer);
            }
            return false;
        }
        boolean awaiting = answer.awaitingAuthorization() && PixTransfer.IN_FLIGHT.contains(status);
        boolean moved = !status.equals(transfer.status) || awaiting != transfer.awaitingAuthorization;
        transfer.status = status;
        transfer.awaitingAuthorization = awaiting;
        transfer.fee = answer.fee() != null ? answer.fee() : transfer.fee;
        transfer.receiptUrl = answer.receiptUrl() != null ? answer.receiptUrl() : transfer.receiptUrl;
        transfer.endToEndId = answer.endToEndId() != null ? answer.endToEndId() : transfer.endToEndId;
        transfer.failReason = answer.failReason() == null ? null : explain(answer.failReason());
        transfer.updatedAt = LocalDateTime.now();
        transfers.save(transfer);
        Payable bill = payables.findById(transfer.payableId).orElse(null);
        if (bill == null) {
            return moved;
        }
        if (PixTransfer.DONE.equals(status)) {
            transfer.confirmedAt = LocalDateTime.now();
            transfers.save(transfer);
            settle(transfer, bill, answer.effectiveDate());
            notify(transfer, "Pix enviado", bill.description + " - " + AuditService.money(transfer.amount) + ": pago, com comprovante.");
        } else if (PixTransfer.FAILED.equals(status) || PixTransfer.CANCELLED.equals(status)) {
            String why = transfer.failReason == null ? (PixTransfer.CANCELLED.equals(status) ? "cancelado no Asaas" : "o Asaas não informou o motivo") : transfer.failReason;
            audit.record(PixTransfer.CANCELLED.equals(status) ? "PIX_CANCELLED" : "PIX_FAILED", "PAYABLE", bill.id,
                bill.description + " - " + AuditService.money(transfer.amount) + " - " + why);
            if (transfer.ownBill) {
                payableService.cancelUnpaid(bill, notSentReason(transfer) + why, transfer.requestedBy);
                notify(transfer, "O Pix não saiu", bill.description + ": " + why + ". A conta foi cancelada: "
                    + (PixTransfer.CODE.equals(transfer.kind) ? "pague com um código novo ou por fora." : "faça o Pix de novo ou pague por fora."));
            } else {
                notify(transfer, "O Pix não saiu", bill.description + ": " + why + ". A conta continua a pagar.");
            }
        }
        return moved;
    }

    /** The money left: the bill becomes an expense with Asaas's receipt, exactly as a payment registered by hand. */
    private void settle(PixTransfer transfer, Payable bill, LocalDate effectiveDate) {
        if (!Payable.APPROVED.equals(bill.status)) {
            audit.record("PIX_DONE_UNSETTLED", "PAYABLE", bill.id, "Pix confirmado, mas a conta estava " + bill.status + ": confira à mão");
            return;
        }
        Long receipt = null;
        if (transfer.receiptUrl != null) {
            PortalDocument document = new PortalDocument();
            document.name = trimTo("Comprovante Pix - " + bill.description, 200);
            document.type = "COMPROVANTE";
            document.url = transfer.receiptUrl;
            document.relatedType = "PAYABLE";
            document.relatedId = bill.id;
            document.description = "Comprovante do Pix enviado pelo Asaas.";
            document.uploadedBy = users.findByEmailIgnoreCase(transfer.requestedBy).map(user -> user.id).orElse(null);
            receipt = documents.save(document).id;
        }
        LocalDate paidAt = effectiveDate == null || effectiveDate.isAfter(today()) ? today() : effectiveDate;
        try {
            payableService.settle(bill, paidAt, "PIX", receipt, null, transfer.requestedBy, transfer.receiverName);
            audit.record("PIX_DONE", "PAYABLE", bill.id, bill.description + " - " + AuditService.money(transfer.amount) + " - baixa automática");
        } catch (RuntimeException refused) {
            // The money already left: the transfer stays DONE and the bill is left for a person to register.
            audit.record("PIX_DONE_UNSETTLED", "PAYABLE", bill.id, "Pix confirmado, mas a baixa automática falhou: " + refused.getMessage());
            log.warn("Pix {} confirmado, mas a baixa da conta {} falhou: {}", transfer.gatewayTransferId, bill.id, refused.getMessage());
        }
    }

    private void notify(PixTransfer transfer, String title, String body) {
        users.findByEmailIgnoreCase(transfer.requestedBy)
            .ifPresent(user -> push.notifyUser(user.id, title, body, Map.of("type", "PAYABLE", "id", transfer.payableId)));
    }

    // ---- Asaas asking before a withdrawal

    PixValidationView validationView() {
        return validations.findByCondominiumId(TenantContext.current())
            .map(found -> new PixValidationView(true, validationUrl(found), secrets.open(found.tokenSealed), found.lastCheckAt))
            .orElseGet(() -> new PixValidationView(false, null, null, null));
    }

    /** A new address and token (replacing any previous one): the administration types both in Asaas. */
    PixValidationView createValidation(String adminEmail) {
        secrets.requireReady();
        long condominium = TenantContext.current();
        PixValidation validation = transaction.execute(status -> {
            validations.findByCondominiumId(condominium).ifPresent(previous -> {
                validations.delete(previous);
                validations.flush();
            });
            PixValidation fresh = new PixValidation();
            fresh.condominiumId = condominium;
            fresh.routeKey = randomText(32);
            fresh.tokenSealed = secrets.seal(randomText(40));
            fresh.createdBy = adminEmail;
            return validations.save(fresh);
        });
        audit.record("PIX_VALIDATION_CREATED", "GATEWAY", validation.id, "Novo endereço de validação de saque para o Asaas");
        return validationView();
    }

    /**
     * Approves only a Pix this server requested and is still waiting for (a transfer to a key, or a paid code), of the
     * same value (and, before Asaas's id is known here, to the same key). Anything else is refused, so a leaked API key
     * alone cannot take money out.
     */
    Map<String, String> validate(String routeKey, String token, JsonNode payload) {
        PixValidation validation = validations.findByRouteKey(routeKey)
            .filter(found -> token != null && MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), secrets.open(found.tokenSealed).getBytes(StandardCharsets.UTF_8)))
            .orElseThrow(InvalidWebhookTokenException::new);
        validation.lastCheckAt = LocalDateTime.now();
        validations.save(validation);
        return TenantContext.callAs(validation.condominiumId, () -> transaction.execute(status -> decide(payload)));
    }

    private Map<String, String> decide(JsonNode payload) {
        String type = payload.path("type").asText("");
        // A transfer to a key, or a paid "copia e cola" code: the two kinds of Pix this server asks for.
        String kind = "TRANSFER".equals(type) ? PixTransfer.KEY : "PIX_QR_CODE".equals(type) ? PixTransfer.CODE : null;
        JsonNode operation = payload.path(PixTransfer.CODE.equals(kind) ? "pixQrCode" : "transfer");
        if (kind == null || operation.isMissingNode()) {
            audit.record("PIX_VALIDATION_REFUSED", "GATEWAY", null, "Operação " + type + " recusada: o Portal da Vila só pede Pix");
            return refuse("O Portal da Vila só libera os Pix que ele mesmo pediu.");
        }
        String what = PixTransfer.CODE.equals(kind) ? "Pagamento de código" : "Transferência";
        String id = operation.path("id").asText(null);
        BigDecimal value = operation.hasNonNull("value") ? operation.get("value").decimalValue() : null;
        String key = PixTransfer.CODE.equals(kind)
            ? operation.path("externalAccount").path("addressKey").asText(null)
            : operation.path("bankAccount").path("pixAddressKey").asText(null);
        PixTransfer ours = id == null ? null : transfers.findByGatewayTransferId(id).filter(found -> kind.equals(found.kind)).orElse(null);
        if (ours == null) {
            // Asaas may ask before its answer to the request got back here: the request waiting, same value, same key
            // (a code may not tell its key: then the same value, asked within minutes, is the request waiting).
            LocalDateTime recent = LocalDateTime.now(ZONE).minusMinutes(15);
            ours = transfers.findByStatusIn(Set.of(PixTransfer.REQUESTED)).stream()
                .filter(candidate -> kind.equals(candidate.kind) && candidate.gatewayTransferId == null && !candidate.requestedAt.isBefore(recent))
                .filter(candidate -> value != null && candidate.amount.compareTo(value) == 0)
                .filter(candidate -> PixTransfer.CODE.equals(kind) && (candidate.pixKey == null || key == null)
                    || key != null && candidate.pixKey != null && sameKey(candidate.pixKey, key))
                .findFirst().orElse(null);
            if (ours != null) {
                ours.gatewayTransferId = id;
                transfers.save(ours);
            }
        }
        if (ours == null || !PixTransfer.IN_FLIGHT.contains(ours.status) || value == null || ours.amount.compareTo(value) != 0) {
            audit.record("PIX_VALIDATION_REFUSED", "GATEWAY", null, what + " " + id + " de " + AuditService.money(value) + " recusado: não foi pedido pelo Portal da Vila");
            return refuse("Este Pix não foi pedido pelo Portal da Vila.");
        }
        audit.record("PIX_VALIDATION_APPROVED", "PAYABLE", ours.payableId, "Asaas conferiu: " + what.toLowerCase(Locale.ROOT) + " " + id + " de " + AuditService.money(value));
        return Map.of("status", "APPROVED");
    }

    private static Map<String, String> refuse(String reason) {
        return Map.of("status", "REFUSED", "refuseReason", reason);
    }

    /** The same Pix key however it is written: digits for documents and phones, lower case otherwise. */
    private static boolean sameKey(String ours, String theirs) {
        String a = ours.trim().toLowerCase(Locale.ROOT);
        String b = theirs.trim().toLowerCase(Locale.ROOT);
        if (a.equals(b)) {
            return true;
        }
        String digitsA = a.replaceAll("\\D", "");
        String digitsB = b.replaceAll("\\D", "");
        return !digitsA.isEmpty() && (digitsA.equals(digitsB) || digitsB.endsWith(digitsA) || digitsA.endsWith(digitsB)) && !a.contains("@");
    }

    private String validationUrl(PixValidation validation) {
        return publicApiUrl + "/api/webhooks/asaas/saque/" + validation.routeKey;
    }

    private String randomText(int length) {
        StringBuilder text = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            text.append(TOKEN_ALPHABET.charAt(random.nextInt(TOKEN_ALPHABET.length())));
        }
        return text.toString();
    }

    private static String trimTo(String text, int max) {
        return text.length() > max ? text.substring(0, max).trim() : text;
    }

    private static LocalDate today() {
        return LocalDate.now(ZONE);
    }
}

/** Asks Asaas about the Pix still on their way, in case a notice did not arrive. */
@Component
class PixTransferSchedule {
    private static final Logger log = LoggerFactory.getLogger(PixTransferSchedule.class);

    private final PixTransferService pix;
    private final CondominiumRepository condominiums;
    private final GatewayCredentials credentials;

    PixTransferSchedule(PixTransferService pix, CondominiumRepository condominiums, GatewayCredentials credentials) {
        this.pix = pix;
        this.condominiums = condominiums;
        this.credentials = credentials;
    }

    @Scheduled(fixedDelay = 120_000, initialDelay = 60_000)
    void refresh() {
        for (Condominium condominium : condominiums.findByStatusOrderByIdAsc(Condominium.ACTIVE)) {
            if (!credentials.connected(condominium.id)) {
                continue;
            }
            try {
                int changed = TenantContext.callAs(condominium.id, pix::refreshInFlight);
                if (changed > 0) {
                    log.info("{} Pix atualizados pelo Asaas no condominio {}", changed, condominium.id);
                }
            } catch (RuntimeException e) {
                log.warn("Falha ao consultar os Pix do condominio {}: {}", condominium.id, e.getMessage());
            }
        }
    }
}
