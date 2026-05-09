grant usage on schema public to authenticated;
grant select on table public.courses to authenticated;
grant select on table public.students to authenticated;
grant select on table public.enrollments to authenticated;

alter table public.courses enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;

drop policy if exists "Public read courses" on public.courses;
drop policy if exists "Authenticated read courses" on public.courses;
drop policy if exists "Students read own profile" on public.students;
drop policy if exists "Students read own enrollments" on public.enrollments;

create policy "Authenticated read courses" on public.courses
  for select to authenticated using (true);

create policy "Students read own profile" on public.students
  for select to authenticated using (auth.uid() = user_id);

create policy "Students read own enrollments" on public.enrollments
  for select to authenticated using (
    student_id = (
      select id from public.students where user_id = auth.uid()
    )
  );
