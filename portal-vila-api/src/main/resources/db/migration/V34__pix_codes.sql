-- Paying a Pix "copia e cola" (the code of a QR code) through Asaas, besides a Pix to a supplier's key. A code carries
-- who receives it, so the bill may have no supplier: the receiver's name is kept here. Asaas may also hold a Pix until
-- someone authorizes it with the token of the account (SMS or app): the list then says so.
alter table pix_transfers add column kind varchar(10) not null default 'KEY';
alter table pix_transfers add column qr_payload text;
alter table pix_transfers add column receiver_name varchar(160);
alter table pix_transfers add column awaiting_authorization boolean not null default false;
alter table pix_transfers alter column pix_key drop not null;
alter table pix_transfers alter column pix_key_type drop not null;
