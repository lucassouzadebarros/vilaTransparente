package br.com.portalvila;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class SindicoServiceTest {
    @Autowired
    SindicoService sindico;

    @Autowired
    AccessRules access;

    @Autowired
    AppUserRepository users;

    @Autowired
    ResidentRepository residents;

    @Autowired
    HouseRepository houses;

    @MockBean
    PixGatewayClient gatewayClient;

    Resident casa02;
    Resident casa05;
    Resident former;

    @BeforeEach
    void setUp() {
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        casa02 = resident(2, "ACTIVE");
        casa05 = resident(5, "ACTIVE");
        former = resident(7, "INACTIVE");
        users.save(new AppUser("Admin", "admin@test.dev", "x", "ADMIN", null));
    }

    @AfterEach
    void clearLogin() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void onlyOneHouseIsSindicoAtATime() {
        assertThat(sindico.current().residentId()).isNull();

        SindicoResponse first = sindico.choose(casa05.id);
        assertThat(first.residentId()).isEqualTo(casa05.id);
        assertThat(first.houseLabel()).isEqualTo("Casa 05");
        assertThat(roleOf(casa05)).isEqualTo("SINDICO");

        sindico.choose(casa02.id);
        assertThat(roleOf(casa05)).isEqualTo("RESIDENT");
        assertThat(roleOf(casa02)).isEqualTo("SINDICO");
        assertThat(sindico.current().houseLabel()).isEqualTo("Casa 02");

        assertThat(sindico.choose(null).residentId()).isNull();
        assertThat(users.findByRole("SINDICO")).isEmpty();

        assertThatThrownBy(() -> sindico.choose(former.id))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void sindicoAndAdminManageBudgetsButOtherResidentsDoNot() {
        sindico.choose(casa05.id);

        loginAs("casa05@test.dev");
        assertThat(access.canManageBudgets()).isTrue();
        loginAs("admin@test.dev");
        assertThat(access.canManageBudgets()).isTrue();
        loginAs("casa02@test.dev");
        assertThat(access.canManageBudgets()).isFalse();

        // Removing the síndico takes effect at once, even with the old login still open.
        sindico.choose(null);
        loginAs("casa05@test.dev");
        assertThat(access.canManageBudgets()).isFalse();
    }

    private Resident resident(int number, String status) {
        House house = houses.save(new House(number, String.format("Casa %02d", number)));
        Resident resident = new Resident(house.id, "Morador " + number, String.format("casa%02d@test.dev", number), null, null);
        resident.status = status;
        resident = residents.save(resident);
        AppUser user = new AppUser(resident.name, resident.email, "x", "RESIDENT", resident.id);
        user.active = "ACTIVE".equals(status);
        users.save(user);
        return resident;
    }

    private String roleOf(Resident resident) {
        return users.findByResidentId(resident.id).orElseThrow().role;
    }

    private static void loginAs(String email) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(email, null, List.of()));
    }
}
