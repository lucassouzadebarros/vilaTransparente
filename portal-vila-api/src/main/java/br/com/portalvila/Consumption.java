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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Water and gas by the meter: the month's readings of each unit, and the charge of what each one used. */
@RestController
@RequestMapping("/api/admin/readings")
@PreAuthorize("hasRole('ADMIN')")
class ReadingsController {
    private final ReadingsService readings;

    ReadingsController(ReadingsService readings) {
        this.readings = readings;
    }

    @GetMapping
    ReadingsView month(@RequestParam String month, @RequestParam String kind) {
        return readings.view(month, kind);
    }

    @PutMapping
    ReadingsView save(@RequestParam String month, @RequestParam String kind, @RequestBody SaveReadingsRequest request) {
        return readings.save(month, kind, request);
    }

    @PostMapping("/charge")
    GenerateChargesResult charge(@RequestParam String month, @RequestParam String kind, @Valid @RequestBody ChargeReadingsRequest request) {
        return readings.charge(month, kind, request);
    }
}

@Service
class ReadingsService {
    private static final Logger log = LoggerFactory.getLogger(ReadingsService.class);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MM/yyyy");

    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final MeterReadingRepository readings;
    private final ContributionRepository contributions;
    private final SettingsRepository settingsRepository;
    private final PixService pix;
    private final GatewayCredentials credentials;
    private final DashboardEventService dashboardEvents;
    private final AuditService audit;

    ReadingsService(
        HouseRepository houses,
        ResidentRepository residents,
        MeterReadingRepository readings,
        ContributionRepository contributions,
        SettingsRepository settingsRepository,
        PixService pix,
        GatewayCredentials credentials,
        DashboardEventService dashboardEvents,
        AuditService audit
    ) {
        this.houses = houses;
        this.residents = residents;
        this.readings = readings;
        this.contributions = contributions;
        this.settingsRepository = settingsRepository;
        this.pix = pix;
        this.credentials = credentials;
        this.dashboardEvents = dashboardEvents;
        this.audit = audit;
    }

    /** Every active unit's reading of the month; the reading before comes from the month before when there is one. */
    @Transactional(readOnly = true)
    ReadingsView view(String month, String kind) {
        String reference = parseMonth(month).toString();
        String meter = parseKind(kind);
        Settings settings = settings();
        Map<Long, MeterReading> saved = readings.findByKindAndReferenceMonth(meter, reference).stream()
            .collect(Collectors.toMap(reading -> reading.houseId, Function.identity()));
        List<ReadingRow> rows = new ArrayList<>();
        BigDecimal totalConsumption = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (House house : houses.findByActiveTrueOrderByNumberAsc()) {
            MeterReading reading = saved.get(house.id);
            MeterReading before = readings.findFirstByHouseIdAndKindAndReferenceMonthLessThanOrderByReferenceMonthDesc(house.id, meter, reference)
                .orElse(null);
            String chargeStatus = reading == null || reading.contributionId == null ? null
                : contributions.findById(reading.contributionId).map(contribution -> contribution.status).orElse(null);
            rows.add(new ReadingRow(
                house.id,
                house.label,
                residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").map(resident -> resident.name).orElse(null),
                before != null ? before.reading : reading == null ? null : reading.previousReading,
                before != null,
                reading == null ? null : reading.reading,
                reading == null ? null : reading.consumption,
                reading == null ? null : reading.amount,
                reading == null ? null : reading.contributionId,
                chargeStatus
            ));
            if (reading != null && reading.consumption != null) {
                totalConsumption = totalConsumption.add(reading.consumption);
            }
            if (reading != null && reading.amount != null) {
                totalAmount = totalAmount.add(reading.amount);
            }
        }
        return new ReadingsView(reference, meter, price(settings, meter), totalConsumption, totalAmount, rows);
    }

    /**
     * Keeps the month's readings and the price of the cubic meter. A reading already charged does not change any more; a
     * unit with no reading typed is left as it was.
     */
    @Transactional
    ReadingsView save(String month, String kind, SaveReadingsRequest request) {
        String reference = parseMonth(month).toString();
        String meter = parseKind(kind);
        BigDecimal price = request.unitPrice();
        if (price == null || price.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o preço do metro cúbico.");
        }
        price = price.setScale(4, RoundingMode.HALF_UP);
        Settings settings = settingsRepository.findAll().stream().findFirst().orElseGet(() -> settingsRepository.save(new Settings()));
        if (MeterReading.WATER.equals(meter)) {
            settings.waterPrice = price;
        } else {
            settings.gasPrice = price;
        }
        settings.updatedAt = LocalDateTime.now();
        settingsRepository.save(settings);

        int saved = 0;
        for (ReadingInput input : request.readings() == null ? List.<ReadingInput>of() : request.readings()) {
            if (input.reading() == null) {
                continue;
            }
            House house = houses.findById(input.houseId()).filter(found -> found.active)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unidade não encontrada."));
            if (input.reading().signum() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, house.label + ": a leitura não pode ser negativa.");
            }
            MeterReading reading = readings.findByHouseIdAndKindAndReferenceMonth(house.id, meter, reference).orElseGet(MeterReading::new);
            BigDecimal previous = readings.findFirstByHouseIdAndKindAndReferenceMonthLessThanOrderByReferenceMonthDesc(house.id, meter, reference)
                .map(before -> before.reading)
                .orElse(input.previousReading());
            if (reading.contributionId != null) {
                if (!sameNumber(reading.reading, input.reading()) || !sameNumber(reading.previousReading, previous)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, house.label + " já foi cobrada: a leitura não muda mais.");
                }
                continue;
            }
            if (previous != null && input.reading().compareTo(previous) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, house.label + ": a leitura atual ("
                    + plain(input.reading()) + ") é menor que a anterior (" + plain(previous) + ").");
            }
            reading.houseId = house.id;
            reading.kind = meter;
            reading.referenceMonth = reference;
            reading.previousReading = previous;
            reading.reading = input.reading();
            reading.consumption = previous == null ? null : input.reading().subtract(previous).setScale(3, RoundingMode.HALF_UP);
            reading.unitPrice = price;
            reading.amount = reading.consumption == null ? null : reading.consumption.multiply(price).setScale(2, RoundingMode.HALF_UP);
            reading.recordedBy = PaymentsService.currentEmail();
            reading.updatedAt = LocalDateTime.now();
            readings.save(reading);
            saved++;
        }
        audit.record("READINGS_SAVED", "METER_READING", null,
            label(meter) + " " + reference + ": " + saved + " leitura(s), " + AuditService.money(price) + " o m³");
        return view(reference, meter);
    }

    /**
     * Charges what each unit used, one unit at a time, as a one-off charge next to the month's own. A reading becomes
     * one charge only: asking again leaves the charged ones as they are.
     */
    GenerateChargesResult charge(String month, String kind, ChargeReadingsRequest request) {
        if (!credentials.connectedHere()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conecte a conta Asaas em Configurações antes de cobrar.");
        }
        String reference = parseMonth(month).toString();
        String meter = parseKind(kind);
        if (request.dueDate().isBefore(BudgetVotingService.today())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O vencimento já passou. Escolha uma data a partir de hoje.");
        }
        Map<Long, House> byId = houses.findAll().stream().collect(Collectors.toMap(house -> house.id, Function.identity()));
        List<MeterReading> monthReadings = readings.findByKindAndReferenceMonth(meter, reference).stream()
            .filter(reading -> byId.containsKey(reading.houseId))
            .sorted(Comparator.comparing(reading -> byId.get(reading.houseId).number))
            .toList();
        int created = 0;
        int alreadyCharged = 0;
        List<UnitProblem> failed = new ArrayList<>();
        List<UnitProblem> skipped = new ArrayList<>();
        for (MeterReading reading : monthReadings) {
            House house = byId.get(reading.houseId);
            if (reading.contributionId != null) {
                alreadyCharged++;
                continue;
            }
            if (reading.amount == null || reading.amount.signum() <= 0) {
                skipped.add(new UnitProblem(house.label, reading.consumption == null
                    ? "Primeira leitura: fica guardada para o mês que vem."
                    : "Sem consumo no mês."));
                continue;
            }
            Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").orElse(null);
            if (resident == null) {
                skipped.add(new UnitProblem(house.label, "Sem morador com acesso ao aplicativo."));
                continue;
            }
            String purpose = label(meter) + " de " + YearMonth.parse(reference).format(MONTH) + ": " + plain(reading.consumption) + " m³";
            try {
                PixChargeResponse charge = pix.generateExtraCharge(purpose, reading.amount, request.dueDate(), resident.id);
                reading.contributionId = charge.contributionId();
                reading.updatedAt = LocalDateTime.now();
                readings.save(reading);
                created++;
            } catch (ResponseStatusException refused) {
                failed.add(new UnitProblem(house.label, refused.getReason() == null ? "O Asaas recusou esta cobrança." : refused.getReason()));
            } catch (RuntimeException unexpected) {
                log.warn("Consumption charge for {} failed", house.label, unexpected);
                failed.add(new UnitProblem(house.label, "Não consegui criar agora. Tente de novo em instantes."));
            }
        }
        if (created > 0 || !failed.isEmpty()) {
            audit.record("CONSUMPTION_CHARGED", "METER_READING", null, label(meter) + " " + reference + ": " + created
                + " cobrança(s) criada(s)" + (failed.isEmpty() ? "" : ", " + failed.size() + " com erro"));
        }
        if (created > 0) {
            dashboardEvents.publishDashboardChanged();
        }
        return new GenerateChargesResult(YearMonth.from(request.dueDate()).toString(), created, alreadyCharged, failed, skipped);
    }

    private Settings settings() {
        return settingsRepository.findAll().stream().findFirst().orElseGet(Settings::new);
    }

    private static BigDecimal price(Settings settings, String meter) {
        return MeterReading.WATER.equals(meter) ? settings.waterPrice : settings.gasPrice;
    }

    private static String label(String meter) {
        return MeterReading.WATER.equals(meter) ? "Água" : "Gás";
    }

    /** 12.500 -> "12,5" */
    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    private static boolean sameNumber(BigDecimal left, BigDecimal right) {
        return left == null ? right == null : right != null && left.compareTo(right) == 0;
    }

    private static String parseKind(String kind) {
        String meter = kind == null ? "" : kind.trim().toUpperCase();
        if (!MeterReading.WATER.equals(meter) && !MeterReading.GAS.equals(meter)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha água ou gás.");
        }
        return meter;
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
