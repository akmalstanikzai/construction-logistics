create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code_number text not null unique check (length(trim(code_number)) > 0),
  organization text not null check (length(trim(organization)) > 0),
  location text not null check (length(trim(location)) > 0),
  total_price numeric(18,2) not null check (total_price >= 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'completed')),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint projects_date_order check (end_date >= start_date)
);
create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  r2_key text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists project_documents_project_id_idx on public.project_documents (project_id);
alter table public.projects enable row level security;
alter table public.project_documents enable row level security;
revoke all on public.projects, public.project_documents from anon;
grant select on public.projects, public.project_documents to authenticated;
grant insert (name, code_number, organization, location, total_price, start_date, end_date, status, note) on public.projects to authenticated;
grant insert (project_id, file_name, content_type, r2_key) on public.project_documents to authenticated;
grant update (status) on public.projects to authenticated;
create policy "Authenticated users can view projects" on public.projects for select to authenticated using (true);
create policy "Authenticated users can add projects" on public.projects for insert to authenticated with check (auth.uid() = created_by);
create policy "Authenticated users can update project status" on public.projects for update to authenticated using (true) with check (true);
create policy "Authenticated users can view project documents" on public.project_documents for select to authenticated using (true);
create policy "Authenticated users can add project documents" on public.project_documents for insert to authenticated
  with check (auth.uid() = created_by and exists (select 1 from public.projects p where p.id = project_id));
