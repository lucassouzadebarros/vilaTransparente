package br.com.portalvila;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the real migrations (db/migration) on an in-memory H2 and lets Hibernate validate that every entity matches the
 * resulting tables. The other tests build the schema from the entities, so without this one a migration that forgets a
 * column would only fail when the API starts in production (ddl-auto is "validate" there).
 *
 * The migrations are written for PostgreSQL. A few old ones only move data or use PostgreSQL-only syntax, so they are
 * skipped here, and the one multi-column "add column" is split in two statements for H2. New migrations must stay
 * plain (one column per "alter table", ANSI types) so they run on both.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:migrations;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=validate"
})
class MigrationsTest {
    private static final String URL = "jdbc:h2:mem:migrations;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    /** Data-only or PostgreSQL-only: they do not change the schema. */
    private static final Set<String> SKIPPED = Set.of("V7", "V15");

    static {
        try (Connection connection = DriverManager.getConnection(URL, "sa", ""); Statement statement = connection.createStatement()) {
            Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*.sql");
            Arrays.sort(files, Comparator.comparingInt(MigrationsTest::version));
            for (Resource file : files) {
                String name = file.getFilename();
                if (SKIPPED.contains("V" + version(file))) {
                    continue;
                }
                String sql = new String(file.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
                    .replace("\r", "")
                    .replace(",\n  add column if not exists", ";\nalter table documents add column if not exists");
                for (String command : sql.split(";\\s*\n|;\\s*$")) {
                    if (!command.isBlank()) {
                        try {
                            statement.execute(command);
                        } catch (Exception e) {
                            throw new IllegalStateException("Migration " + name + " failed on: " + command, e);
                        }
                    }
                }
            }
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private static int version(Resource file) {
        Matcher matcher = Pattern.compile("V(\\d+)__").matcher(file.getFilename());
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
    }

    @Autowired HouseRepository houses;
    @MockBean PixGatewayClient gatewayClient;

    @Test
    void migrationsBuildASchemaTheEntitiesAccept() {
        assertThat(houses.count()).isGreaterThanOrEqualTo(0);
    }
}
