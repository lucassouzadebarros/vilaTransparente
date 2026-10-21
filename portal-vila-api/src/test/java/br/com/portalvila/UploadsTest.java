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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Photos on problem reports and the file rules for every upload. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "portal.uploads.dir=target/test-uploads")
class UploadsTest {
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0, 1};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13};
    private static final byte[] PDF = "%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII);

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired ResidentRepository residents;
    @Autowired HouseRepository houses;
    @Autowired ProblemReportRepository reports;
    @Autowired PortalDocumentRepository documents;
    @MockBean PixGatewayClient gatewayClient;

    private AppUser reporter;
    private AppUser neighbour;
    private AppUser admin;
    private ProblemReport report;

    @BeforeEach
    void setUp() {
        documents.deleteAll();
        reports.deleteAll();
        users.deleteAll();
        residents.deleteAll();
        houses.deleteAll();
        reporter = resident(2, "casa2@teste.dev");
        neighbour = resident(3, "casa3@teste.dev");
        admin = users.save(new AppUser("Admin", "admin@teste.dev", encoder.encode("SenhaAdmin1"), "ADMIN", null));
        report = new ProblemReport();
        report.title = "Portão";
        report.location = "Portão";
        report.category = "Portão";
        report.description = "Não fecha";
        report.createdBy = reporter.id;
        report = reports.save(report);
    }

    private AppUser resident(int number, String email) {
        House house = houses.save(new House(number, String.format("Casa %02d", number)));
        Resident resident = residents.save(new Resident(house.id, "Morador " + number, email, null, null));
        return users.save(new AppUser("Morador", email, encoder.encode("SenhaMorador1"), "RESIDENT", resident.id));
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwt.issue(user);
    }

    private org.springframework.test.web.servlet.ResultActions upload(AppUser user, MockMultipartFile file) throws Exception {
        return mvc.perform(multipart("/api/problem-reports/" + report.id + "/photos").file(file).header("Authorization", bearer(user)));
    }

    private static MockMultipartFile photo(String name, byte[] bytes) {
        return new MockMultipartFile("file", name, "application/octet-stream", bytes);
    }

    @Test
    void theReporterAddsPhotosAndEveryoneSeesTheCount() throws Exception {
        MvcResult saved = upload(reporter, photo("cano.jpg", JPEG)).andExpect(status().isOk()).andReturn();
        JsonNode document = json.readTree(saved.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(document.get("type").asText()).isEqualTo("FOTO");
        assertThat(document.get("relatedType").asText()).isEqualTo("PROBLEM_REPORT");
        upload(reporter, photo("lado.png", PNG)).andExpect(status().isOk());

        JsonNode list = json.readTree(mvc.perform(get("/api/problem-reports").header("Authorization", bearer(neighbour)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(list.get(0).get("photoCount").asInt()).isEqualTo(2);

        // The photo is served as an image to whoever is signed in, and it stays out of the documents library.
        mvc.perform(get("/api/documents/" + document.get("id").asLong() + "/file").header("Authorization", bearer(neighbour)))
            .andExpect(status().isOk())
            .andExpect(content().contentType("image/jpeg"));
        JsonNode library = json.readTree(mvc.perform(get("/api/documents").header("Authorization", bearer(neighbour)))
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(library).isEmpty();
    }

    @Test
    void onlyTheReporterOrTheAdminChangesPhotos() throws Exception {
        upload(neighbour, photo("cano.jpg", JPEG)).andExpect(status().isForbidden());
        MvcResult saved = upload(admin, photo("cano.jpg", JPEG)).andExpect(status().isOk()).andReturn();
        long documentId = json.readTree(saved.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();

        mvc.perform(delete("/api/problem-reports/" + report.id + "/photos/" + documentId).header("Authorization", bearer(neighbour)))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/api/problem-reports/" + report.id + "/photos/" + documentId).header("Authorization", bearer(reporter)))
            .andExpect(status().isOk());
        assertThat(documents.findById(documentId)).isEmpty();
    }

    @Test
    void aReportTakesAtMostThreePhotos() throws Exception {
        for (int i = 0; i < 3; i++) {
            upload(reporter, photo("foto" + i + ".jpg", JPEG)).andExpect(status().isOk());
        }
        upload(reporter, photo("quarta.jpg", JPEG)).andExpect(status().isConflict());
    }

    @Test
    void filesThatAreNotPhotosAreRefused() throws Exception {
        upload(reporter, photo("pagina.html", "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8))).andExpect(status().isBadRequest());
        upload(reporter, photo("falso.jpg", "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8))).andExpect(status().isBadRequest());
        upload(reporter, photo("nota.pdf", PDF)).andExpect(status().isBadRequest());
        assertThat(documents.count()).isZero();
    }

    @Test
    void documentUploadsTakePdfsAndPhotosOnly() throws Exception {
        MockMultipartFile receipt = new MockMultipartFile("file", "recibo.jpg", "image/jpeg", JPEG);
        mvc.perform(multipart("/api/documents/upload").file(receipt).param("name", "Recibo").param("type", "RECIBO")
                .header("Authorization", bearer(admin)))
            .andExpect(status().isOk());
        MockMultipartFile pdf = new MockMultipartFile("file", "nota.pdf", "application/pdf", PDF);
        mvc.perform(multipart("/api/documents/upload").file(pdf).param("name", "Nota").param("type", "NOTA_FISCAL")
                .header("Authorization", bearer(admin)))
            .andExpect(status().isOk());
        MockMultipartFile script = new MockMultipartFile("file", "x.html", "text/html", "<b>x</b>".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/documents/upload").file(script).param("name", "X").param("type", "OUTRO")
                .header("Authorization", bearer(admin)))
            .andExpect(status().isBadRequest());
    }
}
