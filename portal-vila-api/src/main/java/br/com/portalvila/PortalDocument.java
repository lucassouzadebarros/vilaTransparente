package br.com.portalvila;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "documents")
public class PortalDocument {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String name;

    @Column(nullable = false)
    public String type;

    @Column(nullable = false, columnDefinition = "text")
    public String url;

    public String relatedType;
    public Long relatedId;
    public Long uploadedBy;

    @JsonIgnore
    @Column(columnDefinition = "text")
    public String storagePath;

    @Column(columnDefinition = "text")
    public String description;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
