package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Pulls the Pix history straight from the Asaas API and brings the portal database in line with it.
 * Used after downtime, when webhooks were lost (Asaas only keeps undelivered events for 14 days).
 *
 * The whole database phase runs in one transaction. A dry run executes exactly the same code and then rolls
 * back, so the report of a dry run is what an apply run will do.
 */
@Service
class AsaasSyncService {
    private static final String GATEWAY = "ASAAS";
    private static final int MAX_RANGE_MONTHS = 24;
    private static final int MAX_LISTED_ITEMS = 300;
    private static final Set<String> CREDIT_TYPES = Set.of("PAYMENT_RECEIVED", "PIX_TRANSACTION_CREDIT");

    private final PixGatewayClient gatewayClient;
    private final WebhookService webhookService;
    private final FinancialService financialService;
    private final PixChargeRepository pixCharges;
    private final ContributionRepository contributions;
    private final DirectReceiptRepository directReceipts;
    private final ExcludedGatewayPaymentRepository excludedPayments;
    private final DashboardEventService dashboardEvents;
    private final TransactionTemplate transaction;
    private final ReentrantLock running = new ReentrantLock();

    AsaasSyncService(
        PixGatewayClient gatewayClient,
        WebhookService webhookService,
        FinancialService financialService,
        PixChargeRepository pixCharges,
        ContributionRepository contributions,
        DirectReceiptRepository directReceipts,
        ExcludedGatewayPaymentRepository excludedPayments,
        DashboardEventService dashboardEvents,
        PlatformTransactionManager transactionManager
    ) {
        this.gatewayClient = gatewayClient;
        this.webhookService = webhookService;
        this.financialService = financialService;
        this.pixCharges = pixCharges;
        this.contributions = contributions;
        this.directReceipts = directReceipts;
        this.excludedPayments = excludedPayments;
        this.dashboardEvents = dashboardEvents;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    AsaasSyncReport sync(LocalDate requestedFrom, LocalDate requestedTo, boolean apply) {
        LocalDate to = requestedTo == null ? LocalDate.now() : requestedTo;
        LocalDate from = requestedFrom == null ? to.minusMonths(12).withDayOfMonth(1) : requestedFrom;
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A data inicial não pode ser maior que a final.");
        }
        if (from.plusMonths(MAX_RANGE_MONTHS).isBefore(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um período de no máximo " + MAX_RANGE_MONTHS + " meses.");
        }
        if (!running.tryLock()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe uma sincronização com o Asaas em andamento.");
        }
        try {
            List<String> warnings = new ArrayList<>();
            List<JsonNode> payments = fetchPayments(from, to);
            BigDecimal asaasBalance = fetchBalance(warnings);
            List<GatewayTransaction> statement = fetchStatement(from, to, warnings);

            AsaasSyncReport report = transaction.execute(status -> {
                AsaasSyncReport result = reconcile(from, to, apply, payments, asaasBalance, statement, warnings);
                if (!apply) {
                    status.setRollbackOnly();
                }
                return result;
            });
            if (apply && report != null && (report.chargesCreated() + report.chargesUpdated()
                + report.directReceiptsCreated() + report.directReceiptsUpdated()) > 0) {
                dashboardEvents.publishDashboardChanged();
            }
            return report;
        } finally {
            running.unlock();
        }
    }

    private AsaasSyncReport reconcile(
        LocalDate from,
        LocalDate to,
        boolean apply,
        List<JsonNode> payments,
        BigDecimal asaasBalance,
        List<GatewayTransaction> statement,
        List<String> warnings
    ) {
        BigDecimal balanceBefore = localBalance();
        int chargesCreated = 0;
        int chargesUpdated = 0;
        int receiptsCreated = 0;
        int receiptsUpdated = 0;
        int unchanged = 0;
        int ignored = 0;
        int conflicts = 0;
        int skipped = 0;
        int failed = 0;
        List<AsaasSyncItem> items = new ArrayList<>();

        for (JsonNode payment : payments) {
            String id = payment.path("id").asText(null);
            String remoteStatus = payment.path("status").asText("");
            String eventType = eventTypeFor(payment);
            if (id == null || id.isBlank()) {
                continue;
            }
            if (eventType == null) {
                skipped++;
                addItem(items, payment, "SKIPPED", "Status " + remoteStatus + " não é tratado automaticamente; revisar no Asaas.");
                continue;
            }
            PixCharge existing = pixCharges.findByGatewayAndGatewayPaymentId(GATEWAY, id).orElse(null);
            if (existing != null && "PAID".equals(existing.status)
                && !"PAYMENT_RECEIVED".equals(eventType) && !"PAYMENT_REFUNDED".equals(eventType)) {
                conflicts++;
                addItem(items, payment, "CONFLICT", "Local está PAGO mas o Asaas informa " + remoteStatus + "; nada foi alterado.");
                continue;
            }

            String before = stateOf(id);
            try {
                webhookService.applySyncedPayment(eventType, payment);
            } catch (RuntimeException ex) {
                failed++;
                addItem(items, payment, "FAILED", String.valueOf(ex.getMessage()));
                continue;
            }
            String after = stateOf(id);

            if (before.equals(after)) {
                if ("NONE".equals(after)) {
                    ignored++;
                } else {
                    unchanged++;
                }
            } else if (after.startsWith("CHARGE") && !before.startsWith("CHARGE")) {
                chargesCreated++;
                addItem(items, payment, "CHARGE_CREATED", "Cobrança que o portal não conhecia foi registrada.");
            } else if (after.startsWith("CHARGE")) {
                chargesUpdated++;
                addItem(items, payment, "CHARGE_UPDATED", before + " -> " + after);
            } else if (before.equals("NONE")) {
                receiptsCreated++;
                addItem(items, payment, "RECEIPT_CREATED", "Recebimento direto registrado.");
            } else {
                receiptsUpdated++;
                addItem(items, payment, "RECEIPT_UPDATED", before + " -> " + after);
            }
        }

        BigDecimal balanceAfter = localBalance();
        BigDecimal difference = asaasBalance == null ? null : asaasBalance.subtract(balanceAfter);

        BigDecimal credits = BigDecimal.ZERO;
        BigDecimal fees = BigDecimal.ZERO;
        BigDecimal otherDebits = BigDecimal.ZERO;
        Map<String, int[]> counts = new LinkedHashMap<>();
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        List<AsaasStatementEntry> debits = new ArrayList<>();
        List<AsaasStatementEntry> creditsWithoutRecord = new ArrayList<>();
        for (GatewayTransaction entry : statement) {
            counts.computeIfAbsent(entry.type(), ignoredKey -> new int[1])[0]++;
            totals.merge(entry.type(), entry.value(), BigDecimal::add);
            if (entry.value().signum() < 0) {
                if (entry.type().contains("FEE")) {
                    fees = fees.add(entry.value());
                } else {
                    otherDebits = otherDebits.add(entry.value());
                }
                debits.add(toEntry(entry));
            } else if (entry.value().signum() > 0) {
                credits = credits.add(entry.value());
                if (CREDIT_TYPES.contains(entry.type()) && !hasLocalRecord(entry.paymentId())) {
                    creditsWithoutRecord.add(toEntry(entry));
                }
            }
        }
        List<AsaasStatementTotal> byType = totals.entrySet().stream()
            .map(e -> new AsaasStatementTotal(e.getKey(), counts.get(e.getKey())[0], e.getValue()))
            .sorted(Comparator.comparing(AsaasStatementTotal::total))
            .toList();

        if (!creditsWithoutRecord.isEmpty()) {
            warnings.add(creditsWithoutRecord.size() + " crédito(s) do extrato do Asaas continuam sem registro no portal; "
                + "provavelmente Pix recebido direto na chave. Veja creditsWithoutLocalRecord.");
        }
        if (failed > 0) {
            warnings.add(failed + " pagamento(s) falharam; veja os itens com action FAILED.");
        }
        if (items.size() >= MAX_LISTED_ITEMS) {
            warnings.add("A lista de itens foi limitada a " + MAX_LISTED_ITEMS + " linhas; os contadores são completos.");
        }

        return new AsaasSyncReport(
            apply, from, to, payments.size(),
            chargesCreated, chargesUpdated, receiptsCreated, receiptsUpdated,
            unchanged, ignored, conflicts, skipped, failed,
            balanceBefore, balanceAfter, asaasBalance, difference,
            credits, fees, otherDebits,
            items, byType,
            debits.stream().limit(MAX_LISTED_ITEMS).toList(),
            creditsWithoutRecord.stream().limit(MAX_LISTED_ITEMS).toList(),
            warnings
        );
    }

    private List<JsonNode> fetchPayments(LocalDate from, LocalDate to) {
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        for (JsonNode payment : gatewayClient.listPixPaymentsCreatedBetween(from, to)) {
            byId.putIfAbsent(payment.path("id").asText(), payment);
        }
        for (JsonNode payment : gatewayClient.listPixPaymentsReceivedBetween(from, to)) {
            byId.putIfAbsent(payment.path("id").asText(), payment);
        }
        return byId.values().stream()
            .sorted(Comparator.comparing((JsonNode p) -> p.path("dateCreated").asText(""))
                .thenComparing(p -> p.path("id").asText("")))
            .toList();
    }

    private BigDecimal fetchBalance(List<String> warnings) {
        try {
            return gatewayClient.getBalance();
        } catch (ResponseStatusException ex) {
            warnings.add("Não foi possível ler o saldo do Asaas: " + ex.getReason());
            return null;
        }
    }

    private List<GatewayTransaction> fetchStatement(LocalDate from, LocalDate to, List<String> warnings) {
        try {
            List<GatewayTransaction> statement = gatewayClient.listFinancialTransactions(from, to);
            return statement == null ? List.of() : statement;
        } catch (ResponseStatusException ex) {
            warnings.add("Não foi possível ler o extrato do Asaas: " + ex.getReason());
            return List.of();
        }
    }

    /** Maps the Asaas status to the webhook event with the same effect; null means "do not touch automatically". */
    private String eventTypeFor(JsonNode payment) {
        if (payment.path("deleted").asBoolean(false)) {
            return "PAYMENT_DELETED";
        }
        return switch (payment.path("status").asText("")) {
            case "RECEIVED", "CONFIRMED" -> "PAYMENT_RECEIVED";
            case "OVERDUE" -> "PAYMENT_OVERDUE";
            case "REFUNDED" -> "PAYMENT_REFUNDED";
            case "PENDING" -> "PAYMENT_UPDATED";
            default -> null;
        };
    }

    private BigDecimal localBalance() {
        return financialService.dashboard(YearMonth.now().toString()).balance();
    }

    private String stateOf(String paymentId) {
        PixCharge charge = pixCharges.findByGatewayAndGatewayPaymentId(GATEWAY, paymentId).orElse(null);
        if (charge != null) {
            Contribution contribution = contributions.findById(charge.contributionId).orElse(null);
            return "CHARGE|" + charge.status + "|" + plain(charge.value)
                + "|" + (contribution == null ? "-" : contribution.status + "|" + plain(contribution.paidAmount));
        }
        return directReceipts.findByGatewayAndGatewayPaymentId(GATEWAY, paymentId)
            .map(receipt -> "RECEIPT|" + receipt.status + "|" + plain(receipt.amount))
            .orElse("NONE");
    }

    /** A credit is accounted for when the portal has it, or when the admin deliberately excluded it. */
    private boolean hasLocalRecord(String paymentId) {
        return paymentId != null && !paymentId.isBlank()
            && (excludedPayments.existsByGatewayAndGatewayPaymentId(GATEWAY, paymentId) || !"NONE".equals(stateOf(paymentId)));
    }

    private void addItem(List<AsaasSyncItem> items, JsonNode payment, String action, String note) {
        if (items.size() >= MAX_LISTED_ITEMS) {
            return;
        }
        String dateText = payment.path("paymentDate").asText(payment.path("dueDate").asText(""));
        LocalDate date = null;
        if (dateText.length() >= 10) {
            try {
                date = LocalDate.parse(dateText.substring(0, 10));
            } catch (RuntimeException ignored) {
                // leave the date empty
            }
        }
        items.add(new AsaasSyncItem(
            payment.path("id").asText(),
            action,
            payment.path("status").asText(""),
            payment.hasNonNull("value") ? payment.get("value").decimalValue() : null,
            date,
            payment.path("description").asText(""),
            note
        ));
    }

    private AsaasStatementEntry toEntry(GatewayTransaction entry) {
        return new AsaasStatementEntry(entry.date(), entry.type(), entry.value(), entry.description(), entry.paymentId());
    }

    private String plain(BigDecimal value) {
        return value == null ? "-" : value.stripTrailingZeros().toPlainString();
    }
}
