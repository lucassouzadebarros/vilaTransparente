-- Relato -> servico -> orcamentos: ligacoes entre os cadastros (sem chave estrangeira, para nao travar a limpeza de dados).
alter table problem_reports add column service_id bigint;
alter table service_orders add column problem_report_id bigint;

-- O que sera feito, para quem vota entender o orcamento.
alter table budgets add column scope text;

-- Acima deste valor o servico so comeca com orcamento aprovado pelas casas. Vazio = nao exige.
alter table settings add column budget_required_above numeric(12, 2);

create index idx_problem_reports_service on problem_reports(service_id);
create index idx_service_orders_problem_report on service_orders(problem_report_id);
