package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform panel: only the accounts named in the server's settings get in, they see every condominium, and each
 * number is counted inside its own condominium. Being one of them does not change the account's role in its own
 * condominium.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "portal.platform.admin-emails= Dono@Teste.dev , outro-dono@teste.dev")
class PlatformTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired JdbcTemplate jdbc;
    @MockBean PixGatewayClient gatewayClient;

    private final List<Runnable> cleanup = new ArrayList<>();
    private String owner;
    private String vilaAdmin;
    private Condominium second;

    @BeforeEach
    void twoCondominiumsAndTheirPeople() {
        // The Vila is row 1, as in production (V24 makes it). The tests' schema starts with no condominiums.
        if (!condominiums.existsById(TenantContext.VILA)) {
            jdbc.update("insert into condominiums(id, name, slug, status, created_at) values (?, 'Portal da Vila', ?, 'ACTIVE', current_timestamp)",
                TenantContext.VILA, "vila-" + UUID.randomUUID());
            cleanup.add(() -> condominiums.deleteById(TenantContext.VILA));
            // A row written with its own id does not move the counter: the next condominium would get 1 too.
            Long next = jdbc.queryForObject("select max(id) + 1 from condominiums", Long.class);
            jdbc.execute("alter table condominiums alter column id restart with " + next);
        }
        second = condominiums.save(new Condominium("Residencial Teste", "residencial-" + UUID.randomUUID()));
        cleanup.add(() -> condominiums.deleteById(second.id));

        AppUser ownerAccount = account("dono@teste.dev", "ADMIN", TenantContext.VILA);
        AppUser plainAdmin = account("admin-" + UUID.randomUUID() + "@teste.dev", "ADMIN", TenantContext.VILA);
        owner = "Bearer " + jwt.issue(ownerAccount);
        vilaAdmin = "Bearer " + jwt.issue(plainAdmin);

        TenantContext.runAs(second.id, () -> {
            for (int number = 1; number <= 3; number++) {
                House house = houses.save(new House(number, "Apto " + number));
                cleanup.add(() -> TenantContext.runAs(second.id, () -> houses.deleteById(house.id)));
            }
        });
    }

    private AppUser account(String email, String role, long condominium) {
        users.findByEmailIgnoreCase(email).ifPresent(users::delete);
        AppUser account = new AppUser("Pessoa", email, "x", role, null);
        account.condominiumId = condominium;
        AppUser saved = users.save(account);
        cleanup.add(() -> users.deleteById(saved.id));
        return saved;
    }

    @AfterEach
    void removeWhatThisTestCreated() {
        Collections.reverse(cleanup);
        cleanup.forEach(Runnable::run);
        cleanup.clear();
    }

    @Test
    void onlyThePlatformAccountsGetIn() throws Exception {
        mvc.perform(get("/api/platform/condominiums")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/platform/condominiums").header("Authorization", vilaAdmin)).andExpect(status().isForbidden());
        mvc.perform(get("/api/platform/me").header("Authorization", vilaAdmin)).andExpect(status().isForbidden());

        String me = mvc.perform(get("/api/platform/me").header("Authorization", owner))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(me).get("email").asText()).isEqualTo("dono@teste.dev");
    }

    @Test
    void theOwnerSeesEveryCondominiumWithItsOwnNumbers() throws Exception {
        String body = mvc.perform(get("/api/platform/condominiums").header("Authorization", owner))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        JsonNode secondRow = null;
        JsonNode vilaRow = null;
        for (JsonNode row : json.readTree(body)) {
            if (row.get("id").asLong() == second.id) {
                secondRow = row;
            }
            if (row.get("id").asLong() == TenantContext.VILA) {
                vilaRow = row;
            }
        }
        assertThat(secondRow).isNotNull();
        assertThat(secondRow.get("name").asText()).isEqualTo("Residencial Teste");
        assertThat(secondRow.get("houses").asLong()).isEqualTo(3);
        assertThat(secondRow.get("activeResidents").asLong()).isZero();
        assertThat(secondRow.get("pixConnected").asBoolean()).isFalse();
        assertThat(vilaRow).isNotNull();
        assertThat(vilaRow.get("pixConnected").asBoolean()).isTrue();
    }

    @Test
    void runningThePlatformKeepsTheRoleInTheOwnCondominium() throws Exception {
        // The owner is still the Vila's administrator: the Vila's admin routes answer, and only the Vila's data.
        mvc.perform(get("/api/admin/audit").header("Authorization", owner)).andExpect(status().isOk());
        String houseList = mvc.perform(get("/api/residents/houses").header("Authorization", owner))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(houseList).doesNotContain("Apto 1");
    }
}
