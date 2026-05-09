-- Add missing columns to existing courses table
alter table courses 
  add column if not exists room_source_id text,
  add column if not exists room_lat double precision,
  add column if not exists room_lng double precision,
  add column if not exists day_of_week text,
  add column if not exists start_time text,
  add column if not exists end_time text;

-- Create students table
create table students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  student_id text not null unique,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  created_at timestamp with time zone default now()
);

-- Create enrollments table
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  course_id int references courses(id) on delete cascade, -- int to match your existing id type
  enrolled_at timestamp with time zone default now(),
  unique(student_id, course_id)
);

-- RLS
alter table courses enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;

grant usage on schema public to authenticated;
grant select on table public.courses to authenticated;
grant select on table public.students to authenticated;
grant select on table public.enrollments to authenticated;

drop policy if exists "Public read courses" on courses;
drop policy if exists "Authenticated read courses" on courses;
drop policy if exists "Students read own profile" on students;
drop policy if exists "Students read own enrollments" on enrollments;

create policy "Authenticated read courses" on courses
  for select to authenticated using (true);

create policy "Students read own profile" on students
  for select to authenticated using (auth.uid() = user_id);

create policy "Students read own enrollments" on enrollments
  for select to authenticated using (
    student_id = (
      select id from students where user_id = auth.uid()
    )
  );

-- Seed the 5 courses with real coordinates
insert into courses (
  "courseCode", "courseName", description, room, lecturer, department,
  "classSize", "isActive", room_source_id, room_lat, room_lng,
  day_of_week, start_time, end_time
) values
  (
    'INFO3180', 'Application Development',
    'Full stack web application development using modern frameworks.',
    'Tutorial Room 11', 'TBA', 'Computing',
    30, true,
    'social-sciences-tutorial-room-11',
    18.007018, -76.7474146,
    'Monday,Wednesday', '08:00', '10:00'
  ),
  (
    'INFO3170', 'Database Management',
    'Principles and practices of database design and management.',
    'SLT 2', 'TBA', 'Computing',
    30, true,
    'slt-2-3',
    18.00516173, -76.74978513,
    'Tuesday,Thursday', '10:00', '12:00'
  ),
  (
    'INFO3140', 'Operating Systems',
    'Fundamentals of operating system design and implementation.',
    'SLT 1', 'TBA', 'Computing',
    30, true,
    'slt-1-2',
    18.00516173, -76.74978513,
    'Monday,Friday', '12:00', '14:00'
  ),
  (
    'INFO2100', 'Object Oriented Programming',
    'Object oriented design principles and programming practices.',
    'SLT 3', 'TBA', 'Computing',
    30, true,
    'slt-3-23',
    18.00548571, -76.74998598,
    'Wednesday,Friday', '14:00', '16:00'
  ),
  (
    'INFO3165', 'Software Engineering',
    'Software development lifecycle, design patterns and methodologies.',
    'Tutorial Room 11', 'TBA', 'Computing',
    30, true,
    'physics-tutorial-room-11-7',
    18.00482478, -76.7488434,
    'Tuesday,Thursday', '14:00', '16:00'
  );
