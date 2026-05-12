import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { CactusMap, type CactusMapHandle, type Hazard } from "@/components/CactusMap";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import {
<<<<<<< HEAD
  CactusMap,
  UWI_MONA_CENTER,
  type CactusMapHandle,
  type Hazard,
  type WalkGroupMapMarker,
} from "@/components/CactusMap";
import WalkGroupPreviewCard from "@/components/WalkGroupPreviewCard";
import {
  type Coord2,
  DEFAULT_MAP_PLACE_FILTER_KEYS,
  getCachedCampusPlaceData,
  getCategoryMeta,
  loadCampusPlaceData,
  MAP_PLACE_FILTERS,
  type MapPlaceFilterKey,
  normalizeSearchText,
  type PlaceLocation,
} from "@/lib/campusPlaces";
import {
  findNearestCampusPathSnap,
  getCampusNodeComponentId,
  listCampusComponentNodes,
  planCampusRouteBetweenNodes,
  type CampusDataset,
} from "@/lib/findWayGeo";
import {
  createRouteFeatureCollection,
  haversineMeters,
  mergeRouteCoordinates,
} from "@/lib/fstRouting";
import {
  createSupabaseHazard,
  loadSupabaseHazards,
  type HazardRecord,
} from "@/lib/supabaseHazards";
import {
  joinWalkGroup,
  loadActiveWalkGroups,
  loadMyActiveWalkGroup,
  type WalkGroupRecord,
} from "@/lib/supabaseWalkGroups";
import MapHazardReportSheet, {
  type HazardReportOption,
} from "@/components/MapHazardReportSheet";
import MapFilterSheet from "@/components/MapFilterSheet";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Construction,
  Droplets,
  Eye,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
  Zap,
  type LucideIcon,
=======
  AlertTriangle, Users, Shield, Navigation, X, ChevronRight,
  ThumbsUp, ThumbsDown, MapPin, Clock, CheckCircle, Zap,
  Droplets, Eye, Construction, Footprints, Flame, Wind,
  PersonStanding, Route, Accessibility, TreePine, Star,
  ChevronDown, Search,
>>>>>>> 76de4ef14f4ffe7fad8691668ad290bc4c1b8308
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import NavigationPanel from "@/components/NavigationPanel";

// ─── Hazard categories ────────────────────────────────────────────────────────
const HAZARD_CATEGORIES = [
  { type: "light_out", label: "Broken Light", icon: Zap, color: "hsl(40 90% 55%)", bg: "hsl(40 90% 92%)", severity: 4, description: "Street or path light not working" },
  { type: "flooding", label: "Flooding", icon: Droplets, color: "hsl(185 60% 40%)", bg: "hsl(185 40% 92%)", severity: 4, description: "Water on path / flooded area" },
  { type: "broken_path", label: "Broken Path", icon: Footprints, color: "hsl(18 100% 50%)", bg: "hsl(18 100% 95%)", severity: 3, description: "Damaged or unsafe walkway" },
  { type: "suspicious", label: "Suspicious Activity", icon: Eye, color: "hsl(0 0% 40%)", bg: "hsl(47 19% 90%)", severity: 4, description: "Suspicious person or behaviour" },
  { type: "obstruction", label: "Obstruction", icon: Construction, color: "hsl(18 80% 55%)", bg: "hsl(18 80% 93%)", severity: 2, description: "Path blocked or under work" },
  { type: "violent_incident", label: "Violent Incident", icon: Flame, color: "hsl(0 70% 45%)", bg: "hsl(0 70% 93%)", severity: 5, description: "Fight, assault, or threat" },
  { type: "slippery", label: "Slippery Surface", icon: Wind, color: "hsl(185 100% 23%)", bg: "hsl(185 40% 92%)", severity: 3, description: "Wet or slippery path surface" },
  { type: "poor_visibility", label: "Poor Visibility", icon: PersonStanding, color: "hsl(0 0% 40%)", bg: "hsl(47 19% 90%)", severity: 3, description: "Dark or obscured area" },
] as const;

type HazardType = (typeof HAZARD_CATEGORIES)[number]["type"];

const DEMO_HAZARDS: Hazard[] = [
  { id: 1, reportType: "light_out", lat: 18.0042, lng: -76.7485, severity: 4, ttlMinutes: 45, description: "Lamp post near Engineering broken" },
  { id: 2, reportType: "flooding", lat: 18.0028, lng: -76.7510, severity: 3, ttlMinutes: 30, description: "Water pooling after rain near Chapel" },
  { id: 3, reportType: "broken_path", lat: 18.0055, lng: -76.7475, severity: 3, ttlMinutes: 60, description: "Cracked pavement near Mona Bowl" },
  { id: 4, reportType: "suspicious", lat: 18.0035, lng: -76.7500, severity: 4, ttlMinutes: 20, description: "Suspicious individual near car park" },
  { id: 5, reportType: "obstruction", lat: 18.0020, lng: -76.7490, severity: 2, ttlMinutes: 90, description: "Construction materials blocking path" },
];

const DEMO_WALKERS = [
  { id: 101, lat: 18.0038, lng: -76.7492, trustScore: 0.85, faculty: "FST", reviews: ["Friendly, great pace", "Reliable walking partner"] },
  { id: 102, lat: 18.0031, lng: -76.7505, trustScore: 0.72, faculty: "FMS", reviews: ["On time", "Good conversation"] },
  { id: 103, lat: 18.0048, lng: -76.7480, trustScore: 0.91, faculty: "FST", reviews: ["Very trustworthy", "Always available"] },
  { id: 104, lat: 18.0025, lng: -76.7515, trustScore: 0.60, faculty: "FHE", reviews: ["Okay", "Sometimes late"] },
];

const ROUTE_OPTIONS = [
  { id: "fastest", label: "Fastest Route", icon: Route, desc: "5 min · 350m", detail: "Via Engineering Parking", active: true },
  { id: "accessible", label: "Accessible Route", icon: Accessibility, desc: "8 min · 420m", detail: "Ramp-friendly, no stairs", active: false },
  { id: "scenic", label: "Scenic Route", icon: TreePine, desc: "12 min · 600m", detail: "Through Botanical Gardens", active: false },
  { id: "safest", label: "Safest Route", icon: Shield, desc: "7 min · 380m", detail: "Well-lit, CCTV coverage", active: false },
];

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "hsl(185 60% 40%)" },
  2: { label: "Minor", color: "hsl(185 100% 23%)" },
  3: { label: "Moderate", color: "hsl(40 90% 55%)" },
  4: { label: "High", color: "hsl(18 100% 50%)" },
  5: { label: "Critical", color: "hsl(0 70% 45%)" },
};

// ─── Route panel (left side on desktop, bottom sheet on mobile) ───────────────

function RoutePanel({
  activeRoute,
  onSelectRoute,
  onFindPartner,
  showWalkers,
}: {
  activeRoute: string;
  onSelectRoute: (id: string) => void;
  onFindPartner: () => void;
  showWalkers: boolean;
}) {
  const [destQuery, setDestQuery] = useState("SLT 2 — Science Lecture Theatre 2");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-base font-bold text-foreground mb-3">Find Your Way</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-xl">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground flex-1">My Location (GPS)</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-xl">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <input
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              className="text-xs text-foreground bg-transparent flex-1 focus:outline-none"
              placeholder="Where to?"
            />
          </div>
        </div>
<<<<<<< HEAD

        {mode === "navigating" ? (
          <div className="px-5 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3.5 shadow-sm">
                <Search className="mr-3 h-5 w-5 shrink-0 text-blue-500" />
                <input
                  value={selectedPlace?.name ?? searchQuery}
                  readOnly
                  className="w-full bg-transparent text-sm font-bold tracking-tight text-gray-900 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={onCancelNavigation}
                className="flex shrink-0 items-center justify-center rounded-2xl bg-red-50 px-5 py-3.5 text-sm font-bold text-red-600 transition hover:bg-red-100 active:scale-95"
              >
                End
              </button>
            </div>
          </div>
        ) : mode === "routeSelection" && selectedPlace ? (
          <div className="flex flex-1 flex-col px-5 pb-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  Route Selection
                </p>
                <h3 className="mt-1.5 text-xl font-bold tracking-tight text-gray-900">
                  Choose Your Route
                </h3>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  Routing stops at the nearest outdoor access point.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackToSearch}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200 active:scale-95"
                aria-label="Back to search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex items-center gap-3.5">
                <div className="rounded-xl bg-blue-600 p-2.5 text-white shadow-sm shadow-blue-500/20">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold tracking-tight text-gray-900">
                    {selectedPlace.name}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-blue-600">
                    {getCategoryMeta(selectedPlace.category).label}
                    {selectedPlaceDistanceLabel
                      ? ` · ${selectedPlaceDistanceLabel} away`
                      : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="grid grid-cols-3 gap-3">
                {(["quick", "shortcut", "scenic"] as MapRouteType[]).map(
                  nextType => {
                    const meta = ROUTE_TYPE_META[nextType];
                    const isSelected = routeType === nextType;
                    return (
                      <button
                        key={nextType}
                        type="button"
                        disabled={meta.disabled}
                        onClick={() => {
                          if (!meta.disabled) {
                            onRouteTypeChange(nextType);
                          }
                        }}
                        className={`relative rounded-2xl p-4 text-center transition-all active:scale-95 ${
                          isSelected
                            ? "bg-blue-600 shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2"
                            : meta.disabled
                              ? "cursor-not-allowed border border-gray-100 bg-gray-50/50 opacity-60"
                              : "border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                      >
                        <span
                          className={`block text-sm font-bold tracking-tight ${
                            isSelected ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {meta.label}
                        </span>
                        <span
                          className={`mt-1 block text-[10px] font-medium leading-tight ${
                            isSelected ? "text-blue-100" : "text-gray-500"
                          }`}
                        >
                          {meta.subtitle}
                        </span>
                        {meta.disabled ? (
                          <span
                            className={`absolute right-2 top-2 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-gray-200 text-gray-500"
                            }`}
                          >
                            Soon
                          </span>
                        ) : null}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="mt-auto flex gap-3 pb-[88px]">
              <button
                type="button"
                onClick={onStartNavigation}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-bold tracking-wide text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 active:scale-[0.98]"
              >
                {isPlanningRoute ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Navigation className="h-5 w-5 fill-current" />
                    Start Navigation
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <div className="relative mb-6">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                value={searchQuery}
                onFocus={onSearchFocus}
                onChange={event => onSearchQueryChange(event.target.value)}
                placeholder="Search classrooms, labs, faculty..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-10 text-sm font-semibold tracking-tight text-gray-900 outline-none transition-all placeholder:text-gray-400 placeholder:font-medium focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 shadow-sm"
              />
              {searchQuery ? (
                <button
                  onClick={onClearSearch}
                  className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {normalizedQuery && visiblePlaces.length === 0 ? (
              <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center">
                <p className="text-sm font-bold text-gray-900">
                  No places matched "{searchQuery}".
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  Try a building name, room code, or broader keyword.
                </p>
              </div>
            ) : null}

            <div className="pb-24">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  {normalizedQuery ? "Results" : "Recent Searches"}
                </p>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {visiblePlaces.length} shown
                </span>
              </div>
              
              <div className="space-y-2">
                {visiblePlaces.length > 0 ? (
                  visiblePlaces.map(place => {
                    const meta = getCategoryMeta(place.category);
                    const Icon = meta.icon;
                    const isSelected = searchQuery === place.name;
                    return (
                      <button
                        key={place.id}
                        onClick={() => onChooseResult(place)}
                        className={`w-full rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                          isSelected
                            ? "border-blue-200 bg-blue-50 shadow-sm"
                            : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
                            style={{
                              backgroundColor: isSelected ? "#dbeafe" : "#f1f5f9",
                            }}
                          >
                            <Icon
                              className="h-5 w-5"
                              style={{
                                color: isSelected ? "#2563eb" : meta.color,
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-sm font-bold tracking-tight ${
                                isSelected ? "text-blue-700" : "text-gray-900"
                              }`}
                            >
                              {place.name}
                            </p>
                            <p
                              className={`mt-0.5 text-xs font-semibold ${
                                isSelected ? "text-blue-500" : "text-gray-400"
                              }`}
                            >
                              {meta.label}
                            </p>
                          </div>
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? "text-blue-500" : "text-gray-300"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center text-sm font-medium text-gray-500">
                    Search for a classroom, hall, food spot, ATM, or study area to start.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
=======
>>>>>>> 76de4ef14f4ffe7fad8691668ad290bc4c1b8308
      </div>

      {/* Route options */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Route Options
        </p>
        {ROUTE_OPTIONS.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRoute;
          return (
            <button
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              className={cn(
                "w-full text-left p-3 rounded-xl border-2 transition-all",
                isActive
                  ? "border-primary bg-teal-light"
                  : "border-transparent bg-card hover:bg-secondary"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{route.label}</p>
                  <p className="text-xs text-muted-foreground">{route.desc}</p>
                </div>
                {isActive && (
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    SELECTED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 ml-12">{route.detail}</p>
            </button>
          );
        })}

        {/* Delivery/order info style card */}
        <div className="mt-4 p-3 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Route Details</span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-light text-primary">
              WALKING
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Distance</p>
              <p className="text-sm font-bold text-foreground">350m</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Duration</p>
              <p className="text-sm font-bold text-foreground">5 min</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Elevation</p>
              <p className="text-sm font-bold text-foreground">+2m</p>
            </div>
          </div>
        </div>

        {/* Walking partner button */}
        <button
          onClick={onFindPartner}
          className="w-full mt-3 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Users className="w-4 h-4" />
          Find Walking Partner
        </button>
      </div>

      {/* Caution report */}
      <div className="p-4 border-t border-border">
        <button className="w-full py-2.5 bg-orange-light text-orange rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-orange/30 hover:bg-orange/10 transition-colors">
          <AlertTriangle className="w-4 h-4" />
          Report Caution
        </button>
      </div>
    </div>
  );
}

// ─── Walking Partners Panel ──────────────────────────────────────────────────

function WalkingPartnersPanel({ walkers, onClose }: { walkers: typeof DEMO_WALKERS; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">Walking Partners</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-muted-foreground mb-2">
          {walkers.length} students available near you
        </p>
        {walkers.map((w, i) => (
          <div key={w.id} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Student #{i + 123}</p>
                <p className="text-xs text-muted-foreground">{w.faculty} · Trust: {Math.round(w.trustScore * 100)}%</p>
              </div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, j) => (
                  <Star
                    key={j}
                    className={cn("w-3 h-3", j < Math.round(w.trustScore * 5) ? "text-orange fill-orange" : "text-border")}
                  />
                ))}
              </div>
            </div>
            {/* Recent reviews */}
            <div className="space-y-1 ml-13">
              {w.reviews.map((review, j) => (
                <p key={j} className="text-[10px] text-muted-foreground italic">"{review}"</p>
              ))}
            </div>
            <button className="w-full mt-2 py-2 bg-teal-light text-primary rounded-lg text-xs font-semibold hover:bg-primary/15 transition-colors">
              Request Walk
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main MapPage ─────────────────────────────────────────────────────────────

export default function MapPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [activeRoute, setActiveRoute] = useState("fastest");
  const [showWalkers, setShowWalkers] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"none" | "report" | "hazard">("none");
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
<<<<<<< HEAD
  const [viewportHeight, setViewportHeight] = useState(800);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [routeType, setRouteType] = useState<MapRouteType>("quick");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<MapPlaceFilterKey[]>(
    () => [...DEFAULT_MAP_PLACE_FILTER_KEYS]
  );
  const [selectedWalkGroupId, setSelectedWalkGroupId] = useState<string | null>(
    null
  );
  const [activeRoute, setActiveRoute] = useState<ActiveMapRoute | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<HazardRecord | null>(
    null
  );
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [isJoiningWalkGroup, setIsJoiningWalkGroup] = useState(false);
  const [activeSnap, setActiveSnap] = useState<SheetSnap>("collapsed");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
=======
  const [hazards, setHazards] = useState<Hazard[]>(DEMO_HAZARDS);
  const mapRef = useRef<CactusMapHandle>(null);
  const hasGps = userLat !== undefined && userLng !== undefined;
>>>>>>> 76de4ef14f4ffe7fad8691668ad290bc4c1b8308

  // Mobile panel state
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const createReportMutation = trpc.reports.createReport.useMutation({
    onSuccess: () => { toast.success("Hazard reported!"); setActiveSheet("none"); },
    onError: (err: any) => toast.error(err.message),
  });

  const voteReportMutation = trpc.reports.voteReport.useMutation({
    onSuccess: (data: any) => { toast.success(data.newTTL > 0 ? "Thanks!" : "Resolved."); setActiveSheet("none"); setSelectedHazard(null); },
    onError: (err: any) => toast.error(err.message),
  });

  useSSE((event) => {
    if (event.type === "reports.created") {
      const d = event.data as any;
      setHazards((prev) => [...prev, { id: d.reportId, reportType: d.reportType, lat: d.lat, lng: d.lng, severity: d.severity, ttlMinutes: d.severity >= 4 ? 60 : 30 }]);
    }
  });

  useGeolocation((lat, lng) => { setUserLat(lat); setUserLng(lng); }, 3000);

  const handleHazardClick = useCallback((hazard: Hazard) => { setSelectedHazard(hazard); setActiveSheet("hazard"); }, []);
  const activeHazardCount = hazards.filter((h) => (h.ttlMinutes ?? 0) > 0).length;

<<<<<<< HEAD
    loadPlaces();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    let isCancelled = false;

    async function refreshWalkGroups() {
      try {
        const [nextGroups, nextMyGroup] = await Promise.all([
          loadActiveWalkGroups(),
          loadMyActiveWalkGroup().catch(() => null),
        ]);

        if (isCancelled) {
          return;
        }

        walkGroupLoadErrorShownRef.current = false;
        setActiveWalkGroups(nextGroups);
        setMyActiveWalkGroup(nextMyGroup);
        setSelectedWalkGroupId(current => {
          if (!current) {
            return current;
          }
          const stillVisible = nextGroups.some(group => group.id === current);
          const stillMine = nextMyGroup?.id === current;
          return stillVisible || stillMine ? current : null;
        });
      } catch (error) {
        console.error(error);
        if (!isCancelled && !walkGroupLoadErrorShownRef.current) {
          walkGroupLoadErrorShownRef.current = true;
          toast.error("Unable to load active walk groups.");
        }
      }
    }

    void refreshWalkGroups();
    const interval = window.setInterval(
      refreshWalkGroups,
      WALK_GROUP_REFRESH_MS
    );

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [loading, user]);

  useEffect(() => {
    const stored = readRecentSearches();
    setRecentIds(stored);
  }, []);

  useEffect(() => {
    setViewportHeight(window.innerHeight);
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      position => {
        setUserLat(position.coords.latitude);
        setUserLng(position.coords.longitude);
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 12000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function refreshHazards() {
      try {
        const rows = await loadSupabaseHazards();
        if (!isCancelled) {
          hazardLoadErrorShownRef.current = false;
          setHazards(rows);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled && !hazardLoadErrorShownRef.current) {
          hazardLoadErrorShownRef.current = true;
          toast.error("Unable to load hazard reports.");
        }
      }
    }

    refreshHazards();
    const interval = window.setInterval(refreshHazards, HAZARD_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const placesById = useMemo(
    () => new Map(campusPlaces.map(place => [place.id, place])),
    [campusPlaces]
  );

  const sheetMetrics = useMemo(() => {
    const frameHeight = viewportHeight - TAB_BAR_HEIGHT;
    const collapsedVisible = 104;
    const midVisible = Math.round(frameHeight * 0.45);
    const fullVisible = Math.round(frameHeight * 0.9);
    const sheetHeight = fullVisible;
    return {
      sheetHeight,
      snaps: {
        collapsed: Math.max(0, sheetHeight - collapsedVisible),
        mid: Math.max(0, sheetHeight - midVisible),
        full: 0,
      },
    };
  }, [viewportHeight]);

  const normalizedQuery = normalizeSearchText(searchQuery);

  const filteredPlaces = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return campusPlaces
      .filter(place => {
        const haystack = normalizeSearchText(
          `${place.name} ${place.category} ${place.nearestNodeName}`
        );
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [campusPlaces, normalizedQuery]);

  const recentPlaces = useMemo(
    () =>
      recentIds
        .map(id => placesById.get(id))
        .filter((place): place is PlaceLocation => Boolean(place))
        .slice(0, 6),
    [placesById, recentIds]
  );

  const selectedPlace = useMemo(
    () => (selectedPlaceId ? (placesById.get(selectedPlaceId) ?? null) : null),
    [placesById, selectedPlaceId]
  );

  const selectedWalkGroup = useMemo(() => {
    if (!selectedWalkGroupId) {
      return null;
    }
    return (
      activeWalkGroups.find(group => group.id === selectedWalkGroupId) ??
      (myActiveWalkGroup?.id === selectedWalkGroupId ? myActiveWalkGroup : null)
    );
  }, [activeWalkGroups, myActiveWalkGroup, selectedWalkGroupId]);

  const selectedPlaceDistanceLabel = useMemo(() => {
    if (!selectedPlace) {
      return null;
    }
    if (userLat == null || userLng == null) {
      return formatMetersLabel(selectedPlace.nearestNodeDistanceM);
    }
    return formatMetersLabel(
      haversineMeters([userLng, userLat], selectedPlace.coordinates)
    );
  }, [selectedPlace, userLat, userLng]);

  const sheetMode: SearchSheetMode = activeRoute
    ? "navigating"
    : selectedPlace
      ? "routeSelection"
      : "search";

  const visibleHazards = useMemo<Hazard[]>(
    () =>
      hazards.map(hazard => ({
        id: hazard.id,
        reportType: hazard.reportType,
        lat: hazard.lat,
        lng: hazard.lng,
        severity: hazard.severity,
        description: hazard.description,
      })),
    [hazards]
  );

  const activeHazardCount = visibleHazards.length;

  const visibleWalkGroups = useMemo<WalkGroupMapMarker[]>(
    () =>
      activeWalkGroups
        .filter(
          group =>
            Number.isFinite(group.meetingLat) &&
            Number.isFinite(group.meetingLng)
        )
        .map(group => ({
          id: group.id,
          lat: group.meetingLat,
          lng: group.meetingLng,
          destinationName: group.destinationName,
          meetingPointName: group.meetingPointName,
          memberCount: group.memberCount,
          status: group.status,
        })),
    [activeWalkGroups]
  );

  const walkGroupPreviewBottom =
    sheetMetrics.sheetHeight - sheetMetrics.snaps[activeSnap] + 16;

  const snapSheetTo = useCallback(
    (nextSnap: SheetSnap) => {
      activeSnapRef.current = nextSnap;
      setActiveSnap(nextSnap);
      const nextY = sheetMetrics.snaps[nextSnap];
      currentTranslateYRef.current = nextY;
      if (!sheetRef.current) {
        return;
      }
      sheetRef.current.style.transition =
        "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)";
      sheetRef.current.style.transform = `translateY(${nextY}px)`;
    },
    [sheetMetrics]
  );

  useEffect(() => {
    if (!sheetRef.current) {
      return;
    }
    sheetRef.current.style.height = `${sheetMetrics.sheetHeight}px`;
    snapSheetTo(activeSnapRef.current);
  }, [sheetMetrics, snapSheetTo]);

  const fitMapToRoute = useCallback((coordinates: Coord2[]) => {
    const map = mapRef.current?.getMap();
    if (!map || coordinates.length < 2) {
      return;
    }

    const bounds = new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]);
    coordinates.slice(1).forEach(coordinate => bounds.extend(coordinate));

    map.fitBounds(bounds, {
      padding: {
        top: 120,
        right: 32,
        bottom: TAB_BAR_HEIGHT + 120,
        left: 32,
      },
      maxZoom: 18,
      duration: 900,
    });
  }, []);

  const requestWalkingRoute = useCallback(async (waypoints: Coord2[]) => {
    if (!MAPBOX_TOKEN) {
      throw new Error("Mapbox token is missing.");
    }
    if (waypoints.length < 2) {
      throw new Error("At least two coordinates are required.");
    }

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${waypoints
        .map(point => `${point[0]},${point[1]}`)
        .join(";")}`
    );
    url.searchParams.set("alternatives", "false");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("steps", "false");
    url.searchParams.set("access_token", MAPBOX_TOKEN);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Mapbox directions failed (${response.status}).`);
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: number[][] };
      }>;
    };
    const route = data.routes?.[0];
    const coordinates = Array.isArray(route?.geometry?.coordinates)
      ? route.geometry.coordinates
        .filter(value => Array.isArray(value) && value.length >= 2)
        .map(value => [value[0], value[1]] as Coord2)
      : [];

    if (coordinates.length < 2) {
      throw new Error("Mapbox directions did not return a usable path.");
    }

    return {
      coordinates,
      distanceM: route?.distance ?? 0,
      durationSec: route?.duration ?? 0,
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) {
      return;
    }

    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(
      createRouteFeatureCollection(activeRoute?.coordinates ?? [])
    );

    if (activeRoute) {
      fitMapToRoute(activeRoute.coordinates);
    }
  }, [activeRoute, fitMapToRoute]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current || !sheetRef.current) {
        return;
      }

      const delta = event.clientY - startYRef.current;
      const nextY = clampValue(
        startTranslateYRef.current + delta,
        sheetMetrics.snaps.full,
        sheetMetrics.snaps.collapsed
      );

      currentTranslateYRef.current = nextY;
      sheetRef.current.style.transform = `translateY(${nextY}px)`;
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current) {
        return;
      }

      isDraggingRef.current = false;
      const snapEntries: Array<[SheetSnap, number]> = [
        ["collapsed", sheetMetrics.snaps.collapsed],
        ["mid", sheetMetrics.snaps.mid],
        ["full", sheetMetrics.snaps.full],
      ];
      const nearest = snapEntries.reduce((closest, candidate) =>
        Math.abs(candidate[1] - currentTranslateYRef.current) <
        Math.abs(closest[1] - currentTranslateYRef.current)
          ? candidate
          : closest
      );
      snapSheetTo(nearest[0]);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [sheetMetrics, snapSheetTo]);

  const focusPlaceOnMap = useCallback((place: PlaceLocation) => {
    setSelectedPlaceId(place.id);
    setSelectedWalkGroupId(null);
    setSelectedHazard(null);
    mapRef.current?.flyTo(place.coordinates[1], place.coordinates[0], 17.25);
  }, []);

  const handleWalkGroupClick = useCallback(
    (walkGroupMarker: WalkGroupMapMarker) => {
      setSelectedHazard(null);
      setSelectedPlaceId(null);
      setSelectedWalkGroupId(walkGroupMarker.id);
      snapSheetTo("collapsed");
      mapRef.current?.flyTo(walkGroupMarker.lat, walkGroupMarker.lng, 17);
    },
    [snapSheetTo]
  );

  const chooseSearchResult = useCallback(
    (place: PlaceLocation) => {
      setActiveRoute(null);
      focusPlaceOnMap(place);
      snapSheetTo("full");
      setRecentIds(current => {
        const next = [place.id, ...current.filter(id => id !== place.id)].slice(
          0,
          8
        );
        writeRecentSearches(next);
        return next;
      });
    },
    [focusPlaceOnMap, snapSheetTo]
  );

  const handlePlaceClick = useCallback(
    (place: PlaceLocation) => {
      if (activeRoute) {
        return;
      }
      focusPlaceOnMap(place);
      snapSheetTo("full");
    },
    [activeRoute, focusPlaceOnMap, snapSheetTo]
  );

  const handleBackToSearch = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedWalkGroupId(null);
    setActiveRoute(null);
    mapRef.current?.clearRoute();
    snapSheetTo(normalizedQuery ? "full" : "mid");
  }, [normalizedQuery, snapSheetTo]);

  const handleCancelNavigation = useCallback(() => {
    setActiveRoute(null);
    setSelectedPlaceId(null);
    setSelectedHazard(null);
    setSelectedWalkGroupId(null);
    setSearchQuery("");
    mapRef.current?.clearRoute();
    if (userLat != null && userLng != null) {
      mapRef.current?.flyTo(userLat, userLng, 16.4);
    } else {
      mapRef.current?.flyTo(UWI_MONA_CENTER[1], UWI_MONA_CENTER[0], 15.5);
    }
    snapSheetTo("collapsed");
  }, [snapSheetTo, userLat, userLng]);

  const handleHazardClick = useCallback(
    (hazard: Hazard) => {
      const fullHazard =
        hazards.find(item => String(item.id) === String(hazard.id)) ?? null;
      setSelectedHazard(fullHazard);
      setSelectedWalkGroupId(null);
    },
    [hazards]
  );

  const handleSheetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (sheetMode === "navigating") {
        return;
      }
      startYRef.current = event.clientY;
      startTranslateYRef.current = currentTranslateYRef.current;
      isDraggingRef.current = true;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    },
    [sheetMode]
  );

  const handleStartNavigation = useCallback(async () => {
    if (!selectedPlace) {
      toast.error("Select a destination first.");
      return;
    }
    if (!campusData) {
      toast.error("Campus routes are still loading.");
      return;
    }
    if (userLat == null || userLng == null) {
      toast.error("Your location is needed before routing.");
      return;
    }
    if (routeType === "shortcut") {
      toast.error("Shortcut mode is coming soon.");
      return;
    }

    setIsPlanningRoute(true);
    setSelectedHazard(null);
    setSelectedWalkGroupId(null);
    setIsReportOpen(false);

    try {
      const origin: Coord2 = [userLng, userLat];
      const userSnap = findNearestCampusPathSnap(campusData, origin);
      const destinationComponentId = getCampusNodeComponentId(
        campusData,
        selectedPlace.nearestNodeId
      );
      const startOptions = userSnap
        ? [
            {
              nodeId: userSnap.startNodeId,
              connectorDistanceM: userSnap.distanceToStartM,
            },
            {
              nodeId: userSnap.endNodeId,
              connectorDistanceM: userSnap.distanceToEndM,
            },
          ].filter(
            (option, index, options) =>
              options.findIndex(
                candidate => candidate.nodeId === option.nodeId
              ) === index
          )
        : [];
      const connectedStartOptions =
        destinationComponentId === null
          ? []
          : startOptions.filter(
              option =>
                getCampusNodeComponentId(campusData, option.nodeId) ===
                destinationComponentId
            );

      const routeOptions: Array<{
        coordinates: Coord2[];
        distanceM: number;
        durationSec: number;
      }> = [];

      if (userSnap && connectedStartOptions.length > 0) {
        const roadConnectorDistanceM = haversineMeters(
          origin,
          userSnap.coordinates
        );
        const roadRoute =
          roadConnectorDistanceM < 3
            ? {
                coordinates: mergeRouteCoordinates(
                  [origin],
                  [userSnap.coordinates]
                ),
                distanceM: roadConnectorDistanceM,
                durationSec: roadConnectorDistanceM / 1.35,
              }
            : await requestWalkingRoute([origin, userSnap.coordinates]);

        routeOptions.push(
          ...connectedStartOptions
            .map(option => {
              const campusRoute = planCampusRouteBetweenNodes(
                campusData,
                option.nodeId,
                selectedPlace.nearestNodeId,
                getCampusRouteMode(routeType)
              );
              if (!campusRoute) {
                return null;
              }

              const lastCampusCoordinate =
                campusRoute.coordinates[campusRoute.coordinates.length - 1];
              const finalConnectorDistanceM = lastCampusCoordinate
                ? haversineMeters(
                    lastCampusCoordinate,
                    selectedPlace.coordinates
                  )
                : 0;
              const finalConnectorCoordinates =
                finalConnectorDistanceM > 1 ? [selectedPlace.coordinates] : [];

              return {
                coordinates: mergeRouteCoordinates(
                  roadRoute.coordinates,
                  [userSnap.coordinates],
                  campusRoute.coordinates,
                  finalConnectorCoordinates
                ),
                distanceM:
                  roadRoute.distanceM +
                  option.connectorDistanceM +
                  campusRoute.distanceM +
                  finalConnectorDistanceM,
                durationSec:
                  roadRoute.durationSec +
                  option.connectorDistanceM / 1.35 +
                  campusRoute.walkTimeSec +
                  finalConnectorDistanceM / 1.2,
              };
            })
            .filter(
              (route): route is NonNullable<typeof route> => route !== null
            )
        );
      }

      if (routeOptions.length === 0) {
        const fallbackRoute = await buildDestinationComponentEntryRoute({
          campusData,
          origin,
          destination: selectedPlace,
          routeType,
          requestWalkingRoute,
        });
        if (fallbackRoute) {
          routeOptions.push(fallbackRoute);
        }
      }

      const bestRoute = routeOptions.sort(
        (left, right) => left.distanceM - right.distanceM
      )[0];
      if (!bestRoute) {
        const disconnectedMessage = buildDisconnectedCampusRouteMessage(
          campusData,
          startOptions.map(option => option.nodeId),
          selectedPlace.nearestNodeId,
          selectedPlace.name
        );
        if (disconnectedMessage) {
          throw new Error(disconnectedMessage);
        }

        throw new Error("No route could be built to the selected destination.");
      }

      setActiveRoute({
        mode: routeType,
        destinationId: selectedPlace.id,
        destinationName: selectedPlace.name,
        coordinates: bestRoute.coordinates,
        distanceM: bestRoute.distanceM,
        durationSec: bestRoute.durationSec,
      });
      snapSheetTo("collapsed");
    } catch (error) {
      console.error(error);
      toast.error(
        isDisconnectedCampusRouteError(error)
          ? "Those nodes are on a disconnected part of the campus graph."
          : "Unable to build the route right now."
      );
    } finally {
      setIsPlanningRoute(false);
    }
  }, [
    campusData,
    requestWalkingRoute,
    routeType,
    selectedPlace,
    snapSheetTo,
    userLat,
    userLng,
  ]);

  const handleSubmitHazardWithOption = useCallback(
    async (nextType: HazardType) => {
      const category = getHazardCategory(nextType);
      const mapCenter = mapRef.current?.getMap()?.getCenter();
      const lat = userLat ?? mapCenter?.lat ?? UWI_MONA_CENTER[1];
      const lng = userLng ?? mapCenter?.lng ?? UWI_MONA_CENTER[0];

      try {
        const created = await createSupabaseHazard({
          reportType: nextType,
          lat,
          lng,
          severity: category.severity,
          description: undefined,
        });

        setHazards(current => [
          created,
          ...current.filter(item => item.id !== created.id),
        ]);
        setSelectedHazard(created);
        setIsReportOpen(false);
        toast.success("Hazard reported on the map.");
        mapRef.current?.flyTo(created.lat, created.lng, 17.2);
      } catch (error) {
        console.error(error);
        toast.error("Unable to submit the hazard report.");
      }
    },
    [userLat, userLng]
  );

  const openSelectedWalkGroup = useCallback(() => {
    if (!selectedWalkGroup) {
      return;
    }
    navigate(`/walk-group/${selectedWalkGroup.id}`);
  }, [navigate, selectedWalkGroup]);

  const handleJoinWalkGroup = useCallback(async () => {
    if (!selectedWalkGroup) {
      return;
    }

    setIsJoiningWalkGroup(true);
    try {
      const joinedGroup = await joinWalkGroup(selectedWalkGroup.id);
      setMyActiveWalkGroup(joinedGroup);
      setSelectedWalkGroupId(null);
      toast.success("Joined walk group.");
      navigate(`/walk-group/${joinedGroup.id}`);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to join this walk group right now."
      );
    } finally {
      setIsJoiningWalkGroup(false);
    }
  }, [navigate, selectedWalkGroup]);

  const handleToggleFilter = useCallback((filterKey: MapPlaceFilterKey) => {
    setSelectedFilters(current => {
      const nextSelection = current.includes(filterKey)
        ? current.filter(value => value !== filterKey)
        : [...current, filterKey];

      return DEFAULT_MAP_PLACE_FILTER_KEYS.filter(candidate =>
        nextSelection.includes(candidate)
      );
    });
  }, []);

  if (!loading && !user) {
    return null;
  }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="relative w-full" style={{ height: "calc(100vh - 64px)" }}>
        <CactusMap
          ref={mapRef}
          userLat={userLat}
          userLng={userLng}
          walkers={[]}
          hazards={visibleHazards}
          walkGroups={visibleWalkGroups}
          places={campusPlaces}
          selectedPlaceId={selectedPlaceId}
          selectedFilters={selectedFilters}
          campusData={campusData}
          onHazardClick={handleHazardClick}
          onWalkGroupClick={handleWalkGroupClick}
          onPlaceClick={handlePlaceClick}
        />

        {selectedHazard ? (
          <HazardInfoCard
            hazard={selectedHazard}
            userLat={userLat}
            userLng={userLng}
            onClose={() => setSelectedHazard(null)}
          />
        ) : null}

        <div className="absolute left-4 top-4 z-20 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="relative flex h-14 w-14 items-center justify-center rounded-[24px] bg-white/90 backdrop-blur-md shadow-lg shadow-amber-500/20 border-2 border-amber-500 text-amber-500 transition-all hover:scale-105 active:scale-95"
            aria-label="Report a hazard"
          >
            <AlertTriangle className="h-6 w-6" />
            {activeHazardCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
                {activeHazardCount}
              </span>
            ) : null}
          </button>
        </div>

        <MapFilterSheet
          open={isFilterSheetOpen}
          options={MAP_PLACE_FILTERS}
          selectedFilters={selectedFilters}
          onOpen={() => setIsFilterSheetOpen(true)}
          onClose={() => setIsFilterSheetOpen(false)}
          onToggleFilter={handleToggleFilter}
        />

        <SearchBottomSheet
          mode={sheetMode}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onClearSearch={() => {
            setSearchQuery("");
            if (!activeRoute) {
              setSelectedPlaceId(null);
            }
          }}
          results={filteredPlaces}
          recentPlaces={recentPlaces}
          selectedPlace={selectedPlace}
          selectedPlaceDistanceLabel={selectedPlaceDistanceLabel}
          routeType={routeType}
          onChooseResult={chooseSearchResult}
          onRouteTypeChange={setRouteType}
          onBackToSearch={handleBackToSearch}
          onStartNavigation={() => {
            void handleStartNavigation();
          }}
          onCancelNavigation={handleCancelNavigation}
          onSearchFocus={() => snapSheetTo("full")}
          onPointerDown={handleSheetPointerDown}
          sheetRef={sheetRef}
          sheetHeight={sheetMetrics.sheetHeight}
          isPlanningRoute={isPlanningRoute}
        />
=======
  if (!loading && !user) { navigate("/login"); return null; }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="flex h-full">
        {/* Left panel — desktop only */}
        <div className="hidden lg:flex w-80 bg-card border-r border-border flex-col shrink-0">
          {showWalkers ? (
            <WalkingPartnersPanel walkers={DEMO_WALKERS} onClose={() => setShowWalkers(false)} />
          ) : (
            <RoutePanel
              activeRoute={activeRoute}
              onSelectRoute={setActiveRoute}
              onFindPartner={() => setShowWalkers(true)}
              showWalkers={showWalkers}
            />
          )}
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          <CactusMap
            ref={mapRef}
            userLat={userLat}
            userLng={userLng}
            walkers={DEMO_WALKERS}
            hazards={hazards}
            isSelectingDest={false}
            onDestinationSelected={() => {}}
            onHazardClick={handleHazardClick}
          />
>>>>>>> 76de4ef14f4ffe7fad8691668ad290bc4c1b8308

          {/* Mobile: collapsed search bar at top */}
          <div className="lg:hidden absolute top-4 left-4 right-4 z-20">
            <button
              onClick={() => setMobilePanelOpen(true)}
              className="w-full bg-card/97 backdrop-blur-sm rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left border border-border"
            >
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground flex-1">Where would you like to go?</span>
              <Navigation className="w-4 h-4 text-primary shrink-0" />
            </button>
          </div>

          {/* Mobile bottom sheet panel */}
          {mobilePanelOpen && (
            <>
              <div className="lg:hidden fixed inset-0 bg-charcoal/30 z-30" onClick={() => setMobilePanelOpen(false)} />
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-border rounded-full" />
                </div>
                {showWalkers ? (
                  <WalkingPartnersPanel walkers={DEMO_WALKERS} onClose={() => { setShowWalkers(false); setMobilePanelOpen(false); }} />
                ) : (
                  <RoutePanel
                    activeRoute={activeRoute}
                    onSelectRoute={setActiveRoute}
                    onFindPartner={() => setShowWalkers(true)}
                    showWalkers={showWalkers}
                  />
                )}
              </div>
            </>
          )}

          {/* Right-side FABs */}
          <div className="absolute right-4 bottom-24 lg:bottom-8 z-20 flex flex-col gap-3">

            <button
              onClick={() => setActiveSheet("report")}
              className="w-12 h-12 rounded-full bg-card flex items-center justify-center hover:scale-105 transition-transform active:scale-95 border-2 border-orange"
            >
              <AlertTriangle className="w-5 h-5 text-orange" />
              {activeHazardCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {activeHazardCount}
                </span>
              )}
            </button>
          </div>


          {/* Info card at bottom of map — delivery/transit style */}
          <div className="hidden lg:block absolute bottom-0 left-0 right-0 z-10">
            <div className="bg-card backdrop-blur-sm rounded-t-2xl px-6 py-5 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Current Route</p>
                <p className="text-base font-bold text-foreground">
                  My Location → SLT 2
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-base font-bold text-foreground">350m</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">ETA</p>
                  <p className="text-base font-bold text-primary">5 min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hazard report sheet (mobile) */}
      {activeSheet === "report" && (
        <>
          <div className="fixed inset-0 bg-charcoal/30 z-30" onClick={() => setActiveSheet("none")} />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-border rounded-full" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Report a Hazard</h2>
              <button onClick={() => setActiveSheet("none")} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <p className="text-xs text-muted-foreground mb-4">What hazard are you reporting?</p>
              <div className="grid grid-cols-3 gap-3">
                {HAZARD_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.type}
                      onClick={() => {
                        const newHazard: Hazard = { id: Date.now(), reportType: cat.type, lat: userLat ?? 18.0035, lng: userLng ?? -76.7497, severity: cat.severity, ttlMinutes: cat.severity >= 4 ? 60 : 30 };
                        setHazards((prev) => [...prev, newHazard]);
                        toast.success("Hazard reported!");
                        setActiveSheet("none");
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 border-transparent hover:border-border hover:bg-secondary transition-all active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: cat.bg }}>
                        <Icon className="w-6 h-6" style={{ color: cat.color }} />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground text-center leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hazard detail sheet */}
      {activeSheet === "hazard" && selectedHazard && (
        <>
          <div className="fixed inset-0 bg-charcoal/30 z-30" onClick={() => { setActiveSheet("none"); setSelectedHazard(null); }} />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-border rounded-full" /></div>
            <div className="px-5 py-4">
              {(() => {
                const cat = HAZARD_CATEGORIES.find((c) => c.type === selectedHazard.reportType);
                const Icon = cat?.icon ?? AlertTriangle;
                const severity = SEVERITY_LABELS[selectedHazard.severity] ?? SEVERITY_LABELS[3];
                return (
                  <>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat?.bg }}>
                        <Icon className="w-6 h-6" style={{ color: cat?.color }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-foreground">{cat?.label ?? selectedHazard.reportType}</h3>
                        {selectedHazard.description && <p className="text-sm text-muted-foreground">{selectedHazard.description}</p>}
                      </div>
                      <button onClick={() => { setActiveSheet("none"); setSelectedHazard(null); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 text-center">Is this hazard still there?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setHazards((prev) => prev.map((h) => h.id === selectedHazard.id ? { ...h, ttlMinutes: Math.max(0, (h.ttlMinutes ?? 30) + 15) } : h));
                          toast.success("Confirmed!");
                          setActiveSheet("none"); setSelectedHazard(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-orange-light border-2 border-orange text-orange font-bold text-sm"
                      >
                        <ThumbsUp className="w-4 h-4" /> Still There
                      </button>
                      <button
                        onClick={() => {
                          setHazards((prev) => prev.map((h) => h.id === selectedHazard.id ? { ...h, ttlMinutes: 0 } : h));
                          toast.success("Resolved!");
                          setActiveSheet("none"); setSelectedHazard(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-teal-light border-2 border-primary text-primary font-bold text-sm"
                      >
                        <CheckCircle className="w-4 h-4" /> It's Gone
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
<<<<<<< HEAD

function getHazardCategory(type: string) {
  return (
    HAZARD_CATEGORIES.find(category => category.type === type) ?? {
      type: "other",
      label: "Hazard",
      description: "Campus safety report",
      icon: AlertTriangle,
      color: "#ff9f0a",
      bg: "#fff4db",
      severity: 3,
    }
  );
}

function readRecentSearches() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(ids));
}

function formatRelativeTime(createdAt?: string) {
  if (!createdAt) {
    return "Reported recently";
  }

  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatDistanceKm(
  fromLat: number | undefined,
  fromLng: number | undefined,
  toLat: number,
  toLng: number
) {
  if (fromLat == null || fromLng == null) {
    return null;
  }

  const km = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}
=======
>>>>>>> 76de4ef14f4ffe7fad8691668ad290bc4c1b8308
