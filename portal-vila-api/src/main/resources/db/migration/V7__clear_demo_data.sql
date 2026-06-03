update contributions set pix_charge_id = null;

delete from webhook_events;
delete from documents;
delete from expenses;
delete from budgets;
delete from service_orders;
delete from pix_charges;
delete from contributions;

delete from app_users
where role <> 'ADMIN'
   or resident_id is not null;

delete from residents;

update settings
set monthly_amount = 100.00,
    payment_due_day = 10,
    gateway_provider = 'ASAAS',
    updated_at = now();
