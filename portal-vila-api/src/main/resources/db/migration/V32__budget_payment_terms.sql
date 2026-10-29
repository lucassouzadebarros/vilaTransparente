-- How the supplier will be paid is part of what the units vote on: all at once, in installments, or a down payment
-- and the rest. Budgets already voted keep it empty ("não informada").
alter table budgets add column payment_mode varchar(20);
alter table budgets add column down_payment numeric(12, 2);
alter table budgets add column payment_installments integer;
