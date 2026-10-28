package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.LocalDateTime;

/** Someone the condominium pays: a company or a person, with the Pix key the payments go to. */
@Entity
@Table(name = "suppliers")
public class Supplier {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

    @Column(nullable = false)
    public String name;

    /** CPF or CNPJ, digits only. */
    public String document;

    public String pixKey;

    /** CPF, CNPJ, EMAIL, PHONE or EVP (the random key), as Asaas names them. */
    public String pixKeyType;

    public String phone;
    public String email;

    @Column(columnDefinition = "text")
    public String notes;

    @Column(nullable = false)
    public boolean active = true;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
