package br.com.portalvila;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Deleting an account: the person is erased, the condominium's money records are not, and the house is free again.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountErasureTest {
    private static final String PASSWORD = "SenhaForte1";

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired ContributionRepository contributions;
    @Autowired PushTokenRepository pushTokens;
    @Autowired AuditEntryRepository audit;
    @Autowired HouseInviteRepository invites;
    @MockBean PixGatewayClient gatewayClient;

    private House house;
    private Resident resident;
    private AppUser residentUser;
    private String residentToken;
    private String adminToken;
    private String caller;

    @BeforeEach
    void setUp() {
        caller = "test-" + UUID.randomUUID();
        audit.deleteAll();
        pushTokens.deleteAll();
        contributions.deleteAll();
        invites.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        house = houses.save(new House(5, "Casa 05"));
        resident = new Resident(house.id, "Maria Souza", "maria@test.dev", "21999990000", "***.***.***-25");
        resident.documentNumber = "52998224725";
        resident = residents.save(resident);
        residentUser = users.save(new AppUser("Maria Souza", "maria@test.dev", encoder.encode(PASSWORD), "RESIDENT", resident.id));
        residentToken = "Bearer " + jwt.issue(residentUser);
        adminToken = "Bearer " + jwt.issue(users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null)));

        PushToken token = new PushToken();
        token.userId = residentUser.id;
        token.token = "ExponentPushToken[abc]";
        token.platform = "android";
        pushTokens.save(token);

        Contribution paid = new Contribution();
        paid.houseId = house.id;
        paid.residentId = resident.id;
        paid.referenceMonth = "2026-10";
        paid.amount = new BigDecimal("150.00");
        paid.status = "PAID";
        contributions.save(paid);

        AuditEntry earlier = new AuditEntry();
        earlier.actorEmail = "maria@test.dev";
        earlier.actorRole = "RESIDENT";
        earlier.action = "REPORT_CREATED";
        earlier.summary = "Casa 05 relatou um problema";
        audit.save(earlier);
    }

    private String body(String password) {
        return "{\"password\":\"" + password + "\"}";
    }

    @Test
    void aWrongPasswordDeletesNothing() throws Exception {
        mvc.perform(post("/api/auth/delete-account").header("Authorization", residentToken).header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content(body("errada123")))
            .andExpect(status().isForbidden());
        assertThat(residents.findById(resident.id).orElseThrow().name).isEqualTo("Maria Souza");
        assertThat(users.findById(residentUser.id).orElseThrow().active).isTrue();
    }

    @Test
    void theResidentDeletesTheirOwnAccountAndTheMoneyRecordsStayWithoutAName() throws Exception {
        mvc.perform(post("/api/auth/delete-account").header("Authorization", residentToken).header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isOk());

        Resident erased = residents.findById(resident.id).orElseThrow();
        assertThat(erased.name).isEqualTo("Morador removido");
        assertThat(erased.email).endsWith("@removido.invalid").doesNotContain("maria");
        assertThat(erased.phone).isNull();
        assertThat(erased.documentNumber).isNull();
        assertThat(erased.documentMasked).isNull();
        assertThat(erased.status).isEqualTo("INACTIVE");

        AppUser user = users.findById(residentUser.id).orElseThrow();
        assertThat(user.active).isFalse();
        assertThat(user.email).endsWith("@excluida.invalid");
        assertThat(user.name).isEqualTo("Conta excluída");
        assertThat(encoder.matches(PASSWORD, user.passwordHash)).isFalse();
        assertThat(pushTokens.findByUserIdIn(java.util.List.of(residentUser.id))).isEmpty();

        // The charge is still there, tied to the house and the (now nameless) resident.
        assertThat(contributions.findAll()).hasSize(1);
        assertThat(contributions.findAll().get(0).houseId).isEqualTo(house.id);

        // Nothing in the change log keeps the e-mail, and the deletion itself is recorded without it.
        assertThat(audit.findAll()).noneMatch(entry -> "maria@test.dev".equalsIgnoreCase(entry.actorEmail));
        assertThat(audit.findAll()).anyMatch(entry -> "ACCOUNT_ERASED".equals(entry.action)
            && AccountErasureService.ERASED_ACTOR.equals(entry.actorEmail)
            && entry.summary.contains("Casa 05") && !entry.summary.contains("Maria"));

        // The old token opens nothing, and the house can be invited again.
        mvc.perform(get("/api/dashboard").header("Authorization", residentToken)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/residents/invites").header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"houseId\":" + house.id + "}"))
            .andExpect(status().isOk());
    }

    @Test
    void aSindicoStopsBeingSindico() throws Exception {
        residentUser.role = SindicoService.ROLE;
        users.save(residentUser);
        String sindicoToken = "Bearer " + jwt.issue(residentUser);
        mvc.perform(post("/api/auth/delete-account").header("Authorization", sindicoToken).header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isOk());
        assertThat(users.findById(residentUser.id).orElseThrow().role).isEqualTo("RESIDENT");
    }

    @Test
    void theAdministratorAccountCannotBeDeletedFromTheApp() throws Exception {
        mvc.perform(post("/api/auth/delete-account").header("Authorization", adminToken).header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content(body("SenhaAdmin1")))
            .andExpect(status().isConflict());
        assertThat(users.findByEmailIgnoreCase("admin@teste.dev")).isPresent();
    }

    @Test
    void guessingThePasswordIsSlowedDown() throws Exception {
        for (int attempt = 0; attempt < LoginAttemptLimiter.MAX_FAILURES; attempt++) {
            mvc.perform(post("/api/auth/delete-account").header("Authorization", residentToken).header("X-Forwarded-For", caller)
                    .contentType(MediaType.APPLICATION_JSON).content(body("errada" + attempt)))
                .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/auth/delete-account").header("Authorization", residentToken).header("X-Forwarded-For", caller)
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isTooManyRequests());
        assertThat(users.findById(residentUser.id).orElseThrow().active).isTrue();
    }

    @Test
    void theAdministrationErasesTheDataOfAResidentWhoAskedByEmail() throws Exception {
        // Another resident cannot use the administration's door.
        House other = houses.save(new House(6, "Casa 06"));
        Resident neighbour = residents.save(new Resident(other.id, "Vizinho", "vizinho@test.dev", null, null));
        String neighbourToken = "Bearer " + jwt.issue(users.save(new AppUser("Vizinho", "vizinho@test.dev", encoder.encode(PASSWORD), "RESIDENT", neighbour.id)));
        mvc.perform(post("/api/admin/residents/" + resident.id + "/erase").header("Authorization", neighbourToken)).andExpect(status().isForbidden());
        assertThat(residents.findById(resident.id).orElseThrow().name).isEqualTo("Maria Souza");

        mvc.perform(post("/api/admin/residents/" + resident.id + "/erase").header("Authorization", adminToken))
            .andExpect(status().isOk());
        assertThat(residents.findById(resident.id).orElseThrow().name).isEqualTo("Morador removido");
        assertThat(users.findById(residentUser.id).orElseThrow().active).isFalse();
        // The administration's own e-mail stays on its own action.
        assertThat(audit.findAll()).anyMatch(entry -> "ACCOUNT_ERASED".equals(entry.action) && "admin@teste.dev".equals(entry.actorEmail)
            && entry.summary.contains("pela administração"));
    }

    @Test
    void deletingNeedsALogin() throws Exception {
        mvc.perform(post("/api/auth/delete-account").contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isUnauthorized());
    }
}
