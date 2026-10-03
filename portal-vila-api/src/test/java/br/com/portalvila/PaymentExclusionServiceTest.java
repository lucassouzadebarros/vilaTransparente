package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
class PaymentExclusionServiceTest {
    @Autowired
    PaymentExclusionService exclusionService;

    @Autowired
    AsaasSyncService syncService;

    @Autowired
    WebhookService webhookService;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    HouseRepository houses;

    @Autowired
    ResidentRepository residents;

    @Autowired
    ContributionRepository contributions;

    @Autowired
    PixChargeRepository pixCharges;

    @Autowired
    DirectReceiptRepository directReceipts;

    @Autowired
    ExcludedGatewayPaymentRepository excluded;

    @Autowired
    WebhookEventRepository webhookEvents;

    @Autowired
    ExpenseRepository expenses;

    @Autowired
    SettingsRepository settingsRepository;

    @MockBean
    PixGatewayClient gatewayClient;

    @BeforeEach
    void cleanDatabase() {
        excluded.deleteAll();
        webhookEvents.deleteAll();
        directReceipts.deleteAll();
        pixCharges.deleteAll();
        contributions.deleteAll();
        expenses.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        settingsRepository.deleteAll();
    }

    @Test
    void excludesPaymentsKeepsOthersAndStaysExcludedAfterSyncAndWebhook() throws Exception {
        House house = houses.save(new House(5, "Casa 05"));
        Resident resident = new Resident(house.id, "Lucas", "lucas-exclude@test.dev", null, "***.111.***-**");
        resident.gatewayCustomerId = "cus_5";
        resident = residents.save(resident);

        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident.id;
        contribution.referenceMonth = "2026-06";
        contribution.amount = BigDecimal.valueOf(100);
        contribution.paidAmount = BigDecimal.valueOf(100);
        contribution.status = "PAID";
        contribution.paymentDate = LocalDateTime.of(2026, 6, 4, 0, 0);
        contribution = contributions.save(contribution);

        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gatewayPaymentId = "pay_charge";
        charge.externalReference = "VILA-2026-06-HOUSE-05";
        charge.value = BigDecimal.valueOf(100);
        charge.dueDate = LocalDate.of(2026, 6, 4);
        charge.status = "PAID";
        charge = pixCharges.save(charge);
        contribution.pixChargeId = charge.id;
        contributions.save(contribution);

        saveReceipt("pay_receipt", "20", LocalDateTime.of(2026, 6, 4, 0, 0));
        saveReceipt("pay_keep", "80", LocalDateTime.of(2026, 7, 5, 0, 0));

        List<String> ids = List.of("pay_charge", "pay_receipt", "pay_unknown");

        ExcludePaymentsReport dryRun = exclusionService.exclude(ids, "teste de junho", false);

        assertThat(dryRun.applied()).isFalse();
        assertThat(dryRun.balanceBefore()).isEqualByComparingTo("200");
        assertThat(dryRun.balanceAfter()).isEqualByComparingTo("80");
        assertThat(dryRun.items()).extracting(ExcludedPaymentItem::action)
            .containsExactly("REMOVED_CHARGE", "REMOVED_RECEIPT", "EXCLUDED_ONLY");
        assertThat(pixCharges.findAll()).hasSize(1);
        assertThat(contributions.findAll()).hasSize(1);
        assertThat(directReceipts.findAll()).hasSize(2);
        assertThat(excluded.findAll()).isEmpty();

        ExcludePaymentsReport applied = exclusionService.exclude(ids, "teste de junho", true);

        assertThat(applied.balanceAfter()).isEqualByComparingTo("80");
        assertThat(pixCharges.findAll()).isEmpty();
        assertThat(contributions.findAll()).isEmpty();
        assertThat(directReceipts.findAll()).extracting(r -> r.gatewayPaymentId).containsExactly("pay_keep");
        assertThat(excluded.findAll()).extracting(e -> e.gatewayPaymentId)
            .containsExactlyInAnyOrder("pay_charge", "pay_receipt", "pay_unknown");

        ExcludePaymentsReport again = exclusionService.exclude(ids, "teste de junho", true);
        assertThat(again.items()).extracting(ExcludedPaymentItem::action).containsOnly("ALREADY_EXCLUDED");

        // The history sync must not bring them back.
        List<JsonNode> payments = List.of(
            json("""
                {"id":"pay_charge","status":"RECEIVED","billingType":"PIX","value":100.00,"dateCreated":"2026-06-04",
                 "dueDate":"2026-06-04","paymentDate":"2026-06-04","customer":"cus_5","externalReference":"VILA-2026-06-HOUSE-05"}
                """),
            json("""
                {"id":"pay_receipt","status":"RECEIVED","billingType":"PIX","value":20.00,"dateCreated":"2026-06-04",
                 "dueDate":"2026-06-04","paymentDate":"2026-06-04","customer":"cus_stranger"}
                """)
        );
        when(gatewayClient.listPixPaymentsCreatedBetween(any(), any())).thenReturn(payments);
        when(gatewayClient.listPixPaymentsReceivedBetween(any(), any())).thenReturn(payments);
        when(gatewayClient.listFinancialTransactions(any(), any())).thenReturn(List.of(
            new GatewayTransaction("t1", LocalDate.of(2026, 6, 4), "PAYMENT_RECEIVED", BigDecimal.valueOf(100), null, "x", "pay_charge"),
            new GatewayTransaction("t2", LocalDate.of(2026, 6, 4), "PAYMENT_RECEIVED", BigDecimal.valueOf(20), null, "y", "pay_receipt")
        ));

        AsaasSyncReport sync = syncService.sync(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 10, 3), true);

        assertThat(sync.chargesCreated()).isZero();
        assertThat(sync.directReceiptsCreated()).isZero();
        assertThat(sync.ignored()).isEqualTo(2);
        assertThat(sync.creditsWithoutLocalRecord()).isEmpty();
        assertThat(sync.localBalanceAfter()).isEqualByComparingTo("80");

        // Nor a late webhook.
        String webhook = """
            {"id":"evt_late","event":"PAYMENT_RECEIVED","payment":{"id":"pay_receipt","billingType":"PIX",
             "status":"RECEIVED","value":20.00,"paymentDate":"2026-06-04","customer":"cus_stranger"}}
            """;
        webhookService.processAsaas("test-webhook-token", json(webhook));

        assertThat(directReceipts.findAll()).extracting(r -> r.gatewayPaymentId).containsExactly("pay_keep");
        assertThat(pixCharges.findAll()).isEmpty();
    }

    private void saveReceipt(String paymentId, String amount, LocalDateTime receivedAt) {
        DirectReceipt receipt = new DirectReceipt();
        receipt.gatewayPaymentId = paymentId;
        receipt.amount = new BigDecimal(amount);
        receipt.receivedAt = receivedAt;
        receipt.referenceMonth = java.time.YearMonth.from(receivedAt).toString();
        receipt.status = "PAID";
        directReceipts.save(receipt);
    }

    private JsonNode json(String value) throws Exception {
        return objectMapper.readTree(value);
    }
}
