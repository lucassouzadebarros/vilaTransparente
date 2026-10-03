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
class AsaasSyncServiceTest {
    @Autowired
    AsaasSyncService syncService;

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
    WebhookEventRepository webhookEvents;

    @Autowired
    ExpenseRepository expenses;

    @Autowired
    SettingsRepository settingsRepository;

    @MockBean
    PixGatewayClient gatewayClient;

    @BeforeEach
    void cleanDatabase() {
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
    void dryRunReportsWithoutSavingAndApplyUsesRealPaymentDateAndIsIdempotent() throws Exception {
        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = residents.save(new Resident(house.id, "Lorrane", "lorrane-sync@test.dev", null, "***.222.***-**"));

        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident.id;
        contribution.referenceMonth = "2026-07";
        contribution.amount = BigDecimal.valueOf(10);
        contribution.status = "PENDING";
        contribution = contributions.save(contribution);

        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gateway = "ASAAS";
        charge.gatewayPaymentId = "pay_known";
        charge.externalReference = "VILA-2026-07-HOUSE-10";
        charge.value = BigDecimal.valueOf(10);
        charge.dueDate = LocalDate.of(2026, 7, 10);
        charge.status = "PENDING";
        charge = pixCharges.save(charge);
        contribution.pixChargeId = charge.id;
        contributions.save(contribution);

        List<JsonNode> payments = List.of(
            json("""
                {"id":"pay_known","status":"RECEIVED","billingType":"PIX","value":10.00,"dateCreated":"2026-07-01",
                 "dueDate":"2026-07-10","paymentDate":"2026-07-15","customer":"cus_10",
                 "externalReference":"VILA-2026-07-HOUSE-10","transactionReceiptUrl":"https://asaas.test/receipt"}
                """),
            json("""
                {"id":"pay_direct","status":"RECEIVED","billingType":"PIX","value":80.00,"dateCreated":"2026-07-20",
                 "dueDate":"2026-07-20","paymentDate":"2026-07-20","customer":"cus_stranger","description":"Pix recebido"}
                """),
            json("""
                {"id":"pay_pending_unknown","status":"PENDING","billingType":"PIX","value":10.00,"dateCreated":"2026-08-01",
                 "dueDate":"2026-08-10","customer":"cus_stranger"}
                """),
            json("""
                {"id":"pay_refund_requested","status":"REFUND_REQUESTED","billingType":"PIX","value":5.00,
                 "dateCreated":"2026-08-02","dueDate":"2026-08-10"}
                """)
        );
        when(gatewayClient.listPixPaymentsCreatedBetween(any(), any())).thenReturn(payments);
        when(gatewayClient.listPixPaymentsReceivedBetween(any(), any())).thenReturn(List.of(payments.get(0)));
        when(gatewayClient.getBalance()).thenReturn(new BigDecimal("2456.54"));
        when(gatewayClient.listFinancialTransactions(any(), any())).thenReturn(List.of(
            new GatewayTransaction("t1", LocalDate.of(2026, 7, 15), "PAYMENT_RECEIVED", BigDecimal.valueOf(10), null, "Cobrança", "pay_known"),
            new GatewayTransaction("t2", LocalDate.of(2026, 7, 15), "PIX_TRANSACTION_CREDIT_FEE", new BigDecimal("-1.99"), null, "Taxa Pix", null),
            new GatewayTransaction("t3", LocalDate.of(2026, 7, 25), "TRANSFER", BigDecimal.valueOf(-50), null, "Transferência", null),
            new GatewayTransaction("t4", LocalDate.of(2026, 7, 30), "PIX_TRANSACTION_CREDIT", BigDecimal.valueOf(200), null, "Pix na chave", null)
        ));

        AsaasSyncReport dryRun = syncService.sync(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 3), false);

        assertThat(dryRun.applied()).isFalse();
        assertThat(dryRun.paymentsFetched()).isEqualTo(4);
        assertThat(dryRun.chargesUpdated()).isEqualTo(1);
        assertThat(dryRun.directReceiptsCreated()).isEqualTo(1);
        assertThat(dryRun.ignored()).isEqualTo(1);
        assertThat(dryRun.skipped()).isEqualTo(1);
        assertThat(dryRun.localBalanceBefore()).isEqualByComparingTo("0");
        assertThat(dryRun.localBalanceAfter()).isEqualByComparingTo("90");
        assertThat(dryRun.asaasBalance()).isEqualByComparingTo("2456.54");
        assertThat(dryRun.difference()).isEqualByComparingTo("2366.54");
        assertThat(dryRun.statementFees()).isEqualByComparingTo("-1.99");
        assertThat(dryRun.statementOtherDebits()).isEqualByComparingTo("-50");
        assertThat(dryRun.creditsWithoutLocalRecord()).extracting(AsaasStatementEntry::value)
            .singleElement().satisfies(value -> assertThat(value).isEqualByComparingTo("200"));
        assertThat(contributions.findById(contribution.id).orElseThrow().status).isEqualTo("PENDING");
        assertThat(pixCharges.findById(charge.id).orElseThrow().status).isEqualTo("PENDING");
        assertThat(directReceipts.findAll()).isEmpty();

        AsaasSyncReport applied = syncService.sync(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 3), true);

        assertThat(applied.applied()).isTrue();
        assertThat(applied.chargesUpdated()).isEqualTo(1);
        assertThat(applied.directReceiptsCreated()).isEqualTo(1);
        Contribution paid = contributions.findById(contribution.id).orElseThrow();
        assertThat(paid.status).isEqualTo("PAID");
        assertThat(paid.paidAmount).isEqualByComparingTo("10");
        assertThat(paid.paymentDate).isEqualTo(LocalDateTime.of(2026, 7, 15, 0, 0));
        assertThat(pixCharges.findById(charge.id).orElseThrow().paidAt).isEqualTo(LocalDateTime.of(2026, 7, 15, 0, 0));
        assertThat(directReceipts.findAll()).singleElement().satisfies(receipt -> {
            assertThat(receipt.status).isEqualTo("PAID");
            assertThat(receipt.amount).isEqualByComparingTo("80");
            assertThat(receipt.referenceMonth).isEqualTo("2026-07");
        });
        assertThat(webhookEvents.findAll()).isEmpty();

        AsaasSyncReport again = syncService.sync(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 3), true);

        assertThat(again.chargesUpdated()).isZero();
        assertThat(again.directReceiptsCreated()).isZero();
        assertThat(again.directReceiptsUpdated()).isZero();
        assertThat(again.unchanged()).isEqualTo(2);
        assertThat(directReceipts.findAll()).hasSize(1);
        assertThat(again.localBalanceAfter()).isEqualByComparingTo("90");
    }

    @Test
    void localPaidChargeIsNotDowngradedWhenAsaasStillSaysPending() throws Exception {
        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = residents.save(new Resident(house.id, "Lorrane", "lorrane-conflict@test.dev", null, "***.222.***-**"));

        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident.id;
        contribution.referenceMonth = "2026-07";
        contribution.amount = BigDecimal.valueOf(10);
        contribution.paidAmount = BigDecimal.valueOf(10);
        contribution.status = "PAID";
        contribution = contributions.save(contribution);

        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gatewayPaymentId = "pay_paid_local";
        charge.externalReference = "VILA-2026-07-HOUSE-10";
        charge.value = BigDecimal.valueOf(10);
        charge.dueDate = LocalDate.of(2026, 7, 10);
        charge.status = "PAID";
        charge = pixCharges.save(charge);

        List<JsonNode> payments = List.of(json("""
            {"id":"pay_paid_local","status":"PENDING","billingType":"PIX","value":10.00,
             "dateCreated":"2026-07-01","dueDate":"2026-07-10"}
            """));
        when(gatewayClient.listPixPaymentsCreatedBetween(any(), any())).thenReturn(payments);
        when(gatewayClient.listPixPaymentsReceivedBetween(any(), any())).thenReturn(List.of());
        when(gatewayClient.listFinancialTransactions(any(), any())).thenReturn(List.of());

        AsaasSyncReport report = syncService.sync(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 3), true);

        assertThat(report.conflicts()).isEqualTo(1);
        assertThat(report.asaasBalance()).isNull();
        assertThat(pixCharges.findById(charge.id).orElseThrow().status).isEqualTo("PAID");
        assertThat(contributions.findById(contribution.id).orElseThrow().status).isEqualTo("PAID");
    }

    private JsonNode json(String value) throws Exception {
        return objectMapper.readTree(value);
    }
}
