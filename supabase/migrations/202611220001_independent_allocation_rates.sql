-- Charity and remuneration are applied in sequence, so their rates are independent.
alter table public.project_financial_settings
  drop constraint if exists allocation_percentage_limit;
