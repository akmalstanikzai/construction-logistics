create table public.project_expense_types (
  project_id uuid not null references public.projects(id) on delete cascade,
  expense_type text not null check (expense_type in ('security', 'money_transfer_commission', 'goods_purchases', 'transportation_customs', 'installation', 'miscellaneous', 'tax')),
  enabled boolean not null default true,
  primary key (project_id, expense_type)
);

create table public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  expense_type text not null check (expense_type in ('security', 'money_transfer_commission', 'goods_purchases', 'transportation_customs', 'installation', 'miscellaneous')),
  expense_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, project_id)
);

create index project_expenses_project_id_idx on public.project_expenses (project_id);
alter table public.project_documents add column expense_id uuid;
alter table public.project_documents add constraint project_documents_expense_project_fk
  foreign key (expense_id, project_id) references public.project_expenses (id, project_id) on delete cascade;

alter table public.project_expense_types enable row level security;
alter table public.project_expenses enable row level security;
revoke all on public.project_expense_types, public.project_expenses from anon;
grant select on public.project_expense_types, public.project_expenses to authenticated;
grant insert (project_id, expense_type, enabled) on public.project_expense_types to authenticated;
grant update (enabled) on public.project_expense_types to authenticated;
grant insert (project_id, expense_type, expense_date, amount, note) on public.project_expenses to authenticated;
grant insert (project_id, file_name, content_type, r2_key, expense_id) on public.project_documents to authenticated;

create policy "Authenticated users can view expense types" on public.project_expense_types for select to authenticated using (true);
create policy "Authenticated users can add expense types" on public.project_expense_types for insert to authenticated with check (true);
create policy "Authenticated users can update expense types" on public.project_expense_types for update to authenticated using (true) with check (true);
create policy "Authenticated users can view expenses" on public.project_expenses for select to authenticated using (true);
create policy "Authenticated users can add expenses" on public.project_expenses for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.project_expense_types t
    where t.project_id = project_expenses.project_id and t.expense_type = project_expenses.expense_type and t.enabled
  ));
