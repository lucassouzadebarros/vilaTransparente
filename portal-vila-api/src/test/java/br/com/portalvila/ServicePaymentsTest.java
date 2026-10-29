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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An approved budget becomes its service by itself, with how the supplier will be paid; the service is then paid by
 * bills (a down payment and the rest, installments), never twice, and all of it within what the houses approved.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ServicePaymentsTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired BudgetVotingService voting;
    @Autowired ServiceOrderWorkflow workflow;
    @Autowired BudgetRepository budgets;
    @Autowired BudgetVoteRepository votes;
    @Autowired ServiceOrderRepository services;
    @Autowired ProblemReportRepository reports;
    @Autowired ProblemReportEventRepository events;
    @Autowired ExpenseRepository expenses;
    @Autowired PayableRepository payables;
    @Autowired SettingsRepository settings;
    @Autowired AppUserRepository users;
    @Autowired HouseRepository houses;
    @Autowired ResidentRepository residents;
    @MockBean PixGatewayClient gatewayClient;

    /** Voters by house number: houses 02, 03, 05 and 07 take part; the voting closes when all four have voted. */
    final Map<Integer, AppUser> voters = new HashMap<>();
    private String admin;

    /** Bills point to services: other test classes clean services and must not trip over them. */
    @AfterEach
    void cleanUp() {
        payables.deleteAll();
        settings.deleteAll();
    }

    @BeforeEach
    void setUp() {
        payables.deleteAll();
        events.deleteAll();
        votes.deleteAll();
        budgets.deleteAll();
        expenses.deleteAll();
        services.deleteAll();
        reports.deleteAll();
        settings.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        voters.clear();
        for (int number : new int[]{2, 3, 5, 7}) {
            House house = houses.save(new House(number, String.format("Casa %02d", number)));
            Resident resident = residents.save(new Resident(house.id, "Morador " + number, "morador" + number + "@test.dev", null, null));
            AppUser voter = new AppUser();
            voter.role = "RESIDENT";
            voter.residentId = resident.id;
            voters.put(number, voter);
        }
        admin = "Bearer " + jwt.issue(users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null)));
    }

    @Test
    void anApprovedBudgetBecomesItsServiceByItself() {
        ProblemReport report = new ProblemReport();
        report.title = "Muro descascando";
        report.location = "Muro dos fundos";
        report.category = "Estrutura";
        report.priority = "ALTA";
        report.description = "A tinta está saindo em placas";
        report = reports.save(report);
        Budget budget = budget(report.id, "3000.00", "ENTRADA", "900", 2);
        assertThat(budget.paymentMode).isEqualTo("ENTRADA");
        assertThat(budget.downPayment).isEqualByComparingTo("900.00");
        assertThat(budget.paymentInstallments).isEqualTo(2);

        approve(budget);
        ServiceOrder service = serviceOf(budget);
        assertThat(service.status).isEqualTo("APROVADO");
        assertThat(service.title).isEqualTo("Pintura do muro");
        assertThat(service.description).isEqualTo("Lixar e pintar o muro todo");
        assertThat(service.supplier).isEqualTo("Pinta Bem");
        assertThat(service.supplierDocument).isEqualTo("12345678000190");
        assertThat(service.expectedValue).isEqualByComparingTo("3000.00");
        assertThat(service.plannedDate).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(service.category).isEqualTo("Estrutura");
        assertThat(service.priority).isEqualTo("ALTA");
        assertThat(service.problemReportId).isEqualTo(report.id);
        assertThat(reports.findById(report.id).orElseThrow().serviceId).isEqualTo(service.id);
        assertThat(events.findByReportIdOrderByCreatedAtAscIdAsc(report.id)).extracting(event -> event.message)
            .anyMatch(message -> message.startsWith("Virou o serviço #" + service.id));

        // A refused budget opens nothing.
        Budget refused = budget(null, "500.00", null, null, null);
        for (int number : new int[]{2, 3, 5, 7}) {
            voting.vote(refused.id, "RECUSAR", voters.get(number));
        }
        assertThat(budgets.findById(refused.id).orElseThrow().serviceId).isNull();

        // Approved when the deadline closes the voting, it opens the service too.
        Budget late = budget(null, "400.00", "A_VISTA", null, null);
        voting.vote(late.id, "APROVAR", voters.get(2));
        voting.vote(late.id, "APROVAR", voters.get(3));
        voting.vote(late.id, "APROVAR", voters.get(5));
        Budget due = budgets.findById(late.id).orElseThrow();
        due.votingDeadline = BudgetVotingService.today().minusDays(1);
        budgets.save(due);
        assertThat(voting.expireDue(BudgetVotingService.today())).isEqualTo(1);
        assertThat(serviceOf(late).expectedValue).isEqualByComparingTo("400.00");
    }

    @Test
    void howTheSupplierIsPaidIsPartOfWhatIsVoted() {
        assertStatus(() -> budget(null, "1000.00", "ENTRADA", "1000", 1), HttpStatus.BAD_REQUEST);
        assertStatus(() -> budget(null, "1000.00", "ENTRADA", null, 1), HttpStatus.BAD_REQUEST);
        assertStatus(() -> budget(null, "1000.00", "PARCELADO", null, 1), HttpStatus.BAD_REQUEST);
        assertStatus(() -> budget(null, "1000.00", "BOLETO", null, null), HttpStatus.BAD_REQUEST);
        Budget once = budget(null, "1000.00", " a_vista ", "300", 4);
        assertThat(once.paymentMode).isEqualTo("A_VISTA");
        assertThat(once.downPayment).isNull();
        assertThat(once.paymentInstallments).isNull();
        assertThat(budget(null, "1000.00", null, null, null).paymentMode).isNull();

        // Changing it after someone voted starts the voting over, as changing the value does.
        Budget voted = budget(null, "1000.00", "A_VISTA", null, null);
        voting.vote(voted.id, "APROVAR", voters.get(2));
        Budget changed = terms(voted, "PARCELADO", null, 3);
        workflow.updateBudget(voted.id, changed);
        assertThat(votes.findByBudgetId(voted.id)).isEmpty();
        assertThat(budgets.findById(voted.id).orElseThrow().paymentInstallments).isEqualTo(3);

        // Saving it again the same way keeps the votes.
        voting.vote(voted.id, "APROVAR", voters.get(3));
        workflow.updateBudget(voted.id, terms(voted, "PARCELADO", null, 3));
        assertThat(votes.findByBudgetId(voted.id)).hasSize(1);
    }

    @Test
    void aDownPaymentAndTheRestAreBillsOfTheService() throws Exception {
        Budget budget = budget(null, "3000.00", "ENTRADA", "900", 2);
        approve(budget);
        ServiceOrder service = serviceOf(budget);

        JsonNode created = call(post("/api/payables"), "{\"description\":\"Pintura do muro\",\"amount\":3000,\"dueDate\":\"2026-11-02\","
            + "\"downPayment\":900,\"installments\":2,\"restDueDate\":\"2026-12-01\",\"serviceOrderId\":" + service.id + "}", 200);
        assertThat(created).hasSize(3);
        JsonNode entry = created.get(0);
        assertThat(entry.get("description").asText()).isEqualTo("Pintura do muro - entrada");
        assertThat(entry.get("amount").decimalValue()).isEqualByComparingTo("900.00");
        assertThat(entry.get("dueDate").asText()).isEqualTo("2026-11-02");
        assertThat(entry.get("budgetId").asLong()).isEqualTo(budget.id);
        assertThat(created.get(1).get("description").asText()).isEqualTo("Pintura do muro - restante");
        assertThat(created.get(1).get("amount").decimalValue()).isEqualByComparingTo("1050.00");
        assertThat(created.get(1).get("dueDate").asText()).isEqualTo("2026-12-01");
        assertThat(created.get(2).get("dueDate").asText()).isEqualTo("2027-01-01");
        assertThat(created.get(2).get("installment").asInt()).isEqualTo(2);
        assertThat(created).allSatisfy(bill -> assertThat(bill.get("serviceOrderId").asLong()).isEqualTo(service.id));

        // The rest cannot fall due before the down payment, and the down payment is a part of the whole.
        call(post("/api/payables"), "{\"description\":\"Outra\",\"amount\":100,\"dueDate\":\"2026-11-02\",\"downPayment\":100}", 400);
        call(post("/api/payables"), "{\"description\":\"Outra\",\"amount\":100,\"dueDate\":\"2026-11-02\",\"downPayment\":30,\"restDueDate\":\"2026-11-01\"}", 400);

        // Paying the down payment books it on the service and the job is under way.
        call(post("/api/payables/" + entry.get("id").asLong() + "/pay"), "{\"paidAt\":\"" + BudgetVotingService.today() + "\",\"method\":\"PIX\"}", 200);
        assertThat(expenses.findByServiceOrderId(service.id)).singleElement().satisfies(expense -> {
            assertThat(expense.amount).isEqualByComparingTo("900.00");
            assertThat(expense.budgetId).isEqualTo(budget.id);
        });
        assertThat(services.findById(service.id).orElseThrow().status).isEqualTo("EM_ANDAMENTO");

        // Finishing never books the payment a second time: the bills do it.
        assertStatus(() -> workflow.finishService(service.id, finish("3000.00", true)), HttpStatus.CONFLICT);
        assertThat(workflow.finishService(service.id, finish("3000.00", false)).status).isEqualTo("FINALIZADO");
        assertThat(expenses.findByServiceOrderId(service.id)).hasSize(1);
    }

    @Test
    void everythingPaidForTheJobStaysWithinWhatWasApproved() throws Exception {
        Budget budget = budget(null, "1000.00", "A_VISTA", null, null);
        approve(budget);
        ServiceOrder service = serviceOf(budget);

        // A bill made from the approved budget (as the older screens do) belongs to the service it became.
        JsonNode first = call(post("/api/payables"), "{\"description\":\"Pintura\",\"amount\":800,\"dueDate\":\"2026-11-10\",\"budgetId\":" + budget.id + "}", 200);
        assertThat(first.get(0).get("serviceOrderId").asLong()).isEqualTo(service.id);

        // 800 + 400 passes the 1.100 (approved plus 10%): only with a reason everybody reads.
        JsonNode over = call(post("/api/payables"), "{\"description\":\"Pintura extra\",\"amount\":400,\"dueDate\":\"2026-11-10\",\"serviceOrderId\":" + service.id + "}", 409);
        assertThat(over.get("error").asText()).contains("Somando").contains("R$ 800,00").contains("R$ 1.100,00");
        JsonNode allowed = call(post("/api/payables"), "{\"description\":\"Pintura extra\",\"amount\":400,\"dueDate\":\"2026-11-10\",\"serviceOrderId\":"
            + service.id + ",\"exceptionReason\":\"A parede tinha infiltração e precisou de massa a mais.\"}", 200);
        assertThat(allowed.get(0).get("exceptionReason").asText()).startsWith("A parede");

        // A bill for a cancelled service is refused.
        workflow.cancelService(service.id, "admin@teste.dev");
        call(post("/api/payables"), "{\"description\":\"Pintura\",\"amount\":10,\"dueDate\":\"2026-11-10\",\"serviceOrderId\":" + service.id + "}", 409);
    }

    @Test
    void cancellingTheServiceCancelsWhatIsLeftToPay() throws Exception {
        Budget budget = budget(null, "2000.00", "ENTRADA", "500", 1);
        approve(budget);
        ServiceOrder service = serviceOf(budget);
        JsonNode created = call(post("/api/payables"), "{\"description\":\"Telhado\",\"amount\":2000,\"dueDate\":\"2026-11-02\","
            + "\"downPayment\":500,\"serviceOrderId\":" + service.id + "}", 200);
        assertThat(created).hasSize(2);
        assertThat(created.get(1).get("dueDate").asText()).isEqualTo("2026-12-02");
        call(post("/api/payables/" + created.get(0).get("id").asLong() + "/pay"), "{\"paidAt\":\"" + BudgetVotingService.today() + "\",\"method\":\"PIX\"}", 200);

        workflow.cancelService(service.id, "admin@teste.dev");
        Payable entry = payables.findById(created.get(0).get("id").asLong()).orElseThrow();
        Payable rest = payables.findById(created.get(1).get("id").asLong()).orElseThrow();
        assertThat(entry.status).isEqualTo(Payable.PAID);
        assertThat(rest.status).isEqualTo(Payable.CANCELLED);
        assertThat(rest.cancelReason).contains("cancelado");
        assertThat(rest.cancelledBy).isEqualTo("admin@teste.dev");
        // What was already paid stays in the cash box.
        assertThat(expenses.findByServiceOrderId(service.id)).hasSize(1);
    }

    private Budget budget(Long reportId, String amount, String mode, String down, Integer parts) {
        Budget budget = new Budget();
        budget.title = "Pintura do muro";
        budget.supplier = "Pinta Bem";
        budget.supplierDocument = "12345678000190";
        budget.amount = new BigDecimal(amount);
        budget.scope = "Lixar e pintar o muro todo";
        budget.expectedDate = LocalDate.of(2026, 12, 1);
        budget.problemReportId = reportId;
        budget.paymentMode = mode;
        budget.downPayment = down == null ? null : new BigDecimal(down);
        budget.paymentInstallments = parts;
        return workflow.saveBudget(budget);
    }

    /** The same budget as the form sends it back, with another way of paying. */
    private static Budget terms(Budget source, String mode, String down, Integer parts) {
        Budget budget = new Budget();
        budget.title = source.title;
        budget.supplier = source.supplier;
        budget.supplierDocument = source.supplierDocument;
        budget.amount = source.amount;
        budget.scope = source.scope;
        budget.expectedDate = source.expectedDate;
        budget.paymentMode = mode;
        budget.downPayment = down == null ? null : new BigDecimal(down);
        budget.paymentInstallments = parts;
        return budget;
    }

    private void approve(Budget budget) {
        for (int number : new int[]{2, 3, 5, 7}) {
            voting.vote(budget.id, "APROVAR", voters.get(number));
        }
    }

    private ServiceOrder serviceOf(Budget budget) {
        Long serviceId = budgets.findById(budget.id).orElseThrow().serviceId;
        assertThat(serviceId).as("an approved budget becomes a service").isNotNull();
        return services.findById(serviceId).orElseThrow();
    }

    private static FinishServiceRequest finish(String value, boolean generateExpense) {
        return new FinishServiceRequest(new BigDecimal(value), LocalDate.of(2026, 12, 20), "Pinta Bem", null, null, generateExpense, null, null);
    }

    private JsonNode call(MockHttpServletRequestBuilder request, String body, int expected) throws Exception {
        String text = mvc.perform(request.header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expected))
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return text.isBlank() ? null : json.readTree(text);
    }

    private static void assertStatus(Runnable action, HttpStatus status) {
        assertThatThrownBy(action::run)
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(status));
    }
}
