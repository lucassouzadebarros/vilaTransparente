-- A Pix sent by the Portal may come back: the receiver returns it, in full or in part. How much came back, and when, is
-- kept with the Pix; the money that came back enters the cash box as a direct receipt of category ESTORNO_PIX.
alter table pix_transfers add column refunded_amount numeric(12,2);
alter table pix_transfers add column refunded_at timestamp;
