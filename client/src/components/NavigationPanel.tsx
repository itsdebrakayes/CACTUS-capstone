/**
 * NavigationPanel — Waze-style navigation overlay for the CACTUS map.
 *
 * Two modes:
 *   1. Live GPS  — uses the user's current location as the start point.
 *   2. Simulated — user picks a faculty hub as their start, types a destination,
 *                  and the marker animates along the route at walking pace.
 *
 * Styled with the Terraforma design system (Off-White, Stone, Deep Teal, Signal Orange).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Navigation,
  Search,
  X,
  MapPin,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  ArrowRight,
  Clock,
  Footprints,
  Building2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type CactusMapHandle } from "./CactusMap";

// ─── Faculty hubs ─────────────────────────────────────────────────────────────

export interface FacultyHub {
  id: string;
  name: string;
  shortName: string;
  faculty: string;
  lat: number;
  lng: number;
  description: string;
}

export const FACULTY_HUBS: FacultyHub[] = [
  { id: "fst-tasties", name: "Tasties Canteen (FST)", shortName: "Tasties", faculty: "FST", lat: 18.0042, lng: -76.7488, description: "Main canteen near FST block" },
  { id: "fst-eng-parking", name: "Engineering Parking Lot", shortName: "Eng. Parking", faculty: "FST", lat: 18.0038, lng: -76.7501, description: "Parking lot beside Engineering block" },
  { id: "fst-slt2", name: "SLT 2 Lecture Theatre", shortName: "SLT 2", faculty: "FST", lat: 18.0035, lng: -76.7497, description: "Science Lecture Theatre 2 — main campus hub" },
  { id: "fst-guild", name: "FST Guild Office", shortName: "FST Guild", faculty: "FST", lat: 18.0031, lng: -76.7493, description: "Faculty of Science & Technology Guild Office" },
  { id: "mona-main-gate", name: "Main Gate (Ring Road)", shortName: "Main Gate", faculty: "General", lat: 18.0028, lng: -76.7510, description: "Main entrance to UWI Mona campus" },
  { id: "mona-library", name: "Main Library", shortName: "Library", faculty: "General", lat: 18.0040, lng: -76.7505, description: "UWI Mona Main Library" },
  { id: "mona-guild", name: "Guild of Students", shortName: "Guild", faculty: "General", lat: 18.0033, lng: -76.7485, description: "Guild of Students building" },
  { id: "mona-chapel", name: "University Chapel", shortName: "Chapel", faculty: "General", lat: 18.0045, lng: -76.7500, description: "UWI Mona University Chapel" },
];

// ─── Known campus destinations for autocomplete ───────────────────────────────

const CAMPUS_DESTINATIONS = [
  { label: "SLT 1 — Science Lecture Theatre 1", lat: 18.0033, lng: -76.7495 },
  { label: "SLT 2 — Science Lecture Theatre 2", lat: 18.0035, lng: -76.7497 },
  { label: "FST Block A", lat: 18.0040, lng: -76.7490 },
  { label: "FST Block B", lat: 18.0038, lng: -76.7488 },
  { label: "Main Library", lat: 18.0040, lng: -76.7505 },
  { label: "Student Union", lat: 18.0030, lng: -76.7480 },
  { label: "Medical Sciences Block", lat: 18.0050, lng: -76.7510 },
  { label: "Mona Visitors Lodge", lat: 18.0025, lng: -76.7515 },
  { label: "Philip Sherlock Centre", lat: 18.0036, lng: -76.7482 },
  { label: "Rex Nettleford Hall", lat: 18.0028, lng: -76.7495 },
  { label: "Taylor Hall", lat: 18.0055, lng: -76.7488 },
  { label: "Irvine Hall", lat: 18.0058, lng: -76.7492 },
  { label: "Elsa Leo-Rhynie Hall", lat: 18.0052, lng: -76.7485 },
  { label: "Engineering Block", lat: 18.0037, lng: -76.7503 },
  { label: "Chemistry Department", lat: 18.0043, lng: -76.7493 },
  { label: "Physics Department", lat: 18.0041, lng: -76.7496 },
  { label: "Maths Department", lat: 18.0039, lng: -76.7491 },
  { label: "Computer Science Department", lat: 18.0036, lng: -76.7489 },
];

// ─── Simulated walk helpers ───────────────────────────────────────────────────

function interpolateRoute(coords: [number, number][], t: number): [number, number] {
  if (coords.length < 2) return coords[0];
  const lengths: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lengths[lengths.length - 1];
  const target = total * t;
  for (let i = 1; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const seg = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
      return [
        coords[i - 1][0] + seg * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + seg * (coords[i][1] - coords[i - 1][1]),
      ];
    }
  }
  return coords[coords.length - 1];
}

const WALK_SPEED_MS = 1.4;
const TICK_MS = 500;

// ─── Component ────────────────────────────────────────────────────────────────

type NavMode = "idle" | "live" | "simulated";
type SimStep = "hub" | "destination" | "navigating";

interface NavigationPanelProps {
  mapRef: React.RefObject<CactusMapHandle | null>;
  userLat?: number;
  userLng?: number;
  hasGps: boolean;
  onSimPosition?: (lat: number, lng: number) => void;
  onNavigationEnd?: () => void;
}

export default function NavigationPanel({
  mapRef,
  userLat,
  userLng,
  hasGps,
  onSimPosition,
  onNavigationEnd,
}: NavigationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>("idle");
  const [simStep, setSimStep] = useState<SimStep>("hub");

  const [destQuery, setDestQuery] = useState("");
  const [destSuggestions, setDestSuggestions] = useState<typeof CAMPUS_DESTINATIONS>([]);
  const [selectedDest, setSelectedDest] = useState<(typeof CAMPUS_DESTINATIONS)[0] | null>(null);

  const [selectedHub, setSelectedHub] = useState<FacultyHub | null>(null);
  const [hubFilter, setHubFilter] = useState<"All" | "FST" | "General">("All");

  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState(0);
  const [routeDistanceM, setRouteDistanceM] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [landmark, setLandmark] = useState<string | null>(null);

  const animFrameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simMarkerRef = useRef<any>(null);

  // Autocomplete
  useEffect(() => {
    if (destQuery.length < 2) { setDestSuggestions([]); return; }
    const q = destQuery.toLowerCase();
    setDestSuggestions(CAMPUS_DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q)).slice(0, 5));
  }, [destQuery]);

  // Fetch route from Mapbox Directions
  const fetchRoute = useCallback(
    async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
      try {
        const token = (window as any).MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN || "";
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&steps=true&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes?.[0];
        if (!route) return null;
        return { coords: route.geometry.coordinates as [number, number][], durationSec: Math.round(route.duration), distanceM: Math.round(route.distance) };
      } catch { return null; }
    }, []
  );

  const startLiveNav = useCallback(async () => {
    if (!selectedDest || !userLat || !userLng) return;
    const result = await fetchRoute(userLat, userLng, selectedDest.lat, selectedDest.lng);
    if (!result) return;
    setRouteCoords(result.coords);
    setRouteDurationSec(result.durationSec);
    setRouteDistanceM(result.distanceM);
    mapRef.current?.showRoute(userLat, userLng, selectedDest.lat, selectedDest.lng);
    mapRef.current?.flyTo(userLat, userLng, 17);
    setNavMode("live");
    setIsNavigating(true);
  }, [selectedDest, userLat, userLng, fetchRoute, mapRef]);

  const startSimNav = useCallback(async () => {
    if (!selectedDest || !selectedHub) return;
    const result = await fetchRoute(selectedHub.lat, selectedHub.lng, selectedDest.lat, selectedDest.lng);
    if (!result) return;
    setRouteCoords(result.coords);
    setRouteDurationSec(result.durationSec);
    setRouteDistanceM(result.distanceM);
    setElapsedSec(0);
    mapRef.current?.showRoute(selectedHub.lat, selectedHub.lng, selectedDest.lat, selectedDest.lng);
    mapRef.current?.flyTo(selectedHub.lat, selectedHub.lng, 17);
    setNavMode("simulated");
    setSimStep("navigating");
    setIsNavigating(true);
  }, [selectedDest, selectedHub, fetchRoute, mapRef]);

  // Animated walk tick
  useEffect(() => {
    if (!isNavigating || navMode !== "simulated" || !routeCoords || routeDurationSec === 0) return;
    const simDuration = Math.min(routeDurationSec, 180);

    animFrameRef.current = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + TICK_MS / 1000;
        const t = Math.min(next / simDuration, 1);
        const pos = interpolateRoute(routeCoords, t);
        onSimPosition?.(pos[1], pos[0]);

        const map = mapRef.current?.getMap();
        if (map) {
          if (!simMarkerRef.current) {
            const el = document.createElement("div");
            el.style.cssText = "width:18px;height:18px;border-radius:50%;background:hsl(185 100% 23%);border:3px solid white;";
            const mapboxgl = (window as any).mapboxgl;
            if (mapboxgl) {
              simMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(pos).addTo(map);
            }
          } else {
            simMarkerRef.current.setLngLat(pos);
          }
          map.panTo(pos, { duration: 400 });
        }

        if (t >= 0.25 && t < 0.26) setLandmark("Approaching mid-point");
        else if (t >= 0.5 && t < 0.51) setLandmark("Halfway there!");
        else if (t >= 0.75 && t < 0.76) setLandmark("Almost there — 25% remaining");
        else if (t < 0.25 || (t > 0.26 && t < 0.5) || (t > 0.51 && t < 0.75) || t > 0.76) {
          if (t < 0.25 || (t > 0.26 && t < 0.49)) setLandmark(null);
        }

        if (t >= 1) {
          clearInterval(animFrameRef.current!);
          setIsNavigating(false);
          setLandmark("You have arrived!");
          onNavigationEnd?.();
          return simDuration;
        }
        return next;
      });
    }, TICK_MS);

    return () => { if (animFrameRef.current) clearInterval(animFrameRef.current); };
  }, [isNavigating, navMode, routeCoords, routeDurationSec, onSimPosition, onNavigationEnd, mapRef]);

  const stopNavigation = useCallback(() => {
    if (animFrameRef.current) clearInterval(animFrameRef.current);
    simMarkerRef.current?.remove();
    simMarkerRef.current = null;
    mapRef.current?.clearRoute();
    setIsNavigating(false);
    setNavMode("idle");
    setSimStep("hub");
    setRouteCoords(null);
    setElapsedSec(0);
    setLandmark(null);
    setSelectedDest(null);
    setDestQuery("");
    setSelectedHub(null);
    onNavigationEnd?.();
  }, [mapRef, onNavigationEnd]);

  const progressPct = routeDurationSec > 0 ? Math.min((elapsedSec / Math.min(routeDurationSec, 180)) * 100, 100) : 0;
  const remainingSec = Math.max(0, Math.min(routeDurationSec, 180) - elapsedSec);
  const remainingMin = Math.ceil(remainingSec / 60);

  const filteredHubs = hubFilter === "All" ? FACULTY_HUBS : FACULTY_HUBS.filter((h) => h.faculty === hubFilter);

  // ── Collapsed search bar ──────────────────────────────────────────────────
  if (!expanded && navMode === "idle") {
    return (
      <div className="absolute top-4 left-4 right-4 z-20">
        <button
          onClick={() => setExpanded(true)}
          className="w-full bg-card/97 backdrop-blur-sm rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left border border-border hover:border-primary/30 transition-all"
        >
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground flex-1">Where would you like to go?</span>
          <Navigation className="w-4 h-4 text-primary shrink-0" />
        </button>
      </div>
    );
  }

  // ── Active navigation HUD ─────────────────────────────────────────────────
  if (isNavigating || navMode === "live") {
    return (
      <div className="absolute top-4 left-4 right-4 z-20 space-y-2">
        {/* Destination banner */}
        <div className="bg-foreground/95 backdrop-blur-sm rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary-foreground/50">Navigating to</p>
            <p className="text-sm font-bold text-primary-foreground truncate">{selectedDest?.label}</p>
          </div>
          <button
            onClick={stopNavigation}
            className="w-8 h-8 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive hover:bg-destructive/30 transition-colors"
          >
            <Square className="w-3.5 h-3.5" fill="currentColor" />
          </button>
        </div>

        {/* Progress bar */}
        {navMode === "simulated" && (
          <div className="bg-card/97 backdrop-blur-sm rounded-2xl border border-border px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Simulated Walk</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{remainingMin} min left</span>
              </div>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{selectedHub?.shortName}</span>
              <span className="text-[10px] text-muted-foreground">{routeDistanceM}m · {Math.ceil(routeDurationSec / 60)} min walk</span>
            </div>
          </div>
        )}

        {/* Landmark callout */}
        {landmark && (
          <div className="bg-primary rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-primary-foreground shrink-0" />
            <span className="text-sm font-semibold text-primary-foreground">{landmark}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Expanded navigation panel ─────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-10 bg-charcoal/20"
        onClick={() => setExpanded(false)}
      />

      {/* Panel */}
      <div
        className="absolute top-0 left-0 right-0 z-20 bg-card rounded-b-3xl border-b border-border"
        style={{ maxHeight: "80vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
          <button
            onClick={() => setExpanded(false)}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <h2 className="text-base font-bold text-foreground flex-1">Get Directions</h2>
          {navMode !== "idle" && (
            <button onClick={stopNavigation} className="text-xs text-destructive font-semibold">
              Cancel
            </button>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* GPS mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setNavMode(hasGps ? "live" : "simulated")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                hasGps
                  ? "bg-teal-light border-primary text-primary"
                  : "bg-secondary border-border text-muted-foreground"
              )}
            >
              <Navigation className="w-4 h-4" />
              {hasGps ? "Use My Location" : "GPS Unavailable"}
            </button>
            <button
              onClick={() => { setNavMode("simulated"); setSimStep("hub"); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                navMode === "simulated"
                  ? "bg-teal-light border-primary text-primary"
                  : "bg-secondary border-border text-muted-foreground"
              )}
            >
              <Footprints className="w-4 h-4" />
              Simulated Walk
            </button>
          </div>

          {/* GPS no-location warning */}
          {!hasGps && navMode !== "simulated" && (
            <div className="flex items-start gap-2 bg-orange-light border border-destructive/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-orange shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Live GPS is not available. Use <strong className="text-primary">Simulated Walk</strong> to navigate from a known campus hub.
              </p>
            </div>
          )}

          {/* Simulated: Hub picker */}
          {navMode === "simulated" && simStep === "hub" && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                Choose your starting hub
              </p>
              {/* Faculty filter */}
              <div className="flex gap-1.5 mb-3">
                {(["All", "FST", "General"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setHubFilter(f)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                      hubFilter === f
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-card border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {filteredHubs.map((hub) => (
                  <button
                    key={hub.id}
                    onClick={() => {
                      setSelectedHub(hub);
                      setSimStep("destination");
                      mapRef.current?.flyTo(hub.lat, hub.lng, 17);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                      selectedHub?.id === hub.id
                        ? "bg-teal-light border-primary"
                        : "bg-card border-border hover:border-primary/20"
                    )}
                  >
                    <div className="w-9 h-9 rounded-xl bg-teal-light flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">{hub.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{hub.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destination search */}
          {((navMode as string) === "live" || (navMode === "simulated" && simStep === "destination")) && (
            <div>
              {navMode === "simulated" && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setSimStep("hub")}
                    className="text-xs text-primary font-semibold flex items-center gap-1"
                  >
                    <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                    {selectedHub?.shortName}
                  </button>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">Choose destination</span>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={destQuery}
                  onChange={(e) => setDestQuery(e.target.value)}
                  placeholder="Search campus buildings, halls..."
                  className="w-full pl-9 pr-9 py-3 rounded-2xl border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:bg-card transition-colors"
                  autoFocus
                />
                {destQuery && (
                  <button
                    onClick={() => { setDestQuery(""); setSelectedDest(null); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Suggestions */}
              {destSuggestions.length > 0 && (
                <div className="mt-2 bg-card rounded-2xl border border-border overflow-hidden">
                  {destSuggestions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => {
                        setSelectedDest(s);
                        setDestQuery(s.label);
                        setDestSuggestions([]);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted border-b border-border last:border-0 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-sm text-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected destination */}
              {selectedDest && (
                <div className="mt-3 flex items-center gap-2 bg-teal-light border border-primary rounded-xl px-3 py-2">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-primary flex-1 truncate">
                    {selectedDest.label}
                  </span>
                  <button onClick={() => { setSelectedDest(null); setDestQuery(""); }}>
                    <X className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
              )}

              {/* Go button */}
              {selectedDest && (
                <button
                  onClick={(navMode as string) === "live" ? startLiveNav : startSimNav}
                  className="mt-3 w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                  {navMode === "simulated" ? "Start Simulated Walk" : "Start Navigation"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
