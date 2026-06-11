package br.com.portalvila;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
class PixServiceTest {
    @Autowired
    PixService pixService;

    @Autowired
    HouseRepository houses;

    @Autowired
    ResidentRepository residents;

    @Autowired
    ContributionRepository contributions;

    @Autowired
    PixChargeRepository pixCharges;

    @Autowired
    SettingsRepository settingsRepository;

    @MockBean
    PixGatewayClient gatewayClient;

    @BeforeEach
    void cleanDatabase() {
        pixCharges.deleteAll();
        contributions.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        settingsRepository.deleteAll();
    }

    @Test
    void houseSpecificChargeReusesGatewayPaymentAlreadySavedByWebhook() {
        Settings settings = new Settings();
        settings.gatewayProvider = "ASAAS";
        settings.paymentDueDay = 10;
        settings.monthlyAmount = BigDecimal.valueOf(10);
        settingsRepository.save(settings);

        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = new Resident(house.id, "Lorrane", "lorrane-pix@test.dev", "21999990000", "***.222.***-**");
        resident.status = "ACTIVE";
        resident.gatewayCustomerId = "cus_123";
        resident = residents.save(resident);

        Contribution webhookContribution = new Contribution();
        webhookContribution.houseId = house.id;
        webhookContribution.residentId = resident.id;
        webhookContribution.referenceMonth = "2026-07";
        webhookContribution.amount = BigDecimal.valueOf(20);
        webhookContribution.status = "PENDING";
        webhookContribution = contributions.save(webhookContribution);

        PixCharge webhookCharge = new PixCharge();
        webhookCharge.contributionId = webhookContribution.id;
        webhookCharge.gateway = "ASAAS";
        webhookCharge.gatewayPaymentId = "pay_existing_webhook";
        webhookCharge.externalReference = "VILA-2026-07-HOUSE-10-EXTRA-20260701120000000";
        webhookCharge.value = BigDecimal.valueOf(20);
        webhookCharge.dueDate = LocalDate.of(2026, 7, 10);
        webhookCharge.status = "PENDING";
        webhookCharge = pixCharges.save(webhookCharge);

        webhookContribution.pixChargeId = webhookCharge.id;
        contributions.save(webhookContribution);

        when(gatewayClient.createOrUpdateCustomer(any())).thenReturn(new GatewayCustomer("cus_123"));
        when(gatewayClient.createPixCharge(any())).thenReturn(new GatewayCharge(
            "pay_existing_webhook",
            "PENDING",
            "https://asaas.test/invoice",
            BigDecimal.valueOf(20),
            LocalDate.of(2026, 7, 10),
            "VILA-2026-07-HOUSE-10-EXTRA-20260701120000000"
        ));
        when(gatewayClient.findPaymentByExternalReference(any())).thenReturn(Optional.empty());

        PixChargeResponse response = pixService.generateHouseCharge("2026-07", BigDecimal.valueOf(20), house.id);
        List<Contribution> houseContributions = contributions.findByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, "2026-07");

        assertThat(response.id()).isEqualTo(webhookCharge.id);
        assertThat(response.gatewayPaymentId()).isEqualTo("pay_existing_webhook");
        assertThat(pixCharges.findAll()).hasSize(1);
        assertThat(houseContributions).hasSize(1);
        assertThat(houseContributions.get(0).pixChargeId).isEqualTo(webhookCharge.id);
    }

    @Test
    void houseSpecificChargeCreatesExtraChargeWhenStandardChargeWasLinkedToWrongMonth() {
        Settings settings = new Settings();
        settings.gatewayProvider = "ASAAS";
        settings.paymentDueDay = 10;
        settings.monthlyAmount = BigDecimal.valueOf(10);
        settingsRepository.save(settings);

        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = new Resident(house.id, "Lorrane", "lorrane-misaligned@test.dev", "21999990000", "***.222.***-**");
        resident.status = "ACTIVE";
        resident.gatewayCustomerId = "cus_123";
        resident = residents.save(resident);

        Contribution wrongMonthContribution = new Contribution();
        wrongMonthContribution.houseId = house.id;
        wrongMonthContribution.residentId = resident.id;
        wrongMonthContribution.referenceMonth = "2030-06";
        wrongMonthContribution.amount = BigDecimal.valueOf(200);
        wrongMonthContribution.status = "PENDING";
        wrongMonthContribution = contributions.save(wrongMonthContribution);

        PixCharge paidStandardCharge = new PixCharge();
        paidStandardCharge.contributionId = wrongMonthContribution.id;
        paidStandardCharge.gateway = "ASAAS";
        paidStandardCharge.gatewayPaymentId = "pay_paid_standard";
        paidStandardCharge.externalReference = "VILA-2026-06-HOUSE-10";
        paidStandardCharge.value = BigDecimal.valueOf(10);
        paidStandardCharge.dueDate = LocalDate.of(2026, 6, 10);
        paidStandardCharge.status = "PAID";
        paidStandardCharge = pixCharges.save(paidStandardCharge);

        wrongMonthContribution.pixChargeId = paidStandardCharge.id;
        contributions.save(wrongMonthContribution);

        when(gatewayClient.createOrUpdateCustomer(any())).thenReturn(new GatewayCustomer("cus_123"));
        when(gatewayClient.createPixCharge(any())).thenAnswer(invocation -> {
            CreatePixChargeRequest request = invocation.getArgument(0);
            return new GatewayCharge(
                "pay_extra_after_alignment",
                "PENDING",
                "https://asaas.test/invoice-extra",
                request.value(),
                request.dueDate(),
                request.externalReference()
            );
        });

        PixChargeResponse response = pixService.generateHouseCharge("2026-06", BigDecimal.valueOf(200), house.id);
        List<Contribution> houseContributions = contributions.findByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, "2026-06");
        Contribution aligned = contributions.findById(wrongMonthContribution.id).orElseThrow();

        assertThat(response.gatewayPaymentId()).isEqualTo("pay_extra_after_alignment");
        assertThat(response.externalReference()).contains("-EXTRA-");
        assertThat(houseContributions).hasSize(2);
        assertThat(aligned.referenceMonth).isEqualTo("2026-06");
        assertThat(aligned.status).isEqualTo("PAID");
        assertThat(aligned.paidAmount).isEqualByComparingTo("10");
        assertThat(pixCharges.findAll()).hasSize(2);
    }

    @Test
    void rejectsDistantFuturePixChargeMonth() {
        Settings settings = new Settings();
        settings.gatewayProvider = "ASAAS";
        settings.paymentDueDay = 10;
        settings.monthlyAmount = BigDecimal.valueOf(10);
        settingsRepository.save(settings);

        House house = houses.save(new House(10, "Casa 10"));
        Resident resident = new Resident(house.id, "Lorrane", "lorrane-invalid-month@test.dev", "21999990000", "***.222.***-**");
        resident.status = "ACTIVE";
        residents.save(resident);

        assertThatThrownBy(() -> pixService.generateHouseCharge("2030-06", BigDecimal.valueOf(10), house.id))
            .hasMessageContaining("periodo permitido");
    }
}
