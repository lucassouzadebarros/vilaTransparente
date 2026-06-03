package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "residents")
public class Resident {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long houseId;

    @Column(nullable = false)
    public String name;

    @Column(nullable = false, unique = true)
    public String email;

    public String phone;
    public String documentMasked;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    public String documentNumber;

    public String gatewayCustomerId;

    @Column(nullable = false)
    public String status = "ACTIVE";

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public Resident() {
    }

    public Resident(Long houseId, String name, String email, String phone, String documentMasked) {
        this.houseId = houseId;
        this.name = name;
        this.email = email;
        this.phone = phone;
        this.documentMasked = documentMasked;
    }

    @JsonProperty("documentRegistered")
    public boolean isDocumentRegistered() {
        return documentNumber != null && !documentNumber.isBlank();
    }
}
