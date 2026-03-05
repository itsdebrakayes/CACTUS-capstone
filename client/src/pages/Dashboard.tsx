import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, AlertCircle, Users, CheckCircle2, LogOut } from "lucide-react";
import { WalkingBodyPanel } from "@/components/WalkingBodyPanel";
import { ActionPanels } from "@/components/ActionPanels";
import type { RealtimeEvent } from "@shared/types";

/**
 * Main dashboard with split-pane layout
 * Left: Mapbox map (70%)
 * Right: Live feed and action panels (30%)
 */
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // SSE event handler
  const handleSSEEvent = useCallback((event: RealtimeEvent) => {
    setEvents((prev) => [event, ...prev.slice(0, 49)]); // Keep last 50 events
  }, []);

  // Geolocation handler
  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setLocation({ lat, lng });
  }, []);

  // Connect to SSE
  useSSE(handleSSEEvent);

  // Watch geolocation
  useGeolocation(handleLocationChange, 3000);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">CACTUS</h1>
          <span className="text-sm text-muted-foreground">Campus Safety</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Map area (70%) */}
        <div className="flex-[7] bg-muted border-r flex flex-col">
          <div className="flex-1 relative bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
            {/* Map placeholder - will be replaced with actual Mapbox */}
            <div className="text-center">
              <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Map will load here</p>
              {location && (
                <p className="text-xs text-muted-foreground mt-2">
                  Current location: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Panels (30%) */}
        <div className="flex-[3] bg-background flex flex-col overflow-hidden">
          {/* Status bar */}
          <div className="border-b p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Status</h2>
              <Badge variant={isAvailable ? "default" : "secondary"}>
                {isAvailable ? "Available" : "Unavailable"}
              </Badge>
            </div>
            <Button
              variant={isAvailable ? "destructive" : "default"}
              className="w-full"
              onClick={() => setIsAvailable(!isAvailable)}
            >
              {isAvailable ? "Stop Walking" : "Start Walking"}
            </Button>
          </div>

          {/* Tabs for different panels */}
          <Tabs defaultValue="feed" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full rounded-none border-b bg-muted">
              <TabsTrigger value="feed" className="flex-1">
                Live Feed
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex-1">
                Actions
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex-1">
                Stats
              </TabsTrigger>
            </TabsList>

            {/* Live Feed Tab */}
            <TabsContent value="feed" className="flex-1 overflow-y-auto p-4">
              {events.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No events yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((event, idx) => (
                    <Card key={idx} className="text-sm">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="mt-0.5">
                            {event.type.split(".")[0]}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-xs text-muted-foreground">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </p>
                            <p className="text-xs break-words">{event.type}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="flex-1 overflow-y-auto p-4">
              {location && (
                <>
                  <WalkingBodyPanel
                    userLat={location.lat}
                    userLng={location.lng}
                    isAvailable={isAvailable}
                    onAvailabilityChange={setIsAvailable}
                  />
                  <ActionPanels userLat={location.lat} userLng={location.lng} />
                </>
              )}
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Trust Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">0.85</p>
                    <p className="text-xs text-muted-foreground">Based on 5 ratings</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Active Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{events.length}</p>
                    <p className="text-xs text-muted-foreground">Recent realtime updates</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Location</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {location ? (
                      <>
                        <p className="text-sm font-mono">
                          {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        </p>
                        <p className="text-xs text-muted-foreground">Updated just now</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Waiting for location...</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
