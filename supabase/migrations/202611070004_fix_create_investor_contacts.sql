-- Fix the undefined `number` reference in the original create_investor function.
-- The form calls this RPC for every new investor, including those without phones.
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
  select new_investor_id, 'investor', trim(n.phone_number)
  from unnest(coalesce(p_contact_numbers, array[]::text[])) as n(phone_number)
  where length(trim(n.phone_number)) > 0;

  insert into public.investor_contacts (investor_id, contact_type, phone_number)
  select new_investor_id, 'inheritor', trim(n.phone_number)
  from unnest(coalesce(p_inheritor_contact_numbers, array[]::text[])) as n(phone_number)
  where length(trim(n.phone_number)) > 0;

  return new_investor_id;
end;
$$;

revoke all on function public.create_investor(text, text, text[], text, text[]) from public, anon;
grant execute on function public.create_investor(text, text, text[], text, text[]) to authenticated;
