-- Authenticated staff already share read and create access to these records.
grant update (name, code_number, organization, location, total_price, project_base, start_date, end_date, status, note), delete
  on public.projects to authenticated;
grant update (expense_type, expense_date, amount, note), delete
  on public.project_expenses to authenticated;
grant update (first_name, last_name, inheritor_name, nic_r2_key), delete
  on public.investors to authenticated;
grant update (contact_type, phone_number), delete
  on public.investor_contacts to authenticated;
grant update (amount, investment_date, note, kind), delete
  on public.investments to authenticated;
grant update (file_name), delete on public.project_documents to authenticated;
grant delete on public.project_expense_types, public.project_financial_settings to authenticated;

create policy "Authenticated users can delete projects" on public.projects
  for delete to authenticated using (true);
create policy "Authenticated users can update expenses" on public.project_expenses
  for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete expenses" on public.project_expenses
  for delete to authenticated using (true);
create policy "Authenticated users can delete investors" on public.investors
  for delete to authenticated using (true);
create policy "Authenticated users can update investor contacts" on public.investor_contacts
  for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete investor contacts" on public.investor_contacts
  for delete to authenticated using (true);
create policy "Authenticated users can update investments" on public.investments
  for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete investments" on public.investments
  for delete to authenticated using (true);
create policy "Authenticated users can update project documents" on public.project_documents
  for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete project documents" on public.project_documents
  for delete to authenticated using (true);
create policy "Authenticated users can delete expense types" on public.project_expense_types
  for delete to authenticated using (true);
create policy "Authenticated users can delete financial settings" on public.project_financial_settings
  for delete to authenticated using (true);

create or replace function public.update_investor_details(
  p_investor_id uuid, p_first_name text, p_last_name text,
  p_contact_numbers text[], p_inheritor_name text, p_inheritor_contact_numbers text[]
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.investors set first_name = trim(p_first_name), last_name = trim(p_last_name),
    inheritor_name = trim(p_inheritor_name) where id = p_investor_id;
  if not found then raise exception 'Investor not found.'; end if;
  delete from public.investor_contacts where investor_id = p_investor_id;
  insert into public.investor_contacts (investor_id, contact_type, phone_number)
  select p_investor_id, 'investor', trim(phone)
  from unnest(coalesce(p_contact_numbers, array[]::text[])) as n(phone)
  where length(trim(phone)) > 0;
  insert into public.investor_contacts (investor_id, contact_type, phone_number)
  select p_investor_id, 'inheritor', trim(phone)
  from unnest(coalesce(p_inheritor_contact_numbers, array[]::text[])) as n(phone)
  where length(trim(phone)) > 0;
end;
$$;
revoke all on function public.update_investor_details(uuid, text, text, text[], text, text[]) from public, anon;
grant execute on function public.update_investor_details(uuid, text, text, text[], text, text[]) to authenticated;

create or replace function public.keep_investment_balance_nonnegative()
returns trigger language plpgsql set search_path = '' as $$
declare balance numeric;
begin
  -- The parent may already be gone during a cascading investor deletion.
  perform 1 from public.investors where id = old.investor_id for update;
  if not found then return coalesce(new, old); end if;
  select coalesce(sum(case when kind = 'withdrawal' then -amount else amount end), 0)
    into balance from public.investments where investor_id = old.investor_id;
  if balance < 0 then raise exception 'This change would make the investment balance negative.'; end if;
  return coalesce(new, old);
end;
$$;
create trigger investments_keep_balance_after_change
  after update or delete on public.investments
  for each row execute function public.keep_investment_balance_nonnegative();
