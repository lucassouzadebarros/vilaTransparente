package br.com.portalvila;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class FinancialServiceTest {
    @Autowired
    FinancialService financialService;

    @Autowired
    HouseRepository houses;

    @Autowired
    ResidentRepository residents;

    @Autowired
    ContributionRepository contributions;

    @Autowired
    ExpenseRepository expenses;

    @BeforeEach
    void cleanDatabase() {
        expenses.deleteAll();
        contributions.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
    }

    @Test
    void calculatesBalanceOnlyWithPaidContributionsAndExpenses() {
        House houseOne = houses.save(new House(1, "Casa 01"));
        House houseTwo = houses.save(new House(2, "Casa 02"));
        Resident residentOne = residents.save(new Resident(houseOne.id, "Lucas", "lucas@test.dev", null, "***.111.***-**"));
        Resident residentTwo = residents.save(new Resident(houseTwo.id, "Maria", "maria@test.dev", null, "***.222.***-**"));

        Contribution paid = new Contribution();
        paid.houseId = houseOne.id;
        paid.residentId = residentOne.id;
        paid.referenceMonth = "2026-05";
        paid.amount = BigDecimal.valueOf(100);
        paid.paidAmount = BigDecimal.valueOf(100);
        paid.status = "PAID";
        contributions.save(paid);

        Contribution pending = new Contribution();
        pending.houseId = houseTwo.id;
        pending.residentId = residentTwo.id;
        pending.referenceMonth = "2026-05";
        pending.amount = BigDecimal.valueOf(100);
        pending.status = "PENDING";
        contributions.save(pending);

        Expense expense = new Expense();
        expense.description = "Manutencao";
        expense.amount = BigDecimal.valueOf(40);
        expense.expenseDate = LocalDate.of(2026, 5, 12);
        expenses.save(expense);

        DashboardResponse dashboard = financialService.dashboard("2026-05");

        assertThat(dashboard.collected()).isEqualByComparingTo("100");
        assertThat(dashboard.pending()).isEqualByComparingTo("100");
        assertThat(dashboard.balance()).isEqualByComparingTo("60");
        assertThat(dashboard.transparencyEnabled()).isTrue();
    }

    @Test
    void residentOnlySeesAccumulatedBalanceAfterFirstPaidContribution() {
        House houseOne = houses.save(new House(3, "Casa 03"));
        House houseTwo = houses.save(new House(4, "Casa 04"));
        Resident paidResident = residents.save(new Resident(houseOne.id, "Lucas", "lucas-paid@test.dev", null, "***.111.***-**"));
        Resident newResident = residents.save(new Resident(houseTwo.id, "Maria", "maria-new@test.dev", null, "***.222.***-**"));

        Contribution paid = new Contribution();
        paid.houseId = houseOne.id;
        paid.residentId = paidResident.id;
        paid.referenceMonth = "2026-06";
        paid.amount = BigDecimal.valueOf(100);
        paid.paidAmount = BigDecimal.valueOf(100);
        paid.status = "PAID";
        contributions.save(paid);

        Contribution pending = new Contribution();
        pending.houseId = houseTwo.id;
        pending.residentId = newResident.id;
        pending.referenceMonth = "2026-06";
        pending.amount = BigDecimal.valueOf(100);
        pending.status = "PENDING";
        contributions.save(pending);

        DashboardResponse locked = financialService.dashboardForResident("2026-06", newResident.id);
        DashboardResponse unlocked = financialService.dashboardForResident("2026-06", paidResident.id);

        assertThat(locked.transparencyEnabled()).isFalse();
        assertThat(locked.balance()).isEqualByComparingTo("0");
        assertThat(locked.movements()).isEmpty();
        assertThat(unlocked.transparencyEnabled()).isTrue();
        assertThat(unlocked.balance()).isEqualByComparingTo("100");
        assertThat(unlocked.movements()).extracting(MovementResponse::description).contains("Mensalidade recebida");
    }
}
