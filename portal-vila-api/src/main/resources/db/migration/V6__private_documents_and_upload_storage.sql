alter table residents
  add column if not exists document_number varchar(40);

alter table documents
  add column if not exists uploaded_by bigint,
  add column if not exists storage_path text;
