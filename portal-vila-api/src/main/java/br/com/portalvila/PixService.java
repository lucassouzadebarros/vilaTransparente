package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
class PixService {
    private static final DateTimeFormatter EXTRA_REFERENCE_TIMESTAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final PixGatewayClient gatewayClient;
    private final FinancialService financialService;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final ContributionRepository contributions;
    private final PixChargeRepository pixCharges;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;
    private final GatewayPaymentLockService paymentLocks;

    PixService(
        PixGatewayClient gatewayClient,
        FinancialService financialService,
        HouseRepository houses,
        ResidentRepository residents,
        ContributionRepository contributions,
        PixChargeRepository pixCharges,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents,
        GatewayPaymentLockService paymentLocks
    ) {
        this.gatewayClient = gatewayClient;
        this.financialService = financialService;
        this.houses = houses;
        this.residents = residents;
        this.contributions = contributions;
        this.pixCharges = pixCharges;
        this.settingsRepository = settingsRepository;
        this.dashboardEvents = dashboardEvents;
        this.paymentLocks = paymentLocks;
    }

    @Transactional
    public List<PixChargeResponse> generateMonthlyCharges(String month, BigDecimal requestedAmount) {
        month = validatedMonth(month);
        financialService.generateMonthlyContributions(month, requestedAmount);
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        BigDecimal amount = validatedAmount(requestedAmount == null ? settings.monthlyAmount : requestedAmount);

        for (Resident resident : residents.findAllByOrderByHouseIdAsc()) {
            if (!"ACTIVE".equals(resident.status)) {
                continue;
            }
            createMonthlyChargeForResident(month, amount, settings, resident);
        }
        dashboardEvents.publishDashboardChanged();
        return listCharges(month);
    }

    @Transactional
    public PixChargeResponse generateHouseCharge(String month, BigDecimal requestedAmount, Long houseId) {
        month = validatedMonth(month);
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        BigDecimal amount = validatedAmount(requestedAmount == null ? settings.monthlyAmount : requestedAmount);
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Casa não encontrada ou inativa."
            ));
        Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE")
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                house.label + " não possui morador ativo cadastrado."
            ));
        PixChargeResponse response = createHouseChargeForResident(month, amount, settings, resident);
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
    public List<PixChargeResponse> listAllChargesForResident(Long residentId) {
        Map<Long, Contribution> contributionById = contributions.findByResidentIdOrderByReferenceMonthDesc(residentId)
            .stream()
            .collect(Collectors.toMap(c -> c.id, Function.identity()));
        return pixCharges.findAll().stream()
            .filter(charge -> contributionById.containsKey(charge.contributionId))
            .map(charge -> toResponse(charge, contributionById.get(charge.contributionId)))
            .sorted((a, b) -> b.dueDate().compareTo(a.dueDate()))
            .toList();
    }

    @Transactional
    public List<PixChargeResponse> syncChargesForResident(Long residentId) {
        Resident resident = residents.findById(residentId).orElseThrow();
        if (resident.gatewayCustomerId == null || resident.gatewayCustomerId.isBlank()) {
            return listAllChargesForResident(residentId);
        }
        House house = houses.findById(resident.houseId).orElseThrow();
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        LocalDate start = LocalDate.now().minusMonths(12).withDayOfMonth(1);
        LocalDate end = LocalDate.now().plusMonths(12).withDayOfMonth(1).plusMonths(1).minusDays(1);
        boolean changed = false;
        for (GatewayCharge gatewayCharge : gatewayClient.listPixPaymentsByCustomerAndDueDateRange(resident.gatewayCustomerId, start, end)) {
            PixCharge existingCharge = pixCharges.findByGatewayAndGatewayPaymentId(settings.gatewayProvider, gatewayCharge.id()).orElse(null);
            if (existingCharge != null) {
                Contribution existingContribution = contributions.findById(existingCharge.contributionId).orElse(null);
                if (existingContribution != null) {
                    changed = applyGatewayPayment(existingCharge, existingContribution, gatewayClient.getPayment(existingCharge.gatewayPaymentId)) || changed;
                }
                continue;
            }
            LocalDate dueDate = gatewayCharge.dueDate();
            if (dueDate == null) {
                continue;
            }
            String month = YearMonth.from(dueDate).toString();
            String externalReference = gatewayCharge.externalReference() == null || gatewayCharge.externalReference().isBlank()
                ? externalReference(month, house)
                : gatewayCharge.externalReference();
            boolean additionalCharge = isAdditionalExternalReference(externalReference);
            Contribution contribution = additionalCharge
                ? null
                : contributions.findFirstByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, month).orElse(null);
            if (!additionalCharge && contribution != null && pixCharges.findByContributionId(contribution.id).isPresent()) {
                continue;
            }
            BigDecimal amount = gatewayCharge.value() == null ? settings.monthlyAmount : gatewayCharge.value();
            if (contribution == null) {
                contribution = new Contribution();
                contribution.houseId = house.id;
                contribution.residentId = resident.id;
                contribution.referenceMonth = month;
                contribution.amount = amount;
                contribution.status = "PENDING";
                contribution = contributions.save(contribution);
            }
            persistGatewayCharge(settings, contribution, externalReference, amount, dueDate, gatewayCharge);
            changed = true;
        }
        if (changed) {
            dashboardEvents.publishDashboardChanged();
        }
        return listAllChargesForResident(residentId);
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

    private PixChargeResponse createMonthlyChargeForResident(String month, BigDecimal amount, Settings settings, Resident resident) {
        return createChargeForResident(month, amount, settings, resident, false);
    }

    private PixChargeResponse createHouseChargeForResident(String month, BigDecimal amount, Settings settings, Resident resident) {
        return createChargeForResident(month, amount, settings, resident, true);
    }

    private PixChargeResponse createChargeForResident(
        String month,
        BigDecimal amount,
        Settings settings,
        Resident resident,
        boolean allowAdditionalCharge
    ) {
        YearMonth reference = YearMonth.parse(month);
        House house = houses.findById(resident.houseId).orElseThrow();
        String standardExternalReference = externalReference(month, house);
        PixCharge chargeForStandardReference = pixCharges
            .findFirstByGatewayAndExternalReferenceOrderByCreatedAtAsc(settings.gatewayProvider, standardExternalReference)
            .orElse(null);
        Contribution contributionForStandardReference = chargeForStandardReference == null
            ? null
            : contributions.findById(chargeForStandardReference.contributionId)
                .map(contribution -> alignContributionWithGatewayCharge(contribution, chargeForStandardReference, month, amount, resident))
                .orElse(null);
        List<Contribution> monthContributions = contributions.findByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, month);

        Contribution contributionWithoutCharge = null;
        boolean hasChargeForMonth = chargeForStandardReference != null;
        for (Contribution candidate : monthContributions) {
            PixCharge existing = pixCharges.findByContributionId(candidate.id).orElse(null);
            if (existing != null) {
                hasChargeForMonth = true;
                if (!allowAdditionalCharge) {
                    return toResponse(existing, candidate);
                }
            } else if (contributionWithoutCharge == null) {
                contributionWithoutCharge = candidate;
            }
        }

        if (!allowAdditionalCharge && chargeForStandardReference != null && contributionForStandardReference != null) {
            return toResponse(chargeForStandardReference, contributionForStandardReference);
        }

        boolean additionalCharge = allowAdditionalCharge && hasChargeForMonth;
        Contribution contribution = additionalCharge
            ? createContribution(month, amount, resident)
            : contributionWithoutCharge == null ? createContribution(month, amount, resident) : contributionWithoutCharge;

        contribution.residentId = resident.id;
        contribution.amount = amount;
        contribution.status = "PENDING";
        contribution.updatedAt = LocalDateTime.now();
        contribution = contributions.save(contribution);

        GatewayCustomer customer = gatewayClient.createOrUpdateCustomer(resident);
        resident.gatewayCustomerId = customer.id();
        residents.save(resident);

        String externalReference = additionalCharge
            ? additionalExternalReference(month, house)
            : standardExternalReference;
        LocalDate dueDate = reference.atDay(Math.min(settings.paymentDueDay, reference.lengthOfMonth()));
        CreatePixChargeRequest request = new CreatePixChargeRequest(
            customer.id(),
            externalReference,
            "Caixinha da Vila - " + house.label + " - " + month + (additionalCharge ? " (complementar)" : ""),
            amount,
            dueDate
        );
        GatewayCharge gatewayCharge = additionalCharge
            ? gatewayClient.createPixCharge(request)
            : gatewayClient.findPaymentByExternalReference(externalReference)
            .filter(charge -> externalReference.equals(charge.externalReference()))
            .orElseGet(() -> gatewayClient.createPixCharge(new CreatePixChargeRequest(
                customer.id(),
                externalReference,
                "Caixinha da Vila - " + house.label + " - " + month,
                amount,
                dueDate
            )));
        return persistGatewayCharge(settings, contribution, externalReference, amount, dueDate, gatewayCharge);
    }

    private Contribution createContribution(String month, BigDecimal amount, Resident resident) {
        Contribution created = new Contribution();
        created.houseId = resident.houseId;
        created.residentId = resident.id;
        created.referenceMonth = month;
        created.amount = amount;
        created.status = "PENDING";
        return contributions.save(created);
    }

    private PixChargeResponse persistGatewayCharge(
        Settings settings,
        Contribution contribution,
        String externalReference,
        BigDecimal amount,
        LocalDate dueDate,
        GatewayCharge gatewayCharge
    ) {
        return paymentLocks.withLock(gatewayCharge.id(), () -> persistGatewayChargeLocked(settings, contribution, externalReference, amount, dueDate, gatewayCharge));
    }

    private PixChargeResponse persistGatewayChargeLocked(
        Settings settings,
        Contribution contribution,
        String externalReference,
        BigDecimal amount,
        LocalDate dueDate,
        GatewayCharge gatewayCharge
    ) {
        PixCharge existingCharge = pixCharges.findByGatewayAndGatewayPaymentId(settings.gatewayProvider, gatewayCharge.id()).orElse(null);
        if (existingCharge != null) {
            return reuseExistingGatewayCharge(contribution, existingCharge);
        }

        PixQrCode qrCode = safeQrCode(gatewayCharge.id());
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
        charge.qrCodeBase64 = qrCode == null ? null : qrCode.encodedImage();
        charge.pixCopyPaste = qrCode == null ? null : qrCode.payload();
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

    private PixChargeResponse reuseExistingGatewayCharge(Contribution duplicateContribution, PixCharge existingCharge) {
        Contribution existingContribution = contributions.findById(existingCharge.contributionId).orElse(null);
        if (existingContribution == null) {
            duplicateContribution.pixChargeId = existingCharge.id;
            duplicateContribution.updatedAt = LocalDateTime.now();
            existingCharge.contributionId = duplicateContribution.id;
            existingCharge.updatedAt = LocalDateTime.now();
            pixCharges.save(existingCharge);
            existingContribution = contributions.save(duplicateContribution);
        } else if (!existingContribution.id.equals(duplicateContribution.id) && canDiscardDuplicateContribution(duplicateContribution)) {
            contributions.delete(duplicateContribution);
        }
        return toResponse(existingCharge, existingContribution);
    }

    private Contribution alignContributionWithGatewayCharge(
        Contribution contribution,
        PixCharge charge,
        String month,
        BigDecimal requestedAmount,
        Resident resident
    ) {
        boolean changed = false;
        if (!month.equals(contribution.referenceMonth)) {
            contribution.referenceMonth = month;
            changed = true;
        }
        if (!resident.id.equals(contribution.residentId)) {
            contribution.residentId = resident.id;
            changed = true;
        }
        if (!charge.id.equals(contribution.pixChargeId)) {
            contribution.pixChargeId = charge.id;
            changed = true;
        }
        BigDecimal chargeValue = charge.value == null ? requestedAmount : charge.value;
        if (chargeValue != null && contribution.amount.compareTo(chargeValue) != 0) {
            contribution.amount = chargeValue;
            changed = true;
        }
        if ("PAID".equals(charge.status)) {
            if (!"PAID".equals(contribution.status)) {
                contribution.status = "PAID";
                changed = true;
            }
            if (contribution.paidAmount == null || contribution.paidAmount.signum() == 0) {
                contribution.paidAmount = chargeValue;
                changed = true;
            }
            if (contribution.paymentDate == null) {
                contribution.paymentDate = charge.paidAt == null ? LocalDateTime.now() : charge.paidAt;
                changed = true;
            }
            if (contribution.paymentMethod == null || contribution.paymentMethod.isBlank()) {
                contribution.paymentMethod = "PIX_ASAAS";
                changed = true;
            }
        }
        if (changed) {
            contribution.updatedAt = LocalDateTime.now();
            return contributions.save(contribution);
        }
        return contribution;
    }

    private boolean canDiscardDuplicateContribution(Contribution contribution) {
        BigDecimal paidAmount = contribution.paidAmount == null ? BigDecimal.ZERO : contribution.paidAmount;
        return contribution.pixChargeId == null
            && !contribution.manualPayment
            && contribution.paymentDate == null
            && paidAmount.signum() == 0
            && ("PENDING".equals(contribution.status) || contribution.status == null);
    }

    private PixQrCode safeQrCode(String gatewayPaymentId) {
        try {
            return gatewayClient.getPixQrCode(gatewayPaymentId);
        } catch (RuntimeException ignored) {
            return null;
        }
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
            String standardExternalReference = externalReference(month, house);
            Contribution contribution = contributions.findFirstByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, month).orElse(null);
            boolean contributionAlreadyHasCharge = contribution != null && pixCharges.findByContributionId(contribution.id).isPresent();
            GatewayCharge gatewayCharge = gatewayClient.findPaymentByExternalReference(standardExternalReference)
                .filter(charge -> pixCharges.findByGatewayAndGatewayPaymentId(settings.gatewayProvider, charge.id()).isEmpty())
                .orElseGet(() -> findResidentGatewayCharge(resident, start, end).orElse(null));
            if (gatewayCharge == null || pixCharges.findByGatewayAndGatewayPaymentId(settings.gatewayProvider, gatewayCharge.id()).isPresent()) {
                continue;
            }
            String externalReference = gatewayCharge.externalReference() == null || gatewayCharge.externalReference().isBlank()
                ? standardExternalReference
                : gatewayCharge.externalReference();
            if (contributionAlreadyHasCharge || isAdditionalExternalReference(externalReference)) {
                contribution = null;
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

    private String validatedMonth(String month) {
        try {
            YearMonth reference = YearMonth.parse(month);
            YearMonth now = YearMonth.now();
            if (reference.isBefore(YearMonth.of(2020, 1)) || reference.isAfter(now.plusMonths(18))) {
                throw badRequest("Informe um mes de cobranca dentro do periodo permitido.");
            }
            return reference.toString();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw badRequest("Informe o mes da cobranca no formato AAAA-MM.");
        }
    }

    private BigDecimal validatedAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw badRequest("Informe um valor de cobranca maior que zero.");
        }
        return amount;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, message);
    }

    private String additionalExternalReference(String month, House house) {
        return externalReference(month, house) + "-EXTRA-" + LocalDateTime.now().format(EXTRA_REFERENCE_TIMESTAMP);
    }

    private boolean isAdditionalExternalReference(String externalReference) {
        return externalReference != null && externalReference.contains("-EXTRA-");
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

    private boolean applyGatewayPayment(PixCharge charge, Contribution contribution, GatewayPayment payment) {
        String previousChargeStatus = charge.status;
        String previousContributionStatus = contribution.status;
        BigDecimal previousPaidAmount = contribution.paidAmount;
        LocalDateTime previousPaymentDate = contribution.paymentDate;
        String previousReceiptUrl = charge.receiptUrl;

        String status = normalizeGatewayStatus(payment.status());
        if ("PENDING".equals(status) && "PAID".equals(charge.status) && payment.value().signum() == 0) {
            return false;
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
        return !same(previousChargeStatus, charge.status)
            || !same(previousContributionStatus, contribution.status)
            || !same(previousPaidAmount, contribution.paidAmount)
            || !same(previousPaymentDate, contribution.paymentDate)
            || !same(previousReceiptUrl, charge.receiptUrl);
    }

    private boolean same(Object left, Object right) {
        return java.util.Objects.equals(left, right);
    }
}
