package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
class ServiceOrderWorkflow {
    private final ServiceOrderRepository services;
    private final BudgetRepository budgets;
    private final ExpenseRepository expenses;
    private final DashboardEventService dashboardEvents;

    ServiceOrderWorkflow(
        ServiceOrderRepository services,
        BudgetRepository budgets,
        ExpenseRepository expenses,
        DashboardEventService dashboardEvents
    ) {
        this.services = services;
        this.budgets = budgets;
        this.expenses = expenses;
        this.dashboardEvents = dashboardEvents;
    }

    @Transactional(readOnly = true)
    public List<ServiceOrder> listServices(String status) {
        if (status != null && !status.isBlank()) {
            return services.findByStatusOrderByCreatedAtDesc(status);
        }
        return services.findAll().stream()
            .sorted((a, b) -> b.createdAt.compareTo(a.createdAt))
            .toList();
    }

    @Transactional
    public ServiceOrder saveService(ServiceOrder incoming) {
        if (incoming.status == null || incoming.status.isBlank()) {
            incoming.status = "PLANEJADO";
        }
        if (incoming.priority == null || incoming.priority.isBlank()) {
            incoming.priority = "MEDIA";
        }
        incoming.updatedAt = LocalDateTime.now();
        ServiceOrder saved = services.save(incoming);
        reconcileServiceBudget(saved, null);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public ServiceOrder updateService(Long id, ServiceOrder incoming) {
        ServiceOrder service = services.findById(id).orElseThrow();
        Long previousBudgetId = service.approvedBudgetId;
        service.title = incoming.title;
        service.description = incoming.description;
        service.category = incoming.category;
        service.priority = incoming.priority == null || incoming.priority.isBlank() ? "MEDIA" : incoming.priority;
        service.status = incoming.status == null || incoming.status.isBlank() ? service.status : incoming.status;
        service.expectedValue = incoming.expectedValue;
        service.finalValue = incoming.finalValue;
        service.supplier = incoming.supplier;
        service.supplierDocument = incoming.supplierDocument;
        service.plannedDate = incoming.plannedDate;
        service.completedDate = incoming.completedDate;
        service.approvedBudgetId = incoming.approvedBudgetId;
        service.notes = incoming.notes;
        service.updatedAt = LocalDateTime.now();
        ServiceOrder saved = services.save(service);
        reconcileServiceBudget(saved, previousBudgetId);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public void cancelService(Long id) {
        ServiceOrder service = services.findById(id).orElseThrow();
        service.status = "CANCELADO";
        service.updatedAt = LocalDateTime.now();
        services.save(service);
        dashboardEvents.publishDashboardChanged();
    }

    @Transactional
    public Budget saveBudget(Long serviceId, Budget budget) {
        if (serviceId != null) {
            services.findById(serviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Serviço não encontrado."));
        }
        budget.serviceId = serviceId;
        if (budget.status == null || budget.status.isBlank()) {
            budget.status = "EM_ANALISE";
        }
        validateBudget(budget);
        budget.updatedAt = LocalDateTime.now();
        Budget saved = budgets.save(budget);
        applyBudgetStatusToService(saved, null);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public Budget updateBudget(Long id, Budget incoming) {
        Budget budget = budgets.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento não encontrado."));
        Long previousServiceId = budget.serviceId;
        validateBudget(incoming);
        if (incoming.serviceId != null) {
            services.findById(incoming.serviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Serviço não encontrado."));
        }
        budget.serviceId = incoming.serviceId;
        budget.title = incoming.title;
        budget.supplier = incoming.supplier;
        budget.supplierDocument = incoming.supplierDocument;
        budget.phone = incoming.phone;
        budget.amount = incoming.amount;
        budget.budgetDate = incoming.budgetDate;
        budget.validUntil = incoming.validUntil;
        budget.expectedDate = incoming.expectedDate;
        budget.documentId = incoming.documentId;
        budget.status = incoming.status == null || incoming.status.isBlank() ? "EM_ANALISE" : incoming.status;
        budget.notes = incoming.notes;
        budget.updatedAt = LocalDateTime.now();
        Budget saved = budgets.save(budget);
        applyBudgetStatusToService(saved, previousServiceId);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public Budget approveBudget(Long id) {
        Budget approved = budgets.findById(id).orElseThrow();
        if (approved.serviceId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vincule o orçamento a um serviço antes de aprovar.");
        }
        Long approvedId = approved.id;
        budgets.findByServiceIdOrderByAmountAsc(approved.serviceId).forEach(budget -> {
            if (!budget.id.equals(approvedId) && "EM_ANALISE".equals(budget.status)) {
                budget.status = "REJEITADO";
                budget.updatedAt = LocalDateTime.now();
                budgets.save(budget);
            }
        });
        approved.status = "APROVADO";
        approved.updatedAt = LocalDateTime.now();
        approved = budgets.save(approved);

        ServiceOrder service = services.findById(approved.serviceId).orElseThrow();
        service.status = "APROVADO";
        service.approvedBudgetId = approved.id;
        service.expectedValue = approved.amount;
        service.updatedAt = LocalDateTime.now();
        services.save(service);
        dashboardEvents.publishDashboardChanged();
        return approved;
    }

    @Transactional
    public Budget rejectBudget(Long id) {
        Budget budget = budgets.findById(id).orElseThrow();
        budget.status = "REJEITADO";
        budget.updatedAt = LocalDateTime.now();
        Budget saved = budgets.save(budget);
        dashboardEvents.publishDashboardChanged();
        return saved;
    }

    @Transactional
    public ServiceOrder finishService(Long id, FinishServiceRequest request) {
        ServiceOrder service = services.findById(id).orElseThrow();
        service.status = "FINALIZADO";
        service.finalValue = request.finalValue();
        service.completedDate = request.completedDate();
        service.supplier = request.supplier();
        service.supplierDocument = request.supplierDocument();
        service.notes = request.notes();
        service.updatedAt = LocalDateTime.now();
        service = services.save(service);

        if (request.generateExpense()) {
            Expense expense = new Expense();
            expense.description = "Serviço finalizado: " + service.title;
            expense.category = service.category;
            expense.amount = request.finalValue();
            expense.expenseDate = request.completedDate();
            expense.supplier = request.supplier();
            expense.paymentMethod = "PIX";
            expense.notes = request.notes();
            expense.documentId = request.documentId();
            expense.serviceOrderId = service.id;
            expense.budgetId = service.approvedBudgetId;
            expenses.save(expense);
        }
        dashboardEvents.publishDashboardChanged();
        return service;
    }

    private void validateBudget(Budget budget) {
        if (budget == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dados do orçamento obrigatórios.");
        }
        if (budget.title == null || budget.title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título do orçamento obrigatório.");
        }
        if (budget.supplier == null || budget.supplier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fornecedor do orçamento obrigatório.");
        }
        if (budget.amount == null || budget.amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valor do orçamento deve ser maior que zero.");
        }
        if ("APROVADO".equals(budget.status) && budget.serviceId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vincule o orçamento a um serviço antes de aprovar.");
        }
    }

    private void reconcileServiceBudget(ServiceOrder service, Long previousBudgetId) {
        if (previousBudgetId != null && !previousBudgetId.equals(service.approvedBudgetId)) {
            budgets.findById(previousBudgetId).ifPresent(previous -> {
                if (service.id.equals(previous.serviceId)) {
                    previous.serviceId = null;
                    previous.updatedAt = LocalDateTime.now();
                    budgets.save(previous);
                }
            });
        }
        if (service.approvedBudgetId == null) {
            return;
        }
        Budget budget = budgets.findById(service.approvedBudgetId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Orçamento vinculado não encontrado."));
        if (!"APROVADO".equals(budget.status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Somente orçamentos aprovados podem ser vinculados a um serviço.");
        }
        if (budget.serviceId != null && !budget.serviceId.equals(service.id)) {
            services.findById(budget.serviceId).ifPresent(previousService -> {
                if (budget.id.equals(previousService.approvedBudgetId)) {
                    previousService.approvedBudgetId = null;
                    previousService.updatedAt = LocalDateTime.now();
                    services.save(previousService);
                }
            });
        }
        budget.serviceId = service.id;
        budget.updatedAt = LocalDateTime.now();
        budgets.save(budget);
    }

    private void applyBudgetStatusToService(Budget budget, Long previousServiceId) {
        if (previousServiceId != null && !previousServiceId.equals(budget.serviceId)) {
            services.findById(previousServiceId).ifPresent(previousService -> {
                if (budget.id.equals(previousService.approvedBudgetId)) {
                    previousService.approvedBudgetId = null;
                    previousService.updatedAt = LocalDateTime.now();
                    services.save(previousService);
                }
            });
        }
        if (budget.serviceId == null) {
            return;
        }
        services.findById(budget.serviceId).ifPresent(service -> {
            if ("APROVADO".equals(budget.status)) {
                service.status = "APROVADO";
                service.approvedBudgetId = budget.id;
                service.expectedValue = budget.amount;
            } else if (budget.id.equals(service.approvedBudgetId)) {
                service.approvedBudgetId = budget.id;
            }
            service.updatedAt = LocalDateTime.now();
            services.save(service);
        });
    }
}
