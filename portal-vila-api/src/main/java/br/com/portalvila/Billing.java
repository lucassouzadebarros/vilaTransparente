package br.com.portalvila;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** The month's charges in the web panel: what each unit owes, paid or not, and issuing the month for every unit at once. */
@RestController
@RequestMapping("/api/admin/billing")
@PreAuthorize("hasRole('ADMIN')")
class BillingController {
    private final BillingService billing;

    BillingController(BillingService billing) {
        this.billing = billing;
    }

    @GetMapping
    BillingMonth month(@RequestParam String month) {
        return billing.month(month);
    }

    @PostMapping("/generate")
    GenerateChargesResult generate(@Valid @RequestBody GenerateChargesRequest request) {
        return billing.generate(request);
    }
}

@Service
class BillingService {
    private static final Logger log = LoggerFactory.getLogger(BillingService.class);

    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final ContributionRepository contributions;
    private final PixChargeRepository pixCharges;
    private final SettingsRepository settingsRepository;
    private final PixService pix;
    private final GatewayCredentials credentials;
    private final DashboardEventService dashboardEvents;
    private final AuditService audit;

    BillingService(
        HouseRepository houses,
        ResidentRepository residents,
        ContributionRepository contributions,
        PixChargeRepository pixCharges,
        SettingsRepository settingsRepository,
        PixService pix,
        GatewayCredentials credentials,
        DashboardEventService dashboardEvents,
        AuditService audit
    ) {
        this.houses = houses;
        this.residents = residents;
        this.contributions = contributions;
        this.pixCharges = pixCharges;
        this.settingsRepository = settingsRepository;
        this.pix = pix;
        this.credentials = credentials;
        this.dashboardEvents = dashboardEvents;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    BillingMonth month(String month) {
        YearMonth reference = parseMonth(month);
        Settings settings = settings();
        LocalDate today = BudgetVotingService.today();
        Map<Long, List<Contribution>> byHouse = contributions.findByReferenceMonthOrderByHouseIdAsc(reference.toString()).stream()
            .sorted(Comparator.comparing((Contribution c) -> c.createdAt).thenComparing(c -> c.id))
            .collect(Collectors.groupingBy(c -> c.houseId, LinkedHashMap::new, Collectors.toList()));

        // Every active unit, and any other unit that still has something this month (its money must not disappear).
        List<House> units = new ArrayList<>(houses.findByActiveTrueOrderByNumberAsc());
        byHouse.keySet().stream()
            .filter(houseId -> units.stream().noneMatch(house -> house.id.equals(houseId)))
            .forEach(houseId -> houses.findById(houseId).ifPresent(units::add));

        List<BillingRow> rows = new ArrayList<>();
        int unitsToCharge = 0;
        for (House house : units) {
            Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").orElse(null);
            List<Contribution> own = byHouse.getOrDefault(house.id, List.of());
            if (resident != null && eligible(own)) {
                unitsToCharge++;
            }
            if (own.isEmpty()) {
                rows.add(new BillingRow(house.id, house.label, resident == null ? null : resident.name, null, null, null, null, null,
                    resident == null ? "NO_RESIDENT" : "NOT_CHARGED", false, false, null, null, null));
                continue;
            }
            for (Contribution contribution : own) {
                PixCharge charge = chargeOf(contribution);
                String name = contribution.residentId == null ? null
                    : residents.findById(contribution.residentId).map(found -> found.name).orElse(resident == null ? null : resident.name);
                rows.add(new BillingRow(
                    house.id,
                    house.label,
                    name,
                    contribution.id,
                    charge == null ? null : charge.id,
                    contribution.amount,
                    contribution.paidAmount,
                    charge == null ? null : charge.dueDate,
                    status(contribution, charge, today),
                    charge != null && charge.externalReference != null && charge.externalReference.contains("-EXTRA-"),
                    contribution.manualPayment,
                    charge == null ? null : charge.invoiceUrl,
                    charge == null ? null : charge.receiptUrl,
                    charge != null && charge.paidAt != null ? charge.paidAt : contribution.paymentDate
                ));
            }
        }

        BigDecimal expected = BigDecimal.ZERO;
        BigDecimal received = BigDecimal.ZERO;
        BigDecimal open = BigDecimal.ZERO;
        BigDecimal overdue = BigDecimal.ZERO;
        int paid = 0;
        int pending = 0;
        int late = 0;
        for (BillingRow row : rows) {
            if (row.contributionId() == null || "CANCELLED".equals(row.status())) {
                continue;
            }
            expected = expected.add(row.amount());
            switch (row.status()) {
                case "PAID" -> {
                    received = received.add(row.paidAmount() == null || row.paidAmount().signum() == 0 ? row.amount() : row.paidAmount());
                    paid++;
                }
                case "OVERDUE" -> {
                    overdue = overdue.add(row.amount());
                    late++;
                }
                default -> {
                    open = open.add(row.amount());
                    pending++;
                }
            }
        }
        return new BillingMonth(
            reference.toString(),
            credentials.connectedHere(),
            settings.monthlyAmount,
            configuredDueDate(reference, settings),
            unitsToCharge,
            new BillingTotals(expected, received, open, overdue, paid, pending, late),
            rows
        );
    }

    /**
     * Issues the month's charge of every unit with a resident, one unit at a time. A unit already charged this month is
     * left as it is (asking twice never charges twice); one that fails is reported with the reason and the rest go on.
     */
    GenerateChargesResult generate(GenerateChargesRequest request) {
        if (!credentials.connectedHere()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conecte a conta Asaas em Configurações antes de gerar as cobranças.");
        }
        YearMonth reference = parseMonth(request.month());
        LocalDate dueDate = request.dueDate() != null ? request.dueDate() : configuredDueDate(reference, settings());
        if (!YearMonth.from(dueDate).equals(reference)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O vencimento precisa ser dentro do mês da cobrança.");
        }
        // Asaas refuses a due date in the past: better to say so once than to fail every unit.
        if (dueDate.isBefore(BudgetVotingService.today())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O vencimento já passou. Escolha uma data a partir de hoje.");
        }
        String month = reference.toString();
        int created = 0;
        int alreadyCharged = 0;
        List<UnitProblem> failed = new ArrayList<>();
        List<UnitProblem> skipped = new ArrayList<>();
        for (House house : houses.findByActiveTrueOrderByNumberAsc()) {
            Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").orElse(null);
            if (resident == null) {
                skipped.add(new UnitProblem(house.label, "Sem morador com acesso ao aplicativo."));
                continue;
            }
            List<Contribution> own = contributions.findByHouseIdAndReferenceMonthOrderByCreatedAtAsc(house.id, month);
            if (own.stream().anyMatch(contribution -> chargeOf(contribution) != null)) {
                alreadyCharged++;
                continue;
            }
            if (!eligible(own)) {
                skipped.add(new UnitProblem(house.label, "Já registrada como paga neste mês."));
                continue;
            }
            try {
                pix.generateStandardCharge(month, request.amount(), dueDate, resident.id);
                created++;
            } catch (ResponseStatusException refused) {
                failed.add(new UnitProblem(house.label, refused.getReason() == null ? "O Asaas recusou esta cobrança." : refused.getReason()));
            } catch (RuntimeException unexpected) {
                log.warn("Charge for {} in {} failed", house.label, month, unexpected);
                failed.add(new UnitProblem(house.label, "Não consegui criar agora. Tente de novo em instantes."));
            }
        }
        if (created > 0 || !failed.isEmpty()) {
            audit.record("CHARGES_GENERATED", "BILLING", null, month + ": " + created + " cobrança(s) criada(s)"
                + (failed.isEmpty() ? "" : ", " + failed.size() + " com erro"));
        }
        if (created > 0) {
            dashboardEvents.publishDashboardChanged();
        }
        return new GenerateChargesResult(month, created, alreadyCharged, failed, skipped);
    }

    /** A unit gets the month's charge when it has none yet and nothing of the month was already paid outside the system. */
    private boolean eligible(List<Contribution> own) {
        return own.stream().noneMatch(contribution -> chargeOf(contribution) != null || "PAID".equals(contribution.status));
    }

    private PixCharge chargeOf(Contribution contribution) {
        return contribution.pixChargeId == null
            ? pixCharges.findByContributionId(contribution.id).orElse(null)
            : pixCharges.findById(contribution.pixChargeId).orElse(null);
    }

    private static String status(Contribution contribution, PixCharge charge, LocalDate today) {
        if ("PAID".equals(contribution.status) || "CANCELLED".equals(contribution.status)) {
            return contribution.status;
        }
        boolean late = "OVERDUE".equals(contribution.status)
            || charge != null && ("OVERDUE".equals(charge.status) || charge.dueDate != null && charge.dueDate.isBefore(today));
        return late ? "OVERDUE" : "PENDING";
    }

    private Settings settings() {
        return settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
    }

    private static LocalDate configuredDueDate(YearMonth reference, Settings settings) {
        return reference.atDay(Math.min(settings.paymentDueDay == null ? 10 : settings.paymentDueDay, reference.lengthOfMonth()));
    }

    private static YearMonth parseMonth(String month) {
        try {
            YearMonth reference = YearMonth.parse(month == null ? "" : month.trim());
            if (reference.isBefore(YearMonth.of(2020, 1)) || reference.isAfter(YearMonth.now().plusMonths(18))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha um mês entre 2020 e os próximos 18 meses.");
            }
            return reference;
        } catch (DateTimeParseException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o mês no formato AAAA-MM.");
        }
    }
}
