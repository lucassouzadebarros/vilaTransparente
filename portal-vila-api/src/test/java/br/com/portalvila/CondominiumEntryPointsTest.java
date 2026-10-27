package br.com.portalvila;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The ways in that have nobody signed in, or that run by themselves, still land in the right condominium: an
 * invitation code, a document link, the voting schedule, the "reload" stream, and the síndico of each condominium.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CondominiumEntryPointsTest {
    private static final long VILA = TenantContext.VILA;
    private static final long OTHER = 2L;

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired AppUserRepository users;
    @Autowired HouseInviteRepository inviteRows;
    @Autowired HouseInviteService invites;
    @Autowired PortalDocumentRepository documents;
    @Autowired ExpenseRepository expenses;
    @Autowired BudgetRepository budgets;
    @Autowired CondominiumRepository condominiums;
    @Autowired ServiceOrderWorkflow workflow;
    @Autowired VotingSchedule schedule;
    @Autowired SindicoService sindico;
    @Autowired DashboardEventService events;
    @MockBean PixGatewayClient gatewayClient;

    /** The database is shared with the other tests: each test removes what it made, in the condominium it made it in. */
    private final List<Runnable> cleanup = new ArrayList<>();

    @AfterEach
    void removeWhatThisTestCreated() {
        TenantContext.clear();
        Collections.reverse(cleanup);
        cleanup.forEach(Runnable::run);
        cleanup.clear();
    }

    private static <T> T asOther(Supplier<T> work) {
        return TenantContext.callAs(OTHER, work);
    }

    private void undo(long condominium, Runnable removal) {
        cleanup.add(() -> TenantContext.runAs(condominium, removal));
    }

    private House house() {
        int number = 9000 + ThreadLocalRandom.current().nextInt(900);
        House saved = houses.save(new House(number, "Casa " + number));
        undo(TenantContext.current(), () -> houses.deleteById(saved.id));
        return saved;
    }

    private AppUser resident(House house, String role) {
        String email = "morador-" + UUID.randomUUID() + "@teste.dev";
        Resident person = residents.save(new Resident(house.id, "Morador", email, null, null));
        AppUser account = users.save(new AppUser("Morador", email, "x", role, person.id));
        long condominium = TenantContext.current();
        undo(condominium, () -> residents.deleteById(person.id));
        cleanup.add(() -> users.deleteById(account.id));
        return account;
    }

    private long stamp(String table, Long id) {
        return jdbc.queryForObject("select condominium_id from " + table + " where id = ?", Long.class, id);
    }

    @Test
    void anInvitationCodeOpensItsHouseInTheCondominiumItWasMadeIn() throws Exception {
        House house = asOther(this::house);
        String code = asOther(() -> invites.issue(house.id).code());
        undo(OTHER, () -> inviteRows.deleteAll(inviteRows.findAll()));
        String caller = "test-" + UUID.randomUUID();
        String email = "convidado-" + UUID.randomUUID() + "@teste.dev";
        when(gatewayClient.createOrUpdateCustomer(any())).thenReturn(new GatewayCustomer("cus_test_outro"));

        String checked = mvc.perform(post("/api/residents/invite-check").header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(checked).contains(house.label);

        mvc.perform(post("/api/residents/register-with-invite").header("X-Forwarded-For", caller).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + code + "\",\"name\":\"Pessoa Convidada\",\"email\":\"" + email + "\",\"phone\":\"21999990000\","
                    + "\"documentNumber\":\"52998224725\",\"password\":\"SenhaBoa123\"}"))
            .andExpect(status().isOk());

        AppUser account = users.findByEmailIgnoreCase(email).orElseThrow();
        cleanup.add(() -> users.deleteById(account.id));
        undo(OTHER, () -> residents.deleteById(account.residentId));
        assertThat(account.condominiumId).isEqualTo(OTHER);
        assertThat(stamp("residents", account.residentId)).isEqualTo(OTHER);
        assertThat(residents.findById(account.residentId)).isEmpty();
        // The code is spent in its own condominium.
        mvc.perform(post("/api/residents/invite-check").header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void aDocumentLinkOpensTheDocumentOfItsOwnCondominium(@TempDir Path folder) throws Exception {
        Path file = Files.writeString(folder.resolve("ata.pdf"), "%PDF-1.4 ata de teste");
        PortalDocument document = new PortalDocument();
        document.name = "Ata";
        document.type = "ATA";
        document.url = "pending";
        document.storagePath = file.toString();
        PortalDocument saved = asOther(() -> documents.save(document));
        undo(OTHER, () -> documents.deleteById(saved.id));

        String link = asOther(() -> jwt.issueDocumentToken(saved.id));
        mvc.perform(get("/api/documents/" + saved.id + "/file").param("t", link)).andExpect(status().isOk());

        // A link made in the Vila for that number does not reach another condominium's document.
        String vilaLink = jwt.issueDocumentToken(saved.id);
        mvc.perform(get("/api/documents/" + saved.id + "/file").param("t", vilaLink)).andExpect(status().isNotFound());
    }

    @Test
    void choosingTheSindicoOfOneCondominiumLeavesTheOthersAlone() {
        AppUser vilaSindico = resident(house(), "SINDICO");
        AppUser neighbour = asOther(() -> resident(house(), "RESIDENT"));

        asOther(() -> sindico.choose(neighbour.residentId));

        assertThat(users.findById(vilaSindico.id).orElseThrow().role).isEqualTo("SINDICO");
        assertThat(users.findById(neighbour.id).orElseThrow().role).isEqualTo("SINDICO");
        assertThat(asOther(() -> sindico.current().residentId())).isEqualTo(neighbour.residentId);
    }

    @Test
    void theVotingScheduleClosesExpiredVotingsInEveryCondominium() {
        Condominium first = condominiums.save(new Condominium("Condominio A", "a-" + UUID.randomUUID()));
        Condominium second = condominiums.save(new Condominium("Condominio B", "b-" + UUID.randomUUID()));
        cleanup.add(() -> condominiums.deleteAllById(List.of(first.id, second.id)));
        Budget inFirst = TenantContext.callAs(first.id, () -> expiredBudget("Do primeiro"));
        Budget inSecond = TenantContext.callAs(second.id, () -> expiredBudget("Do segundo"));

        schedule.closeExpiredVotings();

        assertThat(TenantContext.callAs(first.id, () -> budgets.findById(inFirst.id)).orElseThrow().status).isNotEqualTo(inFirst.status);
        assertThat(TenantContext.callAs(second.id, () -> budgets.findById(inSecond.id)).orElseThrow().status).isNotEqualTo(inSecond.status);
    }

    private Budget expiredBudget(String title) {
        Budget budget = new Budget();
        budget.title = title;
        budget.supplier = "Fornecedor";
        budget.amount = new BigDecimal("100.00");
        budget.votingDeadline = BudgetVotingService.today();
        Budget saved = workflow.saveBudget(budget);
        long condominium = TenantContext.current();
        undo(condominium, () -> budgets.deleteById(saved.id));
        Budget stored = budgets.findById(saved.id).orElseThrow();
        stored.votingDeadline = BudgetVotingService.today().minusDays(1);
        return budgets.save(stored);
    }

    @Test
    void aChangeOnlyReachesTheOpenScreensOfItsCondominium() throws Exception {
        MvcResult vilaScreen = mvc.perform(get("/api/events/dashboard")).andExpect(request().asyncStarted()).andReturn();
        MvcResult otherScreen = mvc.perform(get("/api/events/dashboard").param("condominium", String.valueOf(OTHER)))
            .andExpect(request().asyncStarted()).andReturn();

        TenantContext.runAs(OTHER, events::publishDashboardChanged);

        long until = System.currentTimeMillis() + 5000;
        while (!otherScreen.getResponse().getContentAsString().contains("dashboard-changed") && System.currentTimeMillis() < until) {
            Thread.sleep(20);
        }
        assertThat(otherScreen.getResponse().getContentAsString()).contains("dashboard-changed");
        assertThat(vilaScreen.getResponse().getContentAsString()).contains("connected").doesNotContain("dashboard-changed");
    }

    @Test
    void lookingAcrossCondominiumsSeesThemAllAndThenComesBack() {
        Expense mine = expenses.save(expense("da Vila"));
        Expense theirs = asOther(() -> expenses.save(expense("do outro")));
        undo(VILA, () -> expenses.deleteById(mine.id));
        undo(OTHER, () -> expenses.deleteById(theirs.id));

        List<Long> everywhere = TenantContext.callAcrossCondominiums(() -> expenses.findAll().stream().map(row -> row.id).toList());

        assertThat(everywhere).contains(mine.id, theirs.id);
        assertThat(expenses.findAll().stream().map(row -> row.id).toList()).contains(mine.id).doesNotContain(theirs.id);
    }

    private static Expense expense(String description) {
        Expense expense = new Expense();
        expense.description = description;
        expense.amount = BigDecimal.ONE;
        return expense;
    }
}
