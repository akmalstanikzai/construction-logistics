alter table public.project_financial_settings
  add column company_shares_loss boolean not null default false,
  add column company_loss_percentage numeric(5,2) not null default 50
    check (company_loss_percentage between 0 and 100);

grant select, insert (company_shares_loss, company_loss_percentage),
  update (company_shares_loss, company_loss_percentage)
  on public.project_financial_settings to authenticated;
