package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
class PixService {
    private final PixGatewayClient gatewayClient;
    private final FinancialService financialService;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final ContributionRepository contributions;
    private final PixChargeRepository pixCharges;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;

    PixService(
        PixGatewayClient gatewayClient,
        FinancialService financialService,
        HouseRepository houses,
        ResidentRepository residents,
        ContributionRepository contributions,
        PixChargeRepository pixCharges,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents
    ) {
        this.gatewayClient = gatewayClient;
        this.financialService = financialService;
        this.houses = houses;
        this.residents = residents;
        this.contributions = contributions;
        this.pixCharges = pixCharges;
        this.settingsRepository = settingsRepository;
        this.dashboardEvents = dashboardEvents;
    }

    @Transactional
    public List<PixChargeResponse> generateMonthlyCharges(String month, BigDecimal requestedAmount) {
        financialService.generateMonthlyContributions(month, requestedAmount);
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        BigDecimal amount = requestedAmount == null ? settings.monthlyAmount : requestedAmount;

        for (Resident resident : residents.findAllByOrderByHouseIdAsc()) {
            if (!"ACTIVE".equals(resident.status)) {
                continue;
            }
            createChargeForResident(month, amount, settings, resident);
        }
        dashboardEvents.publishDashboardChanged();
        return listCharges(month);
    }

    @Transactional
    public PixChargeResponse generateHouseCharge(String month, BigDecimal requestedAmount, Long houseId) {
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        BigDecimal amount = requestedAmount == null ? settings.monthlyAmount : requestedAmount;
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Casa nao encontrada ou inativa."
            ));
        Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE")
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                house.label + " nao possui morador ativo cadastrado."
            ));
        PixChargeResponse response = createChargeForResident(month, amount, settings, resident);
        dashboardEvents.publishDashboardChanged();
        return response;
    }

    @Transactional(readOnly = true)
    public List<PixChargeResponse> listCharges(String month) {
        Map<Long, Contribution> contributionById = contributions.findByReferenceMonthOrderByHouseIdAsc(month)
            .stream()
            .collect(Collectors.toMap(c -> c.id, Function.identity()));
        return pixCharges.findAll().stream()
            .filter(charge -> contributionById.containsKey(charge.contributionId))
            .map(charge -> toResponse(charge, contributionById.get(charge.contributionId)))
            .sorted((a, b) -> a.houseLabel().compareToIgnoreCase(b.houseLabel()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<PixChargeResponse> listChargesForResident(String month, Long residentId) {
        Map<Long, Contribution> contributionById = contributions.findByReferenceMonthAndResidentIdOrderByHouseIdAsc(month, residentId)
            .stream()
            .collect(Collectors.toMap(c -> c.id, Function.identity()));
        return pixCharges.findAll().stream()
            .filter(charge -> contributionById.containsKey(charge.contributionId))
            .map(charge -> toResponse(charge, contributionById.get(charge.contributionId)))
            .sorted((a, b) -> a.houseLabel().compareToIgnoreCase(b.houseLabel()))
            .toList();
    }

    @Transactional(readOnly = true)
    public PixChargeResponse getCharge(Long id) {
        PixCharge charge = pixCharges.findById(id).orElseThrow();
        Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();
        return toResponse(charge, contribution);
    }

    @Transactional
    public PixChargeResponse refreshQrCode(Long id) {
        PixCharge charge = pixCharges.findById(id).orElseThrow();
        PixQrCode qrCode = gatewayClient.getPixQrCode(charge.gatewayPaymentId);
        charge.qrCodeBase64 = qrCode.encodedImage();
        charge.pixCopyPaste = qrCode.payload();
        charge.updatedAt = LocalDateTime.now();
        PixChargeResponse response = toResponse(pixCharges.save(charge), contributions.findById(charge.contributionId).orElseThrow());
        dashboardEvents.publishDashboardChanged();
        return response;
    }

    @Transactional
    public PixChargeResponse cancel(Long id, CancelRequest request) {
        PixCharge charge = pixCharges.findById(id).orElseThrow();
        gatewayClient.cancelPayment(charge.gatewayPaymentId);
        charge.status = "CANCELLED";
        charge.updatedAt = LocalDateTime.now();
        Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();
        contribution.status = "CANCELLED";
        contribution.manualReason = request.reason();
        contribution.updatedAt = LocalDateTime.now();
        contributions.save(contribution);
        PixChargeResponse response = toResponse(pixCharges.save(charge), contribution);
        dashboardEvents.publishDashboardChanged();
        return response;
    }

    @Transactional
    public List<PixChargeResponse> reconcile(String month) {
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        recoverMissingGatewayCharges(month, settings);
        List<PixChargeResponse> current = listCharges(month);
        for (PixChargeResponse response : current) {
            PixCharge charge = pixCharges.findById(response.id()).orElseThrow();
            GatewayPayment payment = gatewayClient.getPayment(charge.gatewayPaymentId);
            Contribution contribution = contributions.findById(charge.contributionId).orElseThrow();
            applyGatewayPayment(charge, contribution, payment);
        }
        dashboardEvents.publishDashboardChanged();
        return listCharges(month);
    }

    PixChargeResponse toResponse(PixCharge charge, Contribution contribution) {
        House house = houses.findById(contribution.houseId).orElse(null);
        Resident resident = contribution.residentId == null ? null : residents.findById(contribution.residentId).orElse(null);
        return new PixChargeResponse(
            charge.id,
            charge.contributionId,
            contribution.houseId,
            house == null ? "Casa " + contribution.houseId : house.label,
            resident == null ? null : resident.name,
            contribution.referenceMonth,
            charge.gateway,
            charge.gatewayPaymentId,
            charge.externalReference,
            charge.value,
            charge.dueDate,
            charge.status,
            charge.qrCodeBase64,
            charge.pixCopyPaste,
            charge.invoiceUrl,
            charge.receiptUrl,
            charge.paidAt
        );
    }

    private PixChargeResponse createChargeForResident(String month, BigDecimal amount, Settings settings, Resident resident) {
        YearMonth reference = YearMonth.parse(month);
        House house = houses.findById(resident.houseId).orElseThrow();
        Contribution contribution = contributions.findByHouseIdAndReferenceMonth(house.id, month).orElseGet(() -> {
            Contribution created = new Contribution();
            created.houseId = resident.houseId;
            created.residentId = resident.id;
            created.referenceMonth = month;
            created.amount = amount;
            created.status = "PENDING";
            return contributions.save(created);
        });
        PixCharge existing = pixCharges.findByContributionId(contribution.id).orElse(null);
        if (existing != null) {
            return toResponse(existing, contribution);
        }

        contribution.residentId = resident.id;
        contribution.amount = amount;
        contribution.status = "PENDING";
        contribution.updatedAt = LocalDateTime.now();
        contribution = contributions.save(contribution);

        GatewayCustomer customer = gatewayClient.createOrUpdateCustomer(resident);
        resident.gatewayCustomerId = customer.id();
        residents.save(resident);

        String externalReference = externalReference(month, house);
        LocalDate dueDate = reference.atDay(Math.min(settings.paymentDueDay, reference.lengthOfMonth()));
        GatewayCharge gatewayCharge = gatewayClient.findPaymentByExternalReference(externalReference)
            .orElseGet(() -> gatewayClient.createPixCharge(new CreatePixChargeRequest(
                customer.id(),
                externalReference,
                "Caixinha da Vila - " + house.label + " - " + month,
                amount,
                dueDate
            )));
        return persistGatewayCharge(settings, contribution, externalReference, amount, dueDate, gatewayCharge);
    }

    private PixChargeResponse persistGatewayCharge(
        Settings settings,
        Contribution contribution,
        String externalReference,
        BigDecimal amount,
        LocalDate dueDate,
        GatewayCharge gatewayCharge
    ) {
        PixQrCode qrCode = gatewayClient.getPixQrCode(gatewayCharge.id());
        PixCharge charge = new PixCharge();
        charge.contributionId = contribution.id;
        charge.gateway = settings.gatewayProvider;
        charge.gatewayPaymentId = gatewayCharge.id();
        charge.externalReference = gatewayCharge.externalReference() == null || gatewayCharge.externalReference().isBlank()
            ? externalReference
            : gatewayCharge.externalReference();
        charge.value = gatewayCharge.value() == null ? amount : gatewayCharge.value();
        charge.dueDate = gatewayCharge.dueDate() == null ? dueDate : gatewayCharge.dueDate();
        charge.status = normalizeGatewayStatus(gatewayCharge.status());
        charge.qrCodeBase64 = qrCode.encodedImage();
        charge.pixCopyPaste = qrCode.payload();
        charge.invoiceUrl = gatewayCharge.invoiceUrl();
        if ("PAID".equals(charge.status)) {
            charge.paidAt = LocalDateTime.now();
        }
        charge.updatedAt = LocalDateTime.now();
        charge = pixCharges.save(charge);

        contribution.pixChargeId = charge.id;
        if ("PAID".equals(charge.status)) {
            contribution.status = "PAID";
            contribution.paidAmount = charge.value;
            contribution.paymentDate = LocalDateTime.now();
            contribution.paymentMethod = "PIX_ASAAS";
        } else {
            contribution.status = "PENDING";
        }
        contribution.updatedAt = LocalDateTime.now();
        contributions.save(contribution);
        return toResponse(charge, contribution);
    }

    private void recoverMissingGatewayCharges(String month, Settings settings) {
        YearMonth reference = YearMonth.parse(month);
        LocalDate start = reference.atDay(1);
        LocalDate end = reference.atEndOfMonth();
        for (Resident resident : residents.findAllByOrderByHouseIdAsc()) {
            if (!"ACTIVE".equals(resident.status)) {
                continue;
            }
            House house = houses.findById(resident.houseId).orElse(null);
            if (house == null) {
                continue;
            }
            String externalReference = externalReference(month, house);
            Contribution contribution = contributions.findByHouseIdAndReferenceMonth(house.id, month).orElse(null);
            if (contribution != null && pixCharges.findByContributionId(contribution.id).isPresent()) {
                continue;
            }
            GatewayCharge gatewayCharge = gatewayClient.findPaymentByExternalReference(externalReference)
                .orElseGet(() -> findResidentGatewayCharge(resident, start, end).orElse(null));
            if (gatewayCharge == null || pixCharges.findByGatewayAndGatewayPaymentId(settings.gatewayProvider, gatewayCharge.id()).isPresent()) {
                continue;
            }
            BigDecimal amount = gatewayCharge.value() == null
                ? contribution == null ? settings.monthlyAmount : contribution.amount
                : gatewayCharge.value();
            if (contribution == null) {
                contribution = new Contribution();
                contribution.houseId = house.id;
                contribution.residentId = resident.id;
                contribution.referenceMonth = month;
                contribution.amount = amount;
                contribution.status = "PENDING";
                contribution = contributions.save(contribution);
            }
            LocalDate dueDate = gatewayCharge.dueDate() == null
                ? reference.atDay(Math.min(settings.paymentDueDay, reference.lengthOfMonth()))
                : gatewayCharge.dueDate();
            persistGatewayCharge(settings, contribution, externalReference, amount, dueDate, gatewayCharge);
        }
    }

    private java.util.Optional<GatewayCharge> findResidentGatewayCharge(Resident resident, LocalDate start, LocalDate end) {
        if (resident.gatewayCustomerId == null || resident.gatewayCustomerId.isBlank()) {
            return java.util.Optional.empty();
        }
        return gatewayClient.listPixPaymentsByCustomerAndDueDateRange(resident.gatewayCustomerId, start, end)
            .stream()
            .filter(charge -> pixCharges.findByGatewayAndGatewayPaymentId("ASAAS", charge.id()).isEmpty())
            .findFirst();
    }

    private String externalReference(String month, House house) {
        String houseNumber = String.format("%02d", house.number);
        return "VILA-" + month + "-HOUSE-" + houseNumber;
    }

    private String normalizeGatewayStatus(String status) {
        if (status == null) {
            return "PENDING";
        }
        return switch (status) {
            case "RECEIVED", "CONFIRMED", "PAID" -> "PAID";
            case "OVERDUE" -> "OVERDUE";
            case "REFUNDED" -> "REFUNDED";
            case "DELETED", "CANCELLED" -> "CANCELLED";
            default -> "PENDING";
        };
    }

    private void applyGatewayPayment(PixCharge charge, Contribution contribution, GatewayPayment payment) {
        String status = normalizeGatewayStatus(payment.status());
        if ("PENDING".equals(status) && "PAID".equals(charge.status) && payment.value().signum() == 0) {
            return;
        }
        charge.status = status;
        if ("PAID".equals(status)) {
            charge.paidAt = charge.paidAt == null ? LocalDateTime.now() : charge.paidAt;
            charge.receiptUrl = payment.receiptUrl();
            contribution.status = "PAID";
            contribution.paidAmount = payment.value().signum() > 0 ? payment.value() : charge.value;
            contribution.paymentDate = contribution.paymentDate == null ? LocalDateTime.now() : contribution.paymentDate;
            contribution.paymentMethod = "PIX_ASAAS";
        } else if ("OVERDUE".equals(status)) {
            contribution.status = "OVERDUE";
        } else if ("REFUNDED".equals(status)) {
            contribution.status = "PENDING";
            contribution.paidAmount = BigDecimal.ZERO;
            contribution.paymentDate = null;
        } else if ("CANCELLED".equals(status)) {
            contribution.status = "CANCELLED";
        }
        charge.updatedAt = LocalDateTime.now();
        contribution.updatedAt = LocalDateTime.now();
        pixCharges.save(charge);
        contributions.save(contribution);
    }
}
