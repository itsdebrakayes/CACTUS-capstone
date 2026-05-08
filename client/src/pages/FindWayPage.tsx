import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
  getCategoryMeta,
  loadCampusPlaceData,
  normalizeSearchText,
  type PlaceDataset,
  type PlaceLocation,
} from "@/lib/campusPlaces";
import { getPlaceMarkerIcon } from "@/lib/placeMarkerIcons";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Crosshair,
  GripHorizontal,
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const DEFAULT_CENTER: [number, number] = [-76.7499, 18.0053];

type Coord2 = [number, number];
type SheetSnap = "peek" | "mid" | "full";
type LocationStatus = "locating" | "ready" | "denied" | "unsupported";
type WalkMode = "quick" | "shortcut" | "longest";
type WalkingPalStatus = "searching" | "empty";

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

function createCampusPlaceCollection(
  placeData: PlaceDataset,
  selectedDestinationId: string | null
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: placeData.locations.map(location => {
      const categoryMeta = getCategoryMeta(location.category);
      return {
        type: "Feature" as const,
        properties: {
          id: location.id,
          name: location.name,
          category: categoryMeta.label,
          rawCategory: location.category,
          color: categoryMeta.color,
          isSelected: location.id === selectedDestinationId ? 1 : 0,
        },
        geometry: { type: "Point" as const, coordinates: location.coordinates },
      };
    }),
  };
}

function createClassroomMarkerElement(isSelected: boolean) {
  const iconSrc = getPlaceMarkerIcon("classroom");
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", "Classroom");
  el.style.cssText = [
    "width:32px",
    "height:32px",
    "border-radius:999px",
    "border:none",
    "padding:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    `box-shadow:${isSelected ? "0 0 0 3px rgba(37,99,235,0.25), 0 4px 12px rgba(0,0,0,0.15)" : "0 2px 8px rgba(0,0,0,0.15)"}`,
    `outline:${isSelected ? "2px solid #2563eb" : "1.5px solid #e2e8f0"}`,
    "cursor:pointer",
  ].join(";");
  el.innerHTML = `<img src="${iconSrc}" alt="Classroom" style="width:18px;height:18px;object-fit:contain;display:block;" />`;
  return el;
}

function ensureMapSources(
  map: mapboxgl.Map,
  placeData: PlaceDataset,
  selectedDestinationId: string | null,
  activeRoute: ActiveRoute | null
) {
  const nonClassroomFilter: mapboxgl.FilterSpecification = [
    "!=",
    ["get", "rawCategory"],
    "classroom",
  ];
  const placeCollection = createCampusPlaceCollection(
    placeData,
    selectedDestinationId
  );
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

  const placeSource = map.getSource("campus-places") as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (placeSource) placeSource.setData(placeCollection);
  else
    map.addSource("campus-places", { type: "geojson", data: placeCollection });

  if (!map.getLayer("campus-place-halo")) {
    map.addLayer({
      id: "campus-place-halo",
      type: "circle",
      source: "campus-places",
      filter: nonClassroomFilter,
      paint: {
        "circle-radius": ["case", ["==", ["get", "isSelected"], 1], 13, 10],
        "circle-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("campus-place-fill")) {
    map.addLayer({
      id: "campus-place-fill",
      type: "circle",
      source: "campus-places",
      filter: nonClassroomFilter,
      paint: {
        "circle-radius": ["case", ["==", ["get", "isSelected"], 1], 7, 5],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  map.setFilter("campus-place-halo", nonClassroomFilter);
  map.setFilter("campus-place-fill", nonClassroomFilter);
}

export default function FindWayPage() {
  const [, navigate] = useLocation();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const classroomMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const selectedPopupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  const initializedRoomRef = useRef(false);
  const sheetHeightRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );
  const walkingPalTimeoutRef = useRef<number | null>(null);

  const [placeData, setPlaceData] = useState<PlaceDataset | null>(null);
  const [campusData, setCampusData] = useState<CampusDataset | null>(null);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("locating");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState<
    string | null
  >(null);
  const [walkMode, setWalkMode] = useState<WalkMode>("quick");
  const [isWalkingPalOpen, setIsWalkingPalOpen] = useState(false);
  const [walkingPalStatus, setWalkingPalStatus] =
    useState<WalkingPalStatus>("searching");
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
      setIsWalkingPalOpen(false);
      setIsReportSheetOpen(false);
      snapSheetTo("mid");
      focusLocationOnMap(location);
    },
    [focusLocationOnMap, snapSheetTo]
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
    setIsWalkingPalOpen(false);
    setIsReportSheetOpen(false);
    setIsPlanningRoute(true);
    try {
      const userSnap = findNearestCampusPathSnap(
        campusData,
        userLocation.coordinates
      );
      if (!userSnap)
        throw new Error(
          "Unable to snap your location to the campus path network."
        );

      const roadRoute = await requestWalkingRoute([
        userLocation.coordinates,
        userSnap.coordinates,
      ]);

      const startOptions = [
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
          options.findIndex(candidate => candidate.nodeId === option.nodeId) ===
          index
      );

      const routeOptions = startOptions
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
        .filter((route): route is NonNullable<typeof route> => route !== null);

      const bestRoute = routeOptions.sort(
        (a, b) => a.totalDistanceM - b.totalDistanceM
      )[0];
      if (!bestRoute)
        throw new Error("No route could be built to the selected room.");
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
      toast.error("Unable to build the combined route right now.");
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

  const openWalkingPalSheet = useCallback(() => {
    const destination = selectedDestination ?? filteredLocations[0] ?? null;
    if (!destination) {
      toast.error("Choose a destination before requesting a walking pal.");
      return;
    }
    setIsReportSheetOpen(false);
    setIsWalkingPalOpen(true);
    setWalkingPalStatus("searching");
  }, [filteredLocations, selectedDestination]);

  const openReportSheet = useCallback(() => {
    setIsWalkingPalOpen(false);
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
    if (!isWalkingPalOpen) {
      if (walkingPalTimeoutRef.current != null) {
        window.clearTimeout(walkingPalTimeoutRef.current);
        walkingPalTimeoutRef.current = null;
      }
      return;
    }
    setWalkingPalStatus("searching");
    if (walkingPalTimeoutRef.current != null)
      window.clearTimeout(walkingPalTimeoutRef.current);
    walkingPalTimeoutRef.current = window.setTimeout(() => {
      setWalkingPalStatus("empty");
      walkingPalTimeoutRef.current = null;
    }, 20000);
    return () => {
      if (walkingPalTimeoutRef.current != null) {
        window.clearTimeout(walkingPalTimeoutRef.current);
        walkingPalTimeoutRef.current = null;
      }
    };
  }, [isWalkingPalOpen]);

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
      ensureMapSources(map, placeData, selectedDestinationId, activeRoute);
      fitMapToCampus(map, placeData);
    });
    mapRef.current = map;
    return () => {
      classroomMarkersRef.current.forEach(m => m.remove());
      classroomMarkersRef.current = [];
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
      ensureMapSources(map, placeData, selectedDestinationId, activeRoute);
      renderSelectedPopup(selectedDestination);
      if (!selectedDestination && !activeRoute) fitMapToCampus(map, placeData);
    };
    if (map.isStyleLoaded()) syncMap();
    else map.once("load", syncMap);
  }, [
    fitMapToCampus,
    activeRoute,
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
    const syncClassroomMarkers = () => {
      resetMarkers();
      for (const location of placeData.locations.filter(
        item => item.category === "classroom"
      )) {
        const el = createClassroomMarkerElement(
          selectedDestinationId === location.id
        );
        el.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          handlePlaceTap(location.id);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(location.coordinates)
          .addTo(map);
        classroomMarkersRef.current.push(marker);
      }
    };
    if (map.isStyleLoaded()) syncClassroomMarkers();
    else map.once("load", syncClassroomMarkers);
    return () => {
      try {
        map.off("load", syncClassroomMarkers);
      } catch {}
      resetMarkers();
    };
  }, [handlePlaceTap, placeData, selectedDestinationId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layerId = "campus-place-fill";
    const handleLayerClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.id;
      if (typeof locationId === "string") handlePlaceTap(locationId);
    };
    const enablePointerCursor = () => {
      try {
        map.getCanvas().style.cursor = "pointer";
      } catch {}
    };
    const disablePointerCursor = () => {
      try {
        map.getCanvas().style.cursor = "";
      } catch {}
    };
    const hasPlaceLayer = () => {
      try {
        return Boolean(map.getLayer(layerId));
      } catch {
        return false;
      }
    };
    const bindLayerEvents = () => {
      if (!hasPlaceLayer()) return;
      map.on("click", layerId, handleLayerClick);
      map.on("mouseenter", layerId, enablePointerCursor);
      map.on("mouseleave", layerId, disablePointerCursor);
    };
    if (map.isStyleLoaded()) bindLayerEvents();
    else map.once("load", bindLayerEvents);
    return () => {
      try {
        map.off("load", bindLayerEvents);
      } catch {}
      if (hasPlaceLayer()) {
        try {
          map.off("click", layerId, handleLayerClick);
          map.off("mouseenter", layerId, enablePointerCursor);
          map.off("mouseleave", layerId, disablePointerCursor);
        } catch {}
      }
      disablePointerCursor();
    };
  }, [handlePlaceTap]);

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
      <div className="absolute top-0 inset-x-0 z-20 pointer-events-none p-4 flex justify-between items-start pt-8">
        {/* Top Left: Walking Requests pill */}
        <button
          onClick={openWalkingPalSheet}
          disabled={!selectedDestination && !destinationQuery}
          className="pointer-events-auto flex items-center gap-2 bg-blue-600 text-white font-bold rounded-full pl-2 pr-4 py-1.5 shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-0"
        >
          <div className="bg-white text-blue-600 p-1.5 rounded-full">
            <Users className="w-4 h-4" />
          </div>
          <span className="text-sm tracking-wide">Walking Requests</span>
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
                      setIsWalkingPalOpen(false);
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
                      setIsWalkingPalOpen(false);
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
                      setIsWalkingPalOpen(false);
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
                            setIsWalkingPalOpen(false);
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
                  setIsWalkingPalOpen(false);
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

        {/* ── Walking Pal Floating Sheet ── */}
        {isWalkingPalOpen && (
          <div
            className="absolute inset-x-0 z-40 px-4 pointer-events-none"
            style={{ bottom: Math.min(sheetHeight + 12, viewportHeight - 260) }}
          >
            <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-gray-100 bg-white shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-50">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Walking Requests
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {selectedDestination?.name ?? destinationQuery}
                  </p>
                </div>
                <button
                  onClick={() => setIsWalkingPalOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-5">
                {walkingPalStatus === "searching" ? (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        Scanning network…
                      </p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Looking for students headed to the same location.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        No requests right now
                      </p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Nobody is going your way. Check back later.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
