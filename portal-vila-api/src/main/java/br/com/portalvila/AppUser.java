package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** The account is not filtered by condominium (the login looks it up before any condominium is known). */
    @JsonIgnore
    @Column(name = "condominium_id", nullable = false)
    public Long condominiumId = TenantContext.VILA;

    @Column(nullable = false)
    public String name;

    @Column(nullable = false, unique = true)
    public String email;

    @JsonIgnore
    @Column(nullable = false)
    public String passwordHash;

    @Column(nullable = false)
    public String role;

    public Long residentId;

    @Column(nullable = false)
    public boolean active = true;

    @Column(nullable = false)
    public boolean mustChangePassword = false;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public AppUser() {
    }

    public AppUser(String name, String email, String passwordHash, String role, Long residentId) {
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.residentId = residentId;
    }
}
