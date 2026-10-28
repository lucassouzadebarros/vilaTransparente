package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
    private final DirectReceiptRepository directReceipts;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final SettingsRepository settingsRepository;
    private final DashboardEventService dashboardEvents;
    private final AuditService audit;

    FinancialService(
        ContributionRepository contributions,
        ExpenseRepository expenses,
        DirectReceiptRepository directReceipts,
        HouseRepository houses,
        ResidentRepository residents,
        SettingsRepository settingsRepository,
        DashboardEventService dashboardEvents,
        AuditService audit
    ) {
        this.audit = audit;
        this.contributions = contributions;
        this.expenses = expenses;
        this.directReceipts = directReceipts;
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
        List<DirectReceipt> monthDirectReceipts = transparencyEnabled
            ? directReceipts.findByReferenceMonthAndStatusOrderByReceivedAtDesc(month, "PAID")
            : List.of();
        List<DirectReceipt> allDirectReceipts = transparencyEnabled
            ? directReceipts.findByStatusOrderByReceivedAtDesc("PAID")
            : List.of();
        BigDecimal collected = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "PAID".equals(c.status))
            .map(this::paidValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .add(sumDirectReceipts(monthDirectReceipts)) : BigDecimal.ZERO;
        BigDecimal pending = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "PENDING".equals(c.status))
            .map(c -> c.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal overdue = transparencyEnabled ? monthContributions.stream()
            .filter(c -> "OVERDUE".equals(c.status))
            .map(c -> c.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        List<Contribution> allContributions = transparencyEnabled ? contributions.findAll() : List.of();
        BigDecimal allPaid = transparencyEnabled ? allContributions.stream()
            .filter(c -> "PAID".equals(c.status))
            .map(this::paidValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .add(sumDirectReceipts(allDirectReceipts)) : BigDecimal.ZERO;
        BigDecimal allExpenses = transparencyEnabled ? expenses.findAll().stream()
            .map(e -> e.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;

        List<MovementResponse> movements = new ArrayList<>();
        if (transparencyEnabled) {
            Map<Long, String> houseLabels = houses.findAll().stream()
                .filter(h -> h.label != null)
                .collect(Collectors.toMap(h -> h.id, h -> h.label));
            // Movements cover every month, like direct receipts and expenses, so the list always matches the totals.
            allContributions.stream()
                .filter(c -> "PAID".equals(c.status))
                .forEach(c -> movements.add(new MovementResponse(
                    c.paymentDate == null ? YearMonth.parse(c.referenceMonth).atDay(1) : c.paymentDate.toLocalDate(),
                    c.manualPayment ? "PAGAMENTO_MANUAL" : "PIX_ASAAS",
                    includeAllContributionMovements
                        ? "Contribuição - " + houseLabels.getOrDefault(c.houseId, "casa " + c.houseId)
                        : "Mensalidade recebida",
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
            allDirectReceipts.forEach(receipt -> movements.add(new MovementResponse(
                receipt.receivedAt.toLocalDate(),
                "RECEBIMENTO_DIRETO",
                // The payer's name is for the admin only; houses see that the money came in, not from whom.
                includeAllContributionMovements ? receipt.description : "Recebimento direto",
                receipt.amount,
                receipt.status
            )));
        }
        movements.sort(Comparator.comparing(MovementResponse::date).reversed());

        return new DashboardResponse(
            month,
            allPaid.subtract(allExpenses),
            collected,
            allPaid,
            pending,
            overdue,
            allExpenses,
            transparencyEnabled ? monthContributions.stream().filter(c -> "PAID".equals(c.status)).count() : 0,
            transparencyEnabled ? monthContributions.stream().filter(c -> !"PAID".equals(c.status)).count() : 0,
            transparencyEnabled,
            movements
        );
    }

    /** Houses that never contributed see no totals: the portal opens its books to those who take part. */
    boolean transparencyEnabledFor(Long residentId) {
        return hasPaidContribution(residentId);
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
            contributions.findFirstByHouseIdAndReferenceMonthOrderByCreatedAtAsc(resident.houseId, month).orElseGet(() -> {
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
        if ("PAID".equals(contribution.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta contribuição já está paga.");
        }
        if ("CANCELLED".equals(contribution.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esta contribuição foi cancelada.");
        }
        if (request.paidAmount() != null && request.paidAmount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um valor pago maior que zero.");
        }
        contribution.status = "PAID";
        contribution.paidAmount = request.paidAmount() == null ? contribution.amount : request.paidAmount();
        contribution.paymentDate = LocalDateTime.now();
        contribution.paymentMethod = "MANUAL";
        contribution.manualPayment = true;
        contribution.manualReason = request.reason();
        contribution.updatedAt = LocalDateTime.now();
        contribution = contributions.save(contribution);
        String houseLabel = houses.findById(contribution.houseId).map(house -> house.label).orElse("casa " + contribution.houseId);
        audit.record("MANUAL_PAYMENT", "CONTRIBUTION", contribution.id,
            houseLabel + " " + contribution.referenceMonth + " - " + AuditService.money(contribution.paidAmount) + " - motivo: " + request.reason());
        dashboardEvents.publishDashboardChanged();
        return toContributionResponse(contribution, houses.findById(contribution.houseId).orElse(null),
            contribution.residentId == null ? null : residents.findById(contribution.residentId).orElse(null));
    }

    public Settings settings() {
        return settingsRepository.findAll().stream().findFirst().orElseGet(() -> settingsRepository.save(new Settings()));
    }

    /** Sets (or clears, with null) the value above which a service needs a budget approved by the houses. */
    public Settings updateBudgetRule(BigDecimal budgetRequiredAbove) {
        if (budgetRequiredAbove != null && budgetRequiredAbove.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O valor não pode ser negativo.");
        }
        Settings settings = settings();
        settings.budgetRequiredAbove = budgetRequiredAbove == null || budgetRequiredAbove.signum() == 0 ? null : budgetRequiredAbove;
        settings.updatedAt = LocalDateTime.now();
        Settings saved = settingsRepository.save(settings);
        audit.record("BUDGET_RULE_CHANGED", "SETTINGS", saved.id, saved.budgetRequiredAbove == null
            ? "Orçamento aprovado deixou de ser exigido"
            : "Orçamento aprovado exigido acima de " + AuditService.money(saved.budgetRequiredAbove));
        return saved;
    }

    /**
     * How the units are charged from the next charge on (the ones already issued keep what they had). The late fee is
     * capped at 2%, the most the Civil Code allows a condominium (art. 1.336, par. 1); the convention may ask for less.
     */
    public Settings updateBillingRules(BillingRulesRequest request) {
        String billingType = request.billingType() == null ? null : request.billingType().trim().toUpperCase();
        if (!Settings.BILLING_PIX.equals(billingType) && !Settings.BILLING_BOLETO.equals(billingType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha Pix ou boleto com Pix.");
        }
        BigDecimal fine = request.finePercent() == null ? BigDecimal.ZERO : request.finePercent();
        if (fine.signum() < 0 || fine.compareTo(BigDecimal.valueOf(2)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A multa por atraso vai de 0% a 2% (Código Civil, art. 1.336).");
        }
        BigDecimal interest = request.interestPercent() == null ? BigDecimal.ZERO : request.interestPercent();
        if (interest.signum() < 0 || interest.compareTo(BigDecimal.TEN) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Os juros vão de 0% a 10% ao mês.");
        }
        String title = request.chargeTitle() == null ? "" : request.chargeTitle().trim().replaceAll("\\s+", " ");
        if (title.length() < 3 || title.length() > 60) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O nome da cobrança precisa ter de 3 a 60 letras.");
        }
        Settings settings = settings();
        BigDecimal reserve = request.reserveFundPercent() == null ? settings.reserveFundPercent : request.reserveFundPercent();
        if (reserve.signum() < 0 || reserve.compareTo(BigDecimal.valueOf(30)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O fundo de reserva vai de 0% a 30% da taxa.");
        }
        int daysBefore = request.reminderDaysBefore() == null ? settings.reminderDaysBefore : request.reminderDaysBefore();
        if (daysBefore < 1 || daysBefore > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O lembrete sai de 1 a 10 dias antes do vencimento.");
        }
        settings.billingType = billingType;
        settings.finePercent = fine.setScale(2, RoundingMode.HALF_UP);
        settings.interestPercent = interest.setScale(2, RoundingMode.HALF_UP);
        settings.chargeTitle = title;
        settings.reserveFundPercent = reserve.setScale(2, RoundingMode.HALF_UP);
        if (request.remindersEnabled() != null) {
            settings.remindersEnabled = request.remindersEnabled();
        }
        settings.reminderDaysBefore = daysBefore;
        settings.updatedAt = LocalDateTime.now();
        Settings saved = settingsRepository.save(settings);
        audit.record("BILLING_RULES_CHANGED", "SETTINGS", saved.id,
            (Settings.BILLING_BOLETO.equals(saved.billingType) ? "Boleto com Pix" : "Pix")
                + ", multa " + saved.finePercent.toPlainString() + "%, juros " + saved.interestPercent.toPlainString() + "% ao mês, \""
                + saved.chargeTitle + "\", fundo de reserva " + saved.reserveFundPercent.toPlainString() + "%, lembretes "
                + (saved.remindersEnabled ? saved.reminderDaysBefore + " dia(s) antes" : "desligados"));
        return saved;
    }

    public Settings updateSettings(Settings incoming) {
        Settings settings = settings();
        // A field left out keeps what it had (the web panel sends only what its form shows).
        if (incoming.villageName != null && !incoming.villageName.isBlank()) {
            settings.villageName = incoming.villageName.trim();
        }
        if (incoming.monthlyAmount != null) {
            settings.monthlyAmount = incoming.monthlyAmount;
        }
        if (incoming.paymentDueDay != null) {
            settings.paymentDueDay = incoming.paymentDueDay;
        }
        if (incoming.gatewayProvider != null && !incoming.gatewayProvider.isBlank()) {
            settings.gatewayProvider = incoming.gatewayProvider;
        }
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

    private BigDecimal sumDirectReceipts(List<DirectReceipt> receipts) {
        return receipts.stream()
            .map(receipt -> receipt.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
