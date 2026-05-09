import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  CactusMap,
  UWI_MONA_CENTER,
  type CactusMapHandle,
  type Hazard,
  type WalkGroupMapMarker,
} from "@/components/CactusMap";
import WalkGroupPreviewCard from "@/components/WalkGroupPreviewCard";
import {
  type Coord2,
  getCachedCampusPlaceData,
  getCategoryMeta,
  loadCampusPlaceData,
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
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import { toast } from "sonner";

const RECENT_SEARCHES_KEY = "cactus-map-recents";
const HAZARD_REFRESH_MS = 15000;
const WALK_GROUP_REFRESH_MS = 15000;
const TAB_BAR_HEIGHT = 64;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
type SheetSnap = "collapsed" | "mid" | "full";
type SearchSheetMode = "search" | "routeSelection" | "navigating";
type MapRouteType = "quick" | "shortcut" | "scenic";
const DISCONNECTED_CAMPUS_ROUTE_PREFIX = "Campus graph disconnect:";
const CROSS_COMPONENT_ENTRY_NODE_LIMIT = 8;

interface ActiveMapRoute {
  mode: MapRouteType;
  destinationId: string;
  destinationName: string;
  coordinates: Coord2[];
  distanceM: number;
  durationSec: number;
}

const DEMO_WALKERS = [
  { id: 101, lat: 18.0038, lng: -76.7492, trustScore: 0.85 },
  { id: 102, lat: 18.0031, lng: -76.7505, trustScore: 0.72 },
  { id: 103, lat: 18.0048, lng: -76.748, trustScore: 0.91 },
  { id: 104, lat: 18.0025, lng: -76.7515, trustScore: 0.6 },
];

interface MapHazardCategory extends HazardReportOption {
  severity: number;
  icon: LucideIcon;
}

const HAZARD_CATEGORIES: MapHazardCategory[] = [
  {
    type: "pothole",
    label: "Pothole",
    description: "Road or path surface is damaged",
    icon: AlertTriangle,
    color: "#f59e0b",
    bg: "#fff4db",
    border: "#fde68a",
    severity: 3,
  },
  {
    type: "light_out",
    label: "Broken Light",
    description: "Street or path light is not working",
    icon: Zap,
    color: "#ef4444",
    bg: "#fde8e8",
    border: "#fecaca",
    severity: 4,
  },
  {
    type: "flooding",
    label: "Flooding",
    description: "Water is blocking the walkway",
    icon: Droplets,
    color: "#0284c7",
    bg: "#e0f2fe",
    border: "#bae6fd",
    severity: 4,
  },
  {
    type: "broken_path",
    label: "Broken Path",
    description: "Damaged or unsafe walkway",
    icon: Footprints,
    color: "#dc2626",
    bg: "#fee2e2",
    border: "#fecdd3",
    severity: 3,
  },
  {
    type: "obstruction",
    label: "Obstruction",
    description: "Path blocked by work or debris",
    icon: Construction,
    color: "#f97316",
    bg: "#ffedd5",
    border: "#fed7aa",
    severity: 2,
  },
  {
    type: "suspicious",
    label: "Suspicious Activity",
    description: "Something feels unsafe in the area",
    icon: Eye,
    color: "#7c3aed",
    bg: "#f3e8ff",
    border: "#ddd6fe",
    severity: 4,
  },
] as const;

type HazardType = (typeof HAZARD_CATEGORIES)[number]["type"];

const ROUTE_TYPE_META: Record<
  MapRouteType,
  { label: string; subtitle: string; disabled?: boolean }
> = {
  quick: { label: "Quick", subtitle: "Fastest route" },
  shortcut: { label: "Shortcut", subtitle: "Footpaths soon", disabled: true },
  scenic: { label: "Scenic", subtitle: "Via Ring Road" },
};

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCampusRouteMode(routeType: MapRouteType) {
  return routeType === "scenic" ? "scenic" : "shortest";
}

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
  routeType: MapRouteType;
  requestWalkingRoute: (
    waypoints: Coord2[]
  ) => Promise<{
    coordinates: Coord2[];
    distanceM: number;
    durationSec: number;
  }>;
}) {
  const {
    campusData,
    origin,
    destination,
    routeType,
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
    coordinates: Coord2[];
    distanceM: number;
    durationSec: number;
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
        getCampusRouteMode(routeType)
      );
      if (!campusRoute) {
        continue;
      }

      const lastCampusCoordinate =
        campusRoute.coordinates[campusRoute.coordinates.length - 1];
      const finalConnectorDistanceM = lastCampusCoordinate
        ? haversineMeters(lastCampusCoordinate, destination.coordinates)
        : 0;
      const finalConnectorCoordinates =
        finalConnectorDistanceM > 1 ? [destination.coordinates] : [];

      routeOptions.push({
        coordinates: mergeRouteCoordinates(
          roadRoute.coordinates,
          campusRoute.coordinates,
          finalConnectorCoordinates
        ),
        distanceM:
          roadRoute.distanceM + campusRoute.distanceM + finalConnectorDistanceM,
        durationSec:
          roadRoute.durationSec +
          campusRoute.walkTimeSec +
          finalConnectorDistanceM / 1.2,
      });
    } catch {
      continue;
    }
  }

  return routeOptions.sort((left, right) => left.distanceM - right.distanceM)[0] ?? null;
}

function formatMetersLabel(distanceM: number) {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return "0 m";
  }
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`;
  }
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function SearchBottomSheet({
  mode,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  results,
  recentPlaces,
  selectedPlace,
  selectedPlaceDistanceLabel,
  routeType,
  onChooseResult,
  onRouteTypeChange,
  onBackToSearch,
  onStartNavigation,
  onCancelNavigation,
  onSearchFocus,
  onPointerDown,
  sheetRef,
  sheetHeight,
  isPlanningRoute,
}: {
  mode: SearchSheetMode;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  results: PlaceLocation[];
  recentPlaces: PlaceLocation[];
  selectedPlace: PlaceLocation | null;
  selectedPlaceDistanceLabel: string | null;
  routeType: MapRouteType;
  onChooseResult: (place: PlaceLocation) => void;
  onRouteTypeChange: (value: MapRouteType) => void;
  onBackToSearch: () => void;
  onStartNavigation: () => void;
  onCancelNavigation: () => void;
  onSearchFocus: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  sheetHeight: number;
  isPlanningRoute: boolean;
}) {
  const normalizedQuery = normalizeSearchText(searchQuery);
  const showingResults = normalizedQuery.length > 0;
  const visiblePlaces = showingResults ? results : recentPlaces;
  const canDrag = mode !== "navigating";

  return (
    <div className="absolute inset-x-0 bottom-0 z-[45] pointer-events-none">
      <div
        ref={sheetRef}
        className="pointer-events-auto flex flex-col rounded-t-3xl border-t border-gray-100 bg-white shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.12)]"
        style={{ height: sheetHeight }}
      >
        <div
          className={`shrink-0 px-6 pb-3 pt-3 ${
            canDrag ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerDown={canDrag ? onPointerDown : undefined}
        >
          <div className="mb-3 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-gray-200" />
          </div>
        </div>

        {mode === "navigating" ? (
          <div className="px-4 pb-6">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
                <input
                  value={selectedPlace?.name ?? searchQuery}
                  readOnly
                  className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={onCancelNavigation}
                className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-red-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mode === "routeSelection" && selectedPlace ? (
          <div className="flex flex-1 flex-col px-4 pb-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Route Type
                </p>
                <h3 className="mt-1 text-base font-bold text-gray-900">
                  Choose Your Route
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  Routing stops at the nearest outdoor access point for now.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackToSearch}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200"
                aria-label="Back to search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-blue-600 p-2 text-white">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {selectedPlace.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-blue-600">
                    {getCategoryMeta(selectedPlace.category).label}
                    {selectedPlaceDistanceLabel
                      ? ` · ${selectedPlaceDistanceLabel} away`
                      : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="grid grid-cols-3 gap-2">
                {(["quick", "shortcut", "scenic"] as MapRouteType[]).map((nextType) => {
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
                      className={`rounded-xl px-2 py-4 text-center transition-all ${
                        isSelected
                          ? "bg-blue-600 shadow-md shadow-blue-200"
                          : meta.disabled
                            ? "cursor-not-allowed bg-gray-50 opacity-60"
                            : "border border-gray-100 bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <span
                        className={`block text-sm font-bold ${
                          isSelected ? "text-white" : "text-gray-700"
                        }`}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-[10px] leading-tight ${
                          isSelected ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        {meta.subtitle}
                      </span>
                      {meta.disabled ? (
                        <span
                          className={`mt-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-gray-200 text-gray-400"
                          }`}
                        >
                          Soon
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto flex gap-2 pb-24">
              <button
                type="button"
                onClick={onBackToSearch}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                aria-label="Back to search"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onStartNavigation}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 text-sm font-bold tracking-wide text-white shadow-md shadow-green-200 transition hover:bg-green-600 active:bg-green-700"
              >
                {isPlanningRoute ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Navigation className="h-4 w-4 fill-current" />
                    GO
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="cactus-scrollbar flex-1 overflow-y-auto px-4 pb-6">
            <div className="relative mb-4">
              <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                value={searchQuery}
                onFocus={onSearchFocus}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search classrooms, labs, faculty..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-9 text-sm font-medium text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15"
              />
              {searchQuery ? (
                <button
                  onClick={onClearSearch}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {normalizedQuery && visiblePlaces.length === 0 ? (
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  No places matched "{searchQuery}".
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Try a building name, room code, or broader keyword.
                </p>
              </div>
            ) : null}

            <div className="pb-24">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {normalizedQuery ? "Results" : "Recent Searches"}
                </p>
                <span className="text-[11px] text-gray-400">
                  {visiblePlaces.length} shown
                </span>
              </div>
              <div className="space-y-1.5">
                {visiblePlaces.length > 0 ? (
                  visiblePlaces.map((place) => {
                    const meta = getCategoryMeta(place.category);
                    const Icon = meta.icon;
                    const isSelected = searchQuery === place.name;
                    return (
                      <button
                        key={place.id}
                        onClick={() => onChooseResult(place)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                          isSelected
                            ? "border-blue-100 bg-blue-50"
                            : "border-gray-100 bg-white hover:bg-gray-50 active:bg-gray-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: isSelected ? "#eff6ff" : "#f8fafc",
                            }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color: isSelected ? "#2563eb" : meta.color }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-sm font-semibold ${
                                isSelected ? "text-blue-700" : "text-gray-900"
                              }`}
                            >
                              {place.name}
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] ${
                                isSelected ? "text-blue-400" : "text-gray-400"
                              }`}
                            >
                              {meta.label}
                            </p>
                          </div>
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? "text-blue-400" : "text-gray-300"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                    Search for a classroom, lab, faculty, or hall to start.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HazardInfoCard({
  hazard,
  userLat,
  userLng,
  onClose,
}: {
  hazard: HazardRecord;
  userLat?: number;
  userLng?: number;
  onClose: () => void;
}) {
  const category = getHazardCategory(hazard.reportType);
  const Icon = category.icon;
  const distance = formatDistanceKm(userLat, userLng, hazard.lat, hazard.lng);

  return (
    <div className="absolute left-4 right-4 top-4 z-30">
      <div className="rounded-[32px] bg-[#17181c] px-5 py-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-light text-white/75">{category.label}</p>
            <p className="mt-1 text-5xl font-bold leading-none">
              {distance ?? "Nearby"}
            </p>
            <p className="mt-3 text-2xl font-semibold leading-tight">
              {hazard.description?.trim() || category.description}
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm text-white/65">
              <Clock3 className="h-4 w-4" />
              <span>{formatRelativeTime(hazard.createdAt)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/75 transition hover:bg-white/15"
              aria-label="Close hazard details"
            >
              <X className="h-4 w-4" />
            </button>
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full shadow-lg"
              style={{ backgroundColor: category.color }}
            >
              <Icon className="h-14 w-14 text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const cachedCampusBundle = getCachedCampusPlaceData();
  const mapRef = useRef<CactusMapHandle>(null);
  const hazardLoadErrorShownRef = useRef(false);
  const walkGroupLoadErrorShownRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const startTranslateYRef = useRef(0);
  const currentTranslateYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const activeSnapRef = useRef<SheetSnap>("collapsed");

  const [campusPlaces, setCampusPlaces] = useState<PlaceLocation[]>(
    cachedCampusBundle?.placeData.locations ?? []
  );
  const [campusData, setCampusData] = useState<CampusDataset | null>(
    cachedCampusBundle?.campusData ?? null
  );
  const [hazards, setHazards] = useState<HazardRecord[]>([]);
  const [activeWalkGroups, setActiveWalkGroups] = useState<WalkGroupRecord[]>([]);
  const [myActiveWalkGroup, setMyActiveWalkGroup] = useState<WalkGroupRecord | null>(
    null
  );
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [viewportHeight, setViewportHeight] = useState(800);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [routeType, setRouteType] = useState<MapRouteType>("quick");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedWalkGroupId, setSelectedWalkGroupId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<ActiveMapRoute | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<HazardRecord | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [isJoiningWalkGroup, setIsJoiningWalkGroup] = useState(false);
  const [activeSnap, setActiveSnap] = useState<SheetSnap>("collapsed");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPlaces() {
      try {
        const { campusData: nextCampusData, placeData } = await loadCampusPlaceData();
        if (!isCancelled) {
          setCampusData(nextCampusData);
          setCampusPlaces(placeData.locations);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          toast.error("Unable to load campus places.");
        }
      }
    }

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
        setSelectedWalkGroupId((current) => {
          if (!current) {
            return current;
          }
          const stillVisible = nextGroups.some((group) => group.id === current);
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
    const interval = window.setInterval(refreshWalkGroups, WALK_GROUP_REFRESH_MS);

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
      (position) => {
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
    () => new Map(campusPlaces.map((place) => [place.id, place])),
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
      .filter((place) => {
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
        .map((id) => placesById.get(id))
        .filter((place): place is PlaceLocation => Boolean(place))
        .slice(0, 6),
    [placesById, recentIds]
  );

  const selectedPlace = useMemo(
    () => (selectedPlaceId ? placesById.get(selectedPlaceId) ?? null : null),
    [placesById, selectedPlaceId]
  );

  const selectedWalkGroup = useMemo(() => {
    if (!selectedWalkGroupId) {
      return null;
    }
    return (
      activeWalkGroups.find((group) => group.id === selectedWalkGroupId) ??
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
      hazards.map((hazard) => ({
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
          (group) =>
            Number.isFinite(group.meetingLat) && Number.isFinite(group.meetingLng)
        )
        .map((group) => ({
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
        "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
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
    coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate));

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
        .map((point) => `${point[0]},${point[1]}`)
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
          .filter((value) => Array.isArray(value) && value.length >= 2)
          .map((value) => [value[0], value[1]] as Coord2)
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
    source?.setData(createRouteFeatureCollection(activeRoute?.coordinates ?? []));

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
      setRecentIds((current) => {
        const next = [place.id, ...current.filter((id) => id !== place.id)].slice(0, 8);
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

  const handleHazardClick = useCallback((hazard: Hazard) => {
    const fullHazard =
      hazards.find((item) => String(item.id) === String(hazard.id)) ?? null;
    setSelectedHazard(fullHazard);
    setSelectedWalkGroupId(null);
  }, [hazards]);

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
                (candidate) => candidate.nodeId === option.nodeId
              ) === index
          )
        : [];
      const connectedStartOptions =
        destinationComponentId === null
          ? []
          : startOptions.filter(
              (option) =>
                getCampusNodeComponentId(campusData, option.nodeId) ===
                destinationComponentId
            );

      const routeOptions: Array<{
        coordinates: Coord2[];
        distanceM: number;
        durationSec: number;
      }> = [];

      if (userSnap && connectedStartOptions.length > 0) {
        const roadConnectorDistanceM = haversineMeters(origin, userSnap.coordinates);
        const roadRoute =
          roadConnectorDistanceM < 3
            ? {
                coordinates: mergeRouteCoordinates([origin], [userSnap.coordinates]),
                distanceM: roadConnectorDistanceM,
                durationSec: roadConnectorDistanceM / 1.35,
              }
            : await requestWalkingRoute([origin, userSnap.coordinates]);

        routeOptions.push(
          ...connectedStartOptions
            .map((option) => {
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
                ? haversineMeters(lastCampusCoordinate, selectedPlace.coordinates)
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
            .filter((route): route is NonNullable<typeof route> => route !== null)
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

  const handleSubmitHazardWithOption = useCallback(async (nextType: HazardType) => {
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

      setHazards((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedHazard(created);
      setIsReportOpen(false);
      toast.success("Hazard reported on the map.");
      mapRef.current?.flyTo(created.lat, created.lng, 17.2);
    } catch (error) {
      console.error(error);
      toast.error("Unable to submit the hazard report.");
    }
  }, [userLat, userLng]);

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

  if (!loading && !user) {
    return null;
  }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="relative" style={{ height: "calc(100vh - 64px)" }}>
        <CactusMap
          ref={mapRef}
          userLat={userLat}
          userLng={userLng}
          walkers={DEMO_WALKERS}
          hazards={visibleHazards}
          walkGroups={visibleWalkGroups}
          places={campusPlaces}
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
            className="relative flex h-14 w-14 items-center justify-center rounded-3xl border-2 border-[#ff9f0a] bg-white text-[#ff9f0a] shadow-xl transition hover:scale-[1.03]"
            aria-label="Report a hazard"
          >
            <AlertTriangle className="h-6 w-6" />
            {activeHazardCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5a4f] px-1 text-[10px] font-bold text-white">
                {activeHazardCount}
              </span>
            ) : null}
          </button>
        </div>

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

        {selectedWalkGroup ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-[55] px-4"
            style={{ bottom: Math.min(walkGroupPreviewBottom, viewportHeight - 260) }}
          >
            <WalkGroupPreviewCard
              group={selectedWalkGroup}
              isJoining={isJoiningWalkGroup}
              hasOtherActiveGroup={Boolean(
                myActiveWalkGroup && myActiveWalkGroup.id !== selectedWalkGroup.id
              )}
              onClose={() => setSelectedWalkGroupId(null)}
              onJoin={() => {
                void handleJoinWalkGroup();
              }}
              onOpen={openSelectedWalkGroup}
            />
          </div>
        ) : null}

      </div>

      <MapHazardReportSheet
        open={isReportOpen}
        title="Report a Path Issue"
        subtitle="Flag a problem other students should know about."
        helperText="Pick the issue type first. After that, we will save it to Supabase and show it on the map."
        options={HAZARD_CATEGORIES}
        onClose={() => setIsReportOpen(false)}
        onSelect={(option) => {
          void handleSubmitHazardWithOption(option.type as HazardType);
        }}
      />
    </AppLayout>
  );
}

function getHazardCategory(type: string) {
  return (
    HAZARD_CATEGORIES.find((category) => category.type === type) ??
    {
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
