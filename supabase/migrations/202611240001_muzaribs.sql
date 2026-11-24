create table public.muzaribs (
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
create index muzaribs_name_idx on public.muzaribs (last_name, first_name);
alter table public.muzaribs enable row level security;
revoke all on public.muzaribs from anon;
grant select, insert (first_name, last_name, phone_number, inheritor_name, inheritor_phone_number),
  update (first_name, last_name, phone_number, inheritor_name, inheritor_phone_number, nic_r2_key), delete
  on public.muzaribs to authenticated;
create policy "Authenticated users can view muzaribs" on public.muzaribs for select to authenticated using (true);
create policy "Authenticated users can add muzaribs" on public.muzaribs for insert to authenticated with check (auth.uid() = created_by);
create policy "Authenticated users can update muzaribs" on public.muzaribs for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete muzaribs" on public.muzaribs for delete to authenticated using (true);

alter table public.projects add column muzarib_id uuid references public.muzaribs(id) on delete restrict;
alter table public.projects add constraint projects_muzarib_type_check check (project_base = 'Muzarebah' or muzarib_id is null);
grant insert (muzarib_id), update (muzarib_id) on public.projects to authenticated;
create index projects_muzarib_id_idx on public.projects (muzarib_id);
