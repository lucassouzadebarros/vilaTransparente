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

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The history and comments of a problem report, and who may cancel it. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReportHistoryTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired ProblemReportRepository reports;
    @Autowired ProblemReportEventRepository events;
    @Autowired ServiceOrderRepository services;
    @Autowired ServiceOrderWorkflow workflow;
    @MockBean PixGatewayClient gatewayClient;

    private AppUser reporter;
    private AppUser neighbour;
    private AppUser admin;
    private AppUser sindico;

    @BeforeEach
    void setUp() {
        events.deleteAll();
        reports.deleteAll();
        services.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        reporter = resident(2, "casa2@teste.dev", "RESIDENT");
        neighbour = resident(3, "casa3@teste.dev", "RESIDENT");
        sindico = resident(5, "casa5@teste.dev", "SINDICO");
        admin = users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null));
    }

    private AppUser resident(int number, String email, String role) {
        House house = houses.save(new House(number, String.format("Casa %02d", number)));
        Resident resident = residents.save(new Resident(house.id, "Morador " + number, email, null, null));
        return users.save(new AppUser("Morador", email, encoder.encode("SenhaMorador1"), role, resident.id));
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwt.issue(user);
    }

    private JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private long openReport() throws Exception {
        String payload = "{\"title\":\"Portão\",\"location\":\"Portão\",\"category\":\"Portão\",\"priority\":\"MEDIA\",\"description\":\"Não fecha\"}";
        return body(mvc.perform(post("/api/problem-reports").header("Authorization", bearer(reporter))
            .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk())).get("id").asLong();
    }

    private JsonNode history(long id, AppUser viewer) throws Exception {
        return body(mvc.perform(get("/api/problem-reports/" + id + "/events").header("Authorization", bearer(viewer))).andExpect(status().isOk()));
    }

    private ResultActions comment(long id, AppUser user, String message) throws Exception {
        return mvc.perform(post("/api/problem-reports/" + id + "/comments").header("Authorization", bearer(user))
            .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"" + message + "\"}"));
    }

    @Test
    void theHistoryStartsWithTheReportAndFollowsItsChanges() throws Exception {
        long id = openReport();
        JsonNode first = history(id, neighbour);
        assertThat(first).hasSize(1);
        assertThat(first.get(0).get("kind").asText()).isEqualTo("CREATED");
        assertThat(first.get(0).get("author").asText()).isEqualTo("Casa 02");

        String update = "{\"title\":\"Portão\",\"location\":\"Portão\",\"category\":\"Portão\",\"priority\":\"MEDIA\",\"status\":\"EM_ANALISE\",\"description\":\"Não fecha\"}";
        mvc.perform(put("/api/problem-reports/" + id).header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(update)).andExpect(status().isOk());

        ServiceOrder service = new ServiceOrder();
        service.title = "Consertar o portão";
        service.description = "Trocar a mola";
        service.problemReportId = id;
        workflow.saveService(service);

        JsonNode now = history(id, reporter);
        assertThat(now).hasSize(3);
        assertThat(now.get(1).get("kind").asText()).isEqualTo("STATUS");
        assertThat(now.get(1).get("author").asText()).isEqualTo("Administração");
        assertThat(now.get(1).get("message").asText()).contains("em análise");
        assertThat(now.get(2).get("kind").asText()).isEqualTo("SERVICE");
        assertThat(now.get(2).get("message").asText()).contains("Consertar o portão");
    }

    @Test
    void theReporterTheAdminAndTheSindicoCommentButNeighboursDoNot() throws Exception {
        long id = openReport();

        comment(id, reporter, "Acontece todo dia de manhã.").andExpect(status().isOk());
        comment(id, admin, "Vamos chamar o técnico.").andExpect(status().isOk());
        comment(id, sindico, "Já falei com ele.").andExpect(status().isOk());
        comment(id, neighbour, "Comigo também.").andExpect(status().isForbidden());
        comment(id, reporter, "   ").andExpect(status().isBadRequest());
        comment(id, reporter, "x".repeat(501)).andExpect(status().isBadRequest());

        JsonNode story = history(id, neighbour);
        assertThat(story).hasSize(4);
        assertThat(story.get(1).get("author").asText()).isEqualTo("Casa 02");
        assertThat(story.get(2).get("author").asText()).isEqualTo("Administração");
        assertThat(story.get(3).get("author").asText()).isEqualTo("Síndico");
        // Names never appear in the history.
        assertThat(story.toString()).doesNotContain("Morador 2");
    }

    @Test
    void theReporterCancelsOnlyWhileNobodyStartedOnIt() throws Exception {
        long mine = openReport();
        mvc.perform(post("/api/problem-reports/" + mine + "/cancel").header("Authorization", bearer(neighbour))).andExpect(status().isForbidden());
        mvc.perform(post("/api/problem-reports/" + mine + "/cancel").header("Authorization", bearer(reporter))).andExpect(status().isOk());
        assertThat(reports.findById(mine).orElseThrow().status).isEqualTo("CANCELADO");
        assertThat(history(mine, reporter).get(1).get("message").asText()).contains("Cancelado por quem fez");
        mvc.perform(post("/api/problem-reports/" + mine + "/cancel").header("Authorization", bearer(reporter))).andExpect(status().isConflict());

        long underAnalysis = openReport();
        ProblemReport report = reports.findById(underAnalysis).orElseThrow();
        report.status = "EM_ANALISE";
        reports.save(report);
        mvc.perform(post("/api/problem-reports/" + underAnalysis + "/cancel").header("Authorization", bearer(reporter))).andExpect(status().isConflict());
        mvc.perform(post("/api/problem-reports/" + underAnalysis + "/cancel").header("Authorization", bearer(admin))).andExpect(status().isOk());
        assertThat(reports.findById(underAnalysis).orElseThrow().status).isEqualTo("CANCELADO");
    }
}
