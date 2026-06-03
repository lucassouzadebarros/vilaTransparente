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

record LoginResponse(String token, String name, String email, String role, Long residentId) {
}

record RegistrationHouseOption(Long houseId, Integer number, String label, boolean available) {
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
    BigDecimal pending,
    BigDecimal overdue,
    BigDecimal expenses,
    long paidHouses,
    long pendingHouses,
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
    @Positive BigDecimal amount
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
    String notes
) {
}

record WebhookResult(boolean processed, boolean duplicate, String message) {
}

record SettingsResponse(
    Long id,
    String villageName,
    BigDecimal monthlyAmount,
    Integer paymentDueDay,
    String gatewayProvider
) {
    static SettingsResponse from(Settings settings) {
        return new SettingsResponse(
            settings.id,
            settings.villageName,
            settings.monthlyAmount,
            settings.paymentDueDay,
            settings.gatewayProvider
        );
    }
}
