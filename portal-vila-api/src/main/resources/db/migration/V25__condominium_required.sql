-- V24 gave every table a condominium, defaulting to the Vila so the code that did not know about condominiums kept
-- working. Now every insert names its condominium (the app stamps it), so the default goes: a row saved without one
-- fails instead of quietly landing in the Vila. Existing rows keep the condominium they have.
alter table app_users alter column condominium_id drop default;
alter table audit_log alter column condominium_id drop default;
alter table budget_votes alter column condominium_id drop default;
alter table budgets alter column condominium_id drop default;
alter table contributions alter column condominium_id drop default;
alter table direct_receipts alter column condominium_id drop default;
alter table documents alter column condominium_id drop default;
alter table excluded_gateway_payments alter column condominium_id drop default;
alter table expenses alter column condominium_id drop default;
alter table house_invites alter column condominium_id drop default;
alter table houses alter column condominium_id drop default;
alter table password_reset_codes alter column condominium_id drop default;
alter table pix_charges alter column condominium_id drop default;
alter table problem_report_events alter column condominium_id drop default;
alter table problem_reports alter column condominium_id drop default;
alter table push_tokens alter column condominium_id drop default;
alter table residents alter column condominium_id drop default;
alter table service_orders alter column condominium_id drop default;
alter table settings alter column condominium_id drop default;
alter table webhook_events alter column condominium_id drop default;
