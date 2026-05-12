import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation, useSearch } from "wouter";
import { useNotification } from "@/contexts/NotificationContext";
import WalkGroupCreateDialog from "@/components/WalkGroupCreateDialog";
import WalkGroupPreviewCard from "@/components/WalkGroupPreviewCard";
import MapHazardReportSheet, {
  type HazardReportOption,
} from "@/components/MapHazardReportSheet";
import {
  createRouteFeatureCollection,
  haversineMeters,
  mergeRouteCoordinates,
} from "@/lib/fstRouting";
import {
  buildHazardAvoidanceWaypoints,
  buildScenicWaypoints,
  routeIntersectsHazards,
  SCENIC_ROUTE_WAYPOINTS,
  sortRoutesBySafety,
} from "@/lib/routeSafety";
import {
  findNearestCampusPathSnap,
  getCampusNodeComponentId,
  listCampusComponentNodes,
  planCampusRouteBetweenNodes,
  type CampusDataset,
} from "@/lib/findWayGeo";
import {
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Users,
  X,
  Navigation,
  ChevronRight,
  Zap,
  Wind,
  Footprints,
  AlertTriangle,
  ArrowLeft,
  Clock,
} from "lucide-react";
import {
  getCachedCampusPlaceData,
  getCategoryMeta,
  loadCampusPlaceData,
  normalizeSearchText,
  type PlaceDataset,
  type PlaceLocation,
} from "@/lib/campusPlaces";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import {
  createWalkGroup,
  joinWalkGroup,
  loadActiveWalkGroups,
  loadMyActiveWalkGroup,
  type WalkGroupRecord,
} from "@/lib/supabaseWalkGroups";
import {
  createSupabaseHazard,
  loadSupabaseHazards,
  type HazardRecord,
} from "@/lib/supabaseHazards";
import {
  createCampusPlaceMarkerElement,
  createWalkGroupMeetingMarkerElement,
} from "@/lib/placeMarkerIcons";
import {
  bindManagedMapMarkerVisibility,
  type ManagedMapMarker,
  type MapMarkerVisibilityBinding,
} from "@/lib/mapMarkerVisibility";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const DEFAULT_CENTER: [number, number] = [-76.7499, 18.0053];
const DISCONNECTED_CAMPUS_ROUTE_PREFIX = "Campus graph disconnect:";
const CROSS_COMPONENT_ENTRY_NODE_LIMIT = 8;

// ─── Helpers (unchanged) ──────────────────────────────────────────────────────

function formatCourseScheduleText(course: {
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
}) {
  const dayText = course.dayOfWeek
    ?.split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .join(" · ");
  const timeText =
    course.startTime && course.endTime
      ? `${course.startTime} – ${course.endTime}`
      : undefined;
  return [dayText, timeText].filter(Boolean).join("  ·  ") || "Schedule not set";
}

function resolveCourseDestination(
  course: SupabaseCourseRecord,
  places: PlaceLocation[]
) {
  if (course.roomSourceId) {
    const m = places.find((p) => p.id === course.roomSourceId);
    if (m) return m;
  }
  if (
    Number.isFinite(course.roomLng) &&
    Number.isFinite(course.roomLat) &&
    course.roomLng != null &&
    course.roomLat != null
  ) {
    const nearest = [...places]
      .map((p) => ({
        place: p,
        distanceM: haversineMeters(p.coordinates, [course.roomLng!, course.roomLat!]),
      }))
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    if (nearest && nearest.distanceM <= 25) return nearest.place;
  }
  if (course.room) {
    const norm = normalizeSearchText(course.room);
    const exact = places.find((p) => normalizeSearchText(p.name) === norm);
    if (exact) return exact;
    const partial = places.find((p) => normalizeSearchText(p.name).includes(norm));
    if (partial) return partial;
  }
  return null;
}

function buildDisconnectedCampusRouteMessage(
  campusData: CampusDataset,
  startNodeIds: string[],
  destinationNodeId: string,
  destinationName: string
) {
  const destComp = getCampusNodeComponentId(campusData, destinationNodeId);
  const startComps = Array.from(
    new Set(
      startNodeIds
        .map((id) => getCampusNodeComponentId(campusData, id))
        .filter((c): c is number => c !== null)
    )
  );
  if (destComp === null || startComps.length === 0 || startComps.includes(destComp))
    return null;
  return `${DISCONNECTED_CAMPUS_ROUTE_PREFIX} ${destinationName} is on component ${destComp}, but the start side is on component(s) ${startComps.join(", ")}.`;
}

function isDisconnectedCampusRouteError(error: unknown) {
  return error instanceof Error && error.message.startsWith(DISCONNECTED_CAMPUS_ROUTE_PREFIX);
}

async function buildDestinationComponentEntryRoute(params: {
  campusData: CampusDataset;
  origin: Coord2;
  destination: PlaceLocation;
  walkMode: WalkMode;
  requestWalkingRoute: (waypoints: Coord2[]) => Promise<DirectionsRoute>;
}) {
  const { campusData, origin, destination, walkMode, requestWalkingRoute } = params;
  const destComp = getCampusNodeComponentId(campusData, destination.nearestNodeId);
  if (destComp === null) return null;

  const candidates = listCampusComponentNodes(campusData, destComp)
    .map((n) => ({ ...n, directDistanceM: haversineMeters(origin, n.coordinates) }))
    .sort((a, b) => a.directDistanceM - b.directDistanceM || a.edgeCount - b.edgeCount)
    .slice(0, CROSS_COMPONENT_ENTRY_NODE_LIMIT);

  const options: Array<{
    combinedCoordinates: Coord2[];
    campusRoute: NonNullable<ReturnType<typeof planCampusRouteBetweenNodes>>;
    roadRoute: DirectionsRoute;
    totalDistanceM: number;
    totalDurationSec: number;
  }> = [];

  for (const candidate of candidates) {
    try {
      const roadDist = haversineMeters(origin, candidate.coordinates);
      const roadRoute =
        roadDist < 3
          ? {
              coordinates: mergeRouteCoordinates([origin], [candidate.coordinates]),
              distanceM: roadDist,
              durationSec: roadDist / 1.35,
            }
          : await requestWalkingRoute([origin, candidate.coordinates]);

      const campusRoute = planCampusRouteBetweenNodes(
        campusData,
        candidate.nodeId,
        destination.nearestNodeId,
        getCampusRouteMode(walkMode)
      );
      if (!campusRoute) continue;

      const lastCoord = campusRoute.coordinates[campusRoute.coordinates.length - 1];
      const finalDist = lastCoord ? haversineMeters(lastCoord, destination.coordinates) : 0;
      const finalCoords = finalDist > 1 ? [destination.coordinates] : [];

      options.push({
        combinedCoordinates: mergeRouteCoordinates(
          roadRoute.coordinates,
          campusRoute.coordinates,
          finalCoords
        ),
        campusRoute,
        roadRoute,
        totalDistanceM: roadRoute.distanceM + campusRoute.distanceM + finalDist,
        totalDurationSec: roadRoute.durationSec + campusRoute.walkTimeSec + finalDist / 1.2,
      });
    } catch {
      continue;
    }
  }
  return options.sort((a, b) => a.totalDistanceM - b.totalDistanceM)[0] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Coord2 = [number, number];
type SheetSnap = "peek" | "mid" | "full";
type LocationStatus = "locating" | "ready" | "denied" | "unsupported";
type WalkMode = "quick" | "shortcut" | "longest";
type WalkGroupDialogMode = "warning" | "form";
const WALK_GROUP_REFRESH_MS = 15000;
const HAZARD_REFRESH_MS = 15000;

interface UserLocation {
  coordinates: Coord2;
  accuracyM: number;
}

interface ActiveRoute {
  mode: WalkMode;
  coordinates: Coord2[];
  distanceM: number;
  roadDistanceM: number;
  campusDistanceM: number;
  durationSec: number;
  entranceNodeName: string;
  targetNodeName: string;
}

interface DirectionsRoute {
  coordinates: Coord2[];
  distanceM: number;
  durationSec: number;
}

interface SelectedMeetingPoint {
  name: string;
  coordinates: Coord2;
  category?: string;
  sourceId?: string;
  nearestNodeId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

function buildWalkGroupMarkerElement(isCurrentUsersGroup: boolean) {
  return createWalkGroupMeetingMarkerElement({
    title: "Walk group meeting point",
    isSelected: isCurrentUsersGroup,
  });
}

function buildMeetingPointMarkerElement() {
  return createWalkGroupMeetingMarkerElement({
    title: "Meeting point",
    isSelected: true,
  });
}

function findClosestMeetingPoint(places: PlaceLocation[], coordinates: Coord2): PlaceLocation | null {
  let best: PlaceLocation | null = null;
  let bestDist = Infinity;
  for (const p of places) {
    const d = haversineMeters(coordinates, p.coordinates);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  return best;
}

const WALK_MODE_META: Record<WalkMode, { label: string; subtitle: string; icon: typeof Zap; disabled?: boolean }> = {
  quick:    { label: "Quick",   subtitle: "Fastest route", icon: Zap },
  shortcut: { label: "Shortcut", subtitle: "Coming soon",  icon: Footprints, disabled: true },
  longest:  { label: "Scenic",  subtitle: "Ring Road",     icon: Wind },
};

const REPORT_OPTIONS: HazardReportOption[] = [
  { type: "lights_not_working", label: "Lights Out",    description: "Poor visibility or lamps out",       color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { type: "rainy",              label: "Rainy",          description: "Wet walkways and light rain",        color: "#0284c7", bg: "#f0f9ff", border: "#bae6fd" },
  { type: "flood",              label: "Flood",          description: "Standing water or flooded path",    color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  { type: "dangerous",          label: "Dangerous",      description: "Unsafe or suspicious activity",     color: "#dc2626", bg: "#fff1f2", border: "#fecdd3" },
  { type: "blocked_path",       label: "Blocked Path",   description: "Path closed or hard to pass",       color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  { type: "obstruction",        label: "Obstruction",    description: "Debris, cones or temporary block",  color: "#7c3aed", bg: "#faf5ff", border: "#ddd6fe" },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function getCampusRouteMode(mode: WalkMode) { return mode === "longest" ? "scenic" : "shortest"; }

function formatDistanceLabel(m: number) {
  if (!Number.isFinite(m) || m <= 0) return "0 m";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDurationLabel(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "<1 min";
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function createBoundsFromCoordinates(coords: Coord2[]) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of coords) {
    w = Math.min(w, lng); s = Math.min(s, lat);
    e = Math.max(e, lng); n = Math.max(n, lat);
  }
  if (!Number.isFinite(w)) return { west: DEFAULT_CENTER[0] - 0.001, south: DEFAULT_CENTER[1] - 0.001, east: DEFAULT_CENTER[0] + 0.001, north: DEFAULT_CENTER[1] + 0.001 };
  return { west: w, south: s, east: e, north: n };
}

function ensureMapSources(
  map: mapboxgl.Map,
  _campusData: CampusDataset | null,
  _placeData: PlaceDataset,
  _selectedDestinationId: string | null,
  activeRoute: ActiveRoute | null
) {
  const collection = createRouteFeatureCollection(activeRoute?.coordinates ?? []);
  const src = map.getSource("campus-active-route") as mapboxgl.GeoJSONSource | undefined;
  if (src) src.setData(collection);
  else map.addSource("campus-active-route", { type: "geojson", data: collection });
  if (!map.getLayer("campus-active-route-casing"))
    map.addLayer({ id: "campus-active-route-casing", type: "line", source: "campus-active-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1e40af", "line-width": 10, "line-opacity": 0.9 } });
  if (!map.getLayer("campus-active-route-line"))
    map.addLayer({ id: "campus-active-route-line", type: "line", source: "campus-active-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3b82f6", "line-width": 5, "line-opacity": 0.95 } });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FindWayPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);

  const requestedCourseId = useMemo(() => {
    const v = Number(queryParams.get("courseId"));
    return Number.isInteger(v) && v > 0 ? v : null;
  }, [queryParams]);
  const requestedRoom = queryParams.get("room")?.trim() ?? null;
  const isCourseRouteMode = requestedCourseId !== null;

  const cachedCampusBundle = getCachedCampusPlaceData();
  const cachedCourses = getCachedSupabaseCourses();

  // refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const classroomMarkersRef = useRef<ManagedMapMarker[]>([]);
  const walkGroupMarkersRef = useRef<ManagedMapMarker[]>([]);
  const meetingPointMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const selectedPopupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markerVisibilityRef = useRef<MapMarkerVisibilityBinding | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  const initializedTargetRef = useRef<string | null>(null);
  const autoPlannedRouteRef = useRef<string | null>(null);
  const sheetHeightRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // state
  const [placeData, setPlaceData] = useState<PlaceDataset | null>(cachedCampusBundle?.placeData ?? null);
  const [campusData, setCampusData] = useState<CampusDataset | null>(cachedCampusBundle?.campusData ?? null);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [activeWalkGroups, setActiveWalkGroups] = useState<WalkGroupRecord[]>([]);
  const [hazards, setHazards] = useState<HazardRecord[]>([]);
  const [myActiveWalkGroup, setMyActiveWalkGroup] = useState<WalkGroupRecord | null>(null);
  const [selectedWalkGroupId, setSelectedWalkGroupId] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(!cachedCampusBundle);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [isCreatingWalkGroup, setIsCreatingWalkGroup] = useState(false);
  const [isJoiningWalkGroup, setIsJoiningWalkGroup] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("locating");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [walkMode, setWalkMode] = useState<WalkMode>("quick");
  const [isWalkGroupDialogOpen, setIsWalkGroupDialogOpen] = useState(false);
  const [walkGroupDialogMode, setWalkGroupDialogMode] = useState<WalkGroupDialogMode>("warning");
  const [isSelectingMeetingPoint, setIsSelectingMeetingPoint] = useState(false);
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState<SelectedMeetingPoint | null>(null);
  const [walkGroupLeavingOffsetMin, setWalkGroupLeavingOffsetMin] = useState(10);
  const [walkGroupNote, setWalkGroupNote] = useState("");
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [sheetHeight, setSheetHeight] = useState(240);
  const [targetCourse, setTargetCourse] = useState<SupabaseCourseRecord | null>(
    requestedCourseId != null ? (cachedCourses?.find((c) => c.id === requestedCourseId) ?? null) : null
  );
  const [courseTargetError, setCourseTargetError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  // derived
  const normalizedDestinationQuery = useMemo(() => normalizeSearchText(destinationQuery), [destinationQuery]);

  const snapHeights = useMemo(() => ({
    peek: 184,
    mid: Math.round(clamp(viewportHeight * 0.45, 340, 460)),
    full: Math.round(clamp(viewportHeight * 0.85, 520, viewportHeight - 40)),
  }), [viewportHeight]);

  const selectedDestination = useMemo(
    () => placeData?.locations.find((l) => l.id === selectedDestinationId) ?? null,
    [placeData?.locations, selectedDestinationId]
  );

  const selectedWalkGroup = useMemo(
    () => activeWalkGroups.find((g) => g.id === selectedWalkGroupId) ?? null,
    [activeWalkGroups, selectedWalkGroupId]
  );

  const filteredLocations = useMemo(() => {
    const locs = placeData?.locations ?? [];
    if (!normalizedDestinationQuery) return locs.slice(0, 16);
    return [...locs]
      .sort((a, b) => {
        const an = normalizeSearchText(a.name), bn = normalizeSearchText(b.name);
        const score = (n: string) =>
          n === normalizedDestinationQuery ? 0 : n.startsWith(normalizedDestinationQuery) ? 1 : n.includes(normalizedDestinationQuery) ? 2 : 3;
        return score(an) - score(bn) || a.name.localeCompare(b.name);
      })
      .filter((l) => normalizeSearchText(l.name).includes(normalizedDestinationQuery))
      .slice(0, 12);
  }, [normalizedDestinationQuery, placeData?.locations]);

  const walkGroupDestination = selectedDestination ?? filteredLocations[0] ?? null;

  const targetCourseSchedule = useMemo(
    () => (targetCourse ? formatCourseScheduleText(targetCourse) : null),
    [targetCourse]
  );

  const visibleLocations = useMemo(() => {
    if (normalizedDestinationQuery) return filteredLocations;
    return filteredLocations.filter((l) => l.id !== selectedDestinationId).slice(0, 8);
  }, [filteredLocations, normalizedDestinationQuery, selectedDestinationId]);

  const locationStatusMeta = useMemo(() => {
    switch (locationStatus) {
      case "ready":    return { label: "GPS Active",   description: userLocation ? `±${Math.max(1, Math.round(userLocation.accuracyM))} m` : "Location locked", dotColor: "#22c55e" };
      case "denied":   return { label: "Location Off", description: "Tap locate to enable",                                                                      dotColor: "#f59e0b" };
      case "unsupported": return { label: "Unavailable", description: "GPS not supported",                                                                       dotColor: "#ef4444" };
      default:         return { label: "Finding you…", description: "Checking GPS signal",                                                                       dotColor: "#3b82f6" };
    }
  }, [locationStatus, userLocation]);

  const snapSheetTo = useCallback((s: SheetSnap) => setSheetHeight(snapHeights[s]), [snapHeights]);

  const fitMapToCampus = useCallback((map: mapboxgl.Map, pd: PlaceDataset) => {
    const b = createBoundsFromCoordinates(pd.locations.map((l) => l.coordinates));
    map.fitBounds(new mapboxgl.LngLatBounds([b.west, b.south], [b.east, b.north]), {
      padding: { top: 120, right: 32, bottom: sheetHeightRef.current + 24, left: 32 }, maxZoom: 17,
    });
  }, []);

  const fitMapToRoute = useCallback((map: mapboxgl.Map, coords: Coord2[]) => {
    if (!coords.length) return;
    const b = createBoundsFromCoordinates(coords);
    map.fitBounds(new mapboxgl.LngLatBounds([b.west, b.south], [b.east, b.north]), {
      padding: { top: 120, right: 32, bottom: sheetHeightRef.current + 32, left: 32 }, maxZoom: 18,
    });
  }, []);

  const focusLocationOnMap = useCallback((location: PlaceLocation) => {
    mapRef.current?.flyTo({ center: location.coordinates, zoom: 18, duration: 900 });
  }, []);

  const selectLocation = useCallback((location: PlaceLocation) => {
    setSelectedDestinationId(location.id);
    setDestinationQuery(location.name);
    setActiveRoute(null);
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(false);
    snapSheetTo("mid");
    focusLocationOnMap(location);
  }, [focusLocationOnMap, snapSheetTo]);

  const resolveMeetingPointSelection = useCallback((coordinates: Coord2) => {
    const nearest = placeData?.locations?.length ? findClosestMeetingPoint(placeData.locations, coordinates) : null;
    const nearestDist = nearest ? haversineMeters(nearest.coordinates, coordinates) : Infinity;
    const snap = campusData ? findNearestCampusPathSnap(campusData, coordinates) : null;
    const nearestNodeId = snap ? (snap.distanceToStartM <= snap.distanceToEndM ? snap.startNodeId : snap.endNodeId) : undefined;
    setSelectedMeetingPoint({
      name: nearest && nearestDist <= 35 ? nearest.name : "Custom Meeting Point",
      coordinates,
      category: nearest && nearestDist <= 35 ? nearest.category : undefined,
      sourceId: nearest && nearestDist <= 35 ? nearest.id : undefined,
      nearestNodeId,
    });
    setIsSelectingMeetingPoint(false);
    setIsWalkGroupDialogOpen(true);
    setWalkGroupDialogMode("form");
    snapSheetTo("mid");
    toast.success("Meeting point selected.");
  }, [campusData, placeData?.locations, snapSheetTo]);

  const renderSelectedPopup = useCallback((location: PlaceLocation | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (!location) { selectedPopupRef.current?.remove(); selectedPopupRef.current = null; return; }
    const categoryMeta = getCategoryMeta(location.category);
    const offset = location.category === "classroom" ? 34 : 18;
    const html = `<div style="padding:8px 10px;background:#fff;color:#0f172a;border-radius:10px;min-width:130px;font-family:system-ui,-apple-system,sans-serif;"><div style="font-size:13px;font-weight:700;line-height:1.3;color:#0f172a">${location.name}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${categoryMeta.label}</div></div>`;
    if (!selectedPopupRef.current)
      selectedPopupRef.current = new mapboxgl.Popup({ offset, closeButton: false, closeOnClick: false, className: "fw-popup" });
    selectedPopupRef.current.setOffset(offset).setLngLat(location.coordinates).setHTML(html);
    if (!selectedPopupRef.current.isOpen()) selectedPopupRef.current.addTo(map);
  }, []);

  const handlePlaceTap = useCallback((locationId: string) => {
    if (isCourseRouteMode && locationId !== selectedDestinationId) return;
    const location = placeData?.locations.find((l) => l.id === locationId);
    if (!location) return;
    selectLocation(location);
    renderSelectedPopup(location);
  }, [isCourseRouteMode, placeData, renderSelectedPopup, selectLocation, selectedDestinationId]);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationStatus("unsupported"); return; }
    if (geoWatchIdRef.current != null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
    setLocationStatus("locating");
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { coordinates: [pos.coords.longitude, pos.coords.latitude] as Coord2, accuracyM: pos.coords.accuracy };
        setUserLocation(loc);
        setLocationStatus("ready");
        if (mapRef.current && !hasCenteredOnUserRef.current) {
          mapRef.current.flyTo({ center: loc.coordinates, zoom: 17, duration: 1100 });
          hasCenteredOnUserRef.current = true;
        }
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const requestWalkingRoute = useCallback(async (waypoints: Coord2[]): Promise<DirectionsRoute> => {
    if (!MAPBOX_TOKEN) throw new Error("Mapbox token is missing.");
    if (waypoints.length < 2) throw new Error("At least two coordinates are required.");
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/walking/${waypoints.map((p) => `${p[0]},${p[1]}`).join(";")}`);
    url.searchParams.set("alternatives", "false");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("steps", "false");
    url.searchParams.set("access_token", MAPBOX_TOKEN);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Mapbox directions failed (${res.status}).`);
    const data = (await res.json()) as { routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }> };
    const route = data.routes?.[0];
    const coords = Array.isArray(route?.geometry?.coordinates)
      ? route!.geometry!.coordinates!.filter((c) => Array.isArray(c) && c.length >= 2).map((c) => [c[0], c[1]] as Coord2)
      : [];
    if (coords.length < 2) throw new Error("Mapbox directions did not return a usable path.");
    return { coordinates: coords, distanceM: route?.distance ?? 0, durationSec: route?.duration ?? 0 };
  }, []);

  const requestHazardAwareWalkingRoute = useCallback(async (waypoints: Coord2[]): Promise<DirectionsRoute> => {
    const route = await requestWalkingRoute(waypoints);
    if (!routeIntersectsHazards(route.coordinates, hazards)) {
      return route;
    }

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const detourWaypoints =
      walkMode === "longest"
        ? mergeRouteCoordinates(
            [origin],
            SCENIC_ROUTE_WAYPOINTS,
            buildHazardAvoidanceWaypoints(origin, destination, hazards).slice(1)
          )
        : buildHazardAvoidanceWaypoints(origin, destination, hazards);
    const detourRoute = await requestWalkingRoute(detourWaypoints);
    return routeIntersectsHazards(detourRoute.coordinates, hazards)
      ? route
      : detourRoute;
  }, [hazards, requestWalkingRoute, walkMode]);

  const handleGoToDestination = useCallback(async () => {
    const destination = isCourseRouteMode
      ? selectedDestination
      : (selectedDestination ?? filteredLocations[0] ?? null);
    if (!destination) {
      toast.error(isCourseRouteMode ? (courseTargetError ?? "No mapped route for this class.") : "Select a destination first.");
      return;
    }
    if (!userLocation) { requestUserLocation(); toast.error("Enable location to get directions."); return; }
    if (!campusData) { toast.error("Campus map is still loading."); return; }
    if (walkMode === "shortcut") { toast.error("Shortcut mode isn't ready yet."); return; }
    if (selectedDestinationId !== destination.id) {
      setSelectedDestinationId(destination.id);
      setDestinationQuery(destination.name);
    }
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(false);
    setIsPlanningRoute(true);
    try {
      const userSnap = findNearestCampusPathSnap(campusData, userLocation.coordinates);
      const destCompId = getCampusNodeComponentId(campusData, destination.nearestNodeId);
      const startOptions = userSnap
        ? [
            { nodeId: userSnap.startNodeId, nodeCoordinates: userSnap.startNodeCoordinates, connectorDistanceM: userSnap.distanceToStartM },
            { nodeId: userSnap.endNodeId, nodeCoordinates: userSnap.endNodeCoordinates, connectorDistanceM: userSnap.distanceToEndM },
          ].filter((o, i, arr) => arr.findIndex((c) => c.nodeId === o.nodeId) === i)
        : [];
      const connectedStartOptions =
        destCompId === null ? [] : startOptions.filter((o) => getCampusNodeComponentId(campusData, o.nodeId) === destCompId);

      const routeOptions: Array<{
        combinedCoordinates: Coord2[];
        campusRoute: NonNullable<ReturnType<typeof planCampusRouteBetweenNodes>>;
        roadRoute: DirectionsRoute;
        totalDistanceM: number;
        totalDurationSec: number;
      }> = [];

      if (walkMode === "longest") {
        try {
          const scenicRoadRoute = await requestHazardAwareWalkingRoute(
            buildScenicWaypoints(userLocation.coordinates, destination.coordinates)
          );
          routeOptions.push({
            combinedCoordinates: scenicRoadRoute.coordinates,
            campusRoute: {
              mode: "scenic",
              coordinates: scenicRoadRoute.coordinates,
              distanceM: scenicRoadRoute.distanceM,
              walkTimeSec: scenicRoadRoute.durationSec,
              safetyScore: 1,
              landmarks: [],
            } as NonNullable<ReturnType<typeof planCampusRouteBetweenNodes>>,
            roadRoute: scenicRoadRoute,
            totalDistanceM: scenicRoadRoute.distanceM,
            totalDurationSec: scenicRoadRoute.durationSec,
          });
        } catch {
          // Fall back to the campus graph scenic route below.
        }
      }

      if (userSnap && connectedStartOptions.length > 0) {
        const snapDist = haversineMeters(userLocation.coordinates, userSnap.coordinates);
        const roadRoute =
          snapDist < 3
            ? { coordinates: mergeRouteCoordinates([userLocation.coordinates], [userSnap.coordinates]), distanceM: snapDist, durationSec: snapDist / 1.35 }
            : await requestHazardAwareWalkingRoute([userLocation.coordinates, userSnap.coordinates]);

        routeOptions.push(
          ...connectedStartOptions
            .map((opt) => {
              const campusRoute = planCampusRouteBetweenNodes(campusData, opt.nodeId, destination.nearestNodeId, getCampusRouteMode(walkMode));
              if (!campusRoute) return null;
              const last = campusRoute.coordinates[campusRoute.coordinates.length - 1];
              const finalDist = last ? haversineMeters(last, destination.coordinates) : 0;
              const finalCoords = finalDist > 1 ? [destination.coordinates] : [];
              return {
                combinedCoordinates: mergeRouteCoordinates(roadRoute.coordinates, [userSnap.coordinates], campusRoute.coordinates, finalCoords),
                campusRoute, roadRoute,
                totalDistanceM: roadRoute.distanceM + opt.connectorDistanceM + campusRoute.distanceM + finalDist,
                totalDurationSec: roadRoute.durationSec + opt.connectorDistanceM / 1.35 + campusRoute.walkTimeSec + finalDist / 1.2,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
        );
      }

      if (!routeOptions.length) {
        const fallback = await buildDestinationComponentEntryRoute({ campusData, origin: userLocation.coordinates, destination, walkMode, requestWalkingRoute: requestHazardAwareWalkingRoute });
        if (fallback) routeOptions.push(fallback);
      }

      const best = sortRoutesBySafety(
        routeOptions.map(route => ({
          ...route,
          coordinates: route.combinedCoordinates,
          distanceM: route.totalDistanceM,
        })),
        hazards,
        walkMode === "longest"
      )[0];
      if (!best) {
        const msg = buildDisconnectedCampusRouteMessage(campusData, startOptions.map((o) => o.nodeId), destination.nearestNodeId, destination.name);
        throw new Error(msg ?? "No route could be built to the selected room.");
      }

      setActiveRoute({
        mode: walkMode,
        coordinates: best.combinedCoordinates,
        distanceM: best.totalDistanceM,
        roadDistanceM: best.roadRoute.distanceM,
        campusDistanceM: best.campusRoute.distanceM,
        durationSec: best.totalDurationSec,
        entranceNodeName: "campus path",
        targetNodeName: destination.name,
      });
      renderSelectedPopup(destination);
      snapSheetTo("mid");
      if (isCourseRouteMode && targetCourse)
        autoPlannedRouteRef.current = [targetCourse.id, destination.id, walkMode].join(":");
      if (mapRef.current) fitMapToRoute(mapRef.current, best.combinedCoordinates);
    } catch (err) {
      console.error(err);
      if (isCourseRouteMode) autoPlannedRouteRef.current = null;
      toast.error(isDisconnectedCampusRouteError(err) ? "Route not available — disconnected campus section." : "Couldn't build a route right now.");
    } finally {
      setIsPlanningRoute(false);
    }
  }, [campusData, courseTargetError, filteredLocations, fitMapToRoute, hazards, isCourseRouteMode, renderSelectedPopup, requestHazardAwareWalkingRoute, requestUserLocation, selectedDestination, selectedDestinationId, snapSheetTo, targetCourse, userLocation, walkMode]);

  useEffect(() => {
    if (!isCourseRouteMode || !targetCourse || !selectedDestination || !userLocation || !campusData || isPlanningRoute || courseTargetError) return;
    const key = [targetCourse.id, selectedDestination.id, walkMode].join(":");
    if (autoPlannedRouteRef.current === key) return;
    void handleGoToDestination();
  }, [campusData, courseTargetError, handleGoToDestination, isCourseRouteMode, isPlanningRoute, selectedDestination, targetCourse, userLocation, walkMode]);

  const refreshWalkGroups = useCallback(async () => {
    try {
      const [groups, active] = await Promise.all([loadActiveWalkGroups(), loadMyActiveWalkGroup().catch(() => null)]);
      setActiveWalkGroups(groups);
      setMyActiveWalkGroup(active);
      setSelectedWalkGroupId((cur) => (cur && !groups.some((g) => g.id === cur) ? null : cur));
    } catch (e) { console.error(e); }
  }, []);

  const openWalkGroupDialog = useCallback(() => {
    if (myActiveWalkGroup) { navigate(`/walk-group/${myActiveWalkGroup.id}`); return; }
    const dest = selectedDestination ?? filteredLocations[0] ?? null;
    if (!dest) { toast.error("Choose a destination before starting a walk group."); return; }
    setSelectedMeetingPoint(null);
    setIsSelectingMeetingPoint(false);
    setWalkGroupLeavingOffsetMin(10);
    setWalkGroupNote("");
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(false);
    setWalkGroupDialogMode("warning");
    setIsWalkGroupDialogOpen(true);
  }, [filteredLocations, myActiveWalkGroup, navigate, selectedDestination]);

  const closeWalkGroupDialog = useCallback(() => {
    setIsWalkGroupDialogOpen(false);
    setIsSelectingMeetingPoint(false);
    setWalkGroupDialogMode("warning");
  }, []);

  const beginMeetingPointSelection = useCallback(() => {
    setIsWalkGroupDialogOpen(false);
    setIsReportSheetOpen(false);
    setSelectedWalkGroupId(null);
    setIsSelectingMeetingPoint(true);
    snapSheetTo("peek");
    toast.message("Tap anywhere on the map to place the meeting point.");
  }, [snapSheetTo]);

  const handleCreateWalkGroup = useCallback(async () => {
    const dest = selectedDestination ?? filteredLocations[0] ?? null;
    if (!dest) { toast.error("Choose a destination first."); return; }
    if (!selectedMeetingPoint) { toast.error("Choose a meeting point first."); return; }
    setIsCreatingWalkGroup(true);
    try {
      const leavingAt = new Date(Date.now() + walkGroupLeavingOffsetMin * 60_000).toISOString();
      const created = await createWalkGroup({
        destinationName: dest.name, destinationCategory: dest.category, destinationSourceId: dest.id,
        destinationNodeId: dest.nearestNodeId, destinationLat: dest.coordinates[1], destinationLng: dest.coordinates[0],
        meetingPointName: selectedMeetingPoint.name, meetingCategory: selectedMeetingPoint.category,
        meetingSourceId: selectedMeetingPoint.sourceId, meetingNodeId: selectedMeetingPoint.nearestNodeId,
        meetingLat: selectedMeetingPoint.coordinates[1], meetingLng: selectedMeetingPoint.coordinates[0],
        leavingAt, note: walkGroupNote,
      });
      setMyActiveWalkGroup(created);
      setIsWalkGroupDialogOpen(false);
      setWalkGroupDialogMode("warning");
      await refreshWalkGroups();
      toast.success("Walk group created.");
      navigate(`/walk-group/${created.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the walk group."); }
    finally { setIsCreatingWalkGroup(false); }
  }, [filteredLocations, navigate, refreshWalkGroups, selectedDestination, selectedMeetingPoint, walkGroupLeavingOffsetMin, walkGroupNote]);

  const handleJoinWalkGroup = useCallback(async () => {
    if (!selectedWalkGroup) return;
    setIsJoiningWalkGroup(true);
    try {
      const joined = await joinWalkGroup(selectedWalkGroup.id);
      setMyActiveWalkGroup(joined);
      setSelectedWalkGroupId(null);
      await refreshWalkGroups();
      toast.success("Joined walk group.");
      navigate(`/walk-group/${joined.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't join this walk group."); }
    finally { setIsJoiningWalkGroup(false); }
  }, [navigate, refreshWalkGroups, selectedWalkGroup]);

  const openSelectedWalkGroup = useCallback(() => {
    if (!selectedWalkGroup) return;
    navigate(`/walk-group/${selectedWalkGroup.id}`);
  }, [navigate, selectedWalkGroup]);

  const openReportSheet = useCallback(() => {
    setIsWalkGroupDialogOpen(false);
    setIsSelectingMeetingPoint(false);
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(true);
    snapSheetTo("mid");
  }, [snapSheetTo]);

  const submitQuickReport = useCallback(async (report: (typeof REPORT_OPTIONS)[number]) => {
    const coordinates = userLocation?.coordinates ?? DEFAULT_CENTER;
    const severity =
      report.type === "dangerous" || report.type === "flood" ? 4 : 3;

    try {
      const created = await createSupabaseHazard({
        reportType: report.type,
        lat: coordinates[1],
        lng: coordinates[0],
        severity,
        description: report.description,
      });

      setHazards(current => [
        created,
        ...current.filter(item => item.id !== created.id),
      ]);
      setIsReportSheetOpen(false);

      if (report.type === "dangerous" || report.type === "flood") {
        showNotification({
          id: created.id,
          title:
            report.type === "flood"
              ? "Flooding reported on campus"
              : "Suspicious activity reported",
          message: `${report.label} has been reported nearby. Routes will try to avoid that area.`,
        });
      }

      toast.success(`${report.label} reported`, {
        description: "Thanks for letting other students know.",
      });
    } catch (error) {
      console.error(error);
      toast.error("Unable to submit the hazard report.");
    }
  }, [showNotification, userLocation?.coordinates]);

  // effects (all unchanged)
  useEffect(() => {
    void refreshWalkGroups();
    const id = window.setInterval(() => void refreshWalkGroups(), WALK_GROUP_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refreshWalkGroups]);

  useEffect(() => {
    let isCancelled = false;

    async function refreshHazards() {
      try {
        const rows = await loadSupabaseHazards();
        if (!isCancelled) {
          setHazards(rows);
        }
      } catch (error) {
        console.error(error);
      }
    }

    void refreshHazards();
    const id = window.setInterval(() => void refreshHazards(), HAZARD_REFRESH_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setViewportHeight(window.innerHeight);
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { sheetHeightRef.current = sheetHeight; }, [sheetHeight]);
  useEffect(() => { setSheetHeight((cur) => clamp(cur, snapHeights.peek, snapHeights.full)); }, [snapHeights]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { campusData: cd, placeData: pd } = await loadCampusPlaceData();
        if (!cancelled) { setCampusData(cd); setPlaceData(pd); }
      } catch (e) { console.error(e); toast.error("Couldn't load the campus map data."); }
      finally { if (!cancelled) setIsLoadingData(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    requestUserLocation();
    return () => { if (geoWatchIdRef.current != null) navigator.geolocation.clearWatch(geoWatchIdRef.current); };
  }, [requestUserLocation]);

  useEffect(() => { initializedTargetRef.current = null; autoPlannedRouteRef.current = null; }, [requestedCourseId, requestedRoom]);

  useEffect(() => {
    let cancelled = false;
    if (!isCourseRouteMode || requestedCourseId === null) { setTargetCourse(null); setCourseTargetError(null); return () => { cancelled = true; }; }
    const cached = getCachedSupabaseCourses()?.find((c) => c.id === requestedCourseId) ?? null;
    if (cached) { setTargetCourse(cached); setCourseTargetError(null); }
    void loadSupabaseCourses()
      .then((courses) => {
        if (cancelled) return;
        const match = courses.find((c) => c.id === requestedCourseId) ?? null;
        if (!match) { setTargetCourse(null); setCourseTargetError("This class couldn't be loaded."); return; }
        setTargetCourse(match); setCourseTargetError(null);
      })
      .catch((e) => { if (!cancelled) { setTargetCourse(null); setCourseTargetError(e instanceof Error ? e.message : "This class couldn't be loaded."); } });
    return () => { cancelled = true; };
  }, [isCourseRouteMode, requestedCourseId]);

  useEffect(() => {
    if (!placeData) return;
    if (isCourseRouteMode) {
      if (!targetCourse) return;
      const key = `course:${targetCourse.id}`;
      if (initializedTargetRef.current === key) return;
      initializedTargetRef.current = key;
      const loc = resolveCourseDestination(targetCourse, placeData.locations);
      if (!loc) { setSelectedDestinationId(null); setActiveRoute(null); setCourseTargetError("This class doesn't have a mapped room yet."); snapSheetTo("mid"); return; }
      setSelectedDestinationId(loc.id); setDestinationQuery(loc.name); setActiveRoute(null);
      setSelectedWalkGroupId(null); setIsReportSheetOpen(false); setCourseTargetError(null); snapSheetTo("mid"); return;
    }
    if (!requestedRoom) return;
    const key = `room:${requestedRoom}`;
    if (initializedTargetRef.current === key) return;
    initializedTargetRef.current = key;
    const loc = placeData.locations.find((l) => normalizeSearchText(l.name) === normalizeSearchText(requestedRoom));
    if (!loc) return;
    setSelectedDestinationId(loc.id); setDestinationQuery(loc.name); snapSheetTo("mid");
  }, [isCourseRouteMode, placeData, requestedRoom, snapSheetTo, targetCourse]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({ container: mapContainerRef.current, style: "mapbox://styles/mapbox/streets-v12", center: DEFAULT_CENTER, zoom: 16, attributionControl: false });
    markerVisibilityRef.current = bindManagedMapMarkerVisibility(map, () => [...classroomMarkersRef.current, ...walkGroupMarkersRef.current]);
    map.on("load", () => { if (!placeData) return; ensureMapSources(map, campusData, placeData, selectedDestinationId, activeRoute); fitMapToCampus(map, placeData); });
    mapRef.current = map;
    return () => {
      markerVisibilityRef.current?.destroy(); markerVisibilityRef.current = null;
      classroomMarkersRef.current.forEach(({ marker }) => marker.remove()); classroomMarkersRef.current = [];
      walkGroupMarkersRef.current.forEach(({ marker }) => marker.remove()); walkGroupMarkersRef.current = [];
      meetingPointMarkerRef.current?.remove(); meetingPointMarkerRef.current = null;
      selectedPopupRef.current?.remove(); userMarkerRef.current?.remove();
      map.remove(); mapRef.current = null;
    };
  }, [fitMapToCampus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placeData) return;
    const sync = () => {
      ensureMapSources(map, campusData, placeData, selectedDestinationId, activeRoute);
      renderSelectedPopup(selectedDestination);
      if (!selectedDestination && !activeRoute) fitMapToCampus(map, placeData);
    };
    if (map.isStyleLoaded()) sync(); else map.once("load", sync);
  }, [fitMapToCampus, activeRoute, campusData, placeData, renderSelectedPopup, selectedDestinationId, selectedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !selectedDestination || activeRoute) return;
    focusLocationOnMap(selectedDestination);
  }, [activeRoute, focusLocationOnMap, selectedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !activeRoute) return;
    fitMapToRoute(map, activeRoute.coordinates);
  }, [activeRoute, fitMapToRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placeData) return;
    const reset = () => { classroomMarkersRef.current.forEach(({ marker }) => marker.remove()); classroomMarkersRef.current = []; };
    const sync = () => {
      reset();
      for (const loc of placeData.locations) {
        const el = createCampusPlaceMarkerElement({ category: loc.category, title: loc.name, isSelected: selectedDestinationId === loc.id });
        el.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          if (isSelectingMeetingPoint) { resolveMeetingPointSelection(loc.coordinates); return; }
          handlePlaceTap(loc.id);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(loc.coordinates).addTo(map);
        classroomMarkersRef.current.push({ baseSizePx: 32, element: el, marker, priority: selectedDestinationId === loc.id ? 40 : 8 });
      }
      markerVisibilityRef.current?.sync();
    };
    if (map.isStyleLoaded()) sync(); else map.once("load", sync);
    return () => { try { map.off("load", sync); } catch {} reset(); };
  }, [handlePlaceTap, isSelectingMeetingPoint, placeData, resolveMeetingPointSelection, selectedDestinationId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const reset = () => { walkGroupMarkersRef.current.forEach(({ marker }) => marker.remove()); walkGroupMarkersRef.current = []; };
    const sync = () => {
      reset();
      for (const group of activeWalkGroups) {
        const el = buildWalkGroupMarkerElement(myActiveWalkGroup?.id === group.id);
        el.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          setSelectedWalkGroupId(group.id); setIsReportSheetOpen(false); setIsWalkGroupDialogOpen(false);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([group.meetingLng, group.meetingLat]).addTo(map);
        walkGroupMarkersRef.current.push({ baseSizePx: 40, element: el, marker, priority: myActiveWalkGroup?.id === group.id ? 30 : 22 });
      }
      markerVisibilityRef.current?.sync();
    };
    if (map.isStyleLoaded()) sync(); else map.once("load", sync);
    return () => { try { map.off("load", sync); } catch {} reset(); };
  }, [activeWalkGroups, myActiveWalkGroup?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedMeetingPoint) { meetingPointMarkerRef.current?.remove(); meetingPointMarkerRef.current = null; return; }
    const [lng, lat] = selectedMeetingPoint.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) { meetingPointMarkerRef.current?.remove(); meetingPointMarkerRef.current = null; return; }
    if (!meetingPointMarkerRef.current)
      meetingPointMarkerRef.current = new mapboxgl.Marker({ element: buildMeetingPointMarkerElement(), anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    meetingPointMarkerRef.current.setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<div style="font:600 12px/1.4 system-ui,sans-serif"><div>Meeting Point</div><div style="font-weight:400;color:#475569">${selectedMeetingPoint.name}</div></div>`));
  }, [selectedMeetingPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: mapboxgl.MapMouseEvent) => { if (!isSelectingMeetingPoint) return; resolveMeetingPointSelection([e.lngLat.lng, e.lngLat.lat]); };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [isSelectingMeetingPoint, resolveMeetingPointSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.getCanvas().style.cursor = isSelectingMeetingPoint ? "crosshair" : ""; } catch {}
    return () => { try { map.getCanvas().style.cursor = ""; } catch {} };
  }, [isSelectingMeetingPoint]);

  useEffect(() => { renderSelectedPopup(selectedDestination); }, [renderSelectedPopup, selectedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !userLocation) return;
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:16px;height:16px;border-radius:999px;background:#2563eb;border:3px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.4);";
      userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(userLocation.coordinates)
        .setPopup(new mapboxgl.Popup({ offset: 12, className: "fw-popup" }).setHTML("<strong style='color:#0f172a;font-size:12px;'>Your location</strong>"))
        .addTo(map);
    } else { userMarkerRef.current.setLngLat(userLocation.coordinates); }
  }, [userLocation]);

  // Sheet drag handlers
  const handleSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { startY: e.clientY, startHeight: sheetHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    const delta = dragStateRef.current.startY - e.clientY;
    setSheetHeight(clamp(dragStateRef.current.startHeight + delta, snapHeights.peek, snapHeights.full));
  };
  const handleSheetPointerUp = () => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    const nearest = (Object.entries(snapHeights) as [SheetSnap, number][])
      .sort((a, b) => Math.abs(a[1] - sheetHeight) - Math.abs(b[1] - sheetHeight))[0][0];
    snapSheetTo(nearest);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

        .fw-popup .mapboxgl-popup-content {
          background:#fff;border:1px solid #e2e8f0;color:#0f172a;border-radius:10px;
          box-shadow:0 4px 16px rgba(0,0,0,0.10);padding:8px 12px;
        }
        .fw-popup .mapboxgl-popup-tip { border-top-color:#fff;border-bottom-color:#fff; }
        .fw-scroll::-webkit-scrollbar { width:3px; }
        .fw-scroll::-webkit-scrollbar-track { background:transparent; }
        .fw-scroll::-webkit-scrollbar-thumb { background:#e2e8f0;border-radius:4px; }
      `}</style>

      {/* ── Floating controls (top-right column) ───────────────────────────── */}
      <div className="absolute top-0 right-0 z-20 pointer-events-none flex flex-col items-end gap-2.5 p-4 pt-10">

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur text-gray-700 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Walk group */}
        <button
          onClick={openWalkGroupDialog}
          disabled={!myActiveWalkGroup && !selectedDestination && !destinationQuery}
          className={`pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full shadow-lg border transition-all active:scale-95 disabled:opacity-40 ${
            myActiveWalkGroup
              ? "bg-[#006b36] text-white border-[#006b36]"
              : "bg-white/95 backdrop-blur text-[#006b36] border-gray-100 hover:bg-[#eaf6ef]"
          }`}
          aria-label={myActiveWalkGroup ? "Open walk group" : "Start walk group"}
        >
          <Users className="w-4 h-4" />
          {myActiveWalkGroup && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0d1f0f] px-1 text-[10px] font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
              {myActiveWalkGroup.memberCount}
            </span>
          )}
        </button>

        {/* Locate */}
        <button
          onClick={() => {
            if (userLocation && mapRef.current) mapRef.current.flyTo({ center: userLocation.coordinates, zoom: 17, duration: 900 });
            else requestUserLocation();
          }}
          className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur text-blue-600 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-blue-50 active:scale-95 transition-all"
          aria-label="Locate me"
        >
          <LocateFixed className="w-4 h-4" />
        </button>

        {/* Report */}
        <button
          onClick={openReportSheet}
          className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur text-amber-500 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-amber-50 active:scale-95 transition-all"
          aria-label="Report an issue"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
      </div>

      {/* ── GPS status pill (top-left) ─────────────────────────────────────── */}
      {/* <div className="absolute left-4 top-10 z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur border border-gray-100 rounded-full px-3 py-2 shadow-md">
          <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: locationStatusMeta.dotColor }} />
          <div>
            <p className="text-[11px] font-bold text-gray-800 leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
              {locationStatusMeta.label}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight">{locationStatusMeta.description}</p>
          </div>
        </div>
      </div> */}

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 bg-gray-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoadingData && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 flex flex-col items-center gap-3 max-w-[72%] text-center">
              <div className="w-11 h-11 rounded-full bg-[#eaf6ef] flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#006b36]" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900" style={{ fontFamily: "'Syne', sans-serif" }}>Mapping campus…</p>
                <p className="text-xs text-gray-400 mt-0.5">Loading rooms and pathways</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Sheet ────────────────────────────────────────────────── */}
        <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none">
          <div
            className="pointer-events-auto bg-white rounded-t-[28px] shadow-[0_-4px_32px_-4px_rgba(0,0,0,0.12)] border-t border-gray-100 flex flex-col transition-[height] duration-200 ease-out"
            style={{ height: sheetHeight }}
          >
            {/* Drag handle + header */}
            <div className="px-5 pt-3 pb-2 shrink-0">
              <div className="flex justify-center mb-3">
                <div
                  className="h-1 w-9 rounded-full bg-gray-200 cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={handleSheetPointerDown}
                  onPointerMove={handleSheetPointerMove}
                  onPointerUp={handleSheetPointerUp}
                  onPointerCancel={handleSheetPointerUp}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[19px] font-bold text-gray-900 leading-tight tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {isCourseRouteMode
                      ? (targetCourse ? targetCourse.courseCode : "Finding class…")
                      : (selectedDestination ? selectedDestination.name : "Where to?")}
                  </h2>
                  {isCourseRouteMode && targetCourse && (
                    <p className="mt-0.5 text-xs text-gray-400 truncate">{targetCourse.room ?? "Room TBA"} · {targetCourseSchedule}</p>
                  )}
                  {!isCourseRouteMode && selectedDestination && (
                    <p className="mt-0.5 text-xs text-[#006b36] font-medium truncate">
                      {getCategoryMeta(selectedDestination.category).label}
                    </p>
                  )}
                </div>
                {!isCourseRouteMode && selectedDestination && (
                  <button
                    onClick={() => { setActiveRoute(null); setSelectedDestinationId(null); setDestinationQuery(""); setSelectedWalkGroupId(null); setIsReportSheetOpen(false); if (mapRef.current && placeData) fitMapToCampus(mapRef.current, placeData); }}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable area */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 fw-scroll">

              {/* ── Course mode: destination card ── */}
              {isCourseRouteMode && (
                <div className="mb-4">
                  {!targetCourse && !courseTargetError && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin text-[#006b36] shrink-0" />
                      <span className="text-sm text-gray-500">Loading class info…</span>
                    </div>
                  )}
                  {courseTargetError && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">Route unavailable</p>
                        <p className="text-xs text-amber-700 mt-1">{courseTargetError}</p>
                      </div>
                    </div>
                  )}
                  {targetCourse && !courseTargetError && selectedDestination && (
                    <div className="rounded-2xl bg-[#f5fdf8] border border-[#d4f0e0] p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#006b36] flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#006b36] mb-1">{targetCourse.courseCode}</p>
                        <p className="text-sm font-bold text-gray-900 leading-snug">{targetCourse.courseName}</p>
                        <p className="text-xs text-gray-500 mt-1">{targetCourse.room ?? "Room TBA"}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Free mode: search bar ── */}
              {!isCourseRouteMode && (
                <div className="relative mb-4">
                  <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    value={destinationQuery}
                    onFocus={() => snapSheetTo("full")}
                    onChange={(e) => {
                      setDestinationQuery(e.target.value);
                      if (selectedDestination && e.target.value !== selectedDestination.name) {
                        setSelectedDestinationId(null); setActiveRoute(null); setSelectedWalkGroupId(null); setIsReportSheetOpen(false);
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleGoToDestination(); }}
                    placeholder="Search rooms, buildings…"
                    className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-[#006b36] focus:ring-2 focus:ring-[#006b36]/15 rounded-xl py-3 pl-10 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-all outline-none"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  />
                  {destinationQuery && (
                    <button onClick={() => { setDestinationQuery(""); setSelectedDestinationId(null); setActiveRoute(null); setSelectedWalkGroupId(null); setIsReportSheetOpen(false); }} className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* ── Active route card ── */}
              {activeRoute && (
                <div className="mb-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  {/* Hero strip */}
                  <div className="bg-gradient-to-r from-[#0d1f12] to-[#006b36] px-4 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50 mb-1">Route ready</p>
                      <p className="text-xl font-bold text-white leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>
                        {formatDurationLabel(activeRoute.durationSec)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50 mb-1">Distance</p>
                      <p className="text-base font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
                        {formatDistanceLabel(activeRoute.distanceM)}
                      </p>
                    </div>
                  </div>
                  {/* Destination row */}
                  <div className="bg-white px-4 py-3 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#eaf6ef] flex items-center justify-center shrink-0">
                      <Navigation className="w-3.5 h-3.5 text-[#006b36]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{activeRoute.targetNodeName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{activeRoute.mode} route · follow the blue line</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Walk mode selector ── */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-2.5 px-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Route type
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["quick", "shortcut", "longest"] as WalkMode[]).map((mode) => {
                    const meta = WALK_MODE_META[mode];
                    const Icon = meta.icon;
                    const isSelected = walkMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => { if (meta.disabled) return; setWalkMode(mode); setActiveRoute(null); setSelectedWalkGroupId(null); setIsReportSheetOpen(false); }}
                        disabled={meta.disabled}
                        className={`rounded-2xl flex flex-col items-center justify-center py-4 px-2 transition-all text-center relative overflow-hidden ${
                          isSelected
                            ? "bg-[#0d1f12] shadow-md"
                            : meta.disabled
                            ? "bg-gray-50 opacity-50 cursor-not-allowed border border-gray-100"
                            : "bg-gray-50 hover:bg-[#f0faf5] border border-gray-100"
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-2 ${isSelected ? "text-[#00e676]" : "text-gray-400"}`} />
                        <span className={`text-[11px] font-bold tracking-wide ${isSelected ? "text-white" : "text-gray-700"}`} style={{ fontFamily: "'Syne', sans-serif" }}>
                          {meta.label}
                        </span>
                        <span className={`text-[9px] mt-0.5 ${isSelected ? "text-white/50" : "text-gray-400"}`}>{meta.subtitle}</span>
                        {meta.disabled && (
                          <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Soon</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── No results ── */}
              {!isCourseRouteMode && normalizedDestinationQuery && visibleLocations.length === 0 && (
                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
                  <p className="text-sm font-semibold text-gray-700">Nothing matched "{destinationQuery}"</p>
                  <p className="text-xs text-gray-400 mt-1">Try a building name, room code, or floor.</p>
                </div>
              )}

              {/* ── Location list ── */}
              {!isCourseRouteMode && visibleLocations.length > 0 && (
                <div className="pb-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-2.5 px-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {normalizedDestinationQuery ? "Results" : "Browse campus"}
                  </p>
                  <div className="space-y-1.5">
                    {visibleLocations.map((loc) => {
                      const meta = getCategoryMeta(loc.category);
                      const Icon = meta.icon;
                      const isSelected = selectedDestinationId === loc.id;
                      return (
                        <button
                          key={loc.id}
                          onClick={() => selectLocation(loc)}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left ${
                            isSelected
                              ? "bg-[#eaf6ef] border border-[#c8f0d8]"
                              : "bg-white border border-gray-100 hover:bg-gray-50 active:bg-gray-100"
                          }`}
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: isSelected ? "#d0f0de" : "#f5f5f0" }}
                          >
                            <Icon className="w-4 h-4" style={{ color: isSelected ? "#006b36" : meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isSelected ? "text-[#006b36]" : "text-gray-900"}`}>
                              {loc.name}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {meta.label}
                            </p>
                          </div>
                          {isSelected
                            ? <div className="w-5 h-5 rounded-full bg-[#006b36] flex items-center justify-center shrink-0"><ChevronRight className="w-3 h-3 text-white" /></div>
                            : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom action bar ─────────────────────────────────────── */}
            <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 pb-8 flex items-center gap-2.5">
              {/* Clear (free mode only) */}
              {!isCourseRouteMode && (
                <button
                  disabled={!placeData}
                  onClick={() => { if (!placeData || !mapRef.current) return; setActiveRoute(null); setSelectedDestinationId(null); setDestinationQuery(""); setSelectedWalkGroupId(null); setIsReportSheetOpen(false); fitMapToCampus(mapRef.current, placeData); }}
                  className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0 disabled:opacity-40"
                  aria-label="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* GO button */}
              <button
                disabled={isPlanningRoute || (isCourseRouteMode ? (!targetCourse || !selectedDestination || Boolean(courseTargetError)) : (!selectedDestination && !destinationQuery))}
                onClick={() => void handleGoToDestination()}
                className={`h-12 rounded-xl font-bold text-sm tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isCourseRouteMode ? "w-full" : "flex-1"}`}
                style={{
                  background: isPlanningRoute ? "#ccc" : "linear-gradient(135deg, #006b36, #00a855)",
                  color: "#fff",
                  boxShadow: isPlanningRoute ? "none" : "0 4px 16px rgba(0,107,54,0.30)",
                  fontFamily: "'Syne', sans-serif",
                }}
              >
                {isPlanningRoute
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Planning…</span></>
                  : <><Navigation className="w-4 h-4 fill-current" /><span>GO</span></>}
              </button>
            </div>
          </div>
        </div>

        {/* Walk group preview card */}
        {selectedWalkGroup && (
          <div
            className="absolute inset-x-0 z-40 px-4 pointer-events-none"
            style={{ bottom: Math.min(sheetHeight + 12, viewportHeight - 260) }}
          >
            <WalkGroupPreviewCard
              group={selectedWalkGroup}
              isJoining={isJoiningWalkGroup}
              hasOtherActiveGroup={Boolean(myActiveWalkGroup && myActiveWalkGroup.id !== selectedWalkGroup.id)}
              onClose={() => setSelectedWalkGroupId(null)}
              onJoin={() => void handleJoinWalkGroup()}
              onOpen={openSelectedWalkGroup}
            />
          </div>
        )}

        {/* Meeting point selection banner */}
        {isSelectingMeetingPoint && (
          <div className="absolute left-1/2 top-24 z-40 w-[min(380px,calc(100%-2rem))] -translate-x-1/2 pointer-events-none">
            <div className="rounded-2xl border border-[#c8f0d8] bg-white/95 backdrop-blur px-4 py-3.5 shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#006b36] mb-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                Pick meeting point
              </p>
              <p className="text-sm font-semibold text-gray-900">Tap anywhere on the map</p>
              <p className="text-xs text-gray-400 mt-1">The closest named place will be used if it's nearby.</p>
            </div>
          </div>
        )}

        <WalkGroupCreateDialog
          open={isWalkGroupDialogOpen}
          mode={walkGroupDialogMode}
          destinationName={walkGroupDestination?.name ?? "Selected destination"}
          selectedMeetingPoint={selectedMeetingPoint ? { name: selectedMeetingPoint.name, coordinates: selectedMeetingPoint.coordinates } : null}
          isPickingMeetingPoint={isSelectingMeetingPoint}
          leavingOffsetMin={walkGroupLeavingOffsetMin}
          note={walkGroupNote}
          isSubmitting={isCreatingWalkGroup}
          onOpenChange={(open) => { if (!open) closeWalkGroupDialog(); }}
          onPickMeetingPoint={beginMeetingPointSelection}
          onLeavingOffsetChange={setWalkGroupLeavingOffsetMin}
          onNoteChange={setWalkGroupNote}
          onCancel={closeWalkGroupDialog}
          onContinue={() => setWalkGroupDialogMode("form")}
          onCreate={() => void handleCreateWalkGroup()}
        />

        <MapHazardReportSheet
          open={isReportSheetOpen}
          title="Report a path issue"
          subtitle="Flag something other students should know about."
          helperText=""
          options={REPORT_OPTIONS}
          onClose={() => setIsReportSheetOpen(false)}
          onSelect={submitQuickReport}
        />
      </div>
    </div>
  );
}
