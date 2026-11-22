-- Permit incomplete test records while retaining identifiers and foreign keys.
alter table public.projects
  alter column name drop not null,
  alter column code_number drop not null,
  alter column organization drop not null,
  alter column location drop not null,
  alter column total_price drop not null,
  alter column start_date drop not null,
  alter column end_date drop not null;

alter table public.investors
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column inheritor_name drop not null;

alter table public.investments
  alter column amount drop not null,
  alter column investment_date drop not null;

alter table public.project_expenses
  alter column expense_date drop not null,
  alter column amount drop not null;

create or replace function public.create_investor_with_investment(
  p_first_name text, p_last_name text, p_contact_numbers text[],
  p_inheritor_name text, p_inheritor_contact_numbers text[],
  p_amount numeric, p_investment_date date, p_note text
) returns table (investor_id uuid, investment_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  investor_id := public.create_investor(
    nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
    p_contact_numbers, nullif(trim(p_inheritor_name), ''), p_inheritor_contact_numbers
  );
  investment_id := null;
  if p_amount is not null or p_investment_date is not null or nullif(trim(p_note), '') is not null then
    insert into public.investments (investor_id, amount, investment_date, note)
      values (investor_id, p_amount, p_investment_date, coalesce(trim(p_note), ''))
      returning id into investment_id;
  end if;
  return next;
end;
$$;
