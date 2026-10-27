package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Whether a condominium may be used. A suspended one keeps its data; its people cannot get in until it is reactivated. */
@Component
class CondominiumAccess {
    static final String SUSPENDED_MESSAGE = "O acesso a este condomínio está suspenso. Fale com a administração da plataforma.";

    private final CondominiumRepository condominiums;

    CondominiumAccess(CondominiumRepository condominiums) {
        this.condominiums = condominiums;
    }

    boolean suspended(Long condominiumId) {
        return condominiumId != null && condominiums.findById(condominiumId)
            .map(condominium -> Condominium.SUSPENDED.equals(condominium.status))
            .orElse(false);
    }
}

/** What the platform panel changes: condominiums are created, renamed, suspended and reactivated here. */
@Service
class PlatformService {
    static final Set<String> UNIT_LABELS = Set.of("Casa", "Apto", "Unidade", "Lote", "Sala");
    static final int MAX_UNITS = 2000;

    private final CondominiumRepository condominiums;
    private final SettingsRepository settings;
    private final HouseRepository houses;
    private final ResidentRepository residents;
    private final AppUserRepository users;
    private final AuditEntryRepository auditEntries;
    private final AuditService audit;
    private final TransactionTemplate transaction;
    private final ManagerInviteService managers;
    private final CondominiumRequestService requests;

    PlatformService(
        CondominiumRepository condominiums,
        SettingsRepository settings,
        HouseRepository houses,
        ResidentRepository residents,
        AppUserRepository users,
        AuditEntryRepository auditEntries,
        AuditService audit,
        PlatformTransactionManager transactionManager,
        ManagerInviteService managers,
        CondominiumRequestService requests
    ) {
        this.managers = managers;
        this.requests = requests;
        this.condominiums = condominiums;
        this.settings = settings;
        this.houses = houses;
        this.residents = residents;
        this.users = users;
        this.auditEntries = auditEntries;
        this.audit = audit;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    List<CondominiumSummary> list() {
        return condominiums.findAll().stream().map(this::summary).toList();
    }

    CondominiumDetail detail(Long id) {
        Condominium condominium = find(id);
        return TenantContext.callAs(id, () -> {
            AppUser sindico = users.findByCondominiumIdAndRole(id, "SINDICO").stream()
                .filter(user -> user.active && user.residentId != null)
                .findFirst()
                .orElse(null);
            String sindicoHouse = sindico == null ? null : residents.findById(sindico.residentId)
                .flatMap(resident -> houses.findById(resident.houseId))
                .map(house -> house.label)
                .orElse(null);
            long administrators = users.findByCondominiumIdAndRole(id, "ADMIN").stream().filter(user -> user.active).count();
            List<CondominiumActivity> activity = auditEntries.findTop12ByOrderByCreatedAtDescIdDesc().stream()
                .map(entry -> new CondominiumActivity(entry.action, entry.summary, entry.actorEmail, entry.createdAt))
                .toList();
            return new CondominiumDetail(summary(condominium), sindico == null ? null : sindico.name, sindicoHouse, administrators,
                managers.pending(id).orElse(null), activity);
        });
    }

    /**
     * Approving a request creates the condominium (with its units and settings) and invites whoever will run it. The
     * e-mail is checked first, so a taken e-mail stops everything before anything is created.
     */
    ApprovalResult approve(Long requestId, ApproveCondominiumRequest input) {
        CondominiumRequest request = requests.pendingRequest(requestId);
        String managerName = blank(input.managerName()) ? request.contactName : input.managerName();
        String managerEmail = blank(input.managerEmail()) ? request.contactEmail : input.managerEmail();
        managers.assertEmailAvailable(managerEmail, null);
        ManagerInviteService.cleanName(managerName);

        CondominiumSummary created = create(new CreateCondominiumRequest(
            blank(input.name()) ? request.condominiumName : input.name(),
            input.slug(),
            input.unitLabel(),
            input.units() == null ? request.units : input.units()
        ));
        ManagerInviteService.Issued issued = managers.invite(created.id(), managerName, managerEmail);
        requests.approved(request, created.id());
        return new ApprovalResult(created, invitation(issued));
    }

    /** Invites (or invites again, with a new code) whoever will run a condominium. */
    ManagerInvitation inviteManager(Long condominiumId, InviteManagerRequest input) {
        return invitation(managers.invite(find(condominiumId).id, input.name(), input.email()));
    }

    private static ManagerInvitation invitation(ManagerInviteService.Issued issued) {
        return new ManagerInvitation(issued.account().name, issued.account().email, issued.code(), issued.expiresAt());
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * A new condominium with its own settings and its units. Two steps: the condominium first (it is not inside any
     * condominium), then everything inside it in a transaction opened as that condominium; if the second step fails,
     * the first is undone.
     */
    CondominiumSummary create(CreateCondominiumRequest request) {
        String name = cleanName(request.name());
        String slug = slugOf(request.slug() == null || request.slug().isBlank() ? name : request.slug());
        String unitLabel = request.unitLabel() == null ? "Casa" : request.unitLabel().trim();
        if (!UNIT_LABELS.contains(unitLabel)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha o tipo de unidade: Casa, Apto, Unidade, Lote ou Sala.");
        }
        int units = request.units() == null ? 0 : request.units();
        if (units < 0 || units > MAX_UNITS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O número de unidades vai de 0 a " + MAX_UNITS + ".");
        }
        if (condominiums.existsBySlug(slug)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe um condomínio com o identificador \"" + slug + "\". Escolha outro.");
        }

        Condominium condominium = condominiums.save(new Condominium(name, slug));
        try {
            TenantContext.runAs(condominium.id, () -> transaction.executeWithoutResult(status -> {
                Settings own = new Settings();
                own.villageName = name;
                settings.save(own);
                for (int number = 1; number <= units; number++) {
                    houses.save(new House(number, unitLabel + " " + (number < 10 ? "0" + number : String.valueOf(number))));
                }
                audit.record("CONDOMINIUM_CREATED", "CONDOMINIUM", condominium.id,
                    name + " - " + (units == 0 ? "sem unidades" : units == 1 ? "1 unidade" : units + " unidades"));
            }));
        } catch (RuntimeException failure) {
            condominiums.deleteById(condominium.id);
            throw failure;
        }
        return summary(condominium);
    }

    CondominiumSummary rename(Long id, String newName) {
        Condominium condominium = find(id);
        String name = cleanName(newName);
        String before = condominium.name;
        condominium.name = name;
        condominiums.save(condominium);
        TenantContext.runAs(id, () -> transaction.executeWithoutResult(status -> {
            settings.findAll().stream().findFirst().ifPresent(own -> {
                own.villageName = name;
                settings.save(own);
            });
            audit.record("CONDOMINIUM_RENAMED", "CONDOMINIUM", id, before + " -> " + name);
        }));
        return summary(condominium);
    }

    CondominiumSummary changeStatus(Long id, String status) {
        Condominium condominium = find(id);
        if (!Condominium.ACTIVE.equals(status) && !Condominium.SUSPENDED.equals(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Situação inválida.");
        }
        if (Condominium.SUSPENDED.equals(status) && id == TenantContext.VILA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A Vila não pode ser suspensa pelo painel.");
        }
        if (!status.equals(condominium.status)) {
            condominium.status = status;
            condominiums.save(condominium);
            TenantContext.runAs(id, () -> audit.record(
                Condominium.SUSPENDED.equals(status) ? "CONDOMINIUM_SUSPENDED" : "CONDOMINIUM_REACTIVATED",
                "CONDOMINIUM", id, condominium.name));
        }
        return summary(condominium);
    }

    private Condominium find(Long id) {
        return condominiums.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Condomínio não encontrado."));
    }

    private CondominiumSummary summary(Condominium condominium) {
        return TenantContext.callAs(condominium.id, () -> new CondominiumSummary(
            condominium.id,
            condominium.name,
            condominium.slug,
            condominium.status,
            condominium.createdAt,
            houses.countByActiveTrue(),
            residents.countByStatus("ACTIVE"),
            PixGatewayClient.connectedHere()
        ));
    }

    private static String cleanName(String raw) {
        String name = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (name.length() < 3 || name.length() > 140) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O nome do condomínio precisa ter de 3 a 140 letras.");
        }
        return name;
    }

    /** "Residencial São José" -> "residencial-sao-jose": no accents, lower case, dashes, at most 60 characters. */
    static String slugOf(String raw) {
        String slug = Normalizer.normalize(raw == null ? "" : raw, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-+|-+$)", "");
        if (slug.length() > 60) {
            slug = slug.substring(0, 60).replaceAll("-+$", "");
        }
        if (slug.length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O identificador precisa ter letras ou números.");
        }
        return slug;
    }
}
