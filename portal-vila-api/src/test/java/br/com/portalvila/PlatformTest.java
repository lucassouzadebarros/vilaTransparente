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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
    @Autowired SettingsRepository settings;
    @Autowired AuditEntryRepository auditEntries;
    @Autowired PasswordEncoder encoder;
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

    private JsonNode send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body, int expected) throws Exception {
        String answer = mvc.perform(request.header("Authorization", owner).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return answer.isBlank() ? null : json.readTree(answer);
    }

    /** Removes a condominium made by a test, with what was created inside it. */
    private void forget(long id) {
        cleanup.add(() -> {
            TenantContext.runAs(id, () -> {
                houses.deleteAll();
                settings.deleteAll();
                auditEntries.deleteAll();
            });
            condominiums.deleteById(id);
        });
    }

    @Test
    void theOwnerCreatesACondominiumWithItsUnitsAndItsOwnSettings() throws Exception {
        String name = "Residencial São José " + UUID.randomUUID().toString().substring(0, 6);
        JsonNode created = send(post("/api/platform/condominiums"), "{\"name\":\"  " + name + " \",\"unitLabel\":\"Apto\",\"units\":12}", 200);
        long id = created.get("id").asLong();
        forget(id);

        assertThat(created.get("name").asText()).isEqualTo(name);
        assertThat(created.get("slug").asText()).startsWith("residencial-sao-jose-");
        assertThat(created.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(created.get("houses").asLong()).isEqualTo(12);
        assertThat(created.get("pixConnected").asBoolean()).isFalse();
        TenantContext.runAs(id, () -> {
            assertThat(houses.findByActiveTrueOrderByNumberAsc().get(0).label).isEqualTo("Apto 01");
            assertThat(settings.findAll()).singleElement().satisfies(own -> assertThat(own.villageName).isEqualTo(name));
        });
        // Nothing of it reaches the Vila.
        assertThat(houses.findByActiveTrueOrderByNumberAsc()).noneMatch(house -> house.label.startsWith("Apto"));

        JsonNode detail = send(get("/api/platform/condominiums/" + id), "", 200);
        assertThat(detail.get("activity").get(0).get("action").asText()).isEqualTo("CONDOMINIUM_CREATED");
        assertThat(detail.get("activity").get(0).get("actor").asText()).isEqualTo("dono@teste.dev");
    }

    @Test
    void aRepeatedIdentifierOrAWrongFieldIsRefusedAndNothingIsLeftBehind() throws Exception {
        String slug = "teste-" + UUID.randomUUID().toString().substring(0, 8);
        long id = send(post("/api/platform/condominiums"), "{\"name\":\"Primeiro\",\"slug\":\"" + slug + "\",\"units\":0}", 200).get("id").asLong();
        forget(id);
        long before = condominiums.count();

        send(post("/api/platform/condominiums"), "{\"name\":\"Segundo\",\"slug\":\"" + slug.toUpperCase() + "\",\"units\":1}", 409);
        send(post("/api/platform/condominiums"), "{\"name\":\"Grande demais\",\"units\":5000}", 400);
        send(post("/api/platform/condominiums"), "{\"name\":\"Torres\",\"unitLabel\":\"Torre\",\"units\":3}", 400);
        send(post("/api/platform/condominiums"), "{\"name\":\"ab\",\"units\":3}", 400);

        assertThat(condominiums.count()).isEqualTo(before);
        mvc.perform(post("/api/platform/condominiums").header("Authorization", vilaAdmin).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Sem permissao\",\"units\":1}")).andExpect(status().isForbidden());
    }

    @Test
    void aSuspendedCondominiumKeepsItsPeopleOutUntilItIsReactivated() throws Exception {
        AppUser manager = new AppUser("Sindica", "sindica-" + UUID.randomUUID() + "@teste.dev", encoder.encode("SenhaBoa123"), "ADMIN", null);
        manager.condominiumId = second.id;
        AppUser saved = users.save(manager);
        cleanup.add(() -> users.deleteById(saved.id));
        String token = "Bearer " + jwt.issue(saved);
        String login = "{\"email\":\"" + saved.email + "\",\"password\":\"SenhaBoa123\"}";

        mvc.perform(get("/api/residents/houses").header("Authorization", token)).andExpect(status().isOk());

        assertThat(send(put("/api/platform/condominiums/" + second.id + "/status"), "{\"status\":\"SUSPENDED\"}", 200).get("status").asText())
            .isEqualTo("SUSPENDED");
        String refused = mvc.perform(get("/api/residents/houses").header("Authorization", token))
            .andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString();
        assertThat(refused).contains("suspenso");
        mvc.perform(post("/api/auth/login").header("X-Forwarded-For", "test-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(login))
            .andExpect(status().isForbidden());
        // The platform keeps working, the Vila too.
        mvc.perform(get("/api/platform/condominiums/" + second.id).header("Authorization", owner)).andExpect(status().isOk());

        send(put("/api/platform/condominiums/" + second.id + "/status"), "{\"status\":\"ACTIVE\"}", 200);
        mvc.perform(get("/api/residents/houses").header("Authorization", token)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").header("X-Forwarded-For", "test-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(login))
            .andExpect(status().isOk());
    }

    @Test
    void theVilaCannotBeSuspendedFromThePanel() throws Exception {
        send(put("/api/platform/condominiums/" + TenantContext.VILA + "/status"), "{\"status\":\"SUSPENDED\"}", 409);
        assertThat(condominiums.findById(TenantContext.VILA).orElseThrow().status).isEqualTo("ACTIVE");
    }

    @Test
    void renamingChangesTheNameTheAppShowsToo() throws Exception {
        TenantContext.runAs(second.id, () -> {
            Settings own = new Settings();
            own.villageName = "Residencial Teste";
            Settings stored = settings.save(own);
            cleanup.add(() -> TenantContext.runAs(second.id, () -> settings.deleteById(stored.id)));
        });

        send(put("/api/platform/condominiums/" + second.id), "{\"name\":\"Residencial Novo Nome\"}", 200);

        assertThat(condominiums.findById(second.id).orElseThrow().name).isEqualTo("Residencial Novo Nome");
        TenantContext.runAs(second.id, () -> assertThat(settings.findAll().get(0).villageName).isEqualTo("Residencial Novo Nome"));
        cleanup.add(() -> TenantContext.runAs(second.id, () -> auditEntries.deleteAll()));
    }

    @Test
    void theSessionTellsTheRoleThePlatformAndTheCondominium() throws Exception {
        JsonNode ownerSession = send(get("/api/session"), "", 200);
        assertThat(ownerSession.get("platformAdmin").asBoolean()).isTrue();
        assertThat(ownerSession.get("role").asText()).isEqualTo("ADMIN");
        assertThat(ownerSession.get("condominium").get("id").asLong()).isEqualTo(TenantContext.VILA);
        assertThat(ownerSession.get("condominium").get("pixConnected").asBoolean()).isTrue();

        String manager = "Bearer " + jwt.issue(account("gestora-" + UUID.randomUUID() + "@teste.dev", "ADMIN", second.id));
        String body = mvc.perform(get("/api/session").header("Authorization", manager))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode session = json.readTree(body);
        assertThat(session.get("platformAdmin").asBoolean()).isFalse();
        assertThat(session.get("condominium").get("id").asLong()).isEqualTo(second.id);
        assertThat(session.get("condominium").get("name").asText()).isEqualTo("Residencial Teste");
        assertThat(session.get("condominium").get("pixConnected").asBoolean()).isFalse();
        mvc.perform(get("/api/session")).andExpect(status().isUnauthorized());
    }

    @Test
    void theAdministrationRenamesItsCondominiumInTheSettingsAndTheRestIsKept() throws Exception {
        String manager = "Bearer " + jwt.issue(account("gestora-" + UUID.randomUUID() + "@teste.dev", "ADMIN", second.id));
        TenantContext.runAs(second.id, () -> {
            Settings own = new Settings();
            own.villageName = "Residencial Teste";
            Settings stored = settings.save(own);
            cleanup.add(() -> TenantContext.runAs(second.id, () -> settings.deleteById(stored.id)));
        });

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/settings").header("Authorization", manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"villageName\":\"Residencial Jardim Novo\",\"monthlyAmount\":250}"))
            .andExpect(status().isOk());

        assertThat(condominiums.findById(second.id).orElseThrow().name).isEqualTo("Residencial Jardim Novo");
        TenantContext.runAs(second.id, () -> {
            Settings own = settings.findAll().get(0);
            assertThat(own.villageName).isEqualTo("Residencial Jardim Novo");
            assertThat(own.monthlyAmount).isEqualByComparingTo("250");
            assertThat(own.paymentDueDay).isEqualTo(10);
            assertThat(own.gatewayProvider).isEqualTo("ASAAS");
        });
        // The Vila is untouched.
        assertThat(condominiums.findById(TenantContext.VILA).orElseThrow().name).isNotEqualTo("Residencial Jardim Novo");
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
