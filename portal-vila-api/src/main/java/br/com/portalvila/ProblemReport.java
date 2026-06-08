package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "problem_reports")
public class ProblemReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String location;

    @Column(nullable = false)
    public String category;

    @Column(nullable = false)
    public String priority = "MEDIA";

    @Column(nullable = false)
    public String status = "ABERTO";

    @Column(nullable = false, columnDefinition = "text")
    public String description;

    public String attachmentName;
    public Long residentId;
    public Long houseId;
    public Long createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
