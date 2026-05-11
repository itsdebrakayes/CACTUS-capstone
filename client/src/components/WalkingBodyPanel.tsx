import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Users, Star, PersonStanding, Shield, Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WalkingBodyPanelProps {
  userLat: number;
  userLng: number;
  isAvailable?: boolean;
  onAvailabilityChange?: (available: boolean) => void;
  onRouteRequested?: (fromLat: number, fromLng: number, toLat: number, toLng: number) => void;
}

export function WalkingBodyPanel({
  userLat,
  userLng,
  isAvailable = false,
  onAvailabilityChange,
}: WalkingBodyPanelProps) {
  const [radiusM, setRadiusM] = useState(300);
  const [localAvailable, setLocalAvailable] = useState(isAvailable);
  const [ratingMatchId, setRatingMatchId] = useState<number | null>(null);
  const [ratingMatchInput, setRatingMatchInput] = useState("");
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  const { data: trustData, refetch: refetchTrust } = trpc.walking.getTrustScore.useQuery();

  const updateAvailabilityMutation = trpc.walking.updateAvailability.useMutation({
    onSuccess: (_, vars) => {
      setLocalAvailable(vars.isAvailable);
      onAvailabilityChange?.(vars.isAvailable);
      toast.success(vars.isAvailable ? "You are now available for walking" : "You are no longer available");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const requestWalkersMutation = trpc.walking.requestWalkers.useMutation({
    onSuccess: (data) => {
      toast.success(`Walking request sent — ${data.matchCount} walker${data.matchCount !== 1 ? "s" : ""} notified`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ratePartnerMutation = trpc.walking.ratePartner.useMutation({
    onSuccess: (data) => {
      toast.success(`Rating submitted! New trust score: ${(data.trustScore * 100).toFixed(0)}%`);
      setRatingMatchId(null);
      setRatingMatchInput("");
      setRatingComment("");
      setRatingStars(5);
      refetchTrust();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleToggleAvailability = () => {
    updateAvailabilityMutation.mutate({
      lat: userLat,
      lng: userLng,
      isAvailable: !localAvailable,
    });
  };

  const handleRequestWalkers = () => {
    if (!localAvailable) {
      toast.error("You must be available first");
      return;
    }
    requestWalkersMutation.mutate({ radiusM });
  };

  const trustPct = trustData ? Math.round(trustData.score * 100) : null;
  const trustColor =
    trustPct === null ? "text-muted-foreground"
    : trustPct >= 80 ? "text-green-600"
    : trustPct >= 50 ? "text-yellow-600"
    : "text-red-600";

  return (
    <div className="space-y-3 p-1">
      {/* Trust Score */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-light flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Trust Score</span>
          </div>
          <div className="text-right">
            {trustPct !== null ? (
              <>
                <p className={cn("text-lg font-bold", trustColor)}>{trustPct}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {trustData?.ratingCount ?? 0} rating{(trustData?.ratingCount ?? 0) !== 1 ? "s" : ""}
                  {(trustData?.ratingCount ?? 0) > 0 && ` · ★ ${trustData?.averageStars.toFixed(1)}`}
                </p>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No ratings yet</span>
            )}
          </div>
        </div>
        {trustPct !== null && (
          <div className="mt-3">
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${trustPct}%`,
                  backgroundColor:
                    trustPct >= 80 ? "hsl(142 60% 45%)" : trustPct >= 50 ? "hsl(40 90% 50%)" : "hsl(0 70% 55%)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-teal-light flex items-center justify-center">
            <PersonStanding className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">My Status</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Current status</p>
            <p className={cn("text-sm font-semibold mt-0.5", localAvailable ? "text-primary" : "text-muted-foreground")}>
              {localAvailable ? "Available for walks" : "Offline"}
            </p>
          </div>
          <div
            className={cn(
              "w-4 h-4 rounded-full border-2",
              localAvailable ? "bg-primary border-primary animate-pulse" : "bg-secondary border-border"
            )}
          />
        </div>
        <button
          onClick={handleToggleAvailability}
          disabled={updateAvailabilityMutation.isPending}
          className={cn(
            "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
            localAvailable
              ? "bg-secondary text-foreground hover:bg-secondary/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {updateAvailabilityMutation.isPending
            ? "Updating..."
            : localAvailable
            ? "Go Offline"
            : "Go Available"}
        </button>
      </div>

      {/* Find Walking Partner */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-teal-light flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Find Walking Partner</span>
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-foreground">Search Radius</label>
            <span className="text-xs text-muted-foreground font-semibold">{radiusM}m</span>
          </div>
          <input
            type="range"
            min={100}
            max={1000}
            step={50}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>100m</span>
            <span>1km</span>
          </div>
        </div>
        <button
          onClick={handleRequestWalkers}
          disabled={requestWalkersMutation.isPending || !localAvailable}
          className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4" />
          {requestWalkersMutation.isPending ? "Searching..." : "Request Walkers Nearby"}
        </button>
        {!localAvailable && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Go available first to request walkers
          </p>
        )}
      </div>

      {/* Rate a Partner */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-orange-light flex items-center justify-center">
            <Star className="w-4 h-4 text-destructive" />
          </div>
          <span className="text-sm font-semibold text-foreground">Rate Walking Partner</span>
        </div>
        {ratingMatchId === null ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Enter a match ID to rate your walking partner after completing a walk.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Match ID"
                value={ratingMatchInput}
                onChange={(e) => setRatingMatchInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-secondary rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => {
                  const v = parseInt(ratingMatchInput);
                  if (!isNaN(v) && v > 0) setRatingMatchId(v);
                  else toast.error("Enter a valid match ID");
                }}
                className="px-3 py-2 bg-secondary text-foreground text-xs font-semibold rounded-xl hover:bg-secondary/80 transition-colors"
              >
                Rate
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRatingStars(s)}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "w-5 h-5",
                      s <= ratingStars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1">{ratingStars}/5</span>
            </div>
            <input
              type="text"
              placeholder="Optional comment..."
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              className="w-full px-3 py-2 bg-secondary rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  ratePartnerMutation.mutate({
                    matchId: ratingMatchId,
                    stars: ratingStars,
                    comment: ratingComment || undefined,
                  })
                }
                disabled={ratePartnerMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {ratePartnerMutation.isPending ? "Submitting..." : "Submit Rating"}
              </button>
              <button
                onClick={() => { setRatingMatchId(null); setRatingMatchInput(""); }}
                className="px-3 py-2 bg-secondary text-foreground text-xs font-semibold rounded-xl hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
