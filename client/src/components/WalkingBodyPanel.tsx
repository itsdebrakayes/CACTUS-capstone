import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, MapPin, Star } from "lucide-react";
import { toast } from "sonner";

interface WalkingBodyPanelProps {
  userLat: number;
  userLng: number;
  isAvailable: boolean;
  onAvailabilityChange: (available: boolean) => void;
}

/**
 * Walking Body panel for requesting/accepting walking partners
 */
export function WalkingBodyPanel({ userLat, userLng, isAvailable, onAvailabilityChange }: WalkingBodyPanelProps) {
  const [radiusM, setRadiusM] = useState(300);
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);

  // Mutations
  const setAvailableMutation = trpc.walking.updateAvailability.useMutation({
    onSuccess: () => {
      onAvailabilityChange(true);
      toast.success("You're now available for walking");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const requestWalkersMutation = trpc.walking.requestWalkers.useMutation({
    onSuccess: () => {
      toast.success("Walking request created!");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const acceptMatchMutation = trpc.walking.respondToMatch.useMutation({
    onSuccess: () => {
      toast.success("Match updated!");
      setSelectedMatch(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSetAvailable = async () => {
    await setAvailableMutation.mutateAsync({
      lat: userLat,
      lng: userLng,
      isAvailable: true,
    });
  };

  const handleRequestWalkers = async () => {
    await requestWalkersMutation.mutateAsync({
      radiusM,
    });
  };

  const handleAcceptMatch = async (matchId: number) => {
    await acceptMatchMutation.mutateAsync({ matchId, action: "accept" });
  };

  return (
    <div className="space-y-3">
      {!isAvailable ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Make Yourself Available
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Become available so others can request to walk with you
            </p>
            <Button
              className="w-full text-xs"
              onClick={handleSetAvailable}
              disabled={setAvailableMutation.isPending}
            >
              {setAvailableMutation.isPending ? "Setting..." : "Set Available"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Request Walking Partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium">Search Radius (meters)</label>
              <Input
                type="number"
                value={radiusM}
                onChange={(e) => setRadiusM(parseInt(e.target.value))}
                className="mt-1 text-xs"
                min="50"
                max="1000"
              />
            </div>
            <Button
              className="w-full text-xs"
              onClick={handleRequestWalkers}
              disabled={requestWalkersMutation.isPending}
            >
              {requestWalkersMutation.isPending ? "Searching..." : "Find Walkers"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending matches */}
      {selectedMatch && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Match Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Walker nearby</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs">4.5/5.0</span>
                </div>
              </div>
              <Badge>New</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="flex-1 text-xs"
                onClick={() => handleAcceptMatch(selectedMatch)}
                disabled={acceptMatchMutation.isPending}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setSelectedMatch(null)}
              >
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
