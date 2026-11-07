-- Supersedes the staff-only policies in 202611070002.
-- Every authenticated user may view and add investors and their contacts.
alter table public.investors enable row level security;
alter table public.investor_contacts enable row level security;

revoke all on public.investors, public.investor_contacts from public, anon, authenticated;
grant select on public.investors to authenticated;
grant insert (first_name, last_name, inheritor_name) on public.investors to authenticated;
grant update (nic_r2_key) on public.investors to authenticated;
grant select on public.investor_contacts to authenticated;
grant insert (investor_id, contact_type, phone_number) on public.investor_contacts to authenticated;

drop policy if exists "Staff can view investors" on public.investors;
drop policy if exists "Staff can add investors" on public.investors;
drop policy if exists "Staff can attach investor NIC" on public.investors;
drop policy if exists "Authenticated users can view investors" on public.investors;
drop policy if exists "Authenticated users can add investors" on public.investors;
drop policy if exists "Authenticated users can update investors" on public.investors;

create policy "Authenticated users can view investors"
  on public.investors for select to authenticated using (true);
create policy "Authenticated users can add investors"
  on public.investors for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "Authenticated users can update investors"
  on public.investors for update to authenticated
  using (true) with check (true);

drop policy if exists "Staff can view investor contacts" on public.investor_contacts;
drop policy if exists "Staff can add investor contacts" on public.investor_contacts;
drop policy if exists "Authenticated users can view investor contacts" on public.investor_contacts;
drop policy if exists "Authenticated users can add investor contacts" on public.investor_contacts;

create policy "Authenticated users can view investor contacts"
  on public.investor_contacts for select to authenticated
  using (exists (select 1 from public.investors i where i.id = investor_id));
create policy "Authenticated users can add investor contacts"
  on public.investor_contacts for insert to authenticated
  with check (exists (select 1 from public.investors i where i.id = investor_id));
