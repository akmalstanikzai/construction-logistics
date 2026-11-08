-- Create the investor, contact numbers, and first investment in one transaction.
create or replace function public.create_investor_with_investment(
  p_first_name text,
  p_last_name text,
  p_contact_numbers text[],
  p_inheritor_name text,
  p_inheritor_contact_numbers text[],
  p_amount numeric,
  p_investment_date date,
  p_note text
) returns table (investor_id uuid, investment_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 or p_investment_date is null then
    raise exception 'Enter an initial investment amount greater than zero and a date.';
  end if;
  investor_id := public.create_investor(
    p_first_name, p_last_name, p_contact_numbers, p_inheritor_name, p_inheritor_contact_numbers
  );
  insert into public.investments (investor_id, amount, investment_date, note)
    values (investor_id, p_amount, p_investment_date, coalesce(trim(p_note), ''))
    returning id into investment_id;
  return next;
end;
$$;
revoke all on function public.create_investor_with_investment(text, text, text[], text, text[], numeric, date, text) from public, anon;
grant execute on function public.create_investor_with_investment(text, text, text[], text, text[], numeric, date, text) to authenticated;
