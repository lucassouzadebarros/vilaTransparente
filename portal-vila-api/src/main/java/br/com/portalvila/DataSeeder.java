package br.com.portalvila;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Component
class DataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    private final boolean enabled;
    private final HouseRepository houses;
    private final AppUserRepository users;
    private final SettingsRepository settingsRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;

    DataSeeder(
        @Value("${portal.seed.enabled:true}") boolean enabled,
        @Value("${portal.admin.email:ubaldinajacare207@gmail.com}") String adminEmail,
        @Value("${portal.admin.password:123456}") String adminPassword,
        HouseRepository houses,
        AppUserRepository users,
        SettingsRepository settingsRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.enabled = enabled;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.houses = houses;
        this.users = users;
        this.settingsRepository = settingsRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!enabled) {
            return;
        }

        if (settingsRepository.count() == 0) {
            Settings settings = new Settings();
            settings.villageName = "Portal da Vila";
            settings.monthlyAmount = BigDecimal.valueOf(100);
            settings.paymentDueDay = 10;
            settings.gatewayProvider = "ASAAS";
            settingsRepository.save(settings);
        }

        if (houses.count() == 0) {
            for (int i = 1; i <= 11; i++) {
                houses.save(new House(i, "Casa " + String.format("%02d", i)));
            }
        }

        users.findByEmailIgnoreCase(adminEmail).orElseGet(() -> {
            if ("123456".equals(adminPassword)) {
                log.warn("Administrador criado com a senha padrao 123456. Defina PORTAL_ADMIN_PASSWORD e troque a senha agora.");
            }
            return users.save(new AppUser(
                "Administrador",
                adminEmail,
                passwordEncoder.encode(adminPassword),
                "ADMIN",
                null
            ));
        });
    }
}
