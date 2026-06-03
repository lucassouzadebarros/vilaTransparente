insert into service_orders(
  title, description, category, priority, status, expected_value, planned_date, notes, created_at, updated_at
)
select
  'Portao automatico',
  'Troca do cabo de aco e revisao do motor do portao.',
  'Portao',
  'ALTA',
  'APROVADO',
  430.00,
  date '2026-06-15',
  'Servico exibido na Home em Manutencoes em destaque.',
  now(),
  now()
where not exists (select 1 from service_orders where title = 'Portao automatico');

insert into service_orders(
  title, description, category, priority, status, expected_value, planned_date, notes, created_at, updated_at
)
select
  'Limpeza da vila',
  'Limpeza quinzenal da area comum e retirada de residuos.',
  'Limpeza',
  'MEDIA',
  'EM_ANDAMENTO',
  250.00,
  date '2026-06-08',
  'Servico exibido na Home em Manutencoes em destaque.',
  now(),
  now()
where not exists (select 1 from service_orders where title = 'Limpeza da vila');

insert into service_orders(
  title, description, category, priority, status, expected_value, planned_date, notes, created_at, updated_at
)
select
  'Iluminacao comum',
  'Substituicao de lampadas queimadas no corredor de entrada.',
  'Iluminacao',
  'URGENTE',
  'PLANEJADO',
  180.00,
  date '2026-06-05',
  'Servico exibido na Home em Manutencoes em destaque.',
  now(),
  now()
where not exists (select 1 from service_orders where title = 'Iluminacao comum');

insert into service_orders(
  title, description, category, priority, status, expected_value, final_value, supplier,
  planned_date, completed_date, notes, created_at, updated_at
)
select
  'Interfone',
  'Avaliacao de falha no modulo externo do interfone.',
  'Interfone',
  'BAIXA',
  'FINALIZADO',
  150.00,
  120.00,
  'Tecnica Voz Clara',
  date '2026-05-28',
  date '2026-05-30',
  'Servico exibido na Home em Manutencoes em destaque.',
  now(),
  now()
where not exists (select 1 from service_orders where title = 'Interfone');

insert into budgets(service_id, title, supplier, phone, amount, budget_date, status, notes, created_at, updated_at)
select
  so.id,
  'Cabo de aco e mao de obra',
  'Portoes Silva',
  '(21) 98888-1111',
  430.00,
  date '2026-05-20',
  'APROVADO',
  'Orcamento aprovado para o portao automatico.',
  now(),
  now()
from service_orders so
where so.title = 'Portao automatico'
  and not exists (
    select 1 from budgets b
    where b.service_id = so.id and b.supplier = 'Portoes Silva'
  );

update service_orders so
set approved_budget_id = b.id,
    updated_at = now()
from budgets b
where so.title = 'Portao automatico'
  and b.service_id = so.id
  and b.supplier = 'Portoes Silva'
  and so.approved_budget_id is null;
