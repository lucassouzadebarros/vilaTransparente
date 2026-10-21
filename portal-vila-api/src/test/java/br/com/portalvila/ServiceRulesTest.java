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

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The service form can open and edit a service, but only the finish action may mark it paid. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ServiceRulesTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ExpenseRepository expenses;
    @MockBean PixGatewayClient gatewayClient;

    private String auth;

    @BeforeEach
    void setUp() {
        votes.deleteAll();
        budgets.deleteAll();
        expenses.deleteAll();
        services.deleteAll();
        users.deleteAll();
        AppUser admin = users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null));
        auth = "Bearer " + jwt.issue(admin);
    }

    private JsonNode send(boolean update, Long id, String body, int expectedStatus) throws Exception {
        var request = update ? put("/api/services/" + id) : post("/api/services");
        String response = mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expectedStatus))
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readTree(response);
    }

    private ServiceOrder service(String status) {
        ServiceOrder service = new ServiceOrder();
        service.title = "Pintura";
        service.description = "Pintar o muro";
        service.status = status;
        return services.save(service);
    }

    private Budget approvedBudget() {
        Budget budget = new Budget();
        budget.title = "Tinta";
        budget.supplier = "Fornecedor";
        budget.amount = BigDecimal.valueOf(300);
        budget.status = "APROVADO";
        return budgets.save(budget);
    }

    @Test
    void aNewServiceCannotBeCreatedAsFinishedOrCancelled() throws Exception {
        send(false, null, "{\"title\":\"Muro\",\"description\":\"Pintar\",\"status\":\"FINALIZADO\",\"finalValue\":1}", 400);
        send(false, null, "{\"title\":\"Muro\",\"description\":\"Pintar\",\"status\":\"CANCELADO\"}", 400);
        send(false, null, "{\"title\":\"Muro\",\"description\":\"Pintar\",\"status\":\"finalizado\"}", 400);
        send(false, null, "{\"title\":\"Muro\",\"description\":\"Pintar\",\"status\":\"QUALQUER\"}", 400);
        assertThat(services.count()).isZero();
    }

    @Test
    void aNewServiceStartsPlannedAndIgnoresAPaidValue() throws Exception {
        JsonNode saved = send(false, null,
            "{\"title\":\"Muro\",\"description\":\"Pintar\",\"finalValue\":250,\"completedDate\":\"2026-10-20\",\"expectedValue\":200}", 200);

        ServiceOrder stored = services.findById(saved.get("id").asLong()).orElseThrow();
        assertThat(stored.status).isEqualTo("PLANEJADO");
        assertThat(stored.finalValue).isNull();
        assertThat(stored.completedDate).isNull();
        assertThat(stored.expectedValue).isEqualByComparingTo("200");
        assertThat(expenses.count()).isZero();
    }

    @Test
    void editingAnOpenServiceCannotFinishItButCanStartIt() throws Exception {
        ServiceOrder open = service("PLANEJADO");

        send(true, open.id, "{\"title\":\"Pintura\",\"description\":\"Pintar o muro\",\"status\":\"FINALIZADO\",\"finalValue\":90}", 400);
        assertThat(services.findById(open.id).orElseThrow().status).isEqualTo("PLANEJADO");
        assertThat(services.findById(open.id).orElseThrow().finalValue).isNull();

        send(true, open.id, "{\"title\":\"Pintura\",\"description\":\"Pintar o muro\",\"status\":\"EM_ANDAMENTO\"}", 200);
        assertThat(services.findById(open.id).orElseThrow().status).isEqualTo("EM_ANDAMENTO");
    }

    @Test
    void aFinishedServiceKeepsItsPaymentWhenEdited() throws Exception {
        ServiceOrder finished = service("FINALIZADO");
        finished.finalValue = BigDecimal.valueOf(500);
        finished.completedDate = LocalDate.of(2026, 7, 4);
        finished = services.save(finished);

        send(true, finished.id,
            "{\"title\":\"Pintura do muro\",\"description\":\"Pintar o muro\",\"status\":\"FINALIZADO\",\"finalValue\":1,\"completedDate\":\"2026-01-01\"}", 200);

        ServiceOrder stored = services.findById(finished.id).orElseThrow();
        assertThat(stored.title).isEqualTo("Pintura do muro");
        assertThat(stored.status).isEqualTo("FINALIZADO");
        assertThat(stored.finalValue).isEqualByComparingTo("500");
        assertThat(stored.completedDate).isEqualTo(LocalDate.of(2026, 7, 4));
    }

    @Test
    void aFinishedOrCancelledServiceCannotBeReopenedFromTheForm() throws Exception {
        ServiceOrder finished = service("FINALIZADO");
        ServiceOrder cancelled = service("CANCELADO");

        send(true, finished.id, "{\"title\":\"Pintura\",\"description\":\"Pintar o muro\",\"status\":\"PLANEJADO\"}", 409);
        send(true, cancelled.id, "{\"title\":\"Pintura\",\"description\":\"Pintar o muro\",\"status\":\"EM_ANDAMENTO\"}", 409);

        assertThat(services.findById(finished.id).orElseThrow().status).isEqualTo("FINALIZADO");
        assertThat(services.findById(cancelled.id).orElseThrow().status).isEqualTo("CANCELADO");
    }

    @Test
    void approvedFollowsTheLinkedBudget() throws Exception {
        Budget budget = approvedBudget();

        JsonNode saved = send(false, null,
            "{\"title\":\"Muro\",\"description\":\"Pintar\",\"approvedBudgetId\":" + budget.id + "}", 200);
        Long id = saved.get("id").asLong();
        assertThat(services.findById(id).orElseThrow().status).isEqualTo("APROVADO");

        send(true, id, "{\"title\":\"Muro\",\"description\":\"Pintar\",\"status\":\"APROVADO\"}", 200);
        assertThat(services.findById(id).orElseThrow().status).isEqualTo("PLANEJADO");
        assertThat(budgets.findById(budget.id).orElseThrow().serviceId).isNull();
    }

    @Test
    void aFinishedServiceCannotBeCancelledButAnOpenOneCan() throws Exception {
        ServiceOrder finished = service("FINALIZADO");
        ServiceOrder open = service("PLANEJADO");

        mvc.perform(post("/api/services/" + finished.id + "/cancel").header("Authorization", auth)).andExpect(status().isConflict());
        mvc.perform(post("/api/services/" + open.id + "/cancel").header("Authorization", auth)).andExpect(status().isOk());

        assertThat(services.findById(finished.id).orElseThrow().status).isEqualTo("FINALIZADO");
        assertThat(services.findById(open.id).orElseThrow().status).isEqualTo("CANCELADO");
    }
}
