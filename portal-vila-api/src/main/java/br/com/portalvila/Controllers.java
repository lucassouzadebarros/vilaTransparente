package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@CrossOrigin
@RequestMapping("/api/auth")
class AuthController {
    private final AppUserRepository users;
    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PixGatewayClient gatewayClient;

    AuthController(
        AppUserRepository users,
        ResidentRepository residents,
        HouseRepository houses,
        PasswordEncoder passwordEncoder,
        JwtService jwtService,
        PixGatewayClient gatewayClient
    ) {
        this.users = users;
        this.residents = residents;
        this.houses = houses;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.gatewayClient = gatewayClient;
    }

    @PostMapping("/login")
    LoginResponse login(@Valid @RequestBody LoginRequest request) {
        AppUser user = users.findByEmailIgnoreCase(request.email())
            .filter(u -> u.active)
            .filter(u -> passwordEncoder.matches(request.password(), u.passwordHash))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciais invalidas."));
        return new LoginResponse(jwtService.issue(user), user.name, user.email, user.role, user.residentId);
    }

    @PostMapping("/register-resident")
    ResidentRegistrationResponse registerResident(@Valid @RequestBody ResidentRegistrationRequest request) {
        House house = houses.findById(request.houseId())
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa nao encontrada."));
        if (house.number == null || house.number < 2 || house.number > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cadastro publico permitido apenas para as casas 02 a 10.");
        }
        if (residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Casa ja possui morador cadastrado.");
        }
        String normalizedEmail = request.email().trim().toLowerCase();
        users.findByEmailIgnoreCase(normalizedEmail).ifPresent(user -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado.");
        });
        if (request.password().trim().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A senha precisa ter pelo menos 6 caracteres.");
        }

        Resident resident = new Resident();
        resident.houseId = house.id;
        resident.name = request.name().trim();
        resident.email = normalizedEmail;
        resident.phone = request.phone().trim();
        resident.documentNumber = onlyDigits(request.documentNumber());
        validateDocument(resident.documentNumber);
        resident.documentMasked = maskDocument(resident.documentNumber);
        resident.status = "ACTIVE";

        GatewayCustomer customer = gatewayClient.createOrUpdateCustomer(resident);
        resident.gatewayCustomerId = customer.id();
        Resident saved = residents.save(resident);
        users.save(new AppUser(
            saved.name,
            saved.email,
            passwordEncoder.encode(request.password()),
            "RESIDENT",
            saved.id
        ));

        return new ResidentRegistrationResponse(
            saved.id,
            saved.houseId,
            house.number,
            house.label,
            saved.name,
            saved.email,
            saved.gatewayCustomerId
        );
    }

    private String onlyDigits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private void validateDocument(String document) {
        if (!(document.length() == 11 || document.length() == 14)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe CPF com 11 digitos ou CNPJ com 14 digitos.");
        }
    }

    private String maskDocument(String document) {
        if (document.length() <= 11) {
            String suffix = document.length() < 2 ? document : document.substring(document.length() - 2);
            return "***.***.***-" + suffix;
        }
        String suffix = document.substring(Math.max(0, document.length() - 2));
        return "**.***.***/****-" + suffix;
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class DashboardController {
    private final FinancialService financialService;
    private final CurrentUserService currentUser;

    DashboardController(FinancialService financialService, CurrentUserService currentUser) {
        this.financialService = financialService;
        this.currentUser = currentUser;
    }

    @GetMapping("/dashboard")
    DashboardResponse dashboard(@RequestParam(required = false) String month) {
        String referenceMonth = month == null ? YearMonth.now().toString() : month;
        return currentUser.isAdmin()
            ? financialService.dashboard(referenceMonth)
            : financialService.dashboardForResident(referenceMonth, currentUser.requiredResidentId());
    }

    @GetMapping("/reports")
    DashboardResponse reports(@RequestParam(required = false) String month) {
        return dashboard(month);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/contributions")
class ContributionController {
    private final FinancialService financialService;
    private final ContributionRepository contributions;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final CurrentUserService currentUser;

    ContributionController(
        FinancialService financialService,
        ContributionRepository contributions,
        HouseRepository houses,
        ResidentRepository residents,
        CurrentUserService currentUser
    ) {
        this.financialService = financialService;
        this.contributions = contributions;
        this.houses = houses;
        this.residents = residents;
        this.currentUser = currentUser;
    }

    @GetMapping
    List<ContributionResponse> list(@RequestParam String month) {
        return currentUser.isAdmin()
            ? financialService.listContributions(month)
            : financialService.listContributionsForResident(month, currentUser.requiredResidentId());
    }

    @GetMapping("/{id}")
    ContributionResponse get(@PathVariable Long id) {
        Contribution contribution = contributions.findById(id).orElseThrow();
        currentUser.assertContributionAccess(contribution);
        return financialService.toContributionResponse(
            contribution,
            houses.findById(contribution.houseId).orElse(null),
            contribution.residentId == null ? null : residents.findById(contribution.residentId).orElse(null)
        );
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/contributions")
@PreAuthorize("hasRole('ADMIN')")
class AdminContributionController {
    private final FinancialService financialService;

    AdminContributionController(FinancialService financialService) {
        this.financialService = financialService;
    }

    @PostMapping("/monthly")
    List<ContributionResponse> generateMonthly(@Valid @RequestBody MonthlyChargeRequest request) {
        return financialService.generateMonthlyContributions(request.month(), request.amount());
    }

    @PostMapping("/{id}/manual-payment")
    ContributionResponse manualPayment(@PathVariable Long id, @Valid @RequestBody ManualPaymentRequest request) {
        return financialService.markManualPayment(id, request);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class PixController {
    private final PixService pixService;
    private final CurrentUserService currentUser;

    PixController(PixService pixService, CurrentUserService currentUser) {
        this.pixService = pixService;
        this.currentUser = currentUser;
    }

    @GetMapping({"/pix/charges", "/pix-charges"})
    List<PixChargeResponse> listCharges(@RequestParam String month) {
        return currentUser.isAdmin()
            ? pixService.listCharges(month)
            : pixService.listChargesForResident(month, currentUser.requiredResidentId());
    }

    @GetMapping({"/pix/charges/{id}", "/pix-charges/{id}"})
    PixChargeResponse getCharge(@PathVariable Long id) {
        PixChargeResponse response = pixService.getCharge(id);
        currentUser.assertHouseAccess(response.houseId());
        return response;
    }

    @PostMapping("/admin/pix/monthly-charges")
    @PreAuthorize("hasRole('ADMIN')")
    List<PixChargeResponse> generateCharges(@Valid @RequestBody MonthlyChargeRequest request) {
        return pixService.generateMonthlyCharges(request.month(), request.amount());
    }

    @PostMapping("/admin/pix/house-charge")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse generateHouseCharge(@Valid @RequestBody HouseMonthlyChargeRequest request) {
        return pixService.generateHouseCharge(request.month(), request.amount(), request.houseId());
    }

    @PostMapping("/admin/pix/charges/{id}/refresh-qrcode")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse refresh(@PathVariable Long id) {
        return pixService.refreshQrCode(id);
    }

    @PostMapping("/admin/pix/charges/{id}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    PixChargeResponse cancel(@PathVariable Long id, @Valid @RequestBody CancelRequest request) {
        return pixService.cancel(id, request);
    }

    @PostMapping("/admin/pix/reconcile")
    @PreAuthorize("hasRole('ADMIN')")
    List<PixChargeResponse> reconcile(@RequestParam String month) {
        return pixService.reconcile(month);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api")
class WebhookController {
    private final WebhookService webhookService;
    private final WebhookEventRepository events;

    WebhookController(WebhookService webhookService, WebhookEventRepository events) {
        this.webhookService = webhookService;
        this.events = events;
    }

    @PostMapping("/webhooks/asaas")
    WebhookResult asaas(@RequestHeader(value = "asaas-access-token", required = false) String token, @RequestBody JsonNode payload) {
        return webhookService.processAsaas(token, payload);
    }

    @GetMapping("/admin/webhook-events")
    @PreAuthorize("hasRole('ADMIN')")
    List<WebhookEvent> eventLog() {
        return events.findTop100ByOrderByCreatedAtDesc();
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/expenses")
class ExpenseController {
    private final ExpenseRepository expenses;

    ExpenseController(ExpenseRepository expenses) {
        this.expenses = expenses;
    }

    @GetMapping
    List<Expense> list() {
        return expenses.findAll();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    Expense create(@RequestBody Expense expense) {
        if (expense.expenseDate == null) {
            expense.expenseDate = LocalDate.now();
        }
        return expenses.save(expense);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/services")
class ServiceOrderController {
    private final ServiceOrderWorkflow workflow;
    private final ServiceOrderRepository services;
    private final BudgetRepository budgets;

    ServiceOrderController(ServiceOrderWorkflow workflow, ServiceOrderRepository services, BudgetRepository budgets) {
        this.workflow = workflow;
        this.services = services;
        this.budgets = budgets;
    }

    @GetMapping
    List<ServiceOrder> list(@RequestParam(required = false) String status) {
        return workflow.listServices(status);
    }

    @GetMapping("/{id}")
    ServiceOrder get(@PathVariable Long id) {
        return services.findById(id).orElseThrow();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    ServiceOrder create(@RequestBody ServiceOrder service) {
        return workflow.saveService(service);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    ServiceOrder update(@PathVariable Long id, @RequestBody ServiceOrder service) {
        return workflow.updateService(id, service);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Map<String, String> delete(@PathVariable Long id) {
        workflow.cancelService(id);
        return Map.of("status", "CANCELADO");
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    Map<String, String> cancel(@PathVariable Long id) {
        workflow.cancelService(id);
        return Map.of("status", "CANCELADO");
    }

    @GetMapping("/{id}/budgets")
    List<Budget> budgets(@PathVariable Long id) {
        return budgets.findByServiceIdOrderByAmountAsc(id);
    }

    @PostMapping("/{id}/budgets")
    @PreAuthorize("hasRole('ADMIN')")
    Budget createBudget(@PathVariable Long id, @RequestBody Budget budget) {
        return workflow.saveBudget(id, budget);
    }

    @PostMapping("/{id}/finish")
    @PreAuthorize("hasRole('ADMIN')")
    ServiceOrder finish(@PathVariable Long id, @Valid @RequestBody FinishServiceRequest request) {
        return workflow.finishService(id, request);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/budgets")
class BudgetController {
    private final BudgetRepository budgets;
    private final ServiceOrderWorkflow workflow;

    BudgetController(BudgetRepository budgets, ServiceOrderWorkflow workflow) {
        this.budgets = budgets;
        this.workflow = workflow;
    }

    @GetMapping
    List<Budget> list() {
        return budgets.findAll();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    Budget create(@RequestBody Budget budget) {
        return workflow.saveBudget(budget.serviceId, budget);
    }

    @GetMapping("/{id}")
    Budget get(@PathVariable Long id) {
        return budgets.findById(id).orElseThrow();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Budget update(@PathVariable Long id, @RequestBody Budget budget) {
        return workflow.updateBudget(id, budget);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Map<String, String> delete(@PathVariable Long id) {
        Budget budget = budgets.findById(id).orElseThrow();
        budget.status = "CANCELADO";
        budgets.save(budget);
        return Map.of("status", "CANCELADO");
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    Budget approve(@PathVariable Long id) {
        return workflow.approveBudget(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    Budget reject(@PathVariable Long id) {
        return workflow.rejectBudget(id);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/documents")
class DocumentController {
    private final PortalDocumentRepository documents;
    private final CurrentUserService currentUser;
    private final Path uploadRoot;

    DocumentController(
        PortalDocumentRepository documents,
        CurrentUserService currentUser,
        @Value("${portal.uploads.dir:uploads/documents}") String uploadDir
    ) {
        this.documents = documents;
        this.currentUser = currentUser;
        this.uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    @GetMapping
    List<PortalDocument> list(@RequestParam(required = false) String relatedType, @RequestParam(required = false) Long relatedId) {
        if (relatedType != null && relatedId != null) {
            return documents.findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc(relatedType, relatedId);
        }
        return documents.findAll();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    PortalDocument create(@RequestBody PortalDocument document) {
        document.uploadedBy = currentUser.current().id;
        return documents.save(document);
    }

    @PostMapping("/upload")
    @PreAuthorize("hasRole('ADMIN')")
    PortalDocument upload(
        @RequestParam String name,
        @RequestParam(defaultValue = "DOCUMENT") String type,
        @RequestParam(required = false) String relatedType,
        @RequestParam(required = false) Long relatedId,
        @RequestParam(required = false) String description,
        @RequestParam(required = false) MultipartFile file
    ) throws IOException {
        PortalDocument document = new PortalDocument();
        document.name = name;
        document.type = type;
        document.relatedType = relatedType;
        document.relatedId = relatedId;
        document.description = description;
        document.uploadedBy = currentUser.current().id;

        if (file == null || file.isEmpty()) {
            document.url = "local://" + name;
            return documents.save(document);
        }

        Files.createDirectories(uploadRoot);
        String originalName = file.getOriginalFilename() == null ? "document.pdf" : file.getOriginalFilename();
        String extension = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.')) : ".pdf";
        String storedName = UUID.randomUUID() + extension;
        Path destination = uploadRoot.resolve(storedName).normalize();
        file.transferTo(destination);

        document.storagePath = destination.toString();
        document.url = "pending";
        PortalDocument saved = documents.save(document);
        saved.url = "/api/documents/" + saved.id + "/file";
        return documents.save(saved);
    }

    @GetMapping("/{id}/file")
    ResponseEntity<Resource> file(@PathVariable Long id) throws MalformedURLException {
        PortalDocument document = documents.findById(id).orElseThrow();
        if (document.storagePath == null || document.storagePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Arquivo nao encontrado.");
        }
        Path path = Paths.get(document.storagePath).toAbsolutePath().normalize();
        Resource resource = new UrlResource(path.toUri());
        if (!resource.exists() || !resource.isReadable()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Arquivo nao encontrado.");
        }
        String filename = path.getFileName().toString();
        MediaType type = filename.toLowerCase().endsWith(".pdf") ? MediaType.APPLICATION_PDF : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
            .contentType(type)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
            .body(resource);
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/residents")
class ResidentController {
    private final ResidentRepository residents;
    private final HouseRepository houses;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final PixGatewayClient gatewayClient;

    ResidentController(
        ResidentRepository residents,
        HouseRepository houses,
        AppUserRepository users,
        PasswordEncoder passwordEncoder,
        PixGatewayClient gatewayClient
    ) {
        this.residents = residents;
        this.houses = houses;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.gatewayClient = gatewayClient;
    }

    @GetMapping("/registration-houses")
    List<RegistrationHouseOption> registrationHouses() {
        return houses.findByActiveTrueOrderByNumberAsc().stream()
            .filter(house -> house.number != null && house.number >= 2 && house.number <= 10)
            .map(house -> new RegistrationHouseOption(
                house.id,
                house.number,
                house.label,
                residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isEmpty()
            ))
            .toList();
    }

    @PostMapping("/self-registration")
    ResidentRegistrationResponse selfRegistration(@Valid @RequestBody ResidentRegistrationRequest request) {
        House house = houses.findById(request.houseId())
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa nao encontrada."));
        if (house.number == null || house.number < 2 || house.number > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cadastro publico permitido apenas para as casas 02 a 10.");
        }
        if (request.password().trim().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A senha precisa ter pelo menos 6 caracteres.");
        }
        Resident saved = createResidentAccount(
            house.id,
            request.name(),
            request.email(),
            request.phone(),
            request.documentNumber(),
            request.password(),
            false
        );
        return new ResidentRegistrationResponse(
            saved.id,
            saved.houseId,
            house.number,
            house.label,
            saved.name,
            saved.email,
            saved.gatewayCustomerId
        );
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    List<Resident> list() {
        return residents.findAllByOrderByHouseIdAsc();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    Resident create(@RequestBody Resident resident) {
        return createResidentAccount(
            resident.houseId,
            resident.name,
            resident.email,
            resident.phone,
            resident.documentNumber,
            "123456",
            true
        );
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Resident update(@PathVariable Long id, @RequestBody Resident incoming) {
        Resident resident = residents.findById(id).orElseThrow();
        users.findByEmailIgnoreCase(incoming.email)
            .filter(user -> user.residentId == null || !user.residentId.equals(id))
            .ifPresent(user -> {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado.");
            });
        resident.name = incoming.name;
        resident.email = incoming.email;
        resident.phone = incoming.phone;
        resident.status = incoming.status == null || incoming.status.isBlank() ? resident.status : incoming.status;
        if (incoming.documentNumber != null && !incoming.documentNumber.isBlank()) {
            resident.documentNumber = onlyDigits(incoming.documentNumber);
            resident.documentMasked = maskDocument(resident.documentNumber);
            resident.gatewayCustomerId = null;
        }
        syncGatewayCustomer(resident);
        resident = residents.save(resident);
        syncResidentUser(resident);
        return resident;
    }

    @PostMapping("/{id}/sync-asaas")
    @PreAuthorize("hasRole('ADMIN')")
    Resident syncAsaas(@PathVariable Long id) {
        Resident resident = residents.findById(id).orElseThrow();
        syncGatewayCustomer(resident);
        return residents.save(resident);
    }

    private void syncGatewayCustomer(Resident resident) {
        GatewayCustomer customer = gatewayClient.createOrUpdateCustomer(resident);
        resident.gatewayCustomerId = customer.id();
    }

    private Resident createResidentAccount(
        Long houseId,
        String name,
        String email,
        String phone,
        String documentNumber,
        String password,
        boolean allowAnyHouse
    ) {
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa nao encontrada."));
        if (!allowAnyHouse && (house.number == null || house.number < 2 || house.number > 10)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cadastro publico permitido apenas para as casas 02 a 10.");
        }
        if (residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE").isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Casa ja possui morador cadastrado.");
        }
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        users.findByEmailIgnoreCase(normalizedEmail).ifPresent(user -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado.");
        });
        Resident resident = new Resident();
        resident.houseId = house.id;
        resident.name = name == null ? "" : name.trim();
        resident.email = normalizedEmail;
        resident.phone = phone == null ? "" : phone.trim();
        resident.documentNumber = documentNumber;
        resident.status = "ACTIVE";
        normalizeDocument(resident);
        validateDocument(resident.documentNumber);
        syncGatewayCustomer(resident);
        Resident saved = residents.save(resident);
        users.save(new AppUser(
            saved.name,
            saved.email,
            passwordEncoder.encode(password),
            "RESIDENT",
            saved.id
        ));
        return saved;
    }

    private void syncResidentUser(Resident resident) {
        AppUser user = users.findByResidentId(resident.id).orElseGet(() -> {
            AppUser created = new AppUser();
            created.role = "RESIDENT";
            created.residentId = resident.id;
            created.passwordHash = passwordEncoder.encode("123456");
            return created;
        });
        user.name = resident.name;
        user.email = resident.email;
        user.active = "ACTIVE".equals(resident.status);
        users.save(user);
    }

    private void normalizeDocument(Resident resident) {
        if (resident.documentNumber != null && !resident.documentNumber.isBlank()) {
            resident.documentNumber = onlyDigits(resident.documentNumber);
            resident.documentMasked = maskDocument(resident.documentNumber);
        }
    }

    private void validateDocument(String document) {
        if (document == null || !(document.length() == 11 || document.length() == 14)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe CPF com 11 digitos ou CNPJ com 14 digitos.");
        }
    }

    private String onlyDigits(String value) {
        return value == null ? null : value.replaceAll("\\D", "");
    }

    private String maskDocument(String document) {
        if (document == null || document.isBlank()) {
            return null;
        }
        if (document.length() <= 11) {
            String suffix = document.length() < 2 ? document : document.substring(document.length() - 2);
            return "***.***.***-" + suffix;
        }
        String suffix = document.substring(Math.max(0, document.length() - 2));
        return "**.***.***/****-" + suffix;
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/admin/houses")
@PreAuthorize("hasRole('ADMIN')")
class AdminHouseController {
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final AppUserRepository users;

    AdminHouseController(HouseRepository houses, ResidentRepository residents, AppUserRepository users) {
        this.houses = houses;
        this.residents = residents;
        this.users = users;
    }

    @PostMapping("/{houseId}/release")
    Resident release(@PathVariable Long houseId) {
        House house = houses.findById(houseId)
            .filter(candidate -> candidate.active)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Casa nao encontrada ou inativa."));
        Resident resident = residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(house.id, "ACTIVE")
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, house.label + " nao possui morador ativo para liberar."));

        resident.status = "INACTIVE";
        resident = residents.save(resident);

        users.findByResidentId(resident.id).ifPresent(user -> {
            user.active = false;
            users.save(user);
        });

        return resident;
    }
}

@RestController
@CrossOrigin
@RequestMapping("/api/settings")
class SettingsController {
    private final FinancialService financialService;

    SettingsController(FinancialService financialService) {
        this.financialService = financialService;
    }

    @GetMapping
    SettingsResponse get() {
        return SettingsResponse.from(financialService.settings());
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    SettingsResponse update(@RequestBody Settings settings) {
        return SettingsResponse.from(financialService.updateSettings(settings));
    }
}

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(InvalidWebhookTokenException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    Map<String, String> invalidWebhook(InvalidWebhookTokenException ex) {
        return Map.of("error", ex.getMessage());
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> responseStatus(ResponseStatusException ex) {
        String reason = ex.getReason();
        if (reason == null || reason.isBlank()) {
            reason = "Nao foi possivel concluir a solicitacao.";
        }
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("error", reason));
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    Map<String, String> notFound() {
        return Map.of("error", "Registro nao encontrado.");
    }
}
