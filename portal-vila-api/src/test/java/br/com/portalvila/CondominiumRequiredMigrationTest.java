package br.com.portalvila;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V25 takes away the "Vila by default" that V24 left on every table: a row saved without its condominium now fails
 * instead of landing in the Vila. The rows that were there keep their condominium.
 */
class CondominiumRequiredMigrationTest {
    private static final String URL = TestMigrations.url("condominium_required");

    @BeforeAll
    static void migrate() throws SQLException {
        TestMigrations.run(URL, 1, 24);
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            statement.execute("insert into expenses(description, amount, expense_date) values ('Antes da V25', 10, current_date)");
        }
        TestMigrations.run(URL, 25, 25);
    }

    @Test
    void aRowWithoutItsCondominiumIsRefused() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            assertThatThrownBy(() -> statement.execute("insert into expenses(description, amount, expense_date) values ('Sem condominio', 10, current_date)"))
                .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> statement.execute("insert into houses(number, label) values (90, 'Casa 90')"))
                .isInstanceOf(SQLException.class);
        }
    }

    @Test
    void aRowThatNamesItsCondominiumIsSavedAndOldRowsStayInTheVila() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            statement.execute("insert into houses(number, label, condominium_id) values (91, 'Casa 91', 1)");
            assertThat(count(statement, "select count(*) from houses where number = 91 and condominium_id = 1")).isEqualTo(1);
            assertThat(count(statement, "select count(*) from expenses where description = 'Antes da V25' and condominium_id = 1")).isEqualTo(1);
        }
    }

    private static long count(Statement statement, String sql) throws SQLException {
        ResultSet rows = statement.executeQuery(sql);
        rows.next();
        return rows.getLong(1);
    }
}
