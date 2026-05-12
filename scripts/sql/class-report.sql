-- Extension for UUID generation
create extension if not exists pgcrypto;

-- 1. PROFILES TABLE (Identity information only)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profile Policies
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" 
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" 
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. CLASS REPORTS
create table if not exists public.class_reports (
  id uuid primary key default gen_random_uuid(),
  course_id int not null, 
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  
  report_type text not null check (
    report_type in (
      'class_cancelled',
      'room_changed',
      'lecturer_late',
      'class_confirmed'
    )
  ),

  message text,
  
  -- Room change specific fields
  old_room text,
  new_room text,
  faculty_id text, 

  status text not null default 'active' check (
    status in ('active', 'verified', 'rejected', 'expired')
  ),

  confirmations_count integer not null default 0,
  denials_count integer not null default 0,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  
  verification_score integer not null default 0 
);

-- 3. COURSE SESSION OVERRIDES
create table if not exists public.course_session_overrides (
  id uuid primary key default gen_random_uuid(),
  course_id int not null,
  report_id uuid not null references public.class_reports(id) on delete cascade,
  override_type text not null, 
  new_room text,
  is_active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 4. CLASS REPORT VOTES
create table if not exists public.class_report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.class_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote_type text not null check (vote_type in ('confirm', 'deny')),
  created_at timestamptz not null default now(),
  unique(report_id, user_id)
);

-- 5. NOTIFICATIONS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.class_reports(id) on delete set null,
  course_id int, -- For navigation
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. RLS POLICIES FOR CLASS REPORTING SYSTEM
alter table public.class_reports enable row level security;
drop policy if exists "Anyone can view reports" on public.class_reports;
create policy "Anyone can view reports" on public.class_reports for select using (true);

drop policy if exists "Authenticated users can submit reports" on public.class_reports;
create policy "Authenticated users can submit reports" on public.class_reports for insert with check (auth.uid() = reporter_id);

alter table public.class_report_votes enable row level security;
drop policy if exists "Users can view all votes" on public.class_report_votes;
create policy "Users can view all votes" on public.class_report_votes for select using (true);

drop policy if exists "Enrolled students can vote" on public.class_report_votes;
create policy "Enrolled students can vote" on public.class_report_votes for insert with check (auth.uid() = user_id);

alter table public.notifications enable row level security;
grant select, update, insert on table public.notifications to authenticated;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications" on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications" on public.notifications for update using (auth.uid() = user_id);

drop policy if exists "Users can insert own notifications" on public.notifications;
create policy "Users can insert own notifications" on public.notifications for insert with check (auth.uid() = user_id);

alter table public.course_session_overrides enable row level security;
drop policy if exists "Anyone can view active overrides" on public.course_session_overrides;
create policy "Anyone can view active overrides" on public.course_session_overrides for select using (is_active and expires_at > now());

drop policy if exists "System can insert overrides" on public.course_session_overrides;
create policy "System can insert overrides"
  on public.course_session_overrides for insert
  with check (true);

-- 7. TRIGGERS & FUNCTIONS

-- Function to handle trust score changes in public.user_trust_profiles
create or replace function public.handle_report_vote()
returns trigger as $$
declare
  v_reporter_id uuid;
  v_report_status text;
begin
  select reporter_id, status into v_reporter_id, v_report_status 
  from public.class_reports where id = NEW.report_id;

  if v_report_status != 'active' then
    return NEW;
  end if;

  if NEW.vote_type = 'confirm' then
    update public.class_reports 
    set confirmations_count = confirmations_count + 1, verification_score = verification_score + 1
    where id = NEW.report_id;
  else
    update public.class_reports 
    set denials_count = denials_count + 1, verification_score = verification_score - 1
    where id = NEW.report_id;
  end if;

  -- Threshold check (3 confirmations to verify, 3 denials to reject)
  if (select confirmations_count from public.class_reports where id = NEW.report_id) >= 3 then
    update public.class_reports set status = 'verified' where id = NEW.report_id;
    
    update public.user_trust_profiles 
    set trust_score = least(100, trust_score + 2), updated_at = now() 
    where user_id = v_reporter_id;
    
    update public.user_trust_profiles utp
    set trust_score = least(100, trust_score + 1), updated_at = now()
    from public.class_report_votes v 
    where v.report_id = NEW.report_id and v.vote_type = 'confirm' and utp.user_id = v.user_id;
    
    update public.user_trust_profiles utp
    set trust_score = greatest(0, trust_score - 1), updated_at = now()
    from public.class_report_votes v 
    where v.report_id = NEW.report_id and v.vote_type = 'deny' and utp.user_id = v.user_id;

  elsif (select denials_count from public.class_reports where id = NEW.report_id) >= 3 then
    update public.class_reports set status = 'rejected' where id = NEW.report_id;
    
    update public.user_trust_profiles 
    set trust_score = greatest(0, trust_score - 5), updated_at = now() 
    where user_id = v_reporter_id;

    update public.user_trust_profiles utp
    set trust_score = least(100, trust_score + 1), updated_at = now()
    from public.class_report_votes v 
    where v.report_id = NEW.report_id and v.vote_type = 'deny' and utp.user_id = v.user_id;
    
    update public.user_trust_profiles utp
    set trust_score = greatest(0, trust_score - 1), updated_at = now()
    from public.class_report_votes v 
    where v.report_id = NEW.report_id and v.vote_type = 'confirm' and utp.user_id = v.user_id;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_report_vote on public.class_report_votes;
create trigger on_report_vote
  after insert on public.class_report_votes
  for each row execute function public.handle_report_vote();

-- Function to create temporary session overrides on verified reports
create or replace function public.apply_verified_override()
returns trigger as $$
begin
  if NEW.status = 'verified' then
    insert into public.course_session_overrides (course_id, report_id, override_type, new_room, expires_at)
    values (NEW.course_id, NEW.id, NEW.report_type, NEW.new_room, NEW.expires_at);
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_report_verified on public.class_reports;
create trigger on_report_verified
  after update of status on public.class_reports
  for each row execute function public.apply_verified_override();

-- Function to notify enrolled students on report submission
create or replace function public.notify_students_on_report()
returns trigger as $$
declare
  v_course_code text;
  v_reporter_name text;
begin
  select "courseCode" into v_course_code from public.courses where id = NEW.course_id;
  select full_name into v_reporter_name from public.profiles where id = NEW.reporter_id;

  -- Create one row per recipient so each user's realtime subscription and
  -- notification tab can see the new class update. Always include the
  -- reporter, even if the course enrollment tables are empty in local data.
  insert into public.notifications (user_id, report_id, course_id, title, message)
  with recipients as (
    select s.user_id
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.course_id = NEW.course_id
      and s.user_id is not null
    union
    select NEW.reporter_id
  )
  select
    r.user_id,
    NEW.id,
    NEW.course_id,
    coalesce(v_course_code, 'Course') || ': ' || initcap(replace(NEW.report_type, '_', ' ')),
    coalesce(v_reporter_name, 'A student') || ' reported: ' || coalesce(NEW.message, 'A new update is available.')
  from recipients r;
  
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_report_submitted on public.class_reports;
create trigger on_report_submitted
  after insert on public.class_reports
  for each row execute function public.notify_students_on_report();

-- Function to automatically handle profile and trust profile creation on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.user_trust_profiles (user_id, trust_score)
  values (new.id, 50)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. BACKFILL & ONE-TIME INSERTS
insert into public.profiles (id, full_name)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.user_trust_profiles (user_id, trust_score)
select id, 50 from auth.users
on conflict (user_id) do nothing;
