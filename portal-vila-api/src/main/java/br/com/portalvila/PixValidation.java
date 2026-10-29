package br.com.portalvila;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Where Asaas asks, before a withdrawal leaves a condominium's account, whether this server requested it. Not filtered
 * by condominium: the request finds it by its route. The token is sealed ({@link SecretBox}) so the administration can
 * read it again to type it in Asaas.
 */
@Entity
@Table(name = "pix_validations")
public class PixValidation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "condominium_id", nullable = false, unique = true)
    public Long condominiumId;

    @Column(nullable = false, unique = true)
    public String routeKey;

    @Column(nullable = false, columnDefinition = "text")
    public String tokenSealed;

    public String createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public LocalDateTime lastCheckAt;
}
