import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
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
  createWalkGroup,
  joinWalkGroup,
  loadActiveWalkGroups,
  loadMyActiveWalkGroup,
  type WalkGroupRecord,
} from "@/lib/supabaseWalkGroups";
import {
  createCampusPlaceMarkerElement,
  createWalkGroupMeetingMarkerElement,
} from "@/lib/placeMarkerIcons";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const DEFAULT_CENTER: [number, number] = [-76.7499, 18.0053];
const DISCONNECTED_CAMPUS_ROUTE_PREFIX = "Campus graph disconnect:";
const CROSS_COMPONENT_ENTRY_NODE_LIMIT = 8;

function buildDisconnectedCampusRouteMessage(
  campusData: CampusDataset,
  startNodeIds: string[],
  destinationNodeId: string,
  destinationName: string
) {
  const destinationComponentId = getCampusNodeComponentId(
    campusData,
    destinationNodeId
  );
  const startComponentIds = Array.from(
    new Set(
      startNodeIds
        .map(nodeId => getCampusNodeComponentId(campusData, nodeId))
        .filter((componentId): componentId is number => componentId !== null)
    )
  );

  if (
    destinationComponentId === null ||
    startComponentIds.length === 0 ||
    startComponentIds.includes(destinationComponentId)
  ) {
    return null;
  }

  return `${DISCONNECTED_CAMPUS_ROUTE_PREFIX} ${destinationName} is on component ${destinationComponentId}, but the start side is on component(s) ${startComponentIds.join(
    ", "
  )}.`;
}

function isDisconnectedCampusRouteError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith(DISCONNECTED_CAMPUS_ROUTE_PREFIX)
  );
}

async function buildDestinationComponentEntryRoute(params: {
  campusData: CampusDataset;
  origin: Coord2;
  destination: PlaceLocation;
  walkMode: WalkMode;
  requestWalkingRoute: (waypoints: Coord2[]) => Promise<DirectionsRoute>;
}) {
  const {
    campusData,
    origin,
    destination,
    walkMode,
    requestWalkingRoute,
  } = params;
  const destinationComponentId = getCampusNodeComponentId(
    campusData,
    destination.nearestNodeId
  );
  if (destinationComponentId === null) {
    return null;
  }

  const candidateNodes = listCampusComponentNodes(campusData, destinationComponentId)
    .map(node => ({
      ...node,
      directDistanceM: haversineMeters(origin, node.coordinates),
    }))
    .sort(
      (left, right) =>
        left.directDistanceM - right.directDistanceM ||
        left.edgeCount - right.edgeCount
    )
    .slice(0, CROSS_COMPONENT_ENTRY_NODE_LIMIT);

  const routeOptions: Array<{
    combinedCoordinates: Coord2[];
    campusRoute: NonNullable<ReturnType<typeof planCampusRouteBetweenNodes>>;
    roadRoute: DirectionsRoute;
    totalDistanceM: number;
    totalDurationSec: number;
  }> = [];

  for (const candidateNode of candidateNodes) {
    try {
      const roadConnectorDistanceM = haversineMeters(
        origin,
        candidateNode.coordinates
      );
      const roadRoute =
        roadConnectorDistanceM < 3
          ? {
              coordinates: mergeRouteCoordinates(
                [origin],
                [candidateNode.coordinates]
              ),
              distanceM: roadConnectorDistanceM,
              durationSec: roadConnectorDistanceM / 1.35,
            }
          : await requestWalkingRoute([origin, candidateNode.coordinates]);

      const campusRoute = planCampusRouteBetweenNodes(
        campusData,
        candidateNode.nodeId,
        destination.nearestNodeId,
        getCampusRouteMode(walkMode)
      );
      if (!campusRoute) {
        continue;
      }

      const lastCampusCoord =
        campusRoute.coordinates[campusRoute.coordinates.length - 1];
      const finalConnectorDistanceM = lastCampusCoord
        ? haversineMeters(lastCampusCoord, destination.coordinates)
        : 0;
      const finalConnectorCoordinates =
        finalConnectorDistanceM > 1 ? [destination.coordinates] : [];

      routeOptions.push({
        combinedCoordinates: mergeRouteCoordinates(
          roadRoute.coordinates,
          campusRoute.coordinates,
          finalConnectorCoordinates
        ),
        campusRoute,
        roadRoute,
        totalDistanceM:
          roadRoute.distanceM + campusRoute.distanceM + finalConnectorDistanceM,
        totalDurationSec:
          roadRoute.durationSec +
          campusRoute.walkTimeSec +
          finalConnectorDistanceM / 1.2,
      });
    } catch {
      continue;
    }
  }

  return (
    routeOptions.sort((a, b) => a.totalDistanceM - b.totalDistanceM)[0] ?? null
  );
}

type Coord2 = [number, number];
type SheetSnap = "peek" | "mid" | "full";
type LocationStatus = "locating" | "ready" | "denied" | "unsupported";
type WalkMode = "quick" | "shortcut" | "longest";
type WalkGroupDialogMode = "warning" | "form";
const WALK_GROUP_REFRESH_MS = 15000;

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

function findClosestMeetingPoint(
  places: PlaceLocation[],
  coordinates: Coord2
): PlaceLocation | null {
  let best: PlaceLocation | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    const distance = haversineMeters(coordinates, place.coordinates);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }

  return best;
}

const WALK_MODE_META: Record<
  WalkMode,
  { label: string; subtitle: string; disabled?: boolean }
> = {
  quick: { label: "Quick", subtitle: "Fastest route" },
  shortcut: { label: "Shortcut", subtitle: "Footpaths soon", disabled: true },
  longest: { label: "Scenic", subtitle: "Via Ring Road" },
};

const REPORT_OPTIONS: HazardReportOption[] = [
  {
    type: "lights_not_working",
    label: "Lights Out",
    description: "Poor visibility or lamps out",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  {
    type: "rainy",
    label: "Rainy",
    description: "Wet walkways and light rain",
    color: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
  },
  {
    type: "flood",
    label: "Flood",
    description: "Standing water or flooded path",
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
  },
  {
    type: "dangerous",
    label: "Dangerous",
    description: "Unsafe area or suspicious activity",
    color: "#dc2626",
    bg: "#fff1f2",
    border: "#fecdd3",
  },
  {
    type: "blocked_path",
    label: "Blocked Path",
    description: "Path closed or hard to pass",
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  {
    type: "obstruction",
    label: "Obstruction",
    description: "Debris, cones, or temporary obstacle",
    color: "#7c3aed",
    bg: "#faf5ff",
    border: "#ddd6fe",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getWalkModeMeta(mode: WalkMode) {
  return WALK_MODE_META[mode];
}

function getCampusRouteMode(mode: WalkMode) {
  return mode === "longest" ? "scenic" : "shortest";
}

function formatDistanceLabel(distanceM: number) {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return "0 m";
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function formatDurationLabel(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return "<1 min";
  const totalMinutes = Math.max(1, Math.round(durationSec / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function createBoundsFromCoordinates(coordinates: Coord2[]) {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  if (!Number.isFinite(west)) {
    return {
      west: DEFAULT_CENTER[0] - 0.001,
      south: DEFAULT_CENTER[1] - 0.001,
      east: DEFAULT_CENTER[0] + 0.001,
      north: DEFAULT_CENTER[1] + 0.001,
    };
  }
  return { west, south, east, north };
}

function ensureMapSources(
  map: mapboxgl.Map,
  _campusData: CampusDataset | null,
  _placeData: PlaceDataset,
  _selectedDestinationId: string | null,
  activeRoute: ActiveRoute | null
) {
  const routeCollection = createRouteFeatureCollection(
    activeRoute?.coordinates ?? []
  );

  const routeSource = map.getSource("campus-active-route") as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (routeSource) routeSource.setData(routeCollection);
  else
    map.addSource("campus-active-route", {
      type: "geojson",
      data: routeCollection,
    });

  if (!map.getLayer("campus-active-route-casing")) {
    map.addLayer({
      id: "campus-active-route-casing",
      type: "line",
      source: "campus-active-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1e40af", "line-width": 10, "line-opacity": 0.9 },
    });
  }
  if (!map.getLayer("campus-active-route-line")) {
    map.addLayer({
      id: "campus-active-route-line",
      type: "line",
      source: "campus-active-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#3b82f6", "line-width": 5, "line-opacity": 0.95 },
    });
  }
}

export default function FindWayPage() {
  const [, navigate] = useLocation();
  const cachedCampusBundle = getCachedCampusPlaceData();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const classroomMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const walkGroupMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const meetingPointMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const selectedPopupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  const initializedRoomRef = useRef(false);
  const sheetHeightRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );

  const [placeData, setPlaceData] = useState<PlaceDataset | null>(
    cachedCampusBundle?.placeData ?? null
  );
  const [campusData, setCampusData] = useState<CampusDataset | null>(
    cachedCampusBundle?.campusData ?? null
  );
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [activeWalkGroups, setActiveWalkGroups] = useState<WalkGroupRecord[]>([]);
  const [myActiveWalkGroup, setMyActiveWalkGroup] =
    useState<WalkGroupRecord | null>(null);
  const [selectedWalkGroupId, setSelectedWalkGroupId] = useState<string | null>(
    null
  );
  const [isLoadingData, setIsLoadingData] = useState(!cachedCampusBundle);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [isCreatingWalkGroup, setIsCreatingWalkGroup] = useState(false);
  const [isJoiningWalkGroup, setIsJoiningWalkGroup] = useState(false);
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("locating");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState<
    string | null
  >(null);
  const [walkMode, setWalkMode] = useState<WalkMode>("quick");
  const [isWalkGroupDialogOpen, setIsWalkGroupDialogOpen] = useState(false);
  const [walkGroupDialogMode, setWalkGroupDialogMode] =
    useState<WalkGroupDialogMode>("warning");
  const [isSelectingMeetingPoint, setIsSelectingMeetingPoint] = useState(false);
  const [selectedMeetingPoint, setSelectedMeetingPoint] =
    useState<SelectedMeetingPoint | null>(null);
  const [walkGroupLeavingOffsetMin, setWalkGroupLeavingOffsetMin] = useState(10);
  const [walkGroupNote, setWalkGroupNote] = useState("");
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [sheetHeight, setSheetHeight] = useState(240);

  const normalizedDestinationQuery = useMemo(
    () => normalizeSearchText(destinationQuery),
    [destinationQuery]
  );

  const snapHeights = useMemo(() => {
    const peek = 184;
    const mid = Math.round(clamp(viewportHeight * 0.45, 340, 460));
    const full = Math.round(
      clamp(viewportHeight * 0.85, 520, viewportHeight - 40)
    );
    return { peek, mid, full };
  }, [viewportHeight]);

  const selectedDestination = useMemo(
    () =>
      placeData?.locations.find(l => l.id === selectedDestinationId) ?? null,
    [placeData?.locations, selectedDestinationId]
  );

  const selectedWalkGroup = useMemo(
    () =>
      activeWalkGroups.find((group) => group.id === selectedWalkGroupId) ?? null,
    [activeWalkGroups, selectedWalkGroupId]
  );

  const filteredLocations = useMemo(() => {
    const locations = placeData?.locations ?? [];
    if (!normalizedDestinationQuery) return locations.slice(0, 16);
    return [...locations]
      .sort((a, b) => {
        const an = normalizeSearchText(a.name);
        const bn = normalizeSearchText(b.name);
        const as_ =
          an === normalizedDestinationQuery
            ? 0
            : an.startsWith(normalizedDestinationQuery)
              ? 1
              : an.includes(normalizedDestinationQuery)
                ? 2
                : 3;
        const bs_ =
          bn === normalizedDestinationQuery
            ? 0
            : bn.startsWith(normalizedDestinationQuery)
              ? 1
              : bn.includes(normalizedDestinationQuery)
                ? 2
                : 3;
        return as_ - bs_ || a.name.localeCompare(b.name);
      })
      .filter(l =>
        normalizeSearchText(l.name).includes(normalizedDestinationQuery)
      )
      .slice(0, 12);
  }, [normalizedDestinationQuery, placeData?.locations]);
  const walkGroupDestination = selectedDestination ?? filteredLocations[0] ?? null;

  const visibleLocations = useMemo(() => {
    if (normalizedDestinationQuery) return filteredLocations;
    return filteredLocations
      .filter(l => l.id !== selectedDestinationId)
      .slice(0, 8);
  }, [filteredLocations, normalizedDestinationQuery, selectedDestinationId]);

  const locationStatusMeta = useMemo(() => {
    switch (locationStatus) {
      case "ready":
        return {
          label: "Live Location",
          description: userLocation
            ? `±${Math.max(1, Math.round(userLocation.accuracyM))} m`
            : "Location locked",
          dotColor: "#22c55e",
        };
      case "denied":
        return {
          label: "Location Off",
          description: "Tap locate to enable GPS",
          dotColor: "#f59e0b",
        };
      case "unsupported":
        return {
          label: "Unavailable",
          description: "Device cannot share location",
          dotColor: "#ef4444",
        };
      default:
        return {
          label: "Finding You…",
          description: "Checking GPS signal",
          dotColor: "#3b82f6",
        };
    }
  }, [locationStatus, userLocation]);

  const snapSheetTo = useCallback(
    (nextSnap: SheetSnap) => setSheetHeight(snapHeights[nextSnap]),
    [snapHeights]
  );

  const fitMapToCampus = useCallback(
    (map: mapboxgl.Map, nextPlaceData: PlaceDataset) => {
      const coordinates = nextPlaceData.locations.map(l => l.coordinates);
      const boundsData = createBoundsFromCoordinates(coordinates);
      const bounds = new mapboxgl.LngLatBounds(
        [boundsData.west, boundsData.south],
        [boundsData.east, boundsData.north]
      );
      map.fitBounds(bounds, {
        padding: {
          top: 120,
          right: 32,
          bottom: sheetHeightRef.current + 24,
          left: 32,
        },
        maxZoom: 17,
      });
    },
    []
  );

  const fitMapToRoute = useCallback(
    (map: mapboxgl.Map, coordinates: Coord2[]) => {
      if (coordinates.length === 0) return;
      const boundsData = createBoundsFromCoordinates(coordinates);
      const bounds = new mapboxgl.LngLatBounds(
        [boundsData.west, boundsData.south],
        [boundsData.east, boundsData.north]
      );
      map.fitBounds(bounds, {
        padding: {
          top: 120,
          right: 32,
          bottom: sheetHeightRef.current + 32,
          left: 32,
        },
        maxZoom: 18,
      });
    },
    []
  );

  const focusLocationOnMap = useCallback((location: PlaceLocation) => {
    mapRef.current?.flyTo({
      center: location.coordinates,
      zoom: 18,
      duration: 900,
    });
  }, []);

  const selectLocation = useCallback(
    (location: PlaceLocation) => {
      setSelectedDestinationId(location.id);
      setDestinationQuery(location.name);
      setActiveRoute(null);
      setSelectedWalkGroupId(null);
      setIsReportSheetOpen(false);
      snapSheetTo("mid");
      focusLocationOnMap(location);
    },
    [focusLocationOnMap, snapSheetTo]
  );

  const resolveMeetingPointSelection = useCallback(
    (coordinates: Coord2) => {
      const nearestPlace =
        placeData?.locations && placeData.locations.length > 0
          ? findClosestMeetingPoint(placeData.locations, coordinates)
          : null;
      const nearestPlaceDistanceM = nearestPlace
        ? haversineMeters(nearestPlace.coordinates, coordinates)
        : Number.POSITIVE_INFINITY;
      const snap = campusData
        ? findNearestCampusPathSnap(campusData, coordinates)
        : null;
      const nearestNodeId = snap
        ? snap.distanceToStartM <= snap.distanceToEndM
          ? snap.startNodeId
          : snap.endNodeId
        : undefined;

      setSelectedMeetingPoint({
        name:
          nearestPlace && nearestPlaceDistanceM <= 35
            ? nearestPlace.name
            : "Custom Meeting Point",
        coordinates,
        category:
          nearestPlace && nearestPlaceDistanceM <= 35
            ? nearestPlace.category
            : undefined,
        sourceId:
          nearestPlace && nearestPlaceDistanceM <= 35
            ? nearestPlace.id
            : undefined,
        nearestNodeId,
      });
      setIsSelectingMeetingPoint(false);
      setIsWalkGroupDialogOpen(true);
      setWalkGroupDialogMode("form");
      snapSheetTo("mid");
      toast.success("Meeting point selected.");
    },
    [campusData, placeData?.locations, snapSheetTo]
  );

  const renderSelectedPopup = useCallback((location: PlaceLocation | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (!location) {
      selectedPopupRef.current?.remove();
      selectedPopupRef.current = null;
      return;
    }
    const categoryMeta = getCategoryMeta(location.category);
    const popupOffset = location.category === "classroom" ? 34 : 18;
    const popupHtml = `
      <div style="padding:8px 10px;background:#fff;color:#0f172a;border-radius:10px;min-width:130px;font-family:system-ui,-apple-system,sans-serif;">
        <div style="font-size:13px;font-weight:700;line-height:1.3;color:#0f172a">${location.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${categoryMeta.label}</div>
      </div>`;
    if (!selectedPopupRef.current) {
      selectedPopupRef.current = new mapboxgl.Popup({
        offset: popupOffset,
        closeButton: false,
        closeOnClick: false,
        className: "light-theme-popup",
      });
    }
    selectedPopupRef.current
      .setOffset(popupOffset)
      .setLngLat(location.coordinates)
      .setHTML(popupHtml);
    if (!selectedPopupRef.current.isOpen()) selectedPopupRef.current.addTo(map);
  }, []);

  const handlePlaceTap = useCallback(
    (locationId: string) => {
      const location = placeData?.locations.find(
        item => item.id === locationId
      );
      if (!location) return;
      selectLocation(location);
      renderSelectedPopup(location);
    },
    [placeData, renderSelectedPopup, selectLocation]
  );

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      return;
    }
    if (geoWatchIdRef.current != null)
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
    setLocationStatus("locating");
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const nextLocation = {
          coordinates: [
            position.coords.longitude,
            position.coords.latitude,
          ] as Coord2,
          accuracyM: position.coords.accuracy,
        };
        setUserLocation(nextLocation);
        setLocationStatus("ready");
        if (mapRef.current && !hasCenteredOnUserRef.current) {
          mapRef.current.flyTo({
            center: nextLocation.coordinates,
            zoom: 17,
            duration: 1100,
          });
          hasCenteredOnUserRef.current = true;
        }
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const requestWalkingRoute = useCallback(
    async (waypoints: Coord2[]): Promise<DirectionsRoute> => {
      if (!MAPBOX_TOKEN) throw new Error("Mapbox token is missing.");
      if (waypoints.length < 2)
        throw new Error("At least two coordinates are required.");
      const url = new URL(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${waypoints.map(p => `${p[0]},${p[1]}`).join(";")}`
      );
      url.searchParams.set("alternatives", "false");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set("overview", "full");
      url.searchParams.set("steps", "false");
      url.searchParams.set("access_token", MAPBOX_TOKEN);
      const response = await fetch(url.toString());
      if (!response.ok)
        throw new Error(`Mapbox directions failed (${response.status}).`);
      const data = (await response.json()) as {
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: number[][] };
        }>;
      };
      const route = data.routes?.[0];
      const coordinates = Array.isArray(route?.geometry?.coordinates)
        ? route!
            .geometry!.coordinates!.filter(
              c => Array.isArray(c) && c.length >= 2
            )
            .map(c => [c[0], c[1]] as Coord2)
        : [];
      if (coordinates.length < 2)
        throw new Error("Mapbox directions did not return a usable path.");
      return {
        coordinates,
        distanceM: route?.distance ?? 0,
        durationSec: route?.duration ?? 0,
      };
    },
    []
  );

  const handleGoToDestination = useCallback(async () => {
    const destination = selectedDestination ?? filteredLocations[0] ?? null;
    if (!destination) {
      toast.error("Select a room first.");
      return;
    }
    if (!userLocation) {
      requestUserLocation();
      toast.error("Your location is needed before routing.");
      return;
    }
    if (!campusData) {
      toast.error("Campus routes are still loading.");
      return;
    }
    if (walkMode === "shortcut") {
      toast.error("Shortcut mode is not ready yet.");
      return;
    }
    if (selectedDestinationId !== destination.id) {
      setSelectedDestinationId(destination.id);
      setDestinationQuery(destination.name);
    }
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(false);
    setIsPlanningRoute(true);
    try {
      const userSnap = findNearestCampusPathSnap(
        campusData,
        userLocation.coordinates
      );
      const destinationComponentId = getCampusNodeComponentId(
        campusData,
        destination.nearestNodeId
      );
      const startOptions = userSnap
        ? [
            {
              nodeId: userSnap.startNodeId,
              nodeCoordinates: userSnap.startNodeCoordinates,
              connectorDistanceM: userSnap.distanceToStartM,
            },
            {
              nodeId: userSnap.endNodeId,
              nodeCoordinates: userSnap.endNodeCoordinates,
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
        combinedCoordinates: Coord2[];
        campusRoute: NonNullable<
          ReturnType<typeof planCampusRouteBetweenNodes>
        >;
        roadRoute: DirectionsRoute;
        totalDistanceM: number;
        totalDurationSec: number;
      }> = [];

      if (userSnap && connectedStartOptions.length > 0) {
        const roadConnectorDistanceM = haversineMeters(
          userLocation.coordinates,
          userSnap.coordinates
        );
        const roadRoute =
          roadConnectorDistanceM < 3
            ? {
                coordinates: mergeRouteCoordinates(
                  [userLocation.coordinates],
                  [userSnap.coordinates]
                ),
                distanceM: roadConnectorDistanceM,
                durationSec: roadConnectorDistanceM / 1.35,
              }
            : await requestWalkingRoute([
                userLocation.coordinates,
                userSnap.coordinates,
              ]);

        routeOptions.push(
          ...connectedStartOptions
            .map(option => {
              const campusRoute = planCampusRouteBetweenNodes(
                campusData,
                option.nodeId,
                destination.nearestNodeId,
                getCampusRouteMode(walkMode)
              );
              if (!campusRoute) return null;

              const lastCampusCoord =
                campusRoute.coordinates[campusRoute.coordinates.length - 1];
              const finalConnectorDistanceM = lastCampusCoord
                ? haversineMeters(lastCampusCoord, destination.coordinates)
                : 0;
              const finalConnectorCoordinates =
                finalConnectorDistanceM > 1 ? [destination.coordinates] : [];
              const combinedCoordinates = mergeRouteCoordinates(
                roadRoute.coordinates,
                [userSnap.coordinates],
                campusRoute.coordinates,
                finalConnectorCoordinates
              );

              return {
                combinedCoordinates,
                campusRoute,
                roadRoute,
                totalDistanceM:
                  roadRoute.distanceM +
                  option.connectorDistanceM +
                  campusRoute.distanceM +
                  finalConnectorDistanceM,
                totalDurationSec:
                  roadRoute.durationSec +
                  option.connectorDistanceM / 1.35 +
                  campusRoute.walkTimeSec +
                  finalConnectorDistanceM / 1.2,
              };
            })
            .filter((route): route is NonNullable<typeof route> => route !== null)
        );
      }

      if (routeOptions.length === 0) {
        const fallbackRoute = await buildDestinationComponentEntryRoute({
          campusData,
          origin: userLocation.coordinates,
          destination,
          walkMode,
          requestWalkingRoute,
        });
        if (fallbackRoute) {
          routeOptions.push(fallbackRoute);
        }
      }

      const bestRoute = routeOptions.sort(
        (a, b) => a.totalDistanceM - b.totalDistanceM
      )[0];
      if (!bestRoute) {
        const disconnectedMessage = buildDisconnectedCampusRouteMessage(
          campusData,
          startOptions.map(option => option.nodeId),
          destination.nearestNodeId,
          destination.name
        );
        if (disconnectedMessage) {
          throw new Error(disconnectedMessage);
        }

        throw new Error("No route could be built to the selected room.");
      }
      setActiveRoute({
        mode: walkMode,
        coordinates: bestRoute.combinedCoordinates,
        distanceM: bestRoute.totalDistanceM,
        roadDistanceM: bestRoute.roadRoute.distanceM,
        campusDistanceM: bestRoute.campusRoute.distanceM,
        durationSec: bestRoute.totalDurationSec,
        entranceNodeName: "campus path",
        targetNodeName: destination.name,
      });
      renderSelectedPopup(destination);
      snapSheetTo("mid");
      if (mapRef.current)
        fitMapToRoute(mapRef.current, bestRoute.combinedCoordinates);
    } catch (error) {
      console.error(error);
      toast.error(
        isDisconnectedCampusRouteError(error)
          ? "Those nodes are on a disconnected part of the campus graph."
          : "Unable to build the combined route right now."
      );
    } finally {
      setIsPlanningRoute(false);
    }
  }, [
    campusData,
    filteredLocations,
    fitMapToRoute,
    renderSelectedPopup,
    requestUserLocation,
    requestWalkingRoute,
    selectedDestination,
    selectedDestinationId,
    snapSheetTo,
    userLocation,
    walkMode,
  ]);

  const refreshWalkGroups = useCallback(async () => {
    try {
      const [groups, activeGroup] = await Promise.all([
        loadActiveWalkGroups(),
        loadMyActiveWalkGroup().catch(() => null),
      ]);
      setActiveWalkGroups(groups);
      setMyActiveWalkGroup(activeGroup);
      setSelectedWalkGroupId((current) =>
        current && !groups.some((group) => group.id === current) ? null : current
      );
    } catch (error) {
      console.error(error);
    }
  }, []);

  const openWalkGroupDialog = useCallback(() => {
    if (myActiveWalkGroup) {
      navigate(`/walk-group/${myActiveWalkGroup.id}`);
      return;
    }

    const destination = selectedDestination ?? filteredLocations[0] ?? null;
    if (!destination) {
      toast.error("Choose a destination before starting a walk group.");
      return;
    }
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
    toast.message("Tap the map to place the Walk Group meeting marker.");
  }, [snapSheetTo]);

  const handleCreateWalkGroup = useCallback(async () => {
    const destination = selectedDestination ?? filteredLocations[0] ?? null;
    if (!destination) {
      toast.error("Choose a destination first.");
      return;
    }
    if (!selectedMeetingPoint) {
      toast.error("Choose a meeting point first.");
      return;
    }

    setIsCreatingWalkGroup(true);
    try {
      const leavingAt = new Date(
        Date.now() + walkGroupLeavingOffsetMin * 60_000
      ).toISOString();
      const createdGroup = await createWalkGroup({
        destinationName: destination.name,
        destinationCategory: destination.category,
        destinationSourceId: destination.id,
        destinationNodeId: destination.nearestNodeId,
        destinationLat: destination.coordinates[1],
        destinationLng: destination.coordinates[0],
        meetingPointName: selectedMeetingPoint.name,
        meetingCategory: selectedMeetingPoint.category,
        meetingSourceId: selectedMeetingPoint.sourceId,
        meetingNodeId: selectedMeetingPoint.nearestNodeId,
        meetingLat: selectedMeetingPoint.coordinates[1],
        meetingLng: selectedMeetingPoint.coordinates[0],
        leavingAt,
        note: walkGroupNote,
      });

      setMyActiveWalkGroup(createdGroup);
      setIsWalkGroupDialogOpen(false);
      setWalkGroupDialogMode("warning");
      await refreshWalkGroups();
      toast.success("Walk group created.");
      navigate(`/walk-group/${createdGroup.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create the walk group right now."
      );
    } finally {
      setIsCreatingWalkGroup(false);
    }
  }, [
    filteredLocations,
    navigate,
    refreshWalkGroups,
    selectedDestination,
    selectedMeetingPoint,
    walkGroupLeavingOffsetMin,
    walkGroupNote,
  ]);

  const handleJoinWalkGroup = useCallback(async () => {
    if (!selectedWalkGroup) {
      return;
    }

    setIsJoiningWalkGroup(true);
    try {
      const joinedGroup = await joinWalkGroup(selectedWalkGroup.id);
      setMyActiveWalkGroup(joinedGroup);
      setSelectedWalkGroupId(null);
      await refreshWalkGroups();
      toast.success("Joined walk group.");
      navigate(`/walk-group/${joinedGroup.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to join this walk group right now."
      );
    } finally {
      setIsJoiningWalkGroup(false);
    }
  }, [navigate, refreshWalkGroups, selectedWalkGroup]);

  const openSelectedWalkGroup = useCallback(() => {
    if (!selectedWalkGroup) {
      return;
    }
    navigate(`/walk-group/${selectedWalkGroup.id}`);
  }, [navigate, selectedWalkGroup]);

  const openReportSheet = useCallback(() => {
    setIsWalkGroupDialogOpen(false);
    setIsSelectingMeetingPoint(false);
    setSelectedWalkGroupId(null);
    setIsReportSheetOpen(true);
    snapSheetTo("mid");
  }, [snapSheetTo]);

  const submitQuickReport = useCallback(
    (report: (typeof REPORT_OPTIONS)[number]) => {
      setIsReportSheetOpen(false);
      toast.success(`${report.label} reported`, {
        description: "Thanks. This is a UI-only demo for now.",
      });
    },
    []
  );

  useEffect(() => {
    void refreshWalkGroups();
    const intervalId = window.setInterval(() => {
      void refreshWalkGroups();
    }, WALK_GROUP_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshWalkGroups]);

  useEffect(() => {
    setViewportHeight(window.innerHeight);
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    sheetHeightRef.current = sheetHeight;
  }, [sheetHeight]);
  useEffect(() => {
    setSheetHeight(current =>
      clamp(current, snapHeights.peek, snapHeights.full)
    );
  }, [snapHeights]);

  useEffect(() => {
    let isCancelled = false;
    async function loadMapData() {
      try {
        const { campusData: nextCampusData, placeData: nextPlaceData } =
          await loadCampusPlaceData();
        if (isCancelled) return;
        setCampusData(nextCampusData);
        setPlaceData(nextPlaceData);
      } catch (error) {
        console.error(error);
        toast.error("Unable to load the campus room and route datasets.");
      } finally {
        if (!isCancelled) setIsLoadingData(false);
      }
    }
    loadMapData();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    requestUserLocation();
    return () => {
      if (geoWatchIdRef.current != null)
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
    };
  }, [requestUserLocation]);

  useEffect(() => {
    if (!placeData || initializedRoomRef.current) return;
    initializedRoomRef.current = true;
    const room = new URLSearchParams(window.location.search).get("room");
    if (!room) return;
    const matchedLocation = placeData.locations.find(
      l => normalizeSearchText(l.name) === normalizeSearchText(room)
    );
    if (!matchedLocation) return;
    setSelectedDestinationId(matchedLocation.id);
    setDestinationQuery(matchedLocation.name);
    snapSheetTo("mid");
  }, [placeData, snapSheetTo]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: 16,
    });
    map.on("load", () => {
      if (!placeData) return;
      ensureMapSources(
        map,
        campusData,
        placeData,
        selectedDestinationId,
        activeRoute
      );
      fitMapToCampus(map, placeData);
    });
    mapRef.current = map;
    return () => {
      classroomMarkersRef.current.forEach(m => m.remove());
      classroomMarkersRef.current = [];
      walkGroupMarkersRef.current.forEach(m => m.remove());
      walkGroupMarkersRef.current = [];
      meetingPointMarkerRef.current?.remove();
      meetingPointMarkerRef.current = null;
      selectedPopupRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [fitMapToCampus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placeData) return;
    const syncMap = () => {
      ensureMapSources(
        map,
        campusData,
        placeData,
        selectedDestinationId,
        activeRoute
      );
      renderSelectedPopup(selectedDestination);
      if (!selectedDestination && !activeRoute) fitMapToCampus(map, placeData);
    };
    if (map.isStyleLoaded()) syncMap();
    else map.once("load", syncMap);
  }, [
    fitMapToCampus,
    activeRoute,
    campusData,
    placeData,
    renderSelectedPopup,
    selectedDestinationId,
    selectedDestination,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !selectedDestination || activeRoute)
      return;
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
    const resetMarkers = () => {
      classroomMarkersRef.current.forEach(m => m.remove());
      classroomMarkersRef.current = [];
    };
    const syncPlaceMarkers = () => {
      resetMarkers();
      for (const location of placeData.locations) {
        const el = createCampusPlaceMarkerElement({
          category: location.category,
          title: location.name,
          isSelected: selectedDestinationId === location.id,
        });
        el.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (isSelectingMeetingPoint) {
            resolveMeetingPointSelection(location.coordinates);
            return;
          }
          handlePlaceTap(location.id);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(location.coordinates)
          .addTo(map);
        classroomMarkersRef.current.push(marker);
      }
    };
    if (map.isStyleLoaded()) syncPlaceMarkers();
    else map.once("load", syncPlaceMarkers);
    return () => {
      try {
        map.off("load", syncPlaceMarkers);
      } catch {}
      resetMarkers();
    };
  }, [
    handlePlaceTap,
    isSelectingMeetingPoint,
    placeData,
    resolveMeetingPointSelection,
    selectedDestinationId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const resetMarkers = () => {
      walkGroupMarkersRef.current.forEach((marker) => marker.remove());
      walkGroupMarkersRef.current = [];
    };

    const syncWalkGroupMarkers = () => {
      resetMarkers();

      for (const group of activeWalkGroups) {
        const markerElement = buildWalkGroupMarkerElement(
          myActiveWalkGroup?.id === group.id
        );
        markerElement.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedWalkGroupId(group.id);
          setIsReportSheetOpen(false);
          setIsWalkGroupDialogOpen(false);
        });

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat([group.meetingLng, group.meetingLat])
          .addTo(map);

        walkGroupMarkersRef.current.push(marker);
      }
    };

    if (map.isStyleLoaded()) {
      syncWalkGroupMarkers();
    } else {
      map.once("load", syncWalkGroupMarkers);
    }

    return () => {
      try {
        map.off("load", syncWalkGroupMarkers);
      } catch {}
      resetMarkers();
    };
  }, [activeWalkGroups, myActiveWalkGroup?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!selectedMeetingPoint) {
      meetingPointMarkerRef.current?.remove();
      meetingPointMarkerRef.current = null;
      return;
    }

    const [meetingLng, meetingLat] = selectedMeetingPoint.coordinates;
    if (!Number.isFinite(meetingLng) || !Number.isFinite(meetingLat)) {
      meetingPointMarkerRef.current?.remove();
      meetingPointMarkerRef.current = null;
      return;
    }

    if (!meetingPointMarkerRef.current) {
      meetingPointMarkerRef.current = new mapboxgl.Marker({
        element: buildMeetingPointMarkerElement(),
        anchor: "center",
      })
        .setLngLat([meetingLng, meetingLat])
        .addTo(map);
    }

    meetingPointMarkerRef.current
      .setLngLat([meetingLng, meetingLat])
      .setPopup(
        new mapboxgl.Popup({ offset: 16 }).setHTML(
          `<div style="font:600 12px/1.4 system-ui,sans-serif"><div>Meeting Point</div><div style="font-weight:400;color:#475569">${selectedMeetingPoint.name}</div></div>`
        )
      );
  }, [selectedMeetingPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleMapClick = (event: mapboxgl.MapMouseEvent) => {
      if (!isSelectingMeetingPoint) {
        return;
      }

      resolveMeetingPointSelection([event.lngLat.lng, event.lngLat.lat]);
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [isSelectingMeetingPoint, resolveMeetingPointSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    try {
      map.getCanvas().style.cursor = isSelectingMeetingPoint ? "crosshair" : "";
    } catch {}

    return () => {
      try {
        map.getCanvas().style.cursor = "";
      } catch {}
    };
  }, [isSelectingMeetingPoint]);

  useEffect(() => {
    renderSelectedPopup(selectedDestination);
  }, [renderSelectedPopup, selectedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !userLocation) return;
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:999px;background:#2563eb;border:3px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.4);";
      userMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat(userLocation.coordinates)
        .setPopup(
          new mapboxgl.Popup({
            offset: 12,
            className: "light-theme-popup",
          }).setHTML(
            "<strong style='color:#0f172a;font-size:12px;'>Your location</strong>"
          )
        )
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(userLocation.coordinates);
    }
  }, [userLocation]);

  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { startY: event.clientY, startHeight: sheetHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    const delta = dragStateRef.current.startY - event.clientY;
    setSheetHeight(
      clamp(
        dragStateRef.current.startHeight + delta,
        snapHeights.peek,
        snapHeights.full
      )
    );
  };
  const handleSheetPointerUp = () => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    const nearestSnap = (
      Object.entries(snapHeights) as [SheetSnap, number][]
    ).sort(
      (a, b) => Math.abs(a[1] - sheetHeight) - Math.abs(b[1] - sheetHeight)
    )[0][0];
    snapSheetTo(nearestSnap);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* ── Floating Map Controls ── */}
      <div className="absolute top-0 right-0 z-20 pointer-events-none flex flex-col items-end gap-3 p-4 pt-8">
        {/* Walk Group entry point */}
        <button
          onClick={openWalkGroupDialog}
          disabled={!myActiveWalkGroup && !selectedDestination && !destinationQuery}
          className={`pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
            myActiveWalkGroup
              ? "bg-[#00c853] text-white border-[#00c853] shadow-[#00c853]/30"
              : "bg-white text-[#00c853] border-gray-100 hover:bg-[#e8faf0]"
          }`}
          aria-label={myActiveWalkGroup ? "Open active walk group" : "Start walk group"}
        >
          <Users className="w-5 h-5" />
          {myActiveWalkGroup ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0f172a] px-1 text-[10px] font-bold text-white">
              {myActiveWalkGroup.memberCount}
            </span>
          ) : null}
        </button>

        {/* Top Right: Back, Locate, Report — stacked column */}
        <div className="flex flex-col gap-3 pointer-events-auto">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-12 h-12 rounded-full bg-white text-gray-700 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-all active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (userLocation && mapRef.current) {
                mapRef.current.flyTo({
                  center: userLocation.coordinates,
                  zoom: 17,
                  duration: 900,
                });
              } else {
                requestUserLocation();
              }
            }}
            className="w-12 h-12 rounded-full bg-white text-blue-600 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-blue-50 active:scale-95 transition-all"
            aria-label="Locate me"
          >
            <LocateFixed className="w-5 h-5" />
          </button>

          <button
            onClick={openReportSheet}
            className="w-12 h-12 rounded-full bg-white text-amber-500 shadow-lg border border-gray-100 flex items-center justify-center hover:bg-amber-50 active:scale-95 transition-all"
            aria-label="Report an issue"
          >
            <AlertTriangle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Location status pill — floats below top-left */}
      <div className="absolute left-4 top-32 z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-full px-3 py-2 shadow-md">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: locationStatusMeta.dotColor }}
          />
          <div>
            <p className="text-[11px] font-bold text-gray-800 leading-tight">
              {locationStatusMeta.label}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight">
              {locationStatusMeta.description}
            </p>
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="relative flex-1 min-h-0 bg-gray-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading Overlay */}
        {isLoadingData && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 flex flex-col items-center text-center gap-3 max-w-[75%]">
              <div className="h-11 w-11 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Mapping Campus…
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Loading rooms and pathways
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Bottom Sheet ── */}
        <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none">
          <div
            className="pointer-events-auto bg-white rounded-t-3xl shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.12)] border-t border-gray-100 flex flex-col transition-[height] duration-200 ease-out"
            style={{ height: sheetHeight }}
          >
            {/* Drag Handle */}
            <div
              className="px-6 pt-3 pb-3 cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              onPointerCancel={handleSheetPointerUp}
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Where to?</h2>
                {selectedDestination && (
                  <button
                    onClick={() => {
                      setActiveRoute(null);
                      setSelectedDestinationId(null);
                      setDestinationQuery("");
                      setSelectedWalkGroupId(null);
                      setIsReportSheetOpen(false);
                      if (mapRef.current && placeData)
                        fitMapToCampus(mapRef.current, placeData);
                    }}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 cactus-scrollbar">
              {/* Search Bar */}
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  value={destinationQuery}
                  onFocus={() => snapSheetTo("full")}
                  onChange={event => {
                    setDestinationQuery(event.target.value);
                    if (
                      selectedDestination &&
                      event.target.value !== selectedDestination.name
                    ) {
                      setSelectedDestinationId(null);
                      setActiveRoute(null);
                      setSelectedWalkGroupId(null);
                      setIsReportSheetOpen(false);
                    }
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter") void handleGoToDestination();
                  }}
                  placeholder="Search destinations…"
                  className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 rounded-xl py-3 pl-10 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-all outline-none"
                />
                {destinationQuery && (
                  <button
                    onClick={() => {
                      setDestinationQuery("");
                      setSelectedDestinationId(null);
                      setActiveRoute(null);
                      setSelectedWalkGroupId(null);
                      setIsReportSheetOpen(false);
                    }}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Selected destination card */}
              {selectedDestination && (
                <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-3">
                  <div className="mt-0.5 bg-blue-600 rounded-lg p-1.5 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {selectedDestination.name}
                    </h3>
                    <p className="text-[11px] text-blue-600 mt-0.5">
                      {getCategoryMeta(selectedDestination.category).label} ·{" "}
                      {selectedDestination.nearestNodeName} (
                      {formatDistanceLabel(
                        selectedDestination.nearestNodeDistanceM
                      )}
                      )
                    </p>
                  </div>
                </div>
              )}

              {/* Walk Mode Cards — matches the dashboard "FIND WAY / CLASS CHAT / EMERGENCY" grid style */}
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-0.5">
                  Route Type
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["quick", "shortcut", "longest"] as WalkMode[]).map(
                    mode => {
                      const meta = getWalkModeMeta(mode);
                      const isSelected = walkMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            if (meta.disabled) return;
                            setWalkMode(mode);
                            setActiveRoute(null);
                            setSelectedWalkGroupId(null);
                            setIsReportSheetOpen(false);
                          }}
                          disabled={meta.disabled}
                          className={`rounded-xl flex flex-col items-center justify-center py-4 px-2 transition-all text-center ${
                            isSelected
                              ? "bg-blue-600 shadow-md shadow-blue-200"
                              : meta.disabled
                                ? "bg-gray-50 opacity-60 cursor-not-allowed"
                                : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
                          }`}
                        >
                          <span
                            className={`text-sm font-bold ${isSelected ? "text-white" : "text-gray-700"}`}
                          >
                            {meta.label}
                          </span>
                          <span
                            className={`text-[10px] mt-0.5 leading-tight ${isSelected ? "text-blue-100" : "text-gray-400"}`}
                          >
                            {meta.subtitle}
                          </span>
                          {meta.disabled && (
                            <span
                              className={`mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-400"}`}
                            >
                              Soon
                            </span>
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Active Route Card — matches "Current Class" card from dashboard */}
              {activeRoute && (
                <div className="mb-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Active Route
                    </span>
                    <span className="text-sm font-bold text-white bg-blue-600 px-3 py-0.5 rounded-full">
                      {formatDurationLabel(activeRoute.durationSec)}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {[
                      {
                        label: "Total distance",
                        value: formatDistanceLabel(activeRoute.distanceM),
                      },
                      {
                        label: "Road segment",
                        value: formatDistanceLabel(activeRoute.roadDistanceM),
                      },
                      {
                        label: "Campus segment",
                        value: formatDistanceLabel(activeRoute.campusDistanceM),
                      },
                    ].map(row => (
                      <div
                        key={row.label}
                        className="flex justify-between items-center"
                      >
                        <span className="text-xs text-gray-400">
                          {row.label}
                        </span>
                        <span className="text-xs font-semibold text-gray-900">
                          {row.value}
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-gray-400 border-t border-gray-50">
                      Join the campus path near your location and continue to{" "}
                      {activeRoute.targetNodeName}
                    </p>
                  </div>
                </div>
              )}

              {/* No results */}
              {normalizedDestinationQuery && visibleLocations.length === 0 && (
                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    No places matched "{destinationQuery}".
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try a building name, room code, or broader keyword.
                  </p>
                </div>
              )}

              {/* Location list — matches "Up Next" rows from dashboard */}
              {visibleLocations.length > 0 && (
                <div className="pb-24">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                      {normalizedDestinationQuery ? "Results" : "Browse Places"}
                    </p>
                    <span className="text-[11px] text-gray-400">
                      {visibleLocations.length} shown
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {visibleLocations.map(location => {
                      const meta = getCategoryMeta(location.category);
                      const Icon = meta.icon;
                      const isSelected = selectedDestinationId === location.id;
                      return (
                        <button
                          key={location.id}
                          onClick={() => selectLocation(location)}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left ${
                            isSelected
                              ? "bg-blue-50 border border-blue-100"
                              : "bg-white border border-gray-100 hover:bg-gray-50 active:bg-gray-100"
                          }`}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: isSelected
                                ? "#eff6ff"
                                : "#f8fafc",
                            }}
                          >
                            <Icon
                              className="w-4 h-4"
                              style={{
                                color: isSelected ? "#2563eb" : meta.color,
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-gray-900"}`}
                            >
                              {location.name}
                            </p>
                            <p
                              className={`text-[11px] mt-0.5 ${isSelected ? "text-blue-400" : "text-gray-400"}`}
                            >
                              {meta.label} ·{" "}
                              {formatDistanceLabel(
                                location.nearestNodeDistanceM
                              )}{" "}
                              to {location.nearestNodeName}
                            </p>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 shrink-0 ${isSelected ? "text-blue-400" : "text-gray-300"}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Action Bar — matches "View Details" green button style */}
            <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-4 flex gap-2.5 pb-8">
              <button
                disabled={!placeData}
                onClick={() => {
                  if (!placeData || !mapRef.current) return;
                  setActiveRoute(null);
                  setSelectedDestinationId(null);
                  setDestinationQuery("");
                  setSelectedWalkGroupId(null);
                  setIsReportSheetOpen(false);
                  fitMapToCampus(mapRef.current, placeData);
                }}
                className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0 disabled:opacity-40"
                aria-label="Clear route"
              >
                <X className="w-5 h-5" />
              </button>

              <button
                disabled={
                  isPlanningRoute || (!selectedDestination && !destinationQuery)
                }
                onClick={() => void handleGoToDestination()}
                className="flex-1 h-12 rounded-xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-sm tracking-wide shadow-md shadow-green-200 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                {isPlanningRoute ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Navigation className="w-4 h-4 fill-current" />
                    GO
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Walk Group preview */}
        {selectedWalkGroup && (
          <div
            className="absolute inset-x-0 z-40 px-4 pointer-events-none"
            style={{ bottom: Math.min(sheetHeight + 12, viewportHeight - 260) }}
          >
            <WalkGroupPreviewCard
              group={selectedWalkGroup}
              isJoining={isJoiningWalkGroup}
              hasOtherActiveGroup={Boolean(
                myActiveWalkGroup && myActiveWalkGroup.id !== selectedWalkGroup.id
              )}
              onClose={() => setSelectedWalkGroupId(null)}
              onJoin={() => void handleJoinWalkGroup()}
              onOpen={openSelectedWalkGroup}
            />
          </div>
        )}

        {isSelectingMeetingPoint && (
          <div className="absolute left-1/2 top-24 z-40 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 pointer-events-none">
            <div className="rounded-2xl border border-[#d2f5df] bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00a844]">
                Pick Meeting Point
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                Tap the map to drop the meeting marker.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                The latitude and longitude of that marker will be saved with the
                Walk Group.
              </p>
            </div>
          </div>
        )}

        <WalkGroupCreateDialog
          open={isWalkGroupDialogOpen}
          mode={walkGroupDialogMode}
          destinationName={walkGroupDestination?.name ?? "Selected destination"}
          selectedMeetingPoint={
            selectedMeetingPoint
              ? {
                  name: selectedMeetingPoint.name,
                  coordinates: selectedMeetingPoint.coordinates,
                }
              : null
          }
          isPickingMeetingPoint={isSelectingMeetingPoint}
          leavingOffsetMin={walkGroupLeavingOffsetMin}
          note={walkGroupNote}
          isSubmitting={isCreatingWalkGroup}
          onOpenChange={(open) => {
            if (!open) closeWalkGroupDialog();
          }}
          onPickMeetingPoint={beginMeetingPointSelection}
          onLeavingOffsetChange={setWalkGroupLeavingOffsetMin}
          onNoteChange={setWalkGroupNote}
          onCancel={closeWalkGroupDialog}
          onContinue={() => setWalkGroupDialogMode("form")}
          onCreate={() => void handleCreateWalkGroup()}
        />

        <MapHazardReportSheet
          open={isReportSheetOpen}
          title="Report a Path Issue"
          subtitle="Flag a problem other students should know about."
          helperText="Reports are demo-only for now, but this matches the quick hazard flow for live campus alerts."
          options={REPORT_OPTIONS}
          onClose={() => setIsReportSheetOpen(false)}
          onSelect={submitQuickReport}
        />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .cactus-scrollbar::-webkit-scrollbar { width: 3px; }
        .cactus-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .cactus-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

        .light-theme-popup .mapboxgl-popup-content {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #0f172a;
          border-radius: 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.10);
          padding: 8px 12px;
        }
        .light-theme-popup .mapboxgl-popup-tip {
          border-top-color: #ffffff;
          border-bottom-color: #ffffff;
        }
      `,
        }}
      />
    </div>
  );
}
