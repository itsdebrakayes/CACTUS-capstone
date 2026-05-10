create extension if not exists pgcrypto;

create table if not exists public.walk_group_member_feedback (
  id uuid primary key default gen_random_uuid(),
  walk_group_id uuid not null references public.walk_groups(id) on delete cascade,
  voter_user_id uuid not null,
  target_user_id uuid not null,
  feedback_type text not null default 'downvote' check (
    feedback_type in ('downvote')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  check (voter_user_id <> target_user_id)
);

create index if not exists idx_walk_group_feedback_group_id
  on public.walk_group_member_feedback (walk_group_id);

create index if not exists idx_walk_group_feedback_target_id
  on public.walk_group_member_feedback (target_user_id);

create unique index if not exists idx_walk_group_feedback_unique_vote
  on public.walk_group_member_feedback (
    walk_group_id,
    voter_user_id,
    target_user_id,
    feedback_type
  );

alter table public.walk_group_member_feedback enable row level security;

drop policy if exists walk_group_feedback_select_authenticated on public.walk_group_member_feedback;
create policy walk_group_feedback_select_authenticated
on public.walk_group_member_feedback
for select
to authenticated
using (true);

grant select on public.walk_group_member_feedback to authenticated;

create table if not exists public.user_trust_profiles (
  user_id uuid primary key,
  trust_score integer not null default 50 check (trust_score >= 0 and trust_score <= 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_trust_profiles enable row level security;

drop policy if exists user_trust_profiles_select_authenticated on public.user_trust_profiles;
create policy user_trust_profiles_select_authenticated
on public.user_trust_profiles
for select
to authenticated
using (true);

grant select on public.user_trust_profiles to authenticated;

create or replace function public.remove_walk_group_member(
  walk_group_id_input uuid,
  target_user_id_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_creator_id uuid;
  target_status text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select creator_id, status
  into target_creator_id, target_status
  from public.walk_groups
  where id = walk_group_id_input;

  if target_creator_id is null then
    raise exception 'Walk group not found.';
  end if;

  if target_creator_id <> current_user_id then
    raise exception 'Only the creator can remove members.';
  end if;

  if target_status not in ('active', 'started') then
    raise exception 'This walk group is no longer active.';
  end if;

  if target_user_id_input = current_user_id or target_user_id_input = target_creator_id then
    raise exception 'Creators cannot remove themselves.';
  end if;

  update public.walk_group_members
  set left_at = timezone('utc', now())
  where walk_group_id = walk_group_id_input
    and user_id = target_user_id_input
    and left_at is null;

  if not found then
    raise exception 'Member not found in this walk group.';
  end if;

  return true;
end;
$$;

create or replace function public.downvote_walk_group_member(
  walk_group_id_input uuid,
  target_user_id_input uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_status text;
  feedback_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if current_user_id = target_user_id_input then
    raise exception 'You cannot downvote yourself.';
  end if;

  select status
  into target_status
  from public.walk_groups
  where id = walk_group_id_input;

  if target_status is null then
    raise exception 'Walk group not found.';
  end if;

  if target_status not in ('active', 'started') then
    raise exception 'This walk group is no longer active.';
  end if;

  if not exists (
    select 1
    from public.walk_group_members
    where walk_group_id = walk_group_id_input
      and user_id = current_user_id
      and left_at is null
  ) then
    raise exception 'Only active members can downvote.';
  end if;

  if not exists (
    select 1
    from public.walk_group_members
    where walk_group_id = walk_group_id_input
      and user_id = target_user_id_input
      and left_at is null
  ) then
    raise exception 'Target user is not an active member of this walk group.';
  end if;

  if exists (
    select 1
    from public.walk_group_member_feedback
    where walk_group_id = walk_group_id_input
      and voter_user_id = current_user_id
      and target_user_id = target_user_id_input
      and feedback_type = 'downvote'
  ) then
    raise exception 'You already downvoted this member.';
  end if;

  insert into public.walk_group_member_feedback (
    walk_group_id,
    voter_user_id,
    target_user_id,
    feedback_type
  )
  values (
    walk_group_id_input,
    current_user_id,
    target_user_id_input,
    'downvote'
  );

  insert into public.user_trust_profiles (user_id)
  values (target_user_id_input)
  on conflict (user_id) do nothing;

  update public.user_trust_profiles
  set trust_score = greatest(0, least(100, trust_score - 5)),
      updated_at = timezone('utc', now())
  where user_id = target_user_id_input;

  select count(*)
  into feedback_count
  from public.walk_group_member_feedback
  where walk_group_id = walk_group_id_input
    and target_user_id = target_user_id_input
    and feedback_type = 'downvote';

  return feedback_count;
end;
$$;

grant execute on function public.remove_walk_group_member(uuid, uuid) to authenticated;
grant execute on function public.downvote_walk_group_member(uuid, uuid) to authenticated;
