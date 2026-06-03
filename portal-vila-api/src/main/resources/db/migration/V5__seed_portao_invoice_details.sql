update service_orders
set status = 'FINALIZADO',
    final_value = 430.00,
    supplier = 'Portoes Silva',
    supplier_document = '12.345.678/0001-90',
    completed_date = date '2026-06-01',
    updated_at = now()
where title = 'Portao automatico';

insert into documents(name, type, url, related_type, related_id, description, created_at)
select
  'Nota Fiscal - Portao automatico',
  'NOTA_FISCAL',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'SERVICE',
  so.id,
  'Nota fiscal do servico de portao automatico.',
  now()
from service_orders so
where so.title = 'Portao automatico'
  and not exists (
    select 1 from documents d
    where d.related_type = 'SERVICE'
      and d.related_id = so.id
      and d.type = 'NOTA_FISCAL'
  );
