package br.com.portalvila;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

record LoginRequest(@NotBlank String email, @NotBlank String password) {
}

record LoginResponse(String token, String name, String email, String role, Long residentId, boolean mustChangePassword) {
}

record PlatformMe(String name, String email) {
}

record SessionCondominium(Long id, String name, String slug, String status, boolean pixConnected) {
}

/** Who is signed in and where: what the web panel needs to show the right menus. */
record SessionResponse(String name, String email, String role, Long residentId, boolean platformAdmin, SessionCondominium condominium) {
}

record CondominiumSummary(
    Long id,
    String name,
    String slug,
    String status,
    java.time.LocalDateTime createdAt,
    long houses,
    long activeResidents,
    boolean pixConnected
) {
}

record CondominiumActivity(String action, String summary, String actor, java.time.LocalDateTime at) {
}

record PendingManager(String name, String email, LocalDateTime expiresAt) {
}

record CondominiumDetail(
    CondominiumSummary condominium,
    String sindicoName,
    String sindicoHouse,
    long administrators,
    PendingManager pendingManager,
    List<CondominiumActivity> activity
) {
}

/** The public form. {@code website} is hidden from people: only robots fill it. */
record CondominiumRequestForm(
    String condominiumName,
    String city,
    String state,
    Integer units,
    String contactName,
    String contactEmail,
    String contactPhone,
    String hasAsaas,
    String message,
    String website
) {
}

record ApproveCondominiumRequest(String name, String slug, String unitLabel, Integer units, String managerName, String managerEmail) {
}

record RejectCondominiumRequest(String note) {
}

record InviteManagerRequest(String name, String email) {
}

/** The code is shown here once; only its hash is kept. */
record ManagerInvitation(String name, String email, String code, LocalDateTime expiresAt) {
}

record ApprovalResult(CondominiumSummary condominium, ManagerInvitation manager) {
}

record ActivationCodeRequest(String code) {
}

record ActivationRequest(String code, String password) {
}

record ActivationPreview(String condominiumName, String name, String email) {
}

/** A new condominium: its name, an optional identifier (made from the name when empty) and its units. */
record CreateCondominiumRequest(@NotBlank String name, String slug, String unitLabel, Integer units) {
}

record RenameCondominiumRequest(@NotBlank String name) {
}

record CondominiumStatusRequest(@NotBlank String status) {
}

record PasswordResetRequest(@NotBlank String email) {
}

record PasswordResetConfirmRequest(@NotBlank String email, @NotBlank String code, @NotBlank String password) {
}

record DeleteAccountRequest(@NotBlank String password) {
}

record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {
}

record PasswordResetResponse(String message, String debugCode) {
}

record HouseOption(Long houseId, Integer number, String label, boolean available, boolean invited) {
}

record CreateInviteRequest(@NotNull Long houseId) {
}

record InviteCheckRequest(@NotBlank String code) {
}

record InviteCheckResponse(String houseLabel, Integer houseNumber) {
}

record InviteRegistrationRequest(
    @NotBlank String code,
    @NotBlank String name,
    @NotBlank String email,
    @NotBlank String phone,
    @NotBlank String documentNumber,
    @NotBlank String password
) {
}

/** The code is only here, in the answer that creates it: it is not kept in a readable form. */
record InviteIssuedResponse(Long id, Long houseId, Integer houseNumber, String houseLabel, String code, java.time.LocalDateTime expiresAt) {
}

record InviteResponse(Long id, Long houseId, Integer houseNumber, String houseLabel, java.time.LocalDateTime createdAt, java.time.LocalDateTime expiresAt, String createdBy) {
}

record ResidentRegistrationRequest(
    @NotNull Long houseId,
    @NotBlank String name,
    @NotBlank String email,
    @NotBlank String phone,
    @NotBlank String documentNumber,
    @NotBlank String password
) {
}

record ResidentRegistrationResponse(
    Long residentId,
    Long houseId,
    Integer houseNumber,
    String houseLabel,
    String name,
    String email,
    String gatewayCustomerId
) {
}

record DashboardResponse(
    String month,
    BigDecimal balance,
    BigDecimal collected,
    BigDecimal totalCollected,
    BigDecimal pending,
    BigDecimal overdue,
    BigDecimal expenses,
    long paidHouses,
    long pendingHouses,
    boolean transparencyEnabled,
    List<MovementResponse> movements
) {
}

record MovementResponse(LocalDate date, String type, String description, BigDecimal amount, String status) {
}

record ContributionResponse(
    Long id,
    Long houseId,
    String houseLabel,
    Long residentId,
    String residentName,
    String month,
    BigDecimal amount,
    BigDecimal paidAmount,
    String status,
    LocalDateTime paymentDate,
    boolean manualPayment,
    Long pixChargeId
) {
}

record MonthlyChargeRequest(
    @NotBlank String month,
    @Positive BigDecimal amount,
    LocalDate dueDate
) {
}

record HouseMonthlyChargeRequest(
    @NotBlank String month,
    @Positive BigDecimal amount,
    @NotNull Long houseId,
    LocalDate dueDate
) {
}

record ManualPaymentRequest(@NotBlank String reason, BigDecimal paidAmount) {
}

record CancelRequest(@NotBlank String reason) {
}

record PixChargeResponse(
    Long id,
    Long contributionId,
    Long houseId,
    String houseLabel,
    String residentName,
    String month,
    String gateway,
    String gatewayPaymentId,
    String externalReference,
    BigDecimal value,
    LocalDate dueDate,
    String status,
    String qrCodeBase64,
    String pixCopyPaste,
    String invoiceUrl,
    String receiptUrl,
    LocalDateTime paidAt
) {
}

record FinishServiceRequest(
    @NotNull BigDecimal finalValue,
    @NotNull LocalDate completedDate,
    @NotBlank String supplier,
    String supplierDocument,
    Long documentId,
    boolean generateExpense,
    String notes,
    /** Required (and shown to everyone) when the payment goes beyond the approved budget or the limit. */
    String emergencyReason
) {
}

record WebhookResult(boolean processed, boolean duplicate, String message) {
}

record DirectReceiptReprocessResponse(int checked, int updated, int unchanged, int skippedNoPayload, int failed) {
}

record ExcludePaymentsRequest(@jakarta.validation.constraints.NotEmpty List<String> paymentIds, String reason) {
}

record ExcludedPaymentItem(String paymentId, String action, BigDecimal amount, String note) {
}

record ExcludePaymentsReport(
    boolean applied,
    List<ExcludedPaymentItem> items,
    BigDecimal balanceBefore,
    BigDecimal balanceAfter
) {
}

record BudgetVoteRequest(@NotBlank String vote) {
}

/** residentId null removes the síndico. */
record ChooseSindicoRequest(Long residentId) {
}

record SindicoResponse(Long residentId, String name, Long houseId, String houseLabel) {
    static SindicoResponse none() {
        return new SindicoResponse(null, null, null, null);
    }
}

/** A house on the voting list. How each house voted stays private; only whether it voted is shown. */
record BudgetVoteHouse(Long houseId, String houseLabel, boolean voted) {
}

record BudgetVotingSummary(
    Long budgetId,
    String status,
    boolean open,
    int participatingHouses,
    int votesToApprove,
    int approveVotes,
    int rejectVotes,
    int pendingVotes,
    String myVote,
    boolean canVote,
    String cannotVoteReason,
    LocalDateTime closedAt,
    List<BudgetVoteHouse> houses,
    LocalDate deadline
) {
}

record AsaasSyncItem(String paymentId, String action, String remoteStatus, BigDecimal value, LocalDate date, String description, String note) {
}

record AsaasStatementTotal(String type, int count, BigDecimal total) {
}

record AsaasStatementEntry(LocalDate date, String type, BigDecimal value, String description, String paymentId) {
}

record AsaasSyncReport(
    boolean applied,
    LocalDate from,
    LocalDate to,
    int paymentsFetched,
    int chargesCreated,
    int chargesUpdated,
    int directReceiptsCreated,
    int directReceiptsUpdated,
    int unchanged,
    int ignored,
    int conflicts,
    int skipped,
    int failed,
    BigDecimal localBalanceBefore,
    BigDecimal localBalanceAfter,
    BigDecimal asaasBalance,
    BigDecimal difference,
    BigDecimal statementCredits,
    BigDecimal statementFees,
    BigDecimal statementOtherDebits,
    List<AsaasSyncItem> items,
    List<AsaasStatementTotal> statementByType,
    List<AsaasStatementEntry> debits,
    List<AsaasStatementEntry> creditsWithoutLocalRecord,
    List<String> warnings
) {
}

record SettingsResponse(
    Long id,
    String villageName,
    BigDecimal monthlyAmount,
    Integer paymentDueDay,
    String gatewayProvider,
    BigDecimal budgetRequiredAbove
) {
    static SettingsResponse from(Settings settings) {
        return new SettingsResponse(
            settings.id,
            settings.villageName,
            settings.monthlyAmount,
            settings.paymentDueDay,
            settings.gatewayProvider,
            settings.budgetRequiredAbove
        );
    }
}

record BudgetRuleRequest(BigDecimal budgetRequiredAbove) {
}
