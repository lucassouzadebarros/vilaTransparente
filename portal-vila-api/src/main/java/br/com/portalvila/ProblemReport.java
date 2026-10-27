package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.hibernate.annotations.TenantId;

@Entity
@Table(name = "problem_reports")
public class ProblemReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @JsonIgnore
    @TenantId
    @Column(name = "condominium_id", nullable = false, updatable = false)
    public Long condominiumId;

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

    /** The service opened to fix this problem, if any. */
    public Long serviceId;

    /** How many photos were sent with the report. Filled when listing; not stored. */
    @Transient
    public Integer photoCount;
    public Long residentId;
    public Long houseId;
    public Long createdBy;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
