create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  kind text not null default 'deposit' check (kind in ('deposit', 'withdrawal')),
  investment_date date not null,
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.investments add column if not exists kind text not null default 'deposit';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.investments'::regclass and conname = 'investments_kind_check') then
    alter table public.investments add constraint investments_kind_check check (kind in ('deposit', 'withdrawal'));
  end if;
end $$;
create index if not exists investments_investor_date_idx on public.investments (investor_id, investment_date desc, created_at desc);
alter table public.investments enable row level security;
revoke all on public.investments from anon;
grant select on public.investments to authenticated;
grant insert (investor_id, amount, investment_date, note) on public.investments to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investments' and policyname = 'Authenticated users can view investments') then
    create policy "Authenticated users can view investments" on public.investments for select to authenticated using (true);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investments' and policyname = 'Authenticated users can add investments') then
    create policy "Authenticated users can add investments" on public.investments for insert to authenticated
      with check (auth.uid() = created_by and exists (select 1 from public.investors i where i.id = investor_id));
  end if;
end $$;

-- Lock the investor row so concurrent withdrawals cannot overdraw the balance.
create or replace function public.withdraw_investment(
  p_investor_id uuid, p_amount numeric, p_date date, p_note text
) returns public.investments
language plpgsql security definer set search_path = '' as $$
declare
  balance numeric;
  result public.investments;
begin
  if auth.uid() is null then raise exception 'Sign in to withdraw investment.'; end if;
  if p_amount is null or p_amount <= 0 or p_date is null then
    raise exception 'Enter an amount greater than zero and a date.';
  end if;
  perform 1 from public.investors where id = p_investor_id for update;
  if not found then raise exception 'Investor not found.'; end if;
  select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0)
    into balance from public.investments where investor_id = p_investor_id;
  if p_amount > balance then raise exception 'Withdrawal exceeds the available investment balance.'; end if;
  insert into public.investments (investor_id, amount, investment_date, note, kind)
    values (p_investor_id, p_amount, p_date, coalesce(trim(p_note), ''), 'withdrawal')
    returning * into result;
  return result;
end;
$$;
revoke all on function public.withdraw_investment(uuid, numeric, date, text) from public, anon;
grant execute on function public.withdraw_investment(uuid, numeric, date, text) to authenticated;
