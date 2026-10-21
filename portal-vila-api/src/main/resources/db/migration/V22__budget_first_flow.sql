-- Problema -> orcamentos -> votacao -> servico: o orcamento nasce do relato e pode concorrer com outros do mesmo problema.
alter table budgets add column problem_report_id bigint;
alter table budgets add column competes boolean not null default true;

-- Justificativa publica quando um pagamento passa do limite sem orcamento aprovado (servico ou despesa direta).
alter table service_orders add column emergency_reason text;
alter table expenses add column exception_reason text;

create index idx_budgets_problem_report on budgets(problem_report_id);
