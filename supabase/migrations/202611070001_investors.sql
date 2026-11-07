-- Shared investor register. All signed-in company users can view and manage records.
create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  inheritor_name text not null check (length(trim(inheritor_name)) > 0),
  nic_r2_key text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_contacts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  contact_type text not null check (contact_type in ('investor', 'inheritor')),
  phone_number text not null check (length(trim(phone_number)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists investor_contacts_investor_id_idx
  on public.investor_contacts (investor_id);
create index if not exists investors_name_idx
  on public.investors (last_name, first_name);

alter table public.investors enable row level security;
alter table public.investor_contacts enable row level security;

revoke all on public.investors, public.investor_contacts from anon;
revoke insert, update, delete on public.investors from authenticated;
revoke insert, update, delete on public.investor_contacts from authenticated;
grant select on public.investors to authenticated;
grant insert (first_name, last_name, inheritor_name) on public.investors to authenticated;
grant update (nic_r2_key) on public.investors to authenticated;
grant select on public.investor_contacts to authenticated;
grant insert (investor_id, contact_type, phone_number) on public.investor_contacts to authenticated;

create policy "Authenticated users can view investors"
  on public.investors for select to authenticated
  using (true);
create policy "Authenticated users can add investors"
  on public.investors for insert to authenticated
  with check (auth.uid() = created_by);
create policy "Authenticated users can update investors"
  on public.investors for update to authenticated
  using (true) with check (true);
create policy "Authenticated users can view investor contacts"
  on public.investor_contacts for select to authenticated
  using (exists (select 1 from public.investors i where i.id = investor_id));
create policy "Authenticated users can add investor contacts"
  on public.investor_contacts for insert to authenticated
  with check (exists (select 1 from public.investors i where i.id = investor_id));
create or replace function public.set_investor_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger investors_set_updated_at
  before update on public.investors
  for each row execute function public.set_investor_updated_at();

-- Creates a parent record and both phone lists in one transaction.
create or replace function public.create_investor(
  p_first_name text,
  p_last_name text,
  p_contact_numbers text[],
  p_inheritor_name text,
  p_inheritor_contact_numbers text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_investor_id uuid;
begin
  insert into public.investors (first_name, last_name, inheritor_name)
  values (trim(p_first_name), trim(p_last_name), trim(p_inheritor_name))
  returning id into new_investor_id;

  insert into public.investor_contacts (investor_id, contact_type, phone_number)
  select new_investor_id, 'investor', trim(number)
  from unnest(coalesce(p_contact_numbers, array[]::text[])) as n(phone_number)
  where length(trim(n.phone_number)) > 0;

  insert into public.investor_contacts (investor_id, contact_type, phone_number)
  select new_investor_id, 'inheritor', trim(number)
  from unnest(coalesce(p_inheritor_contact_numbers, array[]::text[])) as n(phone_number)
  where length(trim(n.phone_number)) > 0;

  return new_investor_id;
end;
$$;

revoke all on function public.create_investor(text, text, text[], text, text[]) from public, anon;
grant execute on function public.create_investor(text, text, text[], text, text[]) to authenticated;
