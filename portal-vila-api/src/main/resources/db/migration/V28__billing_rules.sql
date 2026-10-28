-- How each condominium charges its units: the payment method offered (Pix, or a boleto that also carries a Pix QR code),
-- the late fee and the monthly interest Asaas adds after the due date, and the text that names the charge.
-- Every condominium starts as the Vila works today: Pix only, no fee, no interest. The Vila keeps its "Caixinha da Vila".
alter table settings add column billing_type varchar(20) not null default 'PIX';
alter table settings add column fine_percent numeric(5,2) not null default 0;
alter table settings add column interest_percent numeric(5,2) not null default 0;
alter table settings add column charge_title varchar(80);

update settings set charge_title = 'Caixinha da Vila' where condominium_id = 1;
