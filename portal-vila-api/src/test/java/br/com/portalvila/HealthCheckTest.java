package br.com.portalvila;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Render throws a deploy away when its health check does not get a 200 without logging in. The check was pointed at the
 * public list of houses; closing that list (open registration) took the check with it and the deploy was refused.
 * Both addresses must answer 200 to anyone, and neither may carry any data.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HealthCheckTest {
    @Autowired MockMvc mvc;
    @Autowired HouseRepository houses;
    @MockBean PixGatewayClient gatewayClient;

    @BeforeEach
    void setUp() {
        houses.deleteAll();
        houses.save(new House(7, "Casa 07"));
    }

    @Test
    void theHealthAddressAnswersWithoutLoggingIn() throws Exception {
        String body = mvc.perform(get("/api/health")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).contains("UP").doesNotContain("Casa");
    }

    @Test
    void theAddressRenderStillPointsAtAnswersWithoutLoggingInAndShowsNoHouses() throws Exception {
        String body = mvc.perform(get("/api/residents/registration-houses")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).isEqualTo("[]");
    }

    @Test
    void theRealListOfHousesStillNeedsTheAdministration() throws Exception {
        mvc.perform(get("/api/residents/houses")).andExpect(status().isUnauthorized());
    }
}
