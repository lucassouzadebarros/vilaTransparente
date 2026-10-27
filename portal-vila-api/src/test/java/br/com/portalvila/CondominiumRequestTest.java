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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * From "Quero cadastrar meu condomínio" to the síndico inside the app: the public request creates nothing, the platform
 * approves it (condominium, units, an account that cannot sign in yet and a single-use code) and the person chooses
 * their own password with the code.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "portal.platform.admin-emails=dono@teste.dev")
class CondominiumRequestTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired CondominiumRepository condominiums;
    @Autowired CondominiumRequestRepository requests;
    @Autowired AccountActivationRepository activations;
    @Autowired HouseRepository houses;
    @Autowired SettingsRepository settings;
    @Autowired AuditEntryRepository auditEntries;
    @MockBean PixGatewayClient gatewayClient;

    private final List<Runnable> cleanup = new ArrayList<>();
    private String owner;
    private String address;

    @BeforeEach
    void theOwnerOfThePlatform() {
        if (!condominiums.existsById(TenantContext.VILA)) {
            jdbc.update("insert into condominiums(id, name, slug, status, created_at) values (?, 'Portal da Vila', ?, 'ACTIVE', current_timestamp)",
                TenantContext.VILA, "vila-" + UUID.randomUUID());
            cleanup.add(() -> condominiums.deleteById(TenantContext.VILA));
            Long next = jdbc.queryForObject("select max(id) + 1 from condominiums", Long.class);
            jdbc.execute("alter table condominiums alter column id restart with " + next);
        }
        users.findByEmailIgnoreCase("dono@teste.dev").ifPresent(users::delete);
        AppUser account = users.save(new AppUser("Dono", "dono@teste.dev", "x", "ADMIN", null));
        cleanup.add(() -> users.deleteById(account.id));
        owner = "Bearer " + jwt.issue(account);
        address = "test-" + UUID.randomUUID();
    }

    @AfterEach
    void removeWhatThisTestCreated() {
        Collections.reverse(cleanup);
        cleanup.forEach(Runnable::run);
        cleanup.clear();
    }

    private JsonNode call(MockHttpServletRequestBuilder request, String authorization, String body, int expected) throws Exception {
        request.header("X-Forwarded-For", address).contentType(MediaType.APPLICATION_JSON).content(body);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        String answer = mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return answer.isBlank() ? null : json.readTree(answer);
    }

    private String form(String name, String email) {
        return "{\"condominiumName\":\"" + name + "\",\"city\":\"Niterói\",\"state\":\"rj\",\"units\":12,\"contactName\":\"Ana Síndica\","
            + "\"contactEmail\":\"" + email + "\",\"contactPhone\":\"(21) 99999-0000\",\"hasAsaas\":\"NAO\",\"message\":\"Somos 12 casas.\"}";
    }

    private CondominiumRequest submitted(String name, String email) throws Exception {
        call(post("/api/public/condominium-requests"), null, form(name, email), 200);
        CondominiumRequest stored = requests.findAllByOrderByCreatedAtDesc().stream()
            .filter(request -> request.condominiumName.equals(name)).findFirst().orElseThrow();
        cleanup.add(() -> requests.deleteById(stored.id));
        return stored;
    }

    /** Removes a condominium created by an approval, with everything made inside it and its people. */
    private void forgetCondominium(long id, String managerEmail) {
        cleanup.add(() -> {
            activations.findAll().stream().filter(activation -> activation.condominiumId == id).forEach(activations::delete);
            users.findByEmailIgnoreCase(managerEmail).ifPresent(users::delete);
            TenantContext.runAs(id, () -> {
                houses.deleteAll();
                settings.deleteAll();
                auditEntries.deleteAll();
            });
            requests.findAll().stream().filter(request -> Long.valueOf(id).equals(request.condominiumId)).forEach(request -> {
                request.condominiumId = null;
                requests.save(request);
            });
            condominiums.deleteById(id);
        });
    }

    private String login(String email, String password, int expected) throws Exception {
        JsonNode answer = call(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", expected);
        return answer != null && answer.has("token") ? "Bearer " + answer.get("token").asText() : null;
    }

    @Test
    void aPublicRequestIsStoredAndCreatesNothing() throws Exception {
        long before = condominiums.count();
        CondominiumRequest stored = submitted("Residencial Pedido " + UUID.randomUUID().toString().substring(0, 6), "ana-" + UUID.randomUUID() + "@teste.dev");

        assertThat(stored.status).isEqualTo("PENDING");
        assertThat(stored.state).isEqualTo("RJ");
        assertThat(stored.city).isEqualTo("Niterói");
        assertThat(stored.contactPhone).isEqualTo("21999990000");
        assertThat(condominiums.count()).isEqualTo(before);
        JsonNode pending = call(get("/api/platform/requests/pending-count"), owner, "", 200);
        assertThat(pending.get("pending").asLong()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void aRobotOrAWrongFormIsNotStoredAndTheAddressIsLimited() throws Exception {
        long before = requests.count();
        call(post("/api/public/condominium-requests"), null,
            form("Robo", "robo@teste.dev").replace("}", ",\"website\":\"http://spam\"}"), 200);
        call(post("/api/public/condominium-requests"), null, form("Sem estado", "x@teste.dev").replace("\"rj\"", "\"XX\""), 400);
        call(post("/api/public/condominium-requests"), null, form("E-mail ruim", "nao-e-email"), 400);
        assertThat(requests.count()).isEqualTo(before);

        call(post("/api/public/condominium-requests"), null, form("Mais um", "y@teste.dev").replace("\"rj\"", "\"XX\""), 400);
        call(post("/api/public/condominium-requests"), null, form("Mais dois", "z@teste.dev").replace("\"rj\"", "\"XX\""), 400);
        call(post("/api/public/condominium-requests"), null, form("Demais", "w@teste.dev"), 429);
    }

    @Test
    void approvingCreatesTheCondominiumAndTheManagerActivatesTheirOwnAccount() throws Exception {
        String email = "sindica-" + UUID.randomUUID() + "@teste.dev";
        CondominiumRequest request = submitted("Residencial Aprovado " + UUID.randomUUID().toString().substring(0, 6), email);

        JsonNode approval = call(post("/api/platform/requests/" + request.id + "/approve"), owner, "{\"unitLabel\":\"Casa\"}", 200);
        long condominiumId = approval.get("condominium").get("id").asLong();
        forgetCondominium(condominiumId, email);
        String code = approval.get("manager").get("code").asText();

        assertThat(code).matches("[A-Z2-9]{4}-[A-Z2-9]{4}");
        assertThat(approval.get("condominium").get("houses").asLong()).isEqualTo(12);
        assertThat(approval.get("manager").get("email").asText()).isEqualTo(email);
        assertThat(requests.findById(request.id).orElseThrow().status).isEqualTo("APPROVED");
        AppUser waiting = users.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(waiting.active).isFalse();
        assertThat(waiting.role).isEqualTo("ADMIN");
        assertThat(waiting.condominiumId).isEqualTo(condominiumId);
        assertThat(call(get("/api/platform/condominiums/" + condominiumId), owner, "", 200).get("pendingManager").get("email").asText()).isEqualTo(email);
        // Nobody signs in before choosing the password.
        login(email, "qualquer-coisa", 401);

        JsonNode preview = call(post("/api/public/activation/check"), null, "{\"code\":\"" + code.toLowerCase().replace("-", " ") + "\"}", 200);
        assertThat(preview.get("condominiumName").asText()).startsWith("Residencial Aprovado");
        call(post("/api/public/activation/complete"), null, "{\"code\":\"" + code + "\",\"password\":\"curta\"}", 400);
        call(post("/api/public/activation/complete"), null, "{\"code\":\"" + code + "\",\"password\":\"SenhaDaSindica1\"}", 200);

        String token = login(email, "SenhaDaSindica1", 200);
        String houseList = mvc.perform(get("/api/residents/houses").header("Authorization", token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(houseList).contains("Casa 12");
        // The code worked once.
        call(post("/api/public/activation/check"), null, "{\"code\":\"" + code + "\"}", 404);
        assertThat(call(get("/api/platform/condominiums/" + condominiumId), owner, "", 200).get("pendingManager").isNull()).isTrue();
    }

    @Test
    void aNewCodeCancelsTheOldOneAndASuspendedCondominiumTakesNoActivation() throws Exception {
        long condominiumId = call(post("/api/platform/condominiums"), owner, "{\"name\":\"Sem Pedido " + UUID.randomUUID().toString().substring(0, 6) + "\",\"units\":2}", 200)
            .get("id").asLong();
        String email = "gestor-" + UUID.randomUUID() + "@teste.dev";
        forgetCondominium(condominiumId, email);

        String first = call(post("/api/platform/condominiums/" + condominiumId + "/manager"), owner, "{\"name\":\"Gestor\",\"email\":\"" + email + "\"}", 200).get("code").asText();
        String second = call(post("/api/platform/condominiums/" + condominiumId + "/manager"), owner, "{\"name\":\"Gestor\",\"email\":\"" + email + "\"}", 200).get("code").asText();

        call(post("/api/public/activation/check"), null, "{\"code\":\"" + first + "\"}", 404);
        call(post("/api/public/activation/check"), null, "{\"code\":\"" + second + "\"}", 200);

        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/platform/condominiums/" + condominiumId + "/status"), owner, "{\"status\":\"SUSPENDED\"}", 200);
        call(post("/api/public/activation/check"), null, "{\"code\":\"" + second + "\"}", 404);
    }

    @Test
    void aTakenEmailStopsTheApprovalBeforeAnythingIsCreated() throws Exception {
        CondominiumRequest request = submitted("Residencial E-mail " + UUID.randomUUID().toString().substring(0, 6), "dono@teste.dev");
        long before = condominiums.count();

        call(post("/api/platform/requests/" + request.id + "/approve"), owner, "{}", 409);

        assertThat(condominiums.count()).isEqualTo(before);
        assertThat(requests.findById(request.id).orElseThrow().status).isEqualTo("PENDING");
    }

    @Test
    void aRejectedRequestCannotBeApprovedLater() throws Exception {
        CondominiumRequest request = submitted("Residencial Recusado " + UUID.randomUUID().toString().substring(0, 6), "r-" + UUID.randomUUID() + "@teste.dev");

        JsonNode rejected = call(post("/api/platform/requests/" + request.id + "/reject"), owner, "{\"note\":\"Fora da área atendida\"}", 200);

        assertThat(rejected.get("status").asText()).isEqualTo("REJECTED");
        assertThat(rejected.get("decisionNote").asText()).isEqualTo("Fora da área atendida");
        call(post("/api/platform/requests/" + request.id + "/approve"), owner, "{}", 409);
    }

    @Test
    void onlyThePlatformSeesAndAnswersRequests() throws Exception {
        AppUser plain = users.save(new AppUser("Admin", "admin-" + UUID.randomUUID() + "@teste.dev", "x", "ADMIN", null));
        cleanup.add(() -> users.deleteById(plain.id));
        String token = "Bearer " + jwt.issue(plain);

        call(get("/api/platform/requests"), token, "", 403);
        call(post("/api/platform/requests/1/approve"), token, "{}", 403);
        call(get("/api/platform/requests"), null, "", 401);
    }
}
