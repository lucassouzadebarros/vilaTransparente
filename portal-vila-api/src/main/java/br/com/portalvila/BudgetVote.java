package br.com.portalvila;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** One house's vote on a budget. A house has a single vote; voting again replaces it. */
@Entity
@Table(
    name = "budget_votes",
    uniqueConstraints = @UniqueConstraint(name = "uk_budget_vote_house", columnNames = {"budget_id", "house_id"})
)
public class BudgetVote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false)
    public Long budgetId;

    @Column(nullable = false)
    public Long houseId;

    @Column(nullable = false)
    public Long residentId;

    @Column(nullable = false)
    public String vote;

    @Column(nullable = false)
    public LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    public LocalDateTime updatedAt = LocalDateTime.now();
}
