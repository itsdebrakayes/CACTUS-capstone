import {
  TRUST_SCORE_DEFAULT,
  clampTrustScore,
  getTrustScoreRatio,
  getTrustTier,
  type TrustTierKey,
} from "@shared/trust";
import { createSupabaseDataClientForAccessToken } from "./supabaseAuth";

interface SupabaseTrustProfileRow {
  user_id?: string | null;
  trust_score?: number | null;
}

interface SupabaseTrustFeedbackRow {
  target_user_id?: string | null;
}

export interface SupabaseTrustSummary {
  userId: null;
  openId: string;
  name: null;
  avatarUrl: null;
  score: number;
  scoreRatio: number;
  tierKey: TrustTierKey;
  tierLabel: string;
  ratingCount: number;
  averageStars: number;
}

function getSupabaseUserIdFromOpenId(openId: string) {
  return openId.startsWith("supabase:")
    ? openId.slice("supabase:".length)
    : null;
}

function buildSupabaseTrustSummary(openId: string, score?: number | null) {
  const normalizedScore = clampTrustScore(score ?? TRUST_SCORE_DEFAULT);
  const tier = getTrustTier(normalizedScore);

  return {
    userId: null,
    openId,
    name: null,
    avatarUrl: null,
    score: normalizedScore,
    scoreRatio: getTrustScoreRatio(normalizedScore),
    tierKey: tier.key,
    tierLabel: tier.label,
    ratingCount: 0,
    averageStars: 0,
  } satisfies SupabaseTrustSummary;
}

export async function getSupabaseTrustProfilesByOpenIds(
  accessToken: string,
  openIds: string[]
) {
  const uniqueOpenIds = Array.from(
    new Set(openIds.map(openId => openId.trim()).filter(Boolean))
  );
  if (uniqueOpenIds.length === 0) {
    return [];
  }

  const userIds = uniqueOpenIds
    .map(getSupabaseUserIdFromOpenId)
    .filter((userId): userId is string => Boolean(userId));

  const profileRowsByUserId = new Map<string, SupabaseTrustProfileRow>();
  const downvoteCountsByUserId = new Map<string, number>();

  if (userIds.length > 0) {
    const supabase = createSupabaseDataClientForAccessToken(accessToken);
    const { data: profileData, error: profileError } = await supabase
      .from("user_trust_profiles")
      .select("user_id,trust_score")
      .in("user_id", userIds);

    if (!profileError) {
      for (const row of (profileData ?? []) as SupabaseTrustProfileRow[]) {
        if (typeof row.user_id === "string" && row.user_id.length > 0) {
          profileRowsByUserId.set(row.user_id, row);
        }
      }
    }

    const { data: feedbackData, error: feedbackError } = await supabase
      .from("walk_group_member_feedback")
      .select("target_user_id")
      .eq("feedback_type", "downvote")
      .in("target_user_id", userIds);

    if (feedbackError) {
      throw new Error(`Unable to load trust scores: ${feedbackError.message}`);
    }

    for (const row of (feedbackData ?? []) as SupabaseTrustFeedbackRow[]) {
      if (
        typeof row.target_user_id === "string" &&
        row.target_user_id.length > 0
      ) {
        downvoteCountsByUserId.set(
          row.target_user_id,
          (downvoteCountsByUserId.get(row.target_user_id) ?? 0) + 1
        );
      }
    }
  }

  return uniqueOpenIds.map(openId => {
    const userId = getSupabaseUserIdFromOpenId(openId);
    const profileScore = userId
      ? profileRowsByUserId.get(userId)?.trust_score
      : null;
    const fallbackScore = userId
      ? TRUST_SCORE_DEFAULT - (downvoteCountsByUserId.get(userId) ?? 0) * 5
      : TRUST_SCORE_DEFAULT;

    return buildSupabaseTrustSummary(openId, profileScore ?? fallbackScore);
  });
}

export async function getSupabaseTrustSummaryForOpenId(
  accessToken: string,
  openId: string
) {
  const [summary] = await getSupabaseTrustProfilesByOpenIds(accessToken, [
    openId,
  ]);
  return summary ?? buildSupabaseTrustSummary(openId, TRUST_SCORE_DEFAULT);
}

export async function getSupabaseTrustSummaryForUserId(
  accessToken: string,
  userId: string
) {
  return getSupabaseTrustSummaryForOpenId(accessToken, `supabase:${userId}`);
}
