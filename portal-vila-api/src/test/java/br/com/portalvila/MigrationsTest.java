package br.com.portalvila;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the real migrations (db/migration, see {@link TestMigrations}) on an in-memory H2 and lets Hibernate validate that
 * every entity matches the resulting tables. The other tests build the schema from the entities, so without this one a
 * migration that forgets a column would only fail when the API starts in production (ddl-auto is "validate" there).
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:migrations;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=validate"
})
class MigrationsTest {
    static {
        try {
            TestMigrations.run(TestMigrations.url("migrations"), 1, Integer.MAX_VALUE);
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @Autowired HouseRepository houses;
    @MockBean PixGatewayClient gatewayClient;

    @Test
    void migrationsBuildASchemaTheEntitiesAccept() {
        assertThat(houses.count()).isGreaterThanOrEqualTo(0);
    }
}
