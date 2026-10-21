package br.com.portalvila;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A resident's phone registers, and a new budget reaches it through the push service (here a local stand-in). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {"portal.push.enabled=true", "portal.push.url=http://127.0.0.1:18971/push"})
class PushTest {
    private static HttpServer pushService;
    private static final CopyOnWriteArrayList<String> received = new CopyOnWriteArrayList<>();
    private static volatile CountDownLatch arrived = new CountDownLatch(1);

    @BeforeAll
    static void startPushService() throws Exception {
        pushService = HttpServer.create(new InetSocketAddress("127.0.0.1", 18971), 0);
        pushService.createContext("/push", exchange -> {
            received.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            arrived.countDown();
        });
        pushService.start();
    }

    @AfterAll
    static void stopPushService() {
        pushService.stop(0);
    }

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired PushTokenRepository tokens;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ServiceOrderWorkflow workflow;
    @MockBean PixGatewayClient gatewayClient;

    private AppUser resident;

    @BeforeEach
    void setUp() {
        received.clear();
        arrived = new CountDownLatch(1);
        tokens.deleteAll();
        votes.deleteAll();
        budgets.deleteAll();
        services.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        House house = houses.save(new House(2, "Casa 02"));
        Resident person = residents.save(new Resident(house.id, "Morador", "casa2@teste.dev", null, null));
        resident = users.save(new AppUser("Morador", "casa2@teste.dev", encoder.encode("SenhaMorador1"), "RESIDENT", person.id));
    }

    private void register(String token) throws Exception {
        mvc.perform(post("/api/push-tokens")
                .header("Authorization", "Bearer " + jwt.issue(resident))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"platform\":\"android\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void onlyExpoTokensAreAccepted() throws Exception {
        mvc.perform(post("/api/push-tokens")
                .header("Authorization", "Bearer " + jwt.issue(resident))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"qualquer-coisa\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/push-tokens").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"ExponentPushToken[abc]\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void aPhoneMovesToWhoeverSignedInLast() throws Exception {
        register("ExponentPushToken[abc]");
        register("ExponentPushToken[abc]");
        assertThat(tokens.count()).isEqualTo(1);
        assertThat(tokens.findByToken("ExponentPushToken[abc]").orElseThrow().userId).isEqualTo(resident.id);
    }

    @Test
    void aNewBudgetNoticeReachesTheRegisteredPhone() throws Exception {
        register("ExponentPushToken[abc]");

        Budget budget = new Budget();
        budget.title = "Pintura do muro";
        budget.supplier = "Pinturas Silva";
        budget.amount = new BigDecimal("1500.00");
        workflow.saveBudget(budget);

        assertThat(arrived.await(5, TimeUnit.SECONDS)).isTrue();
        String body = received.get(0);
        assertThat(body).contains("ExponentPushToken[abc]").contains("Nova votação").contains("Pintura do muro");
    }

    @Test
    void nothingIsSentWhenNoPhoneIsRegistered() throws Exception {
        Budget budget = new Budget();
        budget.title = "Pintura do muro";
        budget.supplier = "Pinturas Silva";
        budget.amount = new BigDecimal("1500.00");
        workflow.saveBudget(budget);

        assertThat(arrived.await(1, TimeUnit.SECONDS)).isFalse();
        assertThat(received).isEmpty();
    }
}
