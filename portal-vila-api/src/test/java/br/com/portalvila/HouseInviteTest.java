package br.com.portalvila;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Joining the app is by invitation: a single-use, expiring code the administration makes for a house. Without it nobody
 * can claim a house, and the old open registration is gone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HouseInviteTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @Autowired HouseInviteRepository invites;
    @MockBean PixGatewayClient gatewayClient;

    private String admin;
    private String resident;
    private House free;
    private House taken;
    /** The limiter is shared by the whole context and keyed by address: each test gets its own "address". */
    private String caller;

    @BeforeEach
    void setUp() {
        caller = "test-" + UUID.randomUUID();
        invites.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        free = houses.save(new House(7, "Casa 07"));
        taken = houses.save(new House(2, "Casa 02"));
        Resident owner = residents.save(new Resident(taken.id, "Morador 02", "morador02@test.dev", null, null));
        resident = "Bearer " + jwt.issue(users.save(new AppUser("Morador 02", "morador02@test.dev", encoder.encode("SenhaForte1"), "RESIDENT", owner.id)));
        admin = "Bearer " + jwt.issue(users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null)));
        when(gatewayClient.createOrUpdateCustomer(any())).thenReturn(new GatewayCustomer("cus_test_123"));
    }

    private String issue(House house) throws Exception {
        String body = mvc.perform(post("/api/residents/invites").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"houseId\":" + house.id + "}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("code").asText();
    }

    private ResultActions check(String code) throws Exception {
        return mvc.perform(post("/api/residents/invite-check").header("X-Forwarded-For", caller)
            .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"));
    }

    private ResultActions join(String code, String email) throws Exception {
        return mvc.perform(post("/api/residents/register-with-invite").header("X-Forwarded-For", caller).contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"" + code + "\",\"name\":\"Maria Souza\",\"email\":\"" + email + "\",\"phone\":\"21999990000\","
                + "\"documentNumber\":\"52998224725\",\"password\":\"SenhaBoa123\"}"));
    }

    @Test
    void theAdministrationMakesACodeForAHouseAndThePersonJoinsWithIt() throws Exception {
        String code = issue(free);
        assertThat(code).matches("[A-Z2-9]{4}-[A-Z2-9]{4}");

        // The code shows the house and nothing else, however it is typed.
        for (String typed : new String[]{code, code.toLowerCase(), code.replace("-", " ")}) {
            String house = check(typed).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertThat(json.readTree(house).get("houseLabel").asText()).isEqualTo("Casa 07");
        }

        String joined = join(code, "maria@test.dev").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(joined);
        assertThat(node.get("houseLabel").asText()).isEqualTo("Casa 07");
        assertThat(residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(free.id, "ACTIVE")).isPresent();
        assertThat(users.findByEmailIgnoreCase("maria@test.dev")).isPresent();

        // A code works once.
        check(code).andExpect(status().isNotFound());
        join(code, "outra@test.dev").andExpect(status().isNotFound());
    }

    @Test
    void aWrongOrExpiredOrCancelledCodeLooksTheSameAndNothingIsCreated() throws Exception {
        String wrong = check("ZZZZ-ZZZZ").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();

        String expired = issue(free);
        HouseInvite invite = invites.findAll().get(0);
        invite.expiresAt = LocalDateTime.now().minusMinutes(1);
        invites.save(invite);
        String expiredAnswer = check(expired).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertThat(expiredAnswer).isEqualTo(wrong);
        join(expired, "maria@test.dev").andExpect(status().isNotFound());

        String again = issue(free);
        Long inviteId = invites.findAll().stream().filter(item -> item.expiresAt.isAfter(LocalDateTime.now())).findFirst().orElseThrow().id;
        mvc.perform(delete("/api/residents/invites/" + inviteId).header("Authorization", admin)).andExpect(status().isOk());
        check(again).andExpect(status().isNotFound());

        assertThat(residents.findFirstByHouseIdAndStatusOrderByCreatedAtDesc(free.id, "ACTIVE")).isEmpty();
        assertThat(users.findByEmailIgnoreCase("maria@test.dev")).isEmpty();
    }

    @Test
    void aNewCodeForTheSameHouseCancelsTheOldOne() throws Exception {
        String first = issue(free);
        String second = issue(free);
        check(first).andExpect(status().isNotFound());
        check(second).andExpect(status().isOk());
        assertThat(invites.findByHouseIdAndUsedAtIsNullAndRevokedAtIsNull(free.id)).hasSize(1);
    }

    @Test
    void aHouseThatAlreadyHasAResidentCannotGetACodeAndAFailedJoinKeepsTheCode() throws Exception {
        mvc.perform(post("/api/residents/invites").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"houseId\":" + taken.id + "}"))
            .andExpect(status().isConflict());

        // An e-mail that is already used is refused, but the code is not spent by that.
        String code = issue(free);
        join(code, "morador02@test.dev").andExpect(status().isConflict());
        check(code).andExpect(status().isOk());
        join(code, "maria@test.dev").andExpect(status().isOk());
    }

    @Test
    void onlyTheAdministrationMakesListsAndCancelsCodes() throws Exception {
        mvc.perform(post("/api/residents/invites").header("Authorization", resident).contentType(MediaType.APPLICATION_JSON)
                .content("{\"houseId\":" + free.id + "}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/residents/invites").contentType(MediaType.APPLICATION_JSON).content("{\"houseId\":" + free.id + "}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/residents/invites").header("Authorization", resident)).andExpect(status().isForbidden());
        mvc.perform(get("/api/residents/registration-houses")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/residents/registration-houses").header("Authorization", resident)).andExpect(status().isForbidden());

        String code = issue(free);
        String list = mvc.perform(get("/api/residents/invites").header("Authorization", admin))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(list).contains("Casa 07");
        // The list never carries the code or its hash.
        assertThat(list).doesNotContain(code).doesNotContain("codeHash");

        String houses = mvc.perform(get("/api/residents/registration-houses").header("Authorization", admin))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(houses).findValuesAsText("label")).contains("Casa 07", "Casa 02");
    }

    @Test
    void theOldOpenRegistrationIsGone() throws Exception {
        String body = "{\"houseId\":" + free.id + ",\"name\":\"Intruso\",\"email\":\"intruso@test.dev\",\"phone\":\"2199\","
            + "\"documentNumber\":\"52998224725\",\"password\":\"SenhaBoa123\"}";
        int selfRegistration = mvc.perform(post("/api/residents/self-registration").contentType(MediaType.APPLICATION_JSON).content(body))
            .andReturn().getResponse().getStatus();
        int registerResident = mvc.perform(post("/api/auth/register-resident").contentType(MediaType.APPLICATION_JSON).content(body))
            .andReturn().getResponse().getStatus();
        assertThat(selfRegistration).isIn(401, 403, 404, 405);
        assertThat(registerResident).isIn(401, 403, 404, 405);
        assertThat(users.findByEmailIgnoreCase("intruso@test.dev")).isEmpty();
    }

    @Test
    void guessingCodesIsSlowedDown() throws Exception {
        for (int attempt = 0; attempt < LoginAttemptLimiter.MAX_FAILURES; attempt++) {
            check("ZZZZ-ZZZ" + attempt).andExpect(status().isNotFound());
        }
        // From now on even the right code is refused for a while, from the same address.
        String code = issue(free);
        check(code).andExpect(status().isTooManyRequests());
    }
}
