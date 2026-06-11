package br.com.portalvila;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface HouseRepository extends JpaRepository<House, Long> {
    List<House> findByActiveTrueOrderByNumberAsc();
    Optional<House> findByNumber(Integer number);
}

interface ResidentRepository extends JpaRepository<Resident, Long> {
    Optional<Resident> findFirstByHouseIdAndStatusOrderByCreatedAtDesc(Long houseId, String status);
    Optional<Resident> findFirstByGatewayCustomerIdAndStatusOrderByCreatedAtDesc(String gatewayCustomerId, String status);
    List<Resident> findAllByOrderByHouseIdAsc();
}

interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmailIgnoreCase(String email);
    Optional<AppUser> findByResidentId(Long residentId);
}

interface PasswordResetCodeRepository extends JpaRepository<PasswordResetCode, Long> {
    Optional<PasswordResetCode> findFirstByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(Long userId);
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
    List<ServiceOrder> findByStatusOrderByCreatedAtDesc(String status);
}

interface BudgetRepository extends JpaRepository<Budget, Long> {
    List<Budget> findByServiceIdOrderByAmountAsc(Long serviceId);
    List<Budget> findByServiceIdAndStatus(Long serviceId, String status);
}

interface PortalDocumentRepository extends JpaRepository<PortalDocument, Long> {
    List<PortalDocument> findByRelatedTypeAndRelatedIdOrderByCreatedAtDesc(String relatedType, Long relatedId);
}

interface ProblemReportRepository extends JpaRepository<ProblemReport, Long> {
    List<ProblemReport> findAllByOrderByCreatedAtDesc();
    List<ProblemReport> findByStatusOrderByCreatedAtDesc(String status);
}
