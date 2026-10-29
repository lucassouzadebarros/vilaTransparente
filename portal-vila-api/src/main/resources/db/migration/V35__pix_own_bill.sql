-- A Pix paid at once records its own bill (a "copia e cola" code, or a key typed at the moment, like in a bank app):
-- when it does not go out, that bill is cancelled instead of being left to pay. The codes paid so far are such Pix.
alter table pix_transfers add column own_bill boolean not null default false;
update pix_transfers set own_bill = true where kind = 'CODE';
