package br.com.portalvila;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

/** V28: every condominium keeps charging as before (Pix, no fee, no interest); the Vila keeps calling it "Caixinha da Vila". */
class BillingRulesMigrationTest {
    private static final String URL = TestMigrations.url("billing_rules_migration");

    @BeforeAll
    static void twoCondominiumsBeforeV28() throws SQLException {
        TestMigrations.run(URL, 1, 27);
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            statement.execute("insert into condominiums(name, slug, status) values ('Jardim', 'jardim', 'ACTIVE')");
            statement.execute("insert into settings(village_name, monthly_amount, payment_due_day, gateway_provider, condominium_id) values ('Portal da Vila', 100, 10, 'ASAAS', 1)");
            statement.execute("insert into settings(village_name, monthly_amount, payment_due_day, gateway_provider, condominium_id) "
                + "select 'Jardim', 300, 5, 'ASAAS', id from condominiums where slug = 'jardim'");
        }
        TestMigrations.run(URL, 28, 29);
    }

    @Test
    void v29StartsWithNoReserveFundAndNoReminders() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            ResultSet rows = statement.executeQuery("select reserve_fund_percent, reminders_enabled, reminder_days_before from settings");
            while (rows.next()) {
                assertThat(rows.getBigDecimal("reserve_fund_percent")).isZero();
                assertThat(rows.getBoolean("reminders_enabled")).isFalse();
                assertThat(rows.getInt("reminder_days_before")).isEqualTo(3);
            }
        }
    }

    @Test
    void everyoneKeepsChargingAsBeforeAndTheVilaKeepsItsName() throws SQLException {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            ResultSet rows = statement.executeQuery("select condominium_id, billing_type, fine_percent, interest_percent, charge_title from settings order by condominium_id");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getLong("condominium_id")).isEqualTo(1L);
            assertThat(rows.getString("billing_type")).isEqualTo("PIX");
            assertThat(rows.getBigDecimal("fine_percent")).isZero();
            assertThat(rows.getBigDecimal("interest_percent")).isZero();
            assertThat(rows.getString("charge_title")).isEqualTo("Caixinha da Vila");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("billing_type")).isEqualTo("PIX");
            assertThat(rows.getString("charge_title")).isNull();
            assertThat(rows.next()).isFalse();
        }
    }
}
