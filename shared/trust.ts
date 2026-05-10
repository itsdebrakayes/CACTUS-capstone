export const TRUST_SCORE_MIN = 0;
export const TRUST_SCORE_MAX = 100;
export const TRUST_SCORE_DEFAULT = 50;

export const WALK_GROUP_DOWNVOTE_TRUST_DELTA = -5;

export type TrustTierKey =
  | "flagged"
  | "watchlist"
  | "low_trust"
  | "neutral"
  | "trusted_peer"
  | "campus_ally"
  | "guardian";

export interface TrustTier {
  key: TrustTierKey;
  label: string;
  min: number;
  max: number;
}

export const TRUST_TIERS: TrustTier[] = [
  { key: "flagged", label: "Flagged", min: 0, max: 15 },
  { key: "watchlist", label: "Watchlist", min: 16, max: 31 },
  { key: "low_trust", label: "Low Trust", min: 32, max: 46 },
  { key: "neutral", label: "Neutral", min: 47, max: 61 },
  { key: "trusted_peer", label: "Trusted Peer", min: 62, max: 76 },
  { key: "campus_ally", label: "Campus Ally", min: 77, max: 91 },
  { key: "guardian", label: "Guardian", min: 92, max: 100 },
];

export function clampTrustScore(score: number) {
  if (!Number.isFinite(score)) {
    return TRUST_SCORE_DEFAULT;
  }

  return Math.min(
    TRUST_SCORE_MAX,
    Math.max(TRUST_SCORE_MIN, Math.round(score))
  );
}

export function getTrustScoreRatio(score: number) {
  return clampTrustScore(score) / 100;
}

export function getTrustTier(score: number) {
  const clampedScore = clampTrustScore(score);

  return (
    TRUST_TIERS.find(
      tier => clampedScore >= tier.min && clampedScore <= tier.max
    ) ?? TRUST_TIERS[TRUST_TIERS.length - 1]
  );
}

export function getWalkingRatingTrustDelta(stars: number) {
  switch (stars) {
    case 5:
      return 4;
    case 4:
      return 2;
    case 3:
      return 0;
    case 2:
      return -2;
    case 1:
    default:
      return -5;
  }
}
