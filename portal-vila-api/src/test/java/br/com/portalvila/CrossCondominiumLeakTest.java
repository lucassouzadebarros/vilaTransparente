package br.com.portalvila;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * The Vila's data, marked with a word nobody else uses, against every route the API has: called by the administrator
 * of another condominium (and then by nobody signed in), with the Vila's ids in every place a route takes an id, and
 * with every method (a delete or an update by id is a leak too). No answer may carry the mark, and the Vila's rows must
 * all be there, unchanged, afterwards. The routes come from Spring itself, so a route added later is covered too.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CrossCondominiumLeakTest {
    private static final long OTHER = 2L;
    /** A stream that stays open ("reload" events); it carries no data. */
    private static final Set<String> NOT_CALLED = Set.of("/api/events/dashboard", "/error");

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping routes;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired AppUserRepository users;
    @Autowired ExpenseRepository expenses;
    @Autowired BudgetRepository budgets;
    @Autowired ProblemReportRepository reports;
    @Autowired ProblemReportEventRepository reportEvents;
    @Autowired ServiceOrderRepository services;
    @Autowired ContributionRepository contributions;
    @Autowired DirectReceiptRepository receipts;
    @Autowired PortalDocumentRepository documents;
    @Autowired HouseInviteRepository invites;
    @Autowired AuditService audit;
    @Autowired SettingsRepository settings;
    @Autowired BudgetVoteRepository votes;
    @Autowired PixChargeRepository pixCharges;
    @Autowired AuditEntryRepository auditEntries;
    @Autowired ExcludedGatewayPaymentRepository excludedPayments;
    @Autowired WebhookEventRepository webhookEvents;
    @MockBean PixGatewayClient gatewayClient;

    @TempDir Path folder;

    private final String mark = "VAZOU-" + UUID.randomUUID();
    private final List<Long> vilaIds = new ArrayList<>();
    private final List<Runnable> cleanup = new ArrayList<>();
    private House house;
    private Resident resident;
    private Expense expense;
    private Budget budget;
    private ProblemReport report;
    private ServiceOrder service;
    private PortalDocument document;
    private String otherAdmin;

    @BeforeEach
    void theVilaHasMarkedDataAndAnotherCondominiumHasAnAdministrator() throws Exception {
        house = houses.save(new House(9500 + ThreadLocalRandom.current().nextInt(400), mark));
        resident = residents.save(new Resident(house.id, mark, "vila-" + UUID.randomUUID() + "@teste.dev", null, null));
        AppUser vilaAccount = users.save(new AppUser(mark, resident.email, "x", "RESIDENT", resident.id));

        expense = new Expense();
        expense.description = mark;
        expense.supplier = mark;
        expense.amount = new BigDecimal("12.34");
        expense = expenses.save(expense);

        budget = new Budget();
        budget.title = mark;
        budget.supplier = mark;
        budget = budgets.save(budget);

        report = new ProblemReport();
        report.title = mark;
        report.location = mark;
        report.category = "OUTRO";
        report.description = mark;
        report = reports.save(report);

        ProblemReportEvent event = new ProblemReportEvent();
        event.reportId = report.id;
        event.kind = "COMMENT";
        event.message = mark;
        event = reportEvents.save(event);

        service = new ServiceOrder();
        service.title = mark;
        service.description = mark;
        service = services.save(service);

        Contribution contribution = new Contribution();
        contribution.houseId = house.id;
        contribution.residentId = resident.id;
        contribution.referenceMonth = YearMonth.now().toString();
        contribution = contributions.save(contribution);

        DirectReceipt receipt = new DirectReceipt();
        receipt.gatewayPaymentId = "pay_" + mark;
        receipt.referenceMonth = YearMonth.now().toString();
        receipt = receipts.save(receipt);

        Path file = Files.writeString(folder.resolve("ata.pdf"), "%PDF-1.4 " + mark);
        document = new PortalDocument();
        document.name = mark;
        document.type = "ATA";
        document.url = "pending";
        document.storagePath = file.toString();
        document = documents.save(document);

        HouseInvite invite = new HouseInvite();
        invite.houseId = house.id;
        invite.codeHash = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        invite.createdBy = mark;
        invite.expiresAt = LocalDateTime.now().plusDays(1);
        invite = invites.save(invite);

        audit.record("TESTE_VAZAMENTO", "EXPENSE", expense.id, mark);

        // A notice from the Vila's Asaas account (not filtered by condominium: it arrives before anyone knows whose it is).
        WebhookEvent notice = new WebhookEvent();
        notice.eventId = "evt_" + mark;
        notice.eventType = "PAYMENT_RECEIVED";
        notice.gatewayPaymentId = "pay_" + mark;
        notice.payloadJson = "{\"payment\":{\"description\":\"" + mark + "\"}}";
        WebhookEvent storedNotice = webhookEvents.save(notice);
        cleanup.add(() -> webhookEvents.deleteById(storedNotice.id));

        vilaIds.addAll(List.of(house.id, resident.id, vilaAccount.id, expense.id, budget.id, report.id, event.id, service.id,
            contribution.id, receipt.id, document.id, invite.id));

        AppUser administrator = new AppUser("Admin do outro", "admin-outro-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null);
        administrator.condominiumId = OTHER;
        administrator = users.save(administrator);
        otherAdmin = "Bearer " + jwt.issue(administrator);

        long[] ids = {house.id, resident.id, expense.id, budget.id, report.id, event.id, service.id, contribution.id, receipt.id, document.id, invite.id};
        Long vilaAccountId = vilaAccount.id;
        Long administratorId = administrator.id;
        cleanup.add(() -> {
            users.deleteById(vilaAccountId);
            users.deleteById(administratorId);
            TenantContext.runAs(TenantContext.VILA, () -> {
                invites.findById(ids[10]).ifPresent(invites::delete);
                documents.findById(ids[9]).ifPresent(documents::delete);
                receipts.findById(ids[8]).ifPresent(receipts::delete);
                contributions.findById(ids[7]).ifPresent(contributions::delete);
                services.findById(ids[6]).ifPresent(services::delete);
                reportEvents.findById(ids[5]).ifPresent(reportEvents::delete);
                reports.findById(ids[4]).ifPresent(reports::delete);
                budgets.findById(ids[3]).ifPresent(budgets::delete);
                expenses.findById(ids[2]).ifPresent(expenses::delete);
                residents.findById(ids[1]).ifPresent(residents::delete);
                houses.findById(ids[0]).ifPresent(houses::delete);
            });
        });
    }

    @AfterEach
    void removeTheVilaDataAndWhatTheSweepMadeElsewhere() {
        Collections.reverse(cleanup);
        cleanup.forEach(Runnable::run);
        cleanup.clear();
        // Calling every route as the other condominium creates its own rows (its default settings, say): not the Vila's,
        // but the other tests expect condominium 2 to hold only what they put there.
        TenantContext.runAs(OTHER, () -> List.of(settings, votes, budgets, pixCharges, contributions, receipts, expenses, services,
                reportEvents, reports, documents, invites, auditEntries, excludedPayments, residents, houses)
            .forEach(repository -> repository.deleteAll()));
    }

    @Test
    void theAdministratorOfAnotherCondominiumReachesNothingOfTheVilaOnAnyRoute() {
        Sweep sweep = sweep(otherAdmin);

        assertThat(sweep.leaks).as("routes that answered with the Vila's data").isEmpty();
        assertThat(sweep.calls).as("routes called").isGreaterThan(300);
        theVilaDataIsUntouched();
    }

    @Test
    void nobodySignedInReachesNothingOfTheVilaEither() {
        // As in the running app: a request without an account runs with no condominium.
        TenantContext.clear();
        Sweep sweep = sweep(null);
        TenantContext.set(TenantContext.VILA);

        assertThat(sweep.leaks).as("routes that answered with the Vila's data").isEmpty();
        theVilaDataIsUntouched();
    }

    private void theVilaDataIsUntouched() {
        assertThat(houses.findById(house.id).orElseThrow().label).isEqualTo(mark);
        Resident stillThere = residents.findById(resident.id).orElseThrow();
        assertThat(stillThere.name).isEqualTo(mark);
        assertThat(stillThere.status).isEqualTo(resident.status);
        assertThat(expenses.findById(expense.id).orElseThrow().description).isEqualTo(mark);
        Budget budgetNow = budgets.findById(budget.id).orElseThrow();
        assertThat(budgetNow.title).isEqualTo(mark);
        assertThat(budgetNow.status).isEqualTo(budget.status);
        assertThat(reports.findById(report.id).orElseThrow().title).isEqualTo(mark);
        assertThat(services.findById(service.id).orElseThrow().title).isEqualTo(mark);
        assertThat(documents.findById(document.id).orElseThrow().name).isEqualTo(mark);
        assertThat(invites.findAll().stream().filter(invite -> mark.equals(invite.createdBy)).toList()).hasSize(1)
            .allSatisfy(invite -> assertThat(invite.revokedAt).isNull());
    }

    private record Sweep(int calls, Set<String> leaks) {
    }

    /** Every route, every method it takes, with each of the Vila's ids wherever the route takes one. */
    private Sweep sweep(String authorization) {
        int calls = 0;
        Set<String> leaks = new TreeSet<>();
        for (RequestMappingInfo route : routes.getHandlerMethods().keySet()) {
            Set<RequestMethod> methods = route.getMethodsCondition().getMethods();
            for (String pattern : route.getPatternValues()) {
                if (NOT_CALLED.contains(pattern) || !pattern.startsWith("/api/")) {
                    continue;
                }
                for (RequestMethod method : methods.isEmpty() ? Set.of(RequestMethod.GET) : methods) {
                    boolean takesId = pattern.contains("{");
                    if (!takesId && method != RequestMethod.GET) {
                        continue; // creating something new is not a way into the Vila's data
                    }
                    for (Long id : takesId ? vilaIds : List.of(0L)) {
                        String path = pattern.replaceAll("\\{[^}]+}", String.valueOf(id));
                        calls++;
                        String answer = call(method, path, authorization);
                        if (answer.contains(mark)) {
                            leaks.add(method + " " + pattern + " (id " + id + ")");
                        }
                    }
                }
            }
        }
        return new Sweep(calls, leaks);
    }

    private String call(RequestMethod method, String path, String authorization) {
        MockHttpServletRequestBuilder builder = request(HttpMethod.valueOf(method.name()), path)
            .param("month", YearMonth.now().toString());
        if (method != RequestMethod.GET) {
            builder.contentType(MediaType.APPLICATION_JSON).content("{}");
        }
        if (authorization != null) {
            builder.header("Authorization", authorization);
        }
        try {
            return mvc.perform(builder).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        } catch (Exception failed) {
            // An error that escapes the controller carries no data back; only the text of the error could.
            return String.valueOf(failed.getMessage());
        }
    }
}
