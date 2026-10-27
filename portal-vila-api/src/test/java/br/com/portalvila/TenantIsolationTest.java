package br.com.portalvila;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.Advised;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.orm.jpa.JpaObjectRetrievalFailureException;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Two condominiums share one database. Whatever one of them does through the repositories must stay out of reach of the
 * other: reads, lookups by id, derived queries, locked reads and deletes. The Vila is condominium 1; these tests make no
 * condominium rows (the schema here has no foreign keys), so "2" is just another number.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TenantIsolationTest {
    private static final long VILA = TenantContext.VILA;
    private static final long OTHER = 2L;

    @Autowired ApplicationContext context;
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired ExpenseRepository expenses;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired HouseRepository houses;
    @Autowired SettingsRepository settings;
    @Autowired AppUserRepository users;
    @MockBean PixGatewayClient gatewayClient;

    /** What a test created, removed afterwards: the database is shared with the other tests, whose rows must stay. */
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

    private <T> T inTransaction(Supplier<T> work) {
        return new TransactionTemplate(transactionManager).execute(status -> work.get());
    }

    private Expense expense(String description) {
        Expense expense = new Expense();
        expense.description = description;
        expense.amount = BigDecimal.TEN;
        Expense saved = expenses.save(expense);
        long owner = TenantContext.current();
        cleanup.add(() -> TenantContext.runAs(owner, () -> expenses.deleteById(saved.id)));
        return saved;
    }

    private Budget budget(String title) {
        Budget budget = new Budget();
        budget.title = title;
        budget.supplier = "Fornecedor";
        Budget saved = budgets.save(budget);
        long owner = TenantContext.current();
        cleanup.add(() -> TenantContext.runAs(owner, () -> budgets.deleteById(saved.id)));
        return saved;
    }

    private House house(int number) {
        House saved = houses.save(new House(number, "Casa " + number));
        long owner = TenantContext.current();
        cleanup.add(() -> TenantContext.runAs(owner, () -> houses.deleteById(saved.id)));
        return saved;
    }

    private long stamp(String table, Long id) {
        return jdbc.queryForObject("select condominium_id from " + table + " where id = ?", Long.class, id);
    }

    private static List<Long> ids(List<? extends Object> rows) {
        return rows.stream().map(row -> {
            try {
                return (Long) row.getClass().getField("id").get(row);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        }).toList();
    }

    @Test
    void aNewRowIsStampedWithTheCondominiumItWasCreatedIn() {
        Expense mine = expense("do condominio 1");
        Expense theirs = asOther(() -> expense("do condominio 2"));

        assertThat(stamp("expenses", mine.id)).isEqualTo(VILA);
        assertThat(stamp("expenses", theirs.id)).isEqualTo(OTHER);
    }

    @Test
    void listingOnlyReturnsTheCurrentCondominium() {
        Expense mine = expense("do condominio 1");
        Expense theirs = asOther(() -> expense("do condominio 2"));

        assertThat(ids(expenses.findAll())).contains(mine.id).doesNotContain(theirs.id);
        assertThat(asOther(() -> ids(expenses.findAll()))).contains(theirs.id).doesNotContain(mine.id);
    }

    @Test
    void guessingAnIdFromAnotherCondominiumFindsNothing() {
        Expense theirs = asOther(() -> expense("do condominio 2"));

        assertThat(expenses.findById(theirs.id)).isEmpty();
        assertThat(expenses.existsById(theirs.id)).isFalse();
        assertThat(asOther(() -> expenses.findById(theirs.id))).isPresent();
    }

    @Test
    void anotherCondominiumsRowCannotBeDeletedByItsId() {
        Expense theirs = asOther(() -> expense("do condominio 2"));

        // Asking to delete something that is not visible must not remove it (it may fail or do nothing, never delete).
        try {
            expenses.deleteById(theirs.id);
        } catch (RuntimeException ignored) {
            // acceptable: the row is not visible from here
        }

        assertThat(asOther(() -> expenses.findById(theirs.id))).isPresent();
    }

    @Test
    void anotherCondominiumsRowCannotBeOverwrittenFromHere() {
        Expense theirs = asOther(() -> expense("do condominio 2"));
        // A copy with that id, as if built from a request: saving it here must not reach the original.
        theirs.description = "alterado de fora";

        assertThatThrownBy(() -> expenses.save(theirs))
            .isInstanceOfAny(EntityNotFoundException.class, JpaObjectRetrievalFailureException.class);
        assertThat(asOther(() -> expenses.findById(theirs.id)).orElseThrow().description).isEqualTo("do condominio 2");
    }

    @Test
    void everyRepositoryUsesTheCondominiumAwareBase() throws Exception {
        var repositories = context.getBeansOfType(JpaRepository.class).values();
        assertThat(repositories).hasSize(21);
        for (JpaRepository<?, ?> repository : repositories) {
            assertThat(((Advised) repository).getTargetSource().getTarget()).isInstanceOf(TenantAwareRepository.class);
        }
    }

    @Test
    void derivedQueriesAndTheLockedReadAreFiltered() {
        Budget theirs = asOther(() -> budget("orcamento do condominio 2"));

        assertThat(ids(budgets.findByStatus(theirs.status))).doesNotContain(theirs.id);
        assertThat(asOther(() -> ids(budgets.findByStatus(theirs.status)))).contains(theirs.id);

        assertThat(inTransaction(() -> budgets.findByIdForUpdate(theirs.id))).isEmpty();
        assertThat(asOther(() -> inTransaction(() -> budgets.findByIdForUpdate(theirs.id)))).isPresent();
    }

    @Test
    void aDerivedDeleteOnlyTouchesTheCurrentCondominium() {
        Budget theirs = asOther(() -> budget("orcamento do condominio 2"));
        BudgetVote vote = new BudgetVote();
        vote.budgetId = theirs.id;
        vote.houseId = 1L;
        vote.residentId = 1L;
        vote.vote = "APPROVE";
        BudgetVote saved = asOther(() -> votes.save(vote));
        cleanup.add(() -> TenantContext.runAs(OTHER, () -> votes.deleteById(saved.id)));

        inTransaction(() -> {
            votes.deleteByBudgetId(theirs.id);
            return null;
        });

        assertThat(asOther(() -> votes.findByBudgetId(theirs.id))).hasSize(1);
    }

    @Test
    void settingsAreOnePerCondominium() {
        Settings theirs = asOther(() -> settings.save(new Settings()));
        cleanup.add(() -> TenantContext.runAs(OTHER, () -> settings.deleteById(theirs.id)));

        assertThat(ids(settings.findAll())).doesNotContain(theirs.id);
        assertThat(asOther(() -> ids(settings.findAll()))).containsExactly(theirs.id);
    }

    @Test
    void aHouseNumberCanRepeatInAnotherCondominiumButNotInTheSame() {
        int number = 9000 + ThreadLocalRandom.current().nextInt(900);
        house(number);

        asOther(() -> house(number));
        assertThatThrownBy(() -> houses.saveAndFlush(new House(number, "Casa repetida")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theAccountIsFoundWhicheverCondominiumItBelongsTo() {
        // Signing in looks the account up before any condominium is known, so accounts are not filtered.
        AppUser account = new AppUser("Gestor do condominio 2", "gestor-" + UUID.randomUUID() + "@teste.dev", "hash", "ADMIN", null);
        account.condominiumId = OTHER;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));

        assertThat(users.findByEmailIgnoreCase(account.email)).isPresent();
        assertThat(stamp("app_users", saved.id)).isEqualTo(OTHER);
    }

    @Test
    void aRequestRunsAsTheCondominiumOfTheSignedInAccount() throws Exception {
        String mineName = "so do condominio 1 " + UUID.randomUUID();
        String theirsName = "so do condominio 2 " + UUID.randomUUID();
        expense(mineName);
        asOther(() -> expense(theirsName));
        AppUser vilaAdmin = users.save(new AppUser("Admin 1", "admin1-" + UUID.randomUUID() + "@teste.dev", "hash", "ADMIN", null));
        AppUser otherAdmin = new AppUser("Admin 2", "admin2-" + UUID.randomUUID() + "@teste.dev", "hash", "ADMIN", null);
        otherAdmin.condominiumId = OTHER;
        users.save(otherAdmin);
        cleanup.add(() -> users.deleteById(vilaAdmin.id));
        cleanup.add(() -> users.deleteById(otherAdmin.id));

        String fromVila = mvc.perform(get("/api/expenses").header("Authorization", "Bearer " + jwt.issue(vilaAdmin)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String fromOther = mvc.perform(get("/api/expenses").header("Authorization", "Bearer " + jwt.issue(otherAdmin)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(fromVila).contains(mineName).doesNotContain(theirsName);
        assertThat(fromOther).contains(theirsName).doesNotContain(mineName);
        // The column is internal: the API answers look exactly as before.
        assertThat(fromVila).doesNotContain("condominiumId");
        // And the condominium of one request does not leak into the next one on the same thread.
        assertThat(TenantContext.current()).isEqualTo(VILA);
    }

    @Test
    void theCondominiumIsRestoredAfterWorkingAsAnotherOne() {
        TenantContext.runAs(OTHER, () -> TenantContext.runAs(3L, () -> assertThat(TenantContext.current()).isEqualTo(3L)));
        assertThat(TenantContext.current()).isEqualTo(VILA);

        TenantContext.set(OTHER);
        TenantContext.runAs(3L, () -> assertThat(TenantContext.current()).isEqualTo(3L));
        assertThat(TenantContext.current()).isEqualTo(OTHER);
    }
}
