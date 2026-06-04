insert into houses(number, label, active, created_at)
select 11, 'Casa 11', true, now()
where not exists (select 1 from houses where number = 11);
