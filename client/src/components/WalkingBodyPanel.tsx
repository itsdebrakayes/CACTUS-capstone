import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Users, MapPin, Star, PersonStanding, CheckCircle2,
  XCircle, Navigation, Shield, Clock
} from "lucide-react";
import { toast } from "sonner";

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
  onRouteRequested,
}: WalkingBodyPanelProps) {
  const [radiusM, setRadiusM] = useState(300);
  const [localAvailable, setLocalAvailable] = useState(isAvailable);
  const [ratingMatchId, setRatingMatchId] = useState<number | null>(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  // Queries
  const { data: trustData, refetch: refetchTrust } = trpc.walking.getTrustScore.useQuery();

  // Mutations
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

  const respondToMatchMutation = trpc.walking.respondToMatch.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "accept" ? "Match accepted!" : "Match declined");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ratePartnerMutation = trpc.walking.ratePartner.useMutation({
    onSuccess: (data) => {
      toast.success(`Rating submitted! New trust score: ${(data.trustScore * 100).toFixed(0)}%`);
      setRatingMatchId(null);
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
    <div className="space-y-3">
      {/* Trust score card */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-semibold">Trust Score</span>
            </div>
            {trustData ? (
              <div className="text-right">
                <p className={`text-lg font-bold ${trustColor}`}>{trustPct}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {trustData.ratingCount} rating{trustData.ratingCount !== 1 ? "s" : ""}
                  {trustData.ratingCount > 0 && ` · ★ ${trustData.averageStars.toFixed(1)}`}
                </p>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No ratings yet</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Availability toggle */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <PersonStanding className="w-4 h-4" />
            Walking Availability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {localAvailable
                  ? "Others can request to walk with you"
                  : "Toggle on to be visible to others"}
              </p>
            </div>
            <Badge
              variant={localAvailable ? "default" : "secondary"}
              className="text-[10px]"
              style={localAvailable ? { background: "oklch(0.55 0.12 185)" } : {}}>
              {localAvailable ? "Available" : "Offline"}
            </Badge>
          </div>
          <Button
            className="w-full text-xs h-8"
            variant={localAvailable ? "destructive" : "default"}
            style={!localAvailable ? { background: "oklch(0.55 0.12 185)" } : {}}
            onClick={handleToggleAvailability}
            disabled={updateAvailabilityMutation.isPending}>
            {updateAvailabilityMutation.isPending
              ? "Updating..."
              : localAvailable
              ? "Go Offline"
              : "Go Available"}
          </Button>
        </CardContent>
      </Card>

      {/* Request walkers */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Find Walking Partner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium">Search Radius</label>
              <span className="text-xs text-muted-foreground">{radiusM}m</span>
            </div>
            <Slider
              value={[radiusM]}
              onValueChange={([v]) => setRadiusM(v)}
              min={100}
              max={1000}
              step={50}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>100m</span>
              <span>1km</span>
            </div>
          </div>
          <Button
            className="w-full text-xs h-8"
            style={{ background: "oklch(0.28 0.08 245)" }}
            onClick={handleRequestWalkers}
            disabled={requestWalkersMutation.isPending || !localAvailable}>
            {requestWalkersMutation.isPending ? "Searching..." : "Request Walkers Nearby"}
          </Button>
          {!localAvailable && (
            <p className="text-[10px] text-muted-foreground text-center">
              Go available first to request walkers
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rate a partner */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="w-4 h-4" />
            Rate Walking Partner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          {ratingMatchId === null ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Enter a match ID to rate your walking partner after completing a walk.
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Match ID"
                  className="text-xs h-8"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setRatingMatchId(v);
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  variant="outline"
                  onClick={() => {
                    if (ratingMatchId) setRatingMatchId(ratingMatchId);
                  }}>
                  Rate
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRatingStars(s)}
                    className="p-0.5 transition-transform hover:scale-110">
                    <Star
                      className={`w-5 h-5 ${s <= ratingStars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                    />
                  </button>
                ))}
                <span className="text-xs text-muted-foreground ml-1">{ratingStars}/5</span>
              </div>
              <Input
                placeholder="Optional comment..."
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                className="text-xs h-8"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  style={{ background: "oklch(0.55 0.12 185)" }}
                  onClick={() =>
                    ratePartnerMutation.mutate({
                      matchId: ratingMatchId,
                      stars: ratingStars,
                      comment: ratingComment || undefined,
                    })
                  }
                  disabled={ratePartnerMutation.isPending}>
                  {ratePartnerMutation.isPending ? "Submitting..." : "Submit Rating"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setRatingMatchId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
