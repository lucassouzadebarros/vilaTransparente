package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
class FinancialService {
    private final ContributionRepository contributions;
    private final ExpenseRepository expenses;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;

    FinancialService(
        ContributionRepository contributions,
        ExpenseRepository expenses,
        HouseRepository houses,
        ResidentRepository residents,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents
    ) {
        this.contributions = contributions;
        this.expenses = expenses;
        this.houses = houses;
        this.residents = residents;
        this.settingsRepository = settingsRepository;
        this.dashboardEvents = dashboardEvents;
    }

    @Transactional(readOnly = true)
    public DashboardResponse dashboard(String month) {
        return dashboard(month, null, true);
    }

    @Transactional(readOnly = true)
    public DashboardResponse dashboardForResident(String month, Long residentId) {
        return dashboard(month, residentId, false);
    }

    private DashboardResponse dashboard(String month, Long residentId, boolean includeAllContributionMovements) {
        boolean transparencyEnabled = includeAllContributionMovements || hasPaidContribution(residentId);
        List<Contribution> monthContributions = contributions.findByReferenceMonthOrderByHouseIdAsc(month);
        BigDecimal collected = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "PAID".equals(c.status))
            .map(this::paidValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal pending = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "PENDING".equals(c.status))
            .map(c -> c.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal overdue = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "OVERDUE".equals(c.status))
            .map(c -> c.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal allPaid = transparencyEnabled ? contributions.findAll().stream()
            .filter(c -> "PAID".equals(c.status))
            .map(this::paidValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal allExpenses = transparencyEnabled ? expenses.findAll().stream()
            .map(e -> e.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;

        List<MovementResponse> movements = new ArrayList<>();
        if (transparencyEnabled) {
            monthContributions.stream()
                .filter(c -> "PAID".equals(c.status))
                .forEach(c -> movements.add(new MovementResponse(
                    c.paymentDate == null ? YearMonth.parse(c.referenceMonth).atDay(1) : c.paymentDate.toLocalDate(),
                    c.manualPayment ? "PAGAMENTO_MANUAL" : "PIX_ASAAS",
                includeAllContributionMovements ? "Contribuição casa " + c.houseId : "Mensalidade recebida",
                    paidValue(c),
                    c.status
                )));
            expenses.findAll().forEach(e -> movements.add(new MovementResponse(
                e.expenseDate,
                "DESPESA",
                e.description,
                e.amount.negate(),
                "PAID"
            )));
        }
        movements.sort(Comparator.comparing(MovementResponse::date).reversed());

        return new DashboardResponse(
            month,
            allPaid.subtract(allExpenses),
            collected,
            pending,
            overdue,
            allExpenses,
            transparencyEnabled ? monthContributions.stream().filter(c -> "PAID".equals(c.status)).count() : 0,
            transparencyEnabled ? monthContributions.stream().filter(c -> !"PAID".equals(c.status)).count() : 0,
            transparencyEnabled,
            movements
        );
    }

    private boolean hasPaidContribution(Long residentId) {
        return residentId != null && contributions.findAll().stream()
            .anyMatch(c -> residentId.equals(c.residentId) && "PAID".equals(c.status));
    }

    @Transactional(readOnly = true)
    public List<ContributionResponse> listContributions(String month) {
        Map<Long, House> houseById = houses.findAll().stream().collect(Collectors.toMap(h -> h.id, Function.identity()));
        Map<Long, Resident> residentById = residents.findAll().stream().collect(Collectors.toMap(r -> r.id, Function.identity()));
        return contributions.findByReferenceMonthOrderByHouseIdAsc(month).stream()
            .map(c -> toContributionResponse(c, houseById.get(c.houseId), residentById.get(c.residentId)))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<ContributionResponse> listContributionsForResident(String month, Long residentId) {
        Map<Long, House> houseById = houses.findAll().stream().collect(Collectors.toMap(h -> h.id, Function.identity()));
        Map<Long, Resident> residentById = residents.findAll().stream().collect(Collectors.toMap(r -> r.id, Function.identity()));
        return contributions.findByReferenceMonthAndResidentIdOrderByHouseIdAsc(month, residentId).stream()
            .map(c -> toContributionResponse(c, houseById.get(c.houseId), residentById.get(c.residentId)))
            .toList();
    }

    @Transactional
    public List<ContributionResponse> generateMonthlyContributions(String month, BigDecimal requestedAmount) {
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
        BigDecimal amount = requestedAmount == null ? settings.monthlyAmount : requestedAmount;
        for (Resident resident : residents.findAllByOrderByHouseIdAsc()) {
            if (!"ACTIVE".equals(resident.status)) {
                continue;
            }
            contributions.findByHouseIdAndReferenceMonth(resident.houseId, month).orElseGet(() -> {
                Contribution contribution = new Contribution();
                contribution.houseId = resident.houseId;
                contribution.residentId = resident.id;
                contribution.referenceMonth = month;
                contribution.amount = amount;
                contribution.status = "PENDING";
                return contributions.save(contribution);
            });
        }
        dashboardEvents.publishDashboardChanged();
        return listContributions(month);
    }

    @Transactional
    public ContributionResponse markManualPayment(Long id, ManualPaymentRequest request) {
        Contribution contribution = contributions.findById(id).orElseThrow();
        contribution.status = "PAID";
        contribution.paidAmount = request.paidAmount() == null ? contribution.amount : request.paidAmount();
        contribution.paymentDate = LocalDateTime.now();
        contribution.paymentMethod = "MANUAL";
        contribution.manualPayment = true;
        contribution.manualReason = request.reason();
        contribution.updatedAt = LocalDateTime.now();
        contribution = contributions.save(contribution);
        dashboardEvents.publishDashboardChanged();
        return toContributionResponse(contribution, houses.findById(contribution.houseId).orElse(null),
            contribution.residentId == null ? null : residents.findById(contribution.residentId).orElse(null));
    }

    public Settings settings() {
        return settingsRepository.findAll().stream().findFirst().orElseGet(() -> settingsRepository.save(new Settings()));
    }

    public Settings updateSettings(Settings incoming) {
        Settings settings = settings();
        settings.villageName = incoming.villageName;
        settings.monthlyAmount = incoming.monthlyAmount;
        settings.paymentDueDay = incoming.paymentDueDay;
        settings.gatewayProvider = incoming.gatewayProvider;
        if (incoming.webhookSecret != null && !incoming.webhookSecret.isBlank()) {
            settings.webhookSecret = incoming.webhookSecret;
        }
        settings.updatedAt = LocalDateTime.now();
        return settingsRepository.save(settings);
    }

    ContributionResponse toContributionResponse(Contribution c, House house, Resident resident) {
        return new ContributionResponse(
            c.id,
            c.houseId,
            house == null ? "Casa " + c.houseId : house.label,
            c.residentId,
            resident == null ? null : resident.name,
            c.referenceMonth,
            c.amount,
            c.paidAmount,
            c.status,
            c.paymentDate,
            c.manualPayment,
            c.pixChargeId
        );
    }

    private BigDecimal paidValue(Contribution contribution) {
        return contribution.paidAmount == null || contribution.paidAmount.signum() == 0
            ? contribution.amount
            : contribution.paidAmount;
    }
}
