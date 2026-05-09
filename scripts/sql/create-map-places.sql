create extension if not exists pgcrypto;

create table if not exists public.map_places (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  name text not null,
  type text not null,
  source_category text not null,
  lat double precision not null,
  lng double precision not null,
  parent_name text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_places_type_check check (
    type in (
      'building',
      'classroom',
      'faculty',
      'food',
      'garden',
      'hall',
      'lab',
      'landmark',
      'library',
      'office',
      'parking',
      'restroom'
    )
  )
);

create index if not exists map_places_type_idx on public.map_places (type);
create index if not exists map_places_active_idx on public.map_places (is_active);

create or replace function public.set_map_places_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists map_places_set_updated_at on public.map_places;

create trigger map_places_set_updated_at
before update on public.map_places
for each row
execute function public.set_map_places_updated_at();

alter table public.map_places enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.map_places to anon, authenticated;

drop policy if exists "map_places_select_active" on public.map_places;
create policy "map_places_select_active"
on public.map_places
for select
to anon, authenticated
using (is_active = true);
