-- Apply after 202611070001_investors.sql.
-- This migration denies investor access until an administrator explicitly adds staff users.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.investor_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table private.investor_staff enable row level security;
revoke all on private.investor_staff from public, anon, authenticated;

create or replace function private.is_investor_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.investor_staff
    where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_investor_staff() from public, anon;
grant execute on function private.is_investor_staff() to authenticated;

-- Safe to expose: the function only reports whether the caller is on the staff list.
create or replace function public.has_investor_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_investor_staff();
$$;
revoke all on function public.has_investor_access() from public, anon;
grant execute on function public.has_investor_access() to authenticated;

-- Remove broad privileges from the first migration, including any defaults.
revoke all on public.investors, public.investor_contacts from public, anon, authenticated;
revoke update (nic_r2_key) on public.investors from authenticated;
grant select on public.investors to authenticated;
grant insert (first_name, last_name, inheritor_name) on public.investors to authenticated;
grant update (nic_r2_key) on public.investors to authenticated;
grant select on public.investor_contacts to authenticated;
grant insert (investor_id, contact_type, phone_number) on public.investor_contacts to authenticated;

drop policy if exists "Authenticated users can view investors" on public.investors;
drop policy if exists "Authenticated users can add investors" on public.investors;
drop policy if exists "Authenticated users can update investors" on public.investors;
drop policy if exists "Authenticated users can delete investors" on public.investors;
create policy "Staff can view investors" on public.investors
  for select to authenticated using ((select private.is_investor_staff()));
create policy "Staff can add investors" on public.investors
  for insert to authenticated
  with check ((select private.is_investor_staff()) and created_by = (select auth.uid()));
create policy "Staff can attach investor NIC" on public.investors
  for update to authenticated
  using ((select private.is_investor_staff()))
  with check ((select private.is_investor_staff()));

drop policy if exists "Authenticated users can view investor contacts" on public.investor_contacts;
drop policy if exists "Authenticated users can add investor contacts" on public.investor_contacts;
drop policy if exists "Authenticated users can update investor contacts" on public.investor_contacts;
drop policy if exists "Authenticated users can delete investor contacts" on public.investor_contacts;
create policy "Staff can view investor contacts" on public.investor_contacts
  for select to authenticated
  using ((select private.is_investor_staff()) and exists (
    select 1 from public.investors i where i.id = investor_id
  ));
create policy "Staff can add investor contacts" on public.investor_contacts
  for insert to authenticated
  with check ((select private.is_investor_staff()) and exists (
    select 1 from public.investors i where i.id = investor_id
  ));
