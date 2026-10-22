package br.com.portalvila;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V24 turns the app into "several condominiums" without changing anything for the one that exists: the Vila becomes
 * condominium 1 and keeps every row it has. This runs V1..V23, stores data the way the Vila has it, applies V24 and
 * checks that nothing was lost or left without a condominium.
 *
 * The rule "a house number is unique inside its condominium" drops a constraint PostgreSQL named houses_number_key; H2
 * names it differently, so that part was checked on a real PostgreSQL 16 and is not asserted here.
 */
class CondominiumMigrationTest {
    private static final String URL = TestMigrations.url("condominium_migration");
    private static final List<String> TABLES = List.of(
        "app_users", "audit_log", "budget_votes", "budgets", "contributions", "direct_receipts", "documents",
        "excluded_gateway_payments", "expenses", "house_invites", "houses", "password_reset_codes", "pix_charges",
        "problem_report_events", "problem_reports", "push_tokens", "residents", "service_orders", "settings", "webhook_events"
    );

    /** Rows per table just before V24, to prove that none is lost or left behind. */
    private static final Map<String, Long> BEFORE = new HashMap<>();

    @BeforeAll
    static void migrateWithData() throws SQLException {
        TestMigrations.run(URL, 1, 23);
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            statement.execute("insert into settings(village_name, monthly_amount, payment_due_day, gateway_provider) values ('Portal da Vila', 100, 10, 'ASAAS')");
            for (int number = 1; number <= 3; number++) {
                statement.execute("insert into houses(number, label) values (" + number + ", 'Casa 0" + number + "')");
            }
            statement.execute("insert into residents(house_id, name, email, status) select id, 'Morador', 'morador' || number || '@teste.dev', 'ACTIVE' from houses");
            statement.execute("insert into app_users(name, email, password_hash, role) select name, email, 'hash', 'RESIDENT' from residents");
            statement.execute("insert into contributions(house_id, reference_month, amount, status) select id, '2026-10', 100, 'PENDENTE' from houses");
            statement.execute("insert into expenses(description, amount, expense_date) values ('Despesa', 50, current_date)");
            statement.execute("insert into audit_log(action) values ('EXPENSE_CREATED')");
            for (String table : TABLES) {
                BEFORE.put(table, count(statement, "select count(*) from " + table));
            }
        }
        TestMigrations.run(URL, 24, 24);
    }

    @Test
    void theVilaBecomesTheFirstCondominiumWithItsOwnName() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            ResultSet rows = statement.executeQuery("select id, name, slug, status from condominiums");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getLong("id")).isEqualTo(1L);
            assertThat(rows.getString("name")).isEqualTo("Portal da Vila");
            assertThat(rows.getString("slug")).isEqualTo("vila");
            assertThat(rows.getString("status")).isEqualTo("ACTIVE");
            assertThat(rows.next()).isFalse();
        }
    }

    @Test
    void everyRowThatExistedBelongsToTheVilaAndNothingWasLost() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            for (String table : TABLES) {
                assertThat(count(statement, "select count(*) from " + table + " where condominium_id is null"))
                    .as(table + " rows without a condominium").isZero();
                assertThat(count(statement, "select count(*) from " + table + " where condominium_id <> 1"))
                    .as(table + " rows outside the Vila").isZero();
                assertThat(count(statement, "select count(*) from " + table))
                    .as(table + " rows after V24").isEqualTo(BEFORE.get(table));
            }
            // The data the test stored is there, and it is not an empty comparison.
            assertThat(BEFORE.get("residents")).isEqualTo(4L);
            assertThat(BEFORE.get("contributions")).isEqualTo(4L);
            assertThat(BEFORE.get("expenses")).isEqualTo(1L);
        }
    }

    @Test
    void rowsStoredByTheCodeThatDoesNotKnowAboutCondominiumsYetStillLandInTheVila() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            statement.execute("insert into expenses(description, amount, expense_date) values ('Depois da migracao', 10, current_date)");
            try {
                assertThat(count(statement, "select count(*) from expenses where description = 'Depois da migracao' and condominium_id = 1")).isEqualTo(1);
            } finally {
                // The other tests compare row counts with the ones before V24.
                statement.execute("delete from expenses where description = 'Depois da migracao'");
            }
        }
    }

    @Test
    void aRowCannotPointAtACondominiumThatDoesNotExist() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            assertThatThrownBy(() -> statement.execute("insert into houses(number, label, condominium_id) values (90, 'Casa 90', 99)"))
                .isInstanceOf(SQLException.class);
        }
    }

    private static long count(Statement statement, String sql) throws SQLException {
        ResultSet rows = statement.executeQuery(sql);
        rows.next();
        return rows.getLong(1);
    }
}
