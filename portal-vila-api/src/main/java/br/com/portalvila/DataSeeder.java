package br.com.portalvila;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Component
class DataSeeder implements CommandLineRunner {
    private final boolean enabled;
    private final HouseRepository houses;
    private final AppUserRepository users;
    private final SettingsRepository settingsRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;

    DataSeeder(
        @Value("${portal.seed.enabled:true}") boolean enabled,
        @Value("${portal.admin.email:admin@vila.com}") String adminEmail,
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
            settings.webhookSecret = "dev-webhook-token";
            settingsRepository.save(settings);
        }

        if (houses.count() == 0) {
            for (int i = 1; i <= 11; i++) {
                houses.save(new House(i, "Casa " + String.format("%02d", i)));
            }
        }

        users.findByEmailIgnoreCase(adminEmail).orElseGet(() -> users.save(new AppUser(
            "Administrador",
            adminEmail,
            passwordEncoder.encode(adminPassword),
            "ADMIN",
            null
        )));
    }
}
