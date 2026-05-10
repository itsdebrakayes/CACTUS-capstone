import { supabase } from "@/lib/supabase";

const WALK_GROUP_TABLE = "walk_groups";
const WALK_GROUP_MEMBER_TABLE = "walk_group_members";
const WALK_GROUP_SELECT =
  "id,creator_id,destination_name,destination_category,destination_source_id,destination_node_id,destination_lat,destination_lng,meeting_point_name,meeting_category,meeting_source_id,meeting_node_id,meeting_lat,meeting_lng,leaving_at,note,status,created_at,updated_at";
const WALK_GROUP_MEMBER_SELECT =
  "id,walk_group_id,user_id,role,joined_at,left_at";
const ACTIVE_GROUP_STATUSES: WalkGroupStatus[] = ["active", "started"];

export type WalkGroupStatus =
  | "active"
  | "started"
  | "ended"
  | "cancelled"
  | "expired";

export type WalkGroupMemberRole = "creator" | "member";

export interface WalkGroupMemberRecord {
  id: string;
  walkGroupId: string;
  userId: string;
  role: WalkGroupMemberRole;
  joinedAt?: string;
  leftAt?: string;
}

export interface WalkGroupRecord {
  id: string;
  creatorId: string;
  destinationName: string;
  destinationCategory?: string;
  destinationSourceId?: string;
  destinationNodeId?: string;
  destinationLat: number;
  destinationLng: number;
  meetingPointName: string;
  meetingCategory?: string;
  meetingSourceId?: string;
  meetingNodeId?: string;
  meetingLat: number;
  meetingLng: number;
  leavingAt?: string;
  note?: string;
  status: WalkGroupStatus;
  createdAt?: string;
  updatedAt?: string;
  members: WalkGroupMemberRecord[];
  memberCount: number;
  currentUserRole?: WalkGroupMemberRole;
  isCurrentUserMember: boolean;
  isCreator: boolean;
}

export interface CreateWalkGroupInput {
  destinationName: string;
  destinationCategory?: string;
  destinationSourceId?: string;
  destinationNodeId?: string;
  destinationLat: number;
  destinationLng: number;
  meetingPointName: string;
  meetingCategory?: string;
  meetingSourceId?: string;
  meetingNodeId?: string;
  meetingLat: number;
  meetingLng: number;
  leavingAt: string;
  note?: string;
}

interface WalkGroupRow {
  id?: string | null;
  creator_id?: string | null;
  destination_name?: string | null;
  destination_category?: string | null;
  destination_source_id?: string | null;
  destination_node_id?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  meeting_point_name?: string | null;
  meeting_category?: string | null;
  meeting_source_id?: string | null;
  meeting_node_id?: string | null;
  meeting_lat?: number | null;
  meeting_lng?: number | null;
  leaving_at?: string | null;
  note?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface WalkGroupMemberRow {
  id?: string | null;
  walk_group_id?: string | null;
  user_id?: string | null;
  role?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
}

export async function loadActiveWalkGroups() {
  await expireStaleWalkGroups();
  const currentUserId = await getCurrentSupabaseUserId();
  const { data, error } = await supabase
    .from(WALK_GROUP_TABLE)
    .select(WALK_GROUP_SELECT)
    .eq("status", "active")
    .order("leaving_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load active walk groups: ${error.message}`);
  }

  return enrichWalkGroups(data as WalkGroupRow[], currentUserId);
}

export async function loadWalkGroup(groupId: string) {
  await expireStaleWalkGroups();
  const currentUserId = await getCurrentSupabaseUserId();
  const { data, error } = await supabase
    .from(WALK_GROUP_TABLE)
    .select(WALK_GROUP_SELECT)
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load this walk group: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const groups = await enrichWalkGroups([data as WalkGroupRow], currentUserId);
  return groups[0] ?? null;
}

export async function loadMyActiveWalkGroup() {
  await expireStaleWalkGroups();
  const currentUserId = await getCurrentSupabaseUserId();
  const { data: membershipRows, error: membershipError } = await supabase
    .from(WALK_GROUP_MEMBER_TABLE)
    .select("walk_group_id")
    .eq("user_id", currentUserId)
    .is("left_at", null);

  if (membershipError) {
    throw new Error(
      `Unable to check your active walk group: ${membershipError.message}`
    );
  }

  const groupIds = (membershipRows ?? [])
    .map(row => row.walk_group_id)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );

  if (groupIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from(WALK_GROUP_TABLE)
    .select(WALK_GROUP_SELECT)
    .in("id", groupIds)
    .in("status", ACTIVE_GROUP_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Unable to load your active walk group: ${error.message}`);
  }

  if (!data?.length) {
    return null;
  }

  const groups = await enrichWalkGroups(data as WalkGroupRow[], currentUserId);
  return groups[0] ?? null;
}

export async function createWalkGroup(input: CreateWalkGroupInput) {
  const currentUserId = await getCurrentSupabaseUserId();
  const { data, error } = await supabase.rpc("create_walk_group", {
    destination_name_input: input.destinationName,
    destination_category_input: input.destinationCategory ?? null,
    destination_source_id_input: input.destinationSourceId ?? null,
    destination_node_id_input: input.destinationNodeId ?? null,
    destination_lat_input: input.destinationLat,
    destination_lng_input: input.destinationLng,
    meeting_point_name_input: input.meetingPointName,
    meeting_category_input: input.meetingCategory ?? null,
    meeting_source_id_input: input.meetingSourceId ?? null,
    meeting_node_id_input: input.meetingNodeId ?? null,
    meeting_lat_input: input.meetingLat,
    meeting_lng_input: input.meetingLng,
    leaving_at_input: input.leavingAt,
    note_input: input.note?.trim() || null,
  });

  if (error) {
    throw new Error(`Unable to create the walk group: ${error.message}`);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Supabase did not return the new walk group id.");
  }

  const group = await loadWalkGroup(data);
  if (!group) {
    throw new Error("The new walk group could not be loaded.");
  }

  if (!group.isCreator || group.creatorId !== currentUserId) {
    throw new Error(
      "The new walk group was created, but creator membership is missing."
    );
  }

  return group;
}

export async function joinWalkGroup(groupId: string) {
  const { data, error } = await supabase.rpc("join_walk_group", {
    walk_group_id_input: groupId,
  });

  if (error) {
    throw new Error(`Unable to join this walk group: ${error.message}`);
  }

  const resolvedGroupId = typeof data === "string" && data ? data : groupId;
  const group = await loadWalkGroup(resolvedGroupId);
  if (!group) {
    throw new Error("The joined walk group could not be loaded.");
  }
  return group;
}

export async function leaveWalkGroup(groupId: string) {
  const { data, error } = await supabase.rpc("leave_walk_group", {
    walk_group_id_input: groupId,
  });

  if (error) {
    throw new Error(`Unable to leave this walk group: ${error.message}`);
  }

  return Boolean(data);
}

export async function removeWalkGroupMember(
  groupId: string,
  targetUserId: string
) {
  const { data, error } = await supabase.rpc("remove_walk_group_member", {
    walk_group_id_input: groupId,
    target_user_id_input: targetUserId,
  });

  if (error) {
    throw new Error(`Unable to remove this member: ${error.message}`);
  }

  return Boolean(data);
}

export async function updateWalkGroupStatus(
  groupId: string,
  nextStatus: Extract<
    WalkGroupStatus,
    "started" | "ended" | "cancelled" | "expired"
  >
) {
  const { data, error } = await supabase.rpc("update_walk_group_status", {
    walk_group_id_input: groupId,
    next_status_input: nextStatus,
  });

  if (error) {
    throw new Error(`Unable to update the walk group: ${error.message}`);
  }

  return Boolean(data);
}

export async function expireStaleWalkGroups() {
  const { error } = await supabase.rpc("expire_stale_walk_groups");
  if (error) {
    throw new Error(`Unable to expire stale walk groups: ${error.message}`);
  }
}

async function enrichWalkGroups(
  rows: WalkGroupRow[],
  currentUserId: string
): Promise<WalkGroupRecord[]> {
  const groups = rows.map(mapWalkGroupRow).filter(Boolean) as WalkGroupRecord[];
  if (groups.length === 0) {
    return [];
  }

  const membersByGroup = await loadMembersByGroup(
    groups.map(group => group.id)
  );

  return groups.map(group => {
    const members = membersByGroup.get(group.id) ?? [];
    const currentUserMembership = members.find(
      member => member.userId === currentUserId && !member.leftAt
    );

    return {
      ...group,
      members,
      memberCount: members.length,
      currentUserRole: currentUserMembership?.role,
      isCurrentUserMember: Boolean(currentUserMembership),
      isCreator: group.creatorId === currentUserId,
    };
  });
}

async function loadMembersByGroup(groupIds: string[]) {
  const activeGroupIds = groupIds.filter(Boolean);
  const membersByGroup = new Map<string, WalkGroupMemberRecord[]>();
  if (activeGroupIds.length === 0) {
    return membersByGroup;
  }

  const { data, error } = await supabase
    .from(WALK_GROUP_MEMBER_TABLE)
    .select(WALK_GROUP_MEMBER_SELECT)
    .in("walk_group_id", activeGroupIds)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load walk group members: ${error.message}`);
  }

  for (const row of (data ?? []) as WalkGroupMemberRow[]) {
    const member = mapWalkGroupMemberRow(row);
    if (!member) {
      continue;
    }

    const list = membersByGroup.get(member.walkGroupId) ?? [];
    list.push(member);
    membersByGroup.set(member.walkGroupId, list);
  }

  return membersByGroup;
}

async function getCurrentSupabaseUserId() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Unable to read Supabase session: ${error.message}`);
  }

  if (!session?.user?.id) {
    throw new Error("Supabase session not ready.");
  }

  return session.user.id;
}

function mapWalkGroupRow(row: WalkGroupRow): WalkGroupRecord | null {
  const destinationLat = Number(row.destination_lat);
  const destinationLng = Number(row.destination_lng);
  const meetingLat = Number(row.meeting_lat);
  const meetingLng = Number(row.meeting_lng);
  const status = normalizeWalkGroupStatus(row.status);

  if (
    !row.id ||
    !row.creator_id ||
    !row.destination_name ||
    !row.meeting_point_name ||
    !Number.isFinite(destinationLat) ||
    !Number.isFinite(destinationLng) ||
    !Number.isFinite(meetingLat) ||
    !Number.isFinite(meetingLng) ||
    !status
  ) {
    return null;
  }

  return {
    id: row.id,
    creatorId: row.creator_id,
    destinationName: row.destination_name,
    destinationCategory: normalizeOptionalText(row.destination_category),
    destinationSourceId: normalizeOptionalText(row.destination_source_id),
    destinationNodeId: normalizeOptionalText(row.destination_node_id),
    destinationLat,
    destinationLng,
    meetingPointName: row.meeting_point_name,
    meetingCategory: normalizeOptionalText(row.meeting_category),
    meetingSourceId: normalizeOptionalText(row.meeting_source_id),
    meetingNodeId: normalizeOptionalText(row.meeting_node_id),
    meetingLat,
    meetingLng,
    leavingAt: normalizeOptionalText(row.leaving_at),
    note: normalizeOptionalText(row.note),
    status,
    createdAt: normalizeOptionalText(row.created_at),
    updatedAt: normalizeOptionalText(row.updated_at),
    members: [],
    memberCount: 0,
    isCurrentUserMember: false,
    isCreator: false,
  };
}

function mapWalkGroupMemberRow(
  row: WalkGroupMemberRow
): WalkGroupMemberRecord | null {
  const role = normalizeWalkGroupRole(row.role);
  if (!row.id || !row.walk_group_id || !row.user_id || !role) {
    return null;
  }

  return {
    id: row.id,
    walkGroupId: row.walk_group_id,
    userId: row.user_id,
    role,
    joinedAt: normalizeOptionalText(row.joined_at),
    leftAt: normalizeOptionalText(row.left_at),
  };
}

function normalizeWalkGroupStatus(value: string | null | undefined) {
  if (
    value === "active" ||
    value === "started" ||
    value === "ended" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  return null;
}

function normalizeWalkGroupRole(value: string | null | undefined) {
  if (value === "creator" || value === "member") {
    return value;
  }
  return null;
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
