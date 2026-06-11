with linked_pix as (
    select
        c.id as contribution_id,
        p.id as pix_charge_id,
        substring(p.external_reference from 'VILA-([0-9]{4}-[0-9]{2})-HOUSE-[0-9]+') as pix_month,
        p.charge_value,
        p.status as pix_status,
        p.paid_at
    from contributions c
    join pix_charges p on p.contribution_id = c.id
    where p.external_reference ~ '^VILA-[0-9]{4}-[0-9]{2}-HOUSE-[0-9]+'
)
update contributions c
set
    reference_month = linked_pix.pix_month,
    amount = coalesce(linked_pix.charge_value, c.amount),
    pix_charge_id = linked_pix.pix_charge_id,
    status = case
        when linked_pix.pix_status = 'PAID' then 'PAID'
        else c.status
    end,
    paid_amount = case
        when linked_pix.pix_status = 'PAID' and (c.paid_amount is null or c.paid_amount = 0)
            then coalesce(linked_pix.charge_value, c.amount)
        else c.paid_amount
    end,
    payment_date = case
        when linked_pix.pix_status = 'PAID' and c.payment_date is null
            then coalesce(linked_pix.paid_at, now())
        else c.payment_date
    end,
    payment_method = case
        when linked_pix.pix_status = 'PAID' and (c.payment_method is null or c.payment_method = '')
            then 'PIX_ASAAS'
        else c.payment_method
    end,
    updated_at = now()
from linked_pix
where c.id = linked_pix.contribution_id
  and linked_pix.pix_month is not null
  and (
      c.reference_month <> linked_pix.pix_month
      or c.pix_charge_id is distinct from linked_pix.pix_charge_id
      or c.amount is distinct from linked_pix.charge_value
      or (linked_pix.pix_status = 'PAID' and c.status <> 'PAID')
      or (linked_pix.pix_status = 'PAID' and (c.paid_amount is null or c.paid_amount = 0))
  );
