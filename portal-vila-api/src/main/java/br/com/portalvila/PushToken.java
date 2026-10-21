package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "push_tokens")
public class PushToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long userId;

    @Column(nullable = false, length = 200)
    public String token;

    public String platform;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
