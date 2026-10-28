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

/** A condominium's Asaas connection as the panel shows it; the key itself never comes back, only its last characters. */
record PaymentsStatus(
    boolean connected,
    String source,
    String accountName,
    String keyHint,
    java.time.LocalDateTime connectedAt,
    java.time.LocalDateTime lastEventAt
) {
}

record ConnectAsaasRequest(String apiKey) {
}

record SessionCondominium(Long id, String name, String slug, String status, boolean pixConnected) {
}

/** Who is signed in and where: what the web panel needs to show the right menus. */
/** canPay: may record, approve and pay the condominium's bills (the administration, and the síndico if allowed). */
record SessionResponse(String name, String email, String role, Long residentId, boolean platformAdmin, SessionCondominium condominium, boolean canPay) {
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
    BigDecimal budgetRequiredAbove,
    String billingType,
    BigDecimal finePercent,
    BigDecimal interestPercent,
    String chargeTitle,
    BigDecimal reserveFundPercent,
    boolean remindersEnabled,
    Integer reminderDaysBefore,
    String chargeMode,
    BigDecimal monthlyTotal,
    BigDecimal waterPrice,
    BigDecimal gasPrice,
    boolean sindicoCanPay,
    BigDecimal approvalAbove
) {
    static SettingsResponse from(Settings settings) {
        return new SettingsResponse(
            settings.id,
            settings.villageName,
            settings.monthlyAmount,
            settings.paymentDueDay,
            settings.gatewayProvider,
            settings.budgetRequiredAbove,
            settings.billingType,
            settings.finePercent,
            settings.interestPercent,
            settings.chargeTitleOrDefault(),
            settings.reserveFundPercent,
            settings.remindersEnabled,
            settings.reminderDaysBefore,
            settings.chargeMode,
            settings.monthlyTotal,
            settings.waterPrice,
            settings.gasPrice,
            settings.sindicoCanPay,
            settings.approvalAbove
        );
    }
}

/** Who pays the bills besides the administration, and above which value a second person approves (empty: nobody). */
record PaymentRulesRequest(Boolean sindicoCanPay, BigDecimal approvalAbove) {
}

record SupplierRequest(String name, String document, String pixKey, String pixKeyType, String phone, String email, String notes) {
}

/**
 * A new bill. amount is the whole bill; with installments above 1 it is split in that many, one a month from dueDate.
 * monthly: it repeats every month (paying one creates the next).
 */
record PayableRequest(
    Long supplierId,
    String description,
    String category,
    BigDecimal amount,
    LocalDate dueDate,
    Integer installments,
    Boolean monthly,
    Long budgetId,
    Long serviceOrderId,
    Long documentId,
    String exceptionReason,
    String notes
) {
}

/** A payment made outside the system (bank app, cash): when, how, and the receipt. */
record PayPayableRequest(LocalDate paidAt, String method, Long receiptDocumentId, String notes) {
}

/** canApprove: the person asking may approve it (has permission and did not record it). */
record PayableView(
    Long id,
    String description,
    String category,
    BigDecimal amount,
    LocalDate dueDate,
    String status,
    boolean overdue,
    Long supplierId,
    String supplierName,
    boolean supplierHasPix,
    Integer installment,
    Integer installments,
    String recurrence,
    Long budgetId,
    Long serviceOrderId,
    Long documentId,
    String exceptionReason,
    String notes,
    String createdBy,
    LocalDateTime createdAt,
    String approvedBy,
    LocalDateTime approvedAt,
    String paidBy,
    LocalDate paidAt,
    String paymentMethod,
    Long receiptDocumentId,
    Long expenseId,
    String cancelledBy,
    String cancelReason,
    boolean canApprove
) {
}

record BudgetRuleRequest(BigDecimal budgetRequiredAbove) {
}

/** From reserveFundPercent on, a field may be left out: it keeps what it had. */
record BillingRulesRequest(
    String billingType,
    BigDecimal finePercent,
    BigDecimal interestPercent,
    String chargeTitle,
    BigDecimal reserveFundPercent,
    Boolean remindersEnabled,
    Integer reminderDaysBefore,
    String chargeMode,
    BigDecimal monthlyTotal
) {
}

/** The units' ideal fractions and what each one pays of the month's total. share: percent of the condominium. */
record FractionsView(BigDecimal monthlyTotal, BigDecimal sum, List<UnitFraction> units) {
}

record UnitFraction(Long houseId, String houseLabel, boolean hasResident, BigDecimal fraction, BigDecimal share, BigDecimal amount) {
}

record FractionUpdate(Long houseId, BigDecimal fraction) {
}

/** One month of water or gas: each unit's meter, the reading before, what it used and what it costs. */
record ReadingsView(String month, String kind, BigDecimal unitPrice, BigDecimal totalConsumption, BigDecimal totalAmount, List<ReadingRow> rows) {
}

/**
 * previousFromHistory: the reading before came from last month's record (not typed now). chargeStatus: the charge it
 * became, or empty while it can still be corrected.
 */
record ReadingRow(
    Long houseId,
    String houseLabel,
    String residentName,
    BigDecimal previousReading,
    boolean previousFromHistory,
    BigDecimal reading,
    BigDecimal consumption,
    BigDecimal amount,
    Long contributionId,
    String chargeStatus
) {
}

record ReadingInput(Long houseId, BigDecimal previousReading, BigDecimal reading) {
}

record SaveReadingsRequest(BigDecimal unitPrice, List<ReadingInput> readings) {
}

record ChargeReadingsRequest(@NotNull LocalDate dueDate) {
}

/** A one-off charge: for one unit (houseId) or every unit with a resident (houseId empty). */
record ExtraChargeRequest(Long houseId, @NotBlank String description, @Positive BigDecimal amount, @NotNull LocalDate dueDate) {
}

/** One month of charges as the administration sees it: a row per charge, and the units left without one. */
record BillingMonth(
    String month,
    boolean pixConnected,
    String chargeMode,
    BigDecimal monthlyTotal,
    BigDecimal monthlyAmount,
    LocalDate dueDate,
    int unitsToCharge,
    BillingTotals totals,
    List<BillingRow> rows
) {
}

/** reserve: how much of what is expected goes to the reserve fund. */
record BillingTotals(BigDecimal expected, BigDecimal received, BigDecimal open, BigDecimal overdue, BigDecimal reserve, int paid, int pending, int late) {
}

/**
 * status: PAID, PENDING, OVERDUE, CANCELLED; NOT_CHARGED (a resident, no charge yet this month); NO_RESIDENT (nobody to
 * charge). extra: a charge beyond the month's standard one.
 */
record BillingRow(
    Long houseId,
    String houseLabel,
    String residentName,
    Long contributionId,
    Long chargeId,
    BigDecimal amount,
    BigDecimal paidAmount,
    LocalDate dueDate,
    String status,
    boolean extra,
    boolean manual,
    String invoiceUrl,
    String receiptUrl,
    LocalDateTime paidAt,
    String description,
    BigDecimal reserveAmount
) {
}

/** amount: per unit, when every unit pays the same. total: the month's total, when it is divided by ideal fraction. */
record GenerateChargesRequest(@NotBlank String month, @Positive BigDecimal amount, LocalDate dueDate, @Positive BigDecimal total) {
}

/** What a batch did, unit by unit: one unit failing (a resident without a full CPF, say) does not stop the others. */
record GenerateChargesResult(String month, int created, int alreadyCharged, List<UnitProblem> failed, List<UnitProblem> skipped) {
}

record UnitProblem(String houseLabel, String reason) {
}
