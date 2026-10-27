package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** One condominium the app serves. The Vila is the first (id 1). Not filtered: it is what the filter is about. */
@Entity
@Table(name = "condominiums")
public class Condominium {
    static final String ACTIVE = "ACTIVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String name;

    @Column(nullable = false, unique = true)
    public String slug;

    @Column(nullable = false)
    public String status = ACTIVE;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public Condominium() {
    }

    public Condominium(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }
}
