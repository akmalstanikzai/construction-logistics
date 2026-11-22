alter table public.project_financial_settings
  add column company_charity_percentage numeric(5,2) not null default 2.5 check (company_charity_percentage between 0 and 100),
  add column company_remuneration_percentage numeric(5,2) not null default 15 check (company_remuneration_percentage between 0 and 100);

grant select, insert (company_charity_percentage, company_remuneration_percentage),
  update (company_charity_percentage, company_remuneration_percentage)
  on public.project_financial_settings to authenticated;
