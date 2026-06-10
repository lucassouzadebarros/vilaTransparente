alter table contributions drop constraint if exists uk_contributions_house_month;

create index if not exists idx_contributions_house_month
    on contributions (house_id, reference_month);
