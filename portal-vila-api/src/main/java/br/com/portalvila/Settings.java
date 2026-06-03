package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "settings")
public class Settings {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String villageName = "Portal da Vila";

    @Column(nullable = false)
    public BigDecimal monthlyAmount = BigDecimal.valueOf(100);

    @Column(nullable = false)
    public Integer paymentDueDay = 10;

    @Column(nullable = false)
    public String gatewayProvider = "ASAAS";

    @JsonIgnore
    public String webhookSecret;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
