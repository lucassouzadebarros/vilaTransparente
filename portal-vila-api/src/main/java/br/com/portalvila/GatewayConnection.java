package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A condominium's own Asaas account. Not filtered by condominium: a notice from Asaas finds it by its route before
 * anyone knows whose it is. The key is sealed ({@link SecretBox}); it never leaves the server in the clear.
 */
@Entity
@Table(name = "gateway_connections")
public class GatewayConnection {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "condominium_id", nullable = false, unique = true)
    public Long condominiumId;

    @Column(nullable = false)
    public String provider = "ASAAS";

    @Column(nullable = false, columnDefinition = "text")
    public String apiKeySealed;

    @Column(nullable = false)
    public String apiKeyHint;

    public String accountName;
    public String webhookId;

    @Column(nullable = false, unique = true)
    public String routeKey;

    @Column(nullable = false)
    public String webhookTokenHash;

    public String connectedBy;

    @Column(nullable = false)
    public LocalDateTime connectedAt = LocalDateTime.now();

    public LocalDateTime lastEventAt;
}
