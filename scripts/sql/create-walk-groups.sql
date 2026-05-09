create extension if not exists pgcrypto;

create table if not exists public.walk_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  destination_name text not null,
  destination_category text,
  destination_source_id text,
  destination_node_id text,
  destination_lat double precision not null,
  destination_lng double precision not null,
  meeting_point_name text not null,
  meeting_category text,
  meeting_source_id text,
  meeting_node_id text,
  meeting_lat double precision not null,
  meeting_lng double precision not null,
  leaving_at timestamptz not null,
  note text,
  status text not null default 'active' check (
    status in ('active', 'started', 'ended', 'cancelled', 'expired')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_walk_groups_status_leaving_at
  on public.walk_groups (status, leaving_at);

create index if not exists idx_walk_groups_creator_id
  on public.walk_groups (creator_id);

create table if not exists public.walk_group_members (
  id uuid primary key default gen_random_uuid(),
  walk_group_id uuid not null references public.walk_groups(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('creator', 'member')),
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz
);

create index if not exists idx_walk_group_members_group_id
  on public.walk_group_members (walk_group_id);

create index if not exists idx_walk_group_members_user_id
  on public.walk_group_members (user_id);

create unique index if not exists idx_walk_group_members_active_unique
  on public.walk_group_members (walk_group_id, user_id)
  where left_at is null;

create or replace function public.set_walk_group_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_walk_groups_set_updated_at on public.walk_groups;
create trigger trg_walk_groups_set_updated_at
before update on public.walk_groups
for each row
execute function public.set_walk_group_updated_at();

alter table public.walk_groups enable row level security;
alter table public.walk_group_members enable row level security;

drop policy if exists walk_groups_select_authenticated on public.walk_groups;
create policy walk_groups_select_authenticated
on public.walk_groups
for select
to authenticated
using (true);

drop policy if exists walk_group_members_select_authenticated on public.walk_group_members;
create policy walk_group_members_select_authenticated
on public.walk_group_members
for select
to authenticated
using (true);

grant select on public.walk_groups to authenticated;
grant select on public.walk_group_members to authenticated;

create or replace function public.expire_stale_walk_groups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.walk_groups
    set status = 'expired',
        updated_at = timezone('utc', now())
    where status in ('active', 'started')
      and leaving_at <= timezone('utc', now()) - interval '45 minutes'
    returning id
  )
  select count(*)
  into expired_count
  from expired;

  if expired_count > 0 then
    update public.walk_group_members
    set left_at = coalesce(left_at, timezone('utc', now()))
    where walk_group_id in (
      select id
      from public.walk_groups
      where status = 'expired'
        and leaving_at <= timezone('utc', now()) - interval '45 minutes'
    )
      and left_at is null;
  end if;

  return expired_count;
end;
$$;

create or replace function public.create_walk_group(
  destination_name_input text,
  destination_category_input text,
  destination_source_id_input text,
  destination_node_id_input text,
  destination_lat_input double precision,
  destination_lng_input double precision,
  meeting_point_name_input text,
  meeting_category_input text,
  meeting_source_id_input text,
  meeting_node_id_input text,
  meeting_lat_input double precision,
  meeting_lng_input double precision,
  leaving_at_input timestamptz,
  note_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.expire_stale_walk_groups();

  if exists (
    select 1
    from public.walk_group_members member
    join public.walk_groups grp on grp.id = member.walk_group_id
    where member.user_id = current_user_id
      and member.left_at is null
      and grp.status in ('active', 'started')
  ) then
    raise exception 'You are already in an active walk group.';
  end if;

  insert into public.walk_groups (
    creator_id,
    destination_name,
    destination_category,
    destination_source_id,
    destination_node_id,
    destination_lat,
    destination_lng,
    meeting_point_name,
    meeting_category,
    meeting_source_id,
    meeting_node_id,
    meeting_lat,
    meeting_lng,
    leaving_at,
    note
  )
  values (
    current_user_id,
    destination_name_input,
    nullif(destination_category_input, ''),
    nullif(destination_source_id_input, ''),
    nullif(destination_node_id_input, ''),
    destination_lat_input,
    destination_lng_input,
    meeting_point_name_input,
    nullif(meeting_category_input, ''),
    nullif(meeting_source_id_input, ''),
    nullif(meeting_node_id_input, ''),
    meeting_lat_input,
    meeting_lng_input,
    leaving_at_input,
    nullif(note_input, '')
  )
  returning id into new_group_id;

  insert into public.walk_group_members (
    walk_group_id,
    user_id,
    role
  )
  values (
    new_group_id,
    current_user_id,
    'creator'
  );

  return new_group_id;
end;
$$;

create or replace function public.join_walk_group(
  walk_group_id_input uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_status text;
  target_creator_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.expire_stale_walk_groups();

  select status, creator_id
  into target_status, target_creator_id
  from public.walk_groups
  where id = walk_group_id_input;

  if target_status is null then
    raise exception 'Walk group not found.';
  end if;

  if target_status <> 'active' then
    raise exception 'This walk group is no longer open for joining.';
  end if;

  if exists (
    select 1
    from public.walk_group_members member
    join public.walk_groups grp on grp.id = member.walk_group_id
    where member.user_id = current_user_id
      and member.left_at is null
      and grp.status in ('active', 'started')
      and grp.id <> walk_group_id_input
  ) then
    raise exception 'You are already in another active walk group.';
  end if;

  if exists (
    select 1
    from public.walk_group_members
    where walk_group_id = walk_group_id_input
      and user_id = current_user_id
      and left_at is null
  ) then
    return walk_group_id_input;
  end if;

  insert into public.walk_group_members (
    walk_group_id,
    user_id,
    role
  )
  values (
    walk_group_id_input,
    current_user_id,
    case when target_creator_id = current_user_id then 'creator' else 'member' end
  );

  return walk_group_id_input;
end;
$$;

create or replace function public.leave_walk_group(
  walk_group_id_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_creator_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select creator_id
  into target_creator_id
  from public.walk_groups
  where id = walk_group_id_input;

  if target_creator_id is null then
    raise exception 'Walk group not found.';
  end if;

  if target_creator_id = current_user_id then
    raise exception 'Creators should end the group instead of leaving it.';
  end if;

  update public.walk_group_members
  set left_at = timezone('utc', now())
  where walk_group_id = walk_group_id_input
    and user_id = current_user_id
    and left_at is null;

  return found;
end;
$$;

create or replace function public.update_walk_group_status(
  walk_group_id_input uuid,
  next_status_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if next_status_input not in ('started', 'ended', 'cancelled', 'expired') then
    raise exception 'Unsupported walk group status.';
  end if;

  update public.walk_groups
  set status = next_status_input,
      updated_at = timezone('utc', now())
  where id = walk_group_id_input
    and creator_id = current_user_id;

  if not found then
    raise exception 'Only the creator can update this walk group.';
  end if;

  if next_status_input in ('ended', 'cancelled', 'expired') then
    update public.walk_group_members
    set left_at = coalesce(left_at, timezone('utc', now()))
    where walk_group_id = walk_group_id_input
      and left_at is null;
  end if;

  return true;
end;
$$;

grant execute on function public.expire_stale_walk_groups() to authenticated;
grant execute on function public.create_walk_group(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  timestamptz,
  text
) to authenticated;
grant execute on function public.join_walk_group(uuid) to authenticated;
grant execute on function public.leave_walk_group(uuid) to authenticated;
grant execute on function public.update_walk_group_status(uuid, text) to authenticated;
