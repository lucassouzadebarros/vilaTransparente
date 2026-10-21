package br.com.portalvila;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableMethodSecurity
@EnableScheduling
@ConfigurationPropertiesScan
public class PortalVilaApplication {
    public static void main(String[] args) {
        SpringApplication.run(PortalVilaApplication.class, args);
    }
}
