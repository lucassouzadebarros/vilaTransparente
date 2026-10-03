package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Removes payments from the portal and remembers them, so neither the history sync nor a webhook brings
 * them back. Meant for payments that should not count (for example test payments in the gateway account).
 * A dry run executes the same code and rolls back.
 */
@Service
class PaymentExclusionService {
    private static final String GATEWAY = "ASAAS";

    private final PixChargeRepository pixCharges;
    private final ContributionRepository contributions;
    private final DirectReceiptRepository directReceipts;
    private final ExcludedGatewayPaymentRepository excluded;
    private final FinancialService financialService;
    private final DashboardEventService dashboardEvents;
    private final TransactionTemplate transaction;

    PaymentExclusionService(
        PixChargeRepository pixCharges,
        ContributionRepository contributions,
        DirectReceiptRepository directReceipts,
        ExcludedGatewayPaymentRepository excluded,
        FinancialService financialService,
        DashboardEventService dashboardEvents,
        PlatformTransactionManager transactionManager
    ) {
        this.pixCharges = pixCharges;
        this.contributions = contributions;
        this.directReceipts = directReceipts;
        this.excluded = excluded;
        this.financialService = financialService;
        this.dashboardEvents = dashboardEvents;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    ExcludePaymentsReport exclude(List<String> paymentIds, String reason, boolean apply) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (String id : paymentIds) {
            if (id != null && !id.isBlank()) {
                ids.add(id.trim());
            }
        }
        ExcludePaymentsReport report = transaction.execute(status -> {
            ExcludePaymentsReport result = run(ids, reason, apply);
            if (!apply) {
                status.setRollbackOnly();
            }
            return result;
        });
        if (apply && report != null) {
            dashboardEvents.publishDashboardChanged();
        }
        return report;
    }

    private ExcludePaymentsReport run(LinkedHashSet<String> ids, String reason, boolean apply) {
        BigDecimal before = balance();
        List<ExcludedPaymentItem> items = new ArrayList<>();
        for (String id : ids) {
            items.add(excludeOne(id, reason));
        }
        return new ExcludePaymentsReport(apply, items, before, balance());
    }

    private ExcludedPaymentItem excludeOne(String paymentId, String reason) {
        boolean alreadyExcluded = excluded.existsByGatewayAndGatewayPaymentId(GATEWAY, paymentId);
        String action = alreadyExcluded ? "ALREADY_EXCLUDED" : "EXCLUDED_ONLY";
        BigDecimal amount = null;
        String note = null;

        PixCharge charge = pixCharges.findByGatewayAndGatewayPaymentId(GATEWAY, paymentId).orElse(null);
        if (charge != null) {
            amount = charge.value;
            action = "REMOVED_CHARGE";
            Contribution contribution = contributions.findById(charge.contributionId).orElse(null);
            if (contribution != null) {
                // contributions.pix_charge_id and pix_charges.contribution_id reference each other
                contribution.pixChargeId = null;
                contributions.saveAndFlush(contribution);
            }
            pixCharges.delete(charge);
            pixCharges.flush();
            if (contribution != null) {
                boolean otherCharge = pixCharges.findByContributionId(contribution.id).isPresent();
                boolean paidByThisCharge = "PAID".equals(contribution.status) && !contribution.manualPayment;
                if (!otherCharge && paidByThisCharge) {
                    contributions.delete(contribution);
                    note = "Contribuição " + contribution.referenceMonth + " removida junto.";
                } else {
                    note = "Contribuição " + contribution.referenceMonth + " mantida (pagamento manual, outra cobrança ou não paga).";
                }
            }
        }

        DirectReceipt receipt = directReceipts.findByGatewayAndGatewayPaymentId(GATEWAY, paymentId).orElse(null);
        if (receipt != null) {
            if (amount == null) {
                amount = receipt.amount;
                action = "REMOVED_RECEIPT";
            }
            directReceipts.delete(receipt);
        }

        if (!alreadyExcluded) {
            ExcludedGatewayPayment record = new ExcludedGatewayPayment();
            record.gateway = GATEWAY;
            record.gatewayPaymentId = paymentId;
            record.reason = reason == null || reason.isBlank() ? null : reason.trim();
            excluded.save(record);
        }
        return new ExcludedPaymentItem(paymentId, action, amount, note);
    }

    private BigDecimal balance() {
        return financialService.dashboard(YearMonth.now().toString()).balance();
    }
}
