create table public.project_financial_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  tax_percentage numeric(5,2) not null default 0 check (tax_percentage between 0 and 100),
  charity_percentage numeric(5,2) not null default 2.5 check (charity_percentage between 0 and 100),
  investor_percentage numeric(5,2) not null default 20 check (investor_percentage between 0 and 100),
  constraint allocation_percentage_limit check (charity_percentage + investor_percentage <= 100)
);

alter table public.project_financial_settings enable row level security;
revoke all on public.project_financial_settings from anon;
grant select, insert (project_id, tax_percentage, charity_percentage, investor_percentage), update (tax_percentage, charity_percentage, investor_percentage) on public.project_financial_settings to authenticated;
create policy "Authenticated users can view project financial settings" on public.project_financial_settings for select to authenticated using (true);
create policy "Authenticated users can add project financial settings" on public.project_financial_settings for insert to authenticated with check (true);
create policy "Authenticated users can update project financial settings" on public.project_financial_settings for update to authenticated using (true) with check (true);
