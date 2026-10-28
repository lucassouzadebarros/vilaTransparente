-- More of the condominium's charging rules: a reserve fund added to the monthly fee (in percent), and reminders by the app
-- before and after the due date. Both start off, so every condominium keeps charging as before.
alter table settings add column reserve_fund_percent numeric(5,2) not null default 0;
alter table settings add column reminders_enabled boolean not null default false;
alter table settings add column reminder_days_before integer not null default 3;

-- A one-off charge says what it is for ("Chamada de capital: pintura"); the reserve fund part of a monthly charge is kept
-- apart, for the cash box to put it in its own fund; and the day a reminder went out, so it goes out once.
alter table contributions add column description varchar(140);
alter table contributions add column reserve_amount numeric(12,2);
alter table contributions add column reminded_on date;
