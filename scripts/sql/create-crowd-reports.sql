create extension if not exists pgcrypto;

create table if not exists public.crowd_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  lat double precision not null,
  lng double precision not null,
  severity integer not null default 3,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint crowd_reports_severity_check check (severity between 1 and 5),
  constraint crowd_reports_status_check check (status in ('active', 'resolved', 'expired'))
);

alter table public.crowd_reports enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.crowd_reports to anon, authenticated;

drop policy if exists "crowd_reports_select_all" on public.crowd_reports;
create policy "crowd_reports_select_all"
on public.crowd_reports
for select
to anon, authenticated
using (true);

drop policy if exists "crowd_reports_insert_all" on public.crowd_reports;
create policy "crowd_reports_insert_all"
on public.crowd_reports
for insert
to anon, authenticated
with check (true);

create index if not exists crowd_reports_status_idx on public.crowd_reports (status);
create index if not exists crowd_reports_created_at_idx on public.crowd_reports (created_at desc);

create or replace function public.notify_users_on_urgent_hazard()
returns trigger as $$
declare
  v_title text;
  v_message text;
begin
  if NEW.report_type not in ('suspicious', 'suspicious_person', 'dangerous', 'flooding', 'flood', 'rainy') then
    return NEW;
  end if;

  if NEW.report_type in ('flooding', 'flood', 'rainy') then
    v_title := 'Flooding reported on campus';
    v_message := coalesce(NEW.description, 'Flooding has been reported. Routes may avoid the affected area.');
  else
    v_title := 'Suspicious activity reported';
    v_message := coalesce(NEW.description, 'Suspicious activity has been reported on campus. Stay alert and avoid the area.');
  end if;

  insert into public.notifications (user_id, title, message, is_read)
  select id, v_title, v_message, false
  from public.profiles;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_urgent_hazard_reported on public.crowd_reports;
create trigger on_urgent_hazard_reported
  after insert on public.crowd_reports
  for each row execute function public.notify_users_on_urgent_hazard();
