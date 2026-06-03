insert into documents(name, type, url, related_type, related_id, description, created_at)
select
  'Nota Fiscal - Interfone',
  'NOTA_FISCAL',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'SERVICE',
  so.id,
  'Nota fiscal do servico de interfone.',
  now()
from service_orders so
where so.title = 'Interfone'
  and not exists (
    select 1 from documents d
    where d.related_type = 'SERVICE'
      and d.related_id = so.id
      and d.type = 'NOTA_FISCAL'
  );
