alter table service_orders
  add column if not exists supplier_document varchar(40);

alter table budgets
  add column if not exists supplier_document varchar(40);

update service_orders
set supplier_document = '12.345.678/0001-90'
where title = 'Interfone'
  and supplier_document is null;

update budgets
set supplier_document = '12.345.678/0001-90'
where supplier = 'Portoes Silva'
  and supplier_document is null;
