package br.com.portalvila;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface HouseRepository extends JpaRepository<House, Long> {
    List<House> findByActiveTrueOrderByNumberAsc();
    Optional<House> findByNumber(Integer number);
    long countByActiveTrue();
}

interface ResidentRepository extends JpaRepository<Resident, Long> {
    Optional<Resident> findFirstByHouseIdAndStatusOrderByCreatedAtDesc(Long houseId, String status);
    Optional<Resident> findFirstByGatewayCustomerIdAndStatusOrderByCreatedAtDesc(String gatewayCustomerId, String status);
    List<Resident> findAllByOrderByHouseIdAsc();
    List<Resident> findByStatusOrderByCreatedAtDesc(String status);
    long countByStatus(String status);
}

interface CondominiumRepository extends JpaRepository<Condominium, Long> {
    List<Condominium> findByStatusOrderByIdAsc(String status);
    boolean existsBySlug(String slug);
}

/**
 * Accounts are not filtered by condominium (signing in finds the account before any condominium is known), so a
 * query that lists accounts names the condominium itself.
 */
interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmailIgnoreCase(String email);
    Optional<AppUser> findByResidentId(Long residentId);
    List<AppUser> findByCondominiumId(Long condominiumId);
    List<AppUser> findByCondominiumIdAndRole(Long condominiumId, String role);
}

interface PasswordResetCodeRepository extends JpaRepository<PasswordResetCode, Long> {
    Optional<PasswordResetCode> findFirstByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(Long userId);
    List<PasswordResetCode> findByUserIdAndUsedAtIsNull(Long userId);
    long countByUserIdAndCreatedAtAfter(Long userId, java.time.LocalDateTime since);
}

interface SettingsRepository extends JpaRepository<Settings, Long> {
}

interface ContributionRepository extends JpaRepository<Contribution, Long> {
    Optional<Contribution> findFirstByHouseIdAndReferenceMonthOrderByCreatedAtAsc(Long houseId, String referenceMonth);
    List<Contribution> findByHouseIdAndReferenceMonthOrderByCreatedAtAsc(Long houseId, String referenceMonth);
    List<Contribution> findByReferenceMonthOrderByHouseIdAsc(String referenceMonth);
    List<Contribution> findByReferenceMonthAndResidentIdOrderByHouseIdAsc(String referenceMonth, Long residentId);
    List<Contribution> findByResidentIdOrderByReferenceMonthDesc(Long residentId);
}

interface PixChargeRepository extends JpaRepository<PixCharge, Long> {
    Optional<PixCharge> findByGatewayAndGatewayPaymentId(String gateway, String gatewayPaymentId);
    Optional<PixCharge> findFirstByGatewayAndExternalReferenceOrderByCreatedAtAsc(String gateway, String externalReference);
    Optional<PixCharge> findByContributionId(Long contributionId);
}

interface WebhookEventRepository extends JpaRepository<WebhookEvent, Long> {
    boolean existsByGatewayAndEventId(String gateway, String eventId);
    boolean existsByGatewayAndGatewayPaymentIdAndEventType(String gateway, String gatewayPaymentId, String eventType);
    List<WebhookEvent> findTop100ByOrderByCreatedAtDesc();
}

interface ExpenseRepository extends JpaRepository<Expense, Long> {
    List<Expense> findByServiceOrderId(Long serviceOrderId);
}

interface DirectReceiptRepository extends JpaRepository<DirectReceipt, Long> {
    Optional<DirectReceipt> findByGatewayAndGatewayPaymentId(String gateway, String gatewayPaymentId);
    List<DirectReceipt> findByStatusOrderByReceivedAtDesc(String status);
    List<DirectReceipt> findByReferenceMonthAndStatusOrderByReceivedAtDesc(String referenceMonth, String status);
}

interface ServiceOrderRepository extends JpaRepository<ServiceOrder, Long> {
    List<ServiceOrder> findByProblemReportId(Long problemReportId);
    List<ServiceOrder> findByStatusOrderByCreatedAtDesc(String status);
}

interface BudgetRepository extends JpaRepository<Budget, Long> {
    List<Budget> findByServiceIdOrderByAmountAsc(Long serviceId);
    List<Budget> findByServiceIdAndStatus(Long serviceId, String status);
    List<Budget> findByStatus(String status);
    List<Budget> findByProblemReportId(Long problemReportId);
    List<Budget> findByStatusAndVotingDeadlineBefore(String status, java.time.LocalDate date);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Budget b where b.id = :id")
    Optional<Budget> findByIdForUpdate(@Param("id") Long id);
}

interface BudgetVoteRepository extends JpaRepository<BudgetVote, Long> {
    List<BudgetVote> findByBudgetId(Long budgetId);
    Optional<BudgetVote> findByBudgetIdAndHouseId(Long budgetId, Long houseId);
    boolean existsByBudgetId(Long budgetId);
    void deleteByBudgetId(Long budgetId);
}

interface PortalDocumentRepository extends JpaRepository<PortalDocument, Long> {
    List<PortalDocument> findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc(String relatedType, Long relatedId);
    List<PortalDocument> findByRelatedType(String relatedType);
}

interface ExcludedGatewayPaymentRepository extends JpaRepository<ExcludedGatewayPayment, Long> {
    boolean existsByGatewayAndGatewayPaymentId(String gateway, String gatewayPaymentId);
}

interface AuditEntryRepository extends JpaRepository<AuditEntry, Long> {
    List<AuditEntry> findTop200ByOrderByCreatedAtDescIdDesc();
    List<AuditEntry> findTop12ByOrderByCreatedAtDescIdDesc();
    List<AuditEntry> findByActorEmailIgnoreCase(String actorEmail);
}

interface ProblemReportRepository extends JpaRepository<ProblemReport, Long> {
    List<ProblemReport> findAllByOrderByCreatedAtDesc();
    List<ProblemReport> findByStatusOrderByCreatedAtDesc(String status);
}

interface PushTokenRepository extends JpaRepository<PushToken, Long> {
    Optional<PushToken> findByToken(String token);
    List<PushToken> findByUserIdIn(java.util.Collection<Long> userIds);
    void deleteByToken(String token);
}

interface ProblemReportEventRepository extends JpaRepository<ProblemReportEvent, Long> {
    List<ProblemReportEvent> findByReportIdOrderByCreatedAtAscIdAsc(Long reportId);
}

interface HouseInviteRepository extends JpaRepository<HouseInvite, Long> {
    Optional<HouseInvite> findByCodeHash(String codeHash);
    List<HouseInvite> findByHouseIdAndUsedAtIsNullAndRevokedAtIsNull(Long houseId);
    List<HouseInvite> findByUsedAtIsNullAndRevokedAtIsNullOrderByCreatedAtDesc();
}
