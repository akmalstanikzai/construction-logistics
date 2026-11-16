alter table public.projects
  add column project_base text
  check (project_base in ('Muzarebah', 'Murabeha', 'Musharekah'));

grant insert (project_base) on public.projects to authenticated;
