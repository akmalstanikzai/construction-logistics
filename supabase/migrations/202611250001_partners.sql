create table public.partners (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  phone_number text not null check (length(trim(phone_number)) > 0),
  inheritor_name text not null check (length(trim(inheritor_name)) > 0),
  inheritor_phone_number text not null check (length(trim(inheritor_phone_number)) > 0),
  nic_r2_key text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index partners_name_idx on public.partners(last_name, first_name);
alter table public.partners enable row level security;
revoke all on public.partners from anon;
grant select, delete on public.partners to authenticated;
grant insert (first_name, last_name, phone_number, inheritor_name, inheritor_phone_number),
  update (first_name, last_name, phone_number, inheritor_name, inheritor_phone_number, nic_r2_key)
  on public.partners to authenticated;
create policy partners_read on public.partners for select to authenticated using (true);
create policy partners_insert on public.partners for insert to authenticated with check (created_by = auth.uid());
create policy partners_update on public.partners for update to authenticated using (true) with check (true);
create policy partners_delete on public.partners for delete to authenticated using (true);

create table public.project_partners (
  project_id uuid not null references public.projects(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete restrict,
  primary key (project_id, partner_id)
);
create index project_partners_partner_idx on public.project_partners(partner_id);
alter table public.project_partners enable row level security;
grant select, insert, delete on public.project_partners to authenticated;
create policy project_partners_read on public.project_partners for select to authenticated using (true);
create policy project_partners_insert on public.project_partners for insert to authenticated with check (true);
create policy project_partners_delete on public.project_partners for delete to authenticated using (true);

-- Existing records belong to the shared investor pool unless explicitly reassigned.
alter table public.project_expenses add column funding_partner_id uuid;
alter table public.project_expenses add constraint expense_project_partner_fk
  foreign key (project_id, funding_partner_id) references public.project_partners(project_id, partner_id) on delete no action;
grant insert (funding_partner_id), update (funding_partner_id) on public.project_expenses to authenticated;

create function public.validate_musharekah_funding() returns trigger
language plpgsql set search_path = '' as $$
declare base text;
begin
  -- Serialize funding changes with project edits.
  select project_base into base from public.projects where id = new.project_id for update;
  if new.funding_partner_id is not null and base is distinct from 'Musharekah' then
    raise exception 'Partner funding is only available for Musharekah projects.';
  end if;
  return new;
end;
$$;
create trigger validate_expense_funding before insert or update on public.project_expenses
  for each row execute function public.validate_musharekah_funding();

create function public.validate_project_partner() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.projects where id = new.project_id and project_base = 'Musharekah' for update;
  if not found then raise exception 'Partners can only be assigned to Musharekah projects.'; end if;
  return new;
end;
$$;
create trigger validate_project_partner before insert or update on public.project_partners
  for each row execute function public.validate_project_partner();

create function public.validate_project_funding_base() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.project_base is distinct from 'Musharekah' and exists (
    select 1 from public.project_expenses where project_id = new.id and funding_partner_id is not null
  ) then raise exception 'Reassign partner-funded expenses to investors before changing the project base.'; end if;
  return new;
end;
$$;
create trigger validate_project_funding_base before update of project_base on public.projects
  for each row execute function public.validate_project_funding_base();

-- Save project details and the partner selection in one transaction.
create function public.save_project_with_partners(p_id uuid, p_values jsonb, p_partner_ids uuid[])
returns setof public.projects language plpgsql security invoker set search_path = '' as $$
declare v public.projects; saved_id uuid;
begin
  if p_values->>'project_base' = 'Musharekah' and coalesce(cardinality(p_partner_ids), 0) = 0 then
    raise exception 'Select at least one partner for this project.';
  end if;
  if p_values->>'project_base' is distinct from 'Musharekah' and coalesce(cardinality(p_partner_ids), 0) > 0 then
    raise exception 'Partners can only be assigned to Musharekah projects.';
  end if;
  v := jsonb_populate_record(null::public.projects, p_values);
  if p_id is null then
    insert into public.projects(name, code_number, organization, location, total_price, project_base, muzarib_id, start_date, end_date, status, note)
    values(v.name, v.code_number, v.organization, v.location, v.total_price, v.project_base, v.muzarib_id, v.start_date, v.end_date, v.status, v.note)
    returning id into saved_id;
  else
    update public.projects set name=v.name, code_number=v.code_number, organization=v.organization,
      location=v.location, total_price=v.total_price, project_base=v.project_base, muzarib_id=v.muzarib_id,
      start_date=v.start_date, end_date=v.end_date, status=v.status, note=v.note where id=p_id returning id into saved_id;
    if not found then raise exception 'Project not found.'; end if;
  end if;
  delete from public.project_partners where project_id=saved_id and not (partner_id = any(coalesce(p_partner_ids, '{}'::uuid[])));
  insert into public.project_partners(project_id, partner_id)
    select saved_id, partner_id from (select distinct unnest(p_partner_ids) as partner_id) selected
    where not exists (select 1 from public.project_partners existing where existing.project_id=saved_id and existing.partner_id=selected.partner_id);
  return query select * from public.projects where id=saved_id;
end;
$$;
revoke all on function public.save_project_with_partners(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_project_with_partners(uuid, jsonb, uuid[]) to authenticated;
