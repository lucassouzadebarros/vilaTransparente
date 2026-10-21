package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** One line in the life of a problem report: it was opened, changed situation, became a service, or got a comment. */
@Entity
@Table(name = "problem_report_events")
public class ProblemReportEvent {
    public static final String CREATED = "CREATED";
    public static final String STATUS = "STATUS";
    public static final String SERVICE = "SERVICE";
    public static final String COMMENT = "COMMENT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long reportId;

    @Column(nullable = false, length = 20)
    public String kind;

    /** "Casa 10", "Administração", "Síndico" or "Sistema": never the person's name. */
    @Column(length = 80)
    public String author;

    @Column(nullable = false, columnDefinition = "text")
    public String message;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();
}
