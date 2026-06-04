package br.com.portalvila;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class WebhookServiceTest {
    @Autowired
    WebhookService webhookService;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    HouseRepository houses;

    @Autowired
    ResidentRepository residents;

    @Autowired
    SettingsRepository settingsRepository;

    @Autowired
    ContributionRepository contributions;

    @Autowired
    PixChargeRepository pixCharges;

    @Autowired
    WebhookEventRepository webhookEvents;

    @BeforeEach
    void cleanDatabase() {
        webhookEvents.deleteAll();
        pixCharges.deleteAll();
        contributions.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        settingsRepository.deleteAll();
    }

    @Test
    void paymentReceivedMarksChargeAndContributionAsPaidAndIgnoresDuplicateEvent() throws Exception {
        Settings settings = new Settings();
        settings.webhookSecret = "test-webhook-token";
        settingsRepository.save(settings);

        House house = houses.save(new House(11, "Casa 11"));
        Resident resident = residents.save(new Resident(house.id, "Lucas", "lucas-webhook@test.dev", null, "***.111.***-**"));

        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident.id;
        contribution.referenceMonth = "2026-05";
        contribution.amount = BigDecimal.valueOf(100);
        contribution.status = "PENDING";
        contribution = contributions.save(contribution);

        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gateway = "ASAAS";
        charge.gatewayPaymentId = "pay_123";
        charge.externalReference = "VILA-2026-05-HOUSE-01";
        charge.value = BigDecimal.valueOf(100);
        charge.dueDate = LocalDate.of(2026, 5, 10);
        charge.status = "PENDING";
        charge = pixCharges.save(charge);

        contribution.pixChargeId = charge.id;
        contributions.save(contribution);

        String payload = """
            {
              "id": "evt_123",
              "event": "PAYMENT_RECEIVED",
              "dateCreated": "2026-05-10 14:32:00",
              "payment": {
                "id": "pay_123",
                "value": 100.00,
                "transactionReceiptUrl": "https://asaas.test/receipt"
              }
            }
            """;

        WebhookResult first = webhookService.processAsaas("test-webhook-token", objectMapper.readTree(payload));
        WebhookResult duplicate = webhookService.processAsaas("test-webhook-token", objectMapper.readTree(payload));

        assertThat(first.processed()).isTrue();
        assertThat(duplicate.duplicate()).isTrue();
        assertThat(pixCharges.findById(charge.id).orElseThrow().status).isEqualTo("PAID");
        assertThat(contributions.findById(contribution.id).orElseThrow().status).isEqualTo("PAID");
        assertThat(webhookEvents.findAll()).hasSize(1);
    }

    @Test
    void paymentCreatedFromAsaasCreatesMissingLocalChargeByCustomerAndDueDate() throws Exception {
        Settings settings = new Settings();
        settings.webhookSecret = "test-webhook-token";
        settingsRepository.save(settings);

        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = new Resident(house.id, "Lorrane", "lorrane-webhook@test.dev", null, "***.222.***-**");
        resident.gatewayCustomerId = "cus_123";
        resident = residents.save(resident);

        String payload = """
            {
              "id": "evt_created_123",
              "event": "PAYMENT_CREATED",
              "dateCreated": "2026-07-01 09:00:00",
              "payment": {
                "id": "pay_july_123",
                "customer": "cus_123",
                "billingType": "PIX",
                "status": "PENDING",
                "value": 10.00,
                "dueDate": "2026-07-10",
                "invoiceUrl": "https://asaas.test/invoice"
              }
            }
            """;

        WebhookResult result = webhookService.processAsaas("test-webhook-token", objectMapper.readTree(payload));

        Contribution contribution = contributions.findByHouseIdAndReferenceMonth(house.id, "2026-07").orElseThrow();
        PixCharge charge = pixCharges.findByGatewayAndGatewayPaymentId("ASAAS", "pay_july_123").orElseThrow();

        assertThat(result.processed()).isTrue();
        assertThat(contribution.residentId).isEqualTo(resident.id);
        assertThat(contribution.status).isEqualTo("PENDING");
        assertThat(charge.contributionId).isEqualTo(contribution.id);
        assertThat(charge.value).isEqualByComparingTo("10.00");
        assertThat(charge.dueDate).isEqualTo(LocalDate.of(2026, 7, 10));
        assertThat(charge.invoiceUrl).isEqualTo("https://asaas.test/invoice");
    }
}
