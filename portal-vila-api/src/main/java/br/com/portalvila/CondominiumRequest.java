package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** A request, from the public form, for a condominium to use the app. Not inside any condominium: it comes first. */
@Entity
@Table(name = "condominium_requests")
public class CondominiumRequest {
    static final String PENDING = "PENDING";
    static final String APPROVED = "APPROVED";
    static final String REJECTED = "REJECTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String condominiumName;

    @Column(nullable = false)
    public String city;

    @Column(nullable = false)
    public String state;

    @Column(nullable = false)
    public Integer units;

    @Column(nullable = false)
    public String contactName;

    @Column(nullable = false)
    public String contactEmail;

    public String contactPhone;

    /** SIM, NAO or NAO_SEI: whether the condominium already has an Asaas account (for Pix later). */
    @Column(nullable = false)
    public String hasAsaas = "NAO_SEI";

    public String message;

    @Column(nullable = false)
    public String status = PENDING;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public LocalDateTime decidedAt;
    public String decidedBy;
    public String decisionNote;
    public Long condominiumId;
}
