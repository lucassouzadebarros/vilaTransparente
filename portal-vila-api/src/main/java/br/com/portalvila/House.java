package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "houses")
public class House {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, unique = true)
    public Integer number;

    @Column(nullable = false)
    public String label;

    @Column(nullable = false)
    public boolean active = true;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    public House() {
    }

    public House(Integer number, String label) {
        this.number = number;
        this.label = label;
    }
}
