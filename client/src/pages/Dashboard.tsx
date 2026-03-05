import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import { CactusMap, UWI_MONA_CENTER } from "@/components/CactusMap";
import type { CactusMapHandle, Hazard } from "@/components/CactusMap";
import { WalkingBodyPanel } from "@/components/WalkingBodyPanel";
import { ActionPanels } from "@/components/ActionPanels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MapPin, Radio, PersonStanding, BookOpen,
  AlertTriangle, Activity, LogOut, ChevronLeft, ChevronRight,
  Wifi, WifiOff, Navigation
} from "lucide-react";
import { toast } from "sonner";
import type { RealtimeEvent } from "@shared/types";

type PanelTab = "walking" | "actions" | "feed";

const EVENT_ICONS: Record<string, string> = {
  "walking.availability.updated": "🚶",
  "walking.request.created": "🔍",
  "walking.match.updated": "🤝",
  "trust.walking.updated": "⭐",
  "class.claim.created": "📢",
  "class.claim.voted": "🗳️",
  "class.claim.resolved": "✅",
  "class.rep.strike": "⚠️",
  "reports.created": "🚨",
  "reports.voted": "👍",
  "reports.ttl.tick": "⏱️",
  "reports.expired": "🗑️",
  "checkins.created": "📍",
  "checkins.completed": "✅",
  "checkins.failed": "🆘",
};

const EVENT_LABELS: Record<string, string> = {
  "walking.availability.updated": "Walker availability updated",
  "walking.request.created": "Walking request created",
  "walking.match.updated": "Walking match updated",
  "trust.walking.updated": "Trust score updated",
  "class.claim.created": "New class claim",
  "class.claim.voted": "Claim voted on",
  "class.claim.resolved": "Claim resolved",
  "class.rep.strike": "Class rep strike issued",
  "reports.created": "Hazard reported",
  "reports.voted": "Report voted on",
  "reports.ttl.tick": "Report TTL updated",
  "reports.expired": "Report expired",
  "checkins.created": "Check-in started",
  "checkins.completed": "Check-in completed",
  "checkins.failed": "Check-in FAILED",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const mapRef = useRef<CactusMapHandle>(null);

  // Location state — default to UWI Mona
  const [userLat, setUserLat] = useState<number>(UWI_MONA_CENTER[1]);
  const [userLng, setUserLng] = useState<number>(UWI_MONA_CENTER[0]);
  const [locationGranted, setLocationGranted] = useState(false);

  // UI state
  const [activePanel, setActivePanel] = useState<PanelTab>("walking");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isSelectingDest, setIsSelectingDest] = useState(false);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [events, setEvents] = useState<Array<{ event: RealtimeEvent; id: number }>>([]);
  const eventIdRef = useRef(0);

  // Data queries
  const { data: reports, refetch: refetchReports } = trpc.reports.getReports.useQuery({});
  const { data: footpaths } = trpc.footpaths.getFootpaths.useQuery();

  // Update availability mutation (for location push)
  const updateAvailabilityMutation = trpc.walking.updateAvailability.useMutation();

  // Geolocation tracking
  const handleLocationChange = useCallback(
    (lat: number, lng: number) => {
      setUserLat(lat);
      setUserLng(lng);
      setLocationGranted(true);
      updateAvailabilityMutation.mutate({ lat, lng, isAvailable: false });
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useGeolocation(handleLocationChange, 3000);

  // SSE event handler
  const handleSSEEvent = useCallback((event: RealtimeEvent) => {
    setSseConnected(true);
    setEvents((prev) => {
      const newEntry = { event, id: ++eventIdRef.current };
      return [newEntry, ...prev].slice(0, 50);
    });
    if (event.type === "reports.created" || event.type === "reports.voted" || event.type === "reports.expired") {
      refetchReports();
    }
    if (event.type === "checkins.failed") {
      toast.error("⚠️ Check-in FAILED — emergency contact notified!", { duration: 8000 });
    }
    if (event.type === "walking.match.updated" && (event.data as any)?.status === "accepted") {
      toast.success("🤝 A walker accepted your request!");
    }
  }, [refetchReports]);
  useSSE(handleSSEEvent);

  // Hazard markers from reports
  const hazardMarkers: Hazard[] = (reports || []).map((r) => ({
    id: r.id,
    lat: parseFloat(r.lat.toString()),
    lng: parseFloat(r.lng.toString()),
    severity: r.severity,
    reportType: r.reportType,
    description: (r as any).description || undefined,
    ttlMinutes: r.ttlMinutes,
    stillThereCount: (r as any).stillThereCount ?? 0,
    notThereCount: (r as any).notThereCount ?? 0,
  }));

  const handleDestinationSelected = useCallback((lat: number, lng: number) => {
    setDestLat(lat);
    setDestLng(lng);
    setIsSelectingDest(false);
    toast.success(`Destination set`);
    if (locationGranted) {
      mapRef.current?.showRoute(userLat, userLng, lat, lng);
    }
  }, [userLat, userLng, locationGranted]);

  const handleRequestDestSelect = useCallback(() => {
    setIsSelectingDest(true);
    setActivePanel("actions");
    toast.info("Click on the map to set your destination", { duration: 3000 });
  }, []);

  const handleFlyToUser = () => {
    if (locationGranted) {
      mapRef.current?.flyTo(userLat, userLng, 17);
    } else {
      mapRef.current?.flyTo(UWI_MONA_CENTER[1], UWI_MONA_CENTER[0], 15.5);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top navbar */}
      <header className="h-12 flex items-center justify-between px-4 shrink-0 z-10"
        style={{ background: "oklch(0.18 0.06 245)", color: "white" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: "oklch(0.55 0.12 185)" }}>C</div>
            <span className="font-semibold text-sm tracking-wide">CACTUS</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/20 text-white/60 hidden sm:inline">
            UWI Mona Campus
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            {sseConnected ? (
              <><Wifi className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.12 185)" }} />
              <span className="hidden sm:inline" style={{ color: "oklch(0.65 0.12 185)" }}>Live</span></>
            ) : (
              <><WifiOff className="w-3.5 h-3.5 opacity-40" />
              <span className="hidden sm:inline opacity-40">Connecting</span></>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <MapPin className={`w-3.5 h-3.5 ${locationGranted ? "" : "opacity-40"}`}
              style={locationGranted ? { color: "oklch(0.65 0.12 185)" } : {}} />
            <span className={`hidden sm:inline ${locationGranted ? "" : "opacity-40"}`}
              style={locationGranted ? { color: "oklch(0.65 0.12 185)" } : {}}>
              {locationGranted ? "GPS Active" : "No GPS"}
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-2 ml-1">
              <span className="text-xs opacity-70 hidden sm:inline">{user.name || user.email}</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 opacity-70 hover:opacity-100 hover:bg-white/10"
                style={{ color: "white" }} onClick={logout}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <CactusMap
            ref={mapRef}
            userLat={locationGranted ? userLat : undefined}
            userLng={locationGranted ? userLng : undefined}
            walkers={[]}
            hazards={hazardMarkers}
            footpaths={footpaths || []}
            isSelectingDest={isSelectingDest}
            onDestinationSelected={handleDestinationSelected}
            onHazardClick={(h) => toast.info(`${h.reportType}: Severity ${h.severity} — ${h.ttlMinutes}min TTL`)}
          />

          {/* Map overlay controls */}
          <div className="absolute bottom-6 left-4 flex flex-col gap-2 z-10">
            <Button size="sm"
              className="h-8 px-3 text-xs bg-white text-gray-800 hover:bg-gray-100 shadow-md border"
              onClick={handleFlyToUser}>
              <Navigation className="w-3.5 h-3.5 mr-1.5" />
              {locationGranted ? "My Location" : "UWI Mona"}
            </Button>
            {isSelectingDest && (
              <Button size="sm" variant="destructive" className="h-8 px-3 text-xs shadow-md"
                onClick={() => setIsSelectingDest(false)}>
                Cancel
              </Button>
            )}
          </div>

          {/* Stats overlay */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm border flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-orange-500" />
              {hazardMarkers.length} hazard{hazardMarkers.length !== 1 ? "s" : ""}
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm border flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-teal-600" />
              {events.length} events
            </div>
          </div>
        </div>

        {/* Collapsible side panel */}
        <div className={`flex flex-col bg-background border-l transition-all duration-300 ${panelCollapsed ? "w-10" : "w-80"} shrink-0`}>
          <button
            className="h-10 flex items-center justify-center border-b hover:bg-muted/50 transition-colors shrink-0"
            onClick={() => setPanelCollapsed(!panelCollapsed)}>
            {panelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {!panelCollapsed && (
            <>
              {/* Panel tabs */}
              <div className="flex border-b shrink-0">
                {(["walking", "actions", "feed"] as PanelTab[]).map((tab) => {
                  const icons = { walking: PersonStanding, actions: BookOpen, feed: Radio };
                  const labels = { walking: "Walk", actions: "Actions", feed: "Feed" };
                  const Icon = icons[tab];
                  return (
                    <button key={tab}
                      className={`flex-1 h-9 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                        activePanel === tab
                          ? "border-b-2 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                      style={activePanel === tab ? { borderColor: "oklch(0.55 0.12 185)", color: "oklch(0.28 0.08 245)" } : {}}
                      onClick={() => setActivePanel(tab)}>
                      <Icon className="w-3.5 h-3.5" />
                      {labels[tab]}
                      {tab === "feed" && events.length > 0 && (
                        <span className="ml-0.5 text-white text-[9px] rounded-full px-1 min-w-[16px] text-center"
                          style={{ background: "oklch(0.55 0.12 185)" }}>
                          {Math.min(events.length, 99)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Panel content */}
              <ScrollArea className="flex-1 panel-scroll">
                <div className="p-3">
                  {activePanel === "walking" && (
                    <WalkingBodyPanel
                      userLat={userLat}
                      userLng={userLng}
                      onRouteRequested={(fromLat: number, fromLng: number, toLat: number, toLng: number) => {
                        mapRef.current?.showRoute(fromLat, fromLng, toLat, toLng);
                      }}
                    />
                  )}
                  {activePanel === "actions" && (
                    <ActionPanels
                      userLat={userLat}
                      userLng={userLng}
                      destLat={destLat}
                      destLng={destLng}
                      onRequestDestSelect={handleRequestDestSelect}
                      onCheckinCreated={(id) => toast.success(`Check-in #${id} started`)}
                    />
                  )}
                  {activePanel === "feed" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">Live Events</p>
                        <div className={`flex items-center gap-1 text-[10px] ${sseConnected ? "text-teal-600" : "text-muted-foreground"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${sseConnected ? "bg-teal-500 animate-pulse" : "bg-muted-foreground"}`} />
                          {sseConnected ? "Connected" : "Connecting..."}
                        </div>
                      </div>
                      {events.length === 0 ? (
                        <div className="text-center py-8">
                          <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Waiting for events...</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            Events appear here in real-time as users interact.
                          </p>
                        </div>
                      ) : (
                        events.map(({ event, id }) => (
                          <div key={id} className="event-entry flex gap-2 p-2 rounded-lg bg-muted/40 text-xs">
                            <span className="text-base leading-none shrink-0">{EVENT_ICONS[event.type] || "📡"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{EVENT_LABELS[event.type] || event.type}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
