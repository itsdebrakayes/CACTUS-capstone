import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  CactusMap,
  type CactusMapHandle,
  type Hazard,
} from "@/components/CactusMap";
import MapHazardReportSheet, {
  type HazardReportOption,
} from "@/components/MapHazardReportSheet";
import {
  createRouteFeatureCollection,
  haversineMeters,
  mergeRouteCoordinates,
} from "@/lib/fstRouting";
import {
  getCachedCampusPlaceData,
  loadCampusPlaceData,
} from "@/lib/campusPlaces";
import {
  planCampusRouteBetweenNodes,
  type CampusDataset,
} from "@/lib/findWayGeo";
import {
  createSupabaseHazard,
  loadSupabaseHazards,
  type HazardRecord,
} from "@/lib/supabaseHazards";
import { createWalkGroupMeetingMarkerElement } from "@/lib/placeMarkerIcons";
import {
  joinWalkGroup,
  leaveWalkGroup,
  loadMyActiveWalkGroup,
  loadWalkGroup,
  removeWalkGroupMember,
  updateWalkGroupStatus,
  type WalkGroupRecord,
  type WalkGroupMemberRecord,
} from "@/lib/supabaseWalkGroups";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Construction,
  Droplets,
  Eye,
  Footprints,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  Play,
  ShieldAlert,
  Users,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  TRUST_SCORE_DEFAULT,
  getTrustTier,
  type TrustTierKey,
} from "@shared/trust";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const REFRESH_MS = 15000;
const HAZARD_REFRESH_MS = 15000;
const TAB_BAR_HEIGHT = 64;
const EMPTY_ROUTE_COLLECTION = createRouteFeatureCollection([]);

type Coord2 = [number, number];
type SheetSnap = "collapsed" | "mid" | "full";
type WalkGroupTab = "main" | "comments";

interface UserLocation {
  coordinates: Coord2;
  accuracyM: number;
}

interface DirectionsRoute {
  coordinates: Coord2[];
  distanceM: number;
  durationSec: number;
}

interface WalkGroupRouteSummary {
  userCoordinates: Coord2[];
  userDistanceM: number;
  userDurationSec: number;
  groupCoordinates: Coord2[];
  groupDistanceM: number;
  groupDurationSec: number;
}

interface MapHazardCategory extends HazardReportOption {
  severity: number;
  icon: LucideIcon;
}

interface DemoMemberProfile {
  id: string;
  userId: string;
  name: string;
  trustScore: number;
  trustTierKey: TrustTierKey;
  trustTierLabel: string;
  isCreator: boolean;
  isCurrentUser: boolean;
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
];

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

function formatLeavingTime(value?: string) {
  if (!value) return "Leaving time not set";
  const leavingAt = new Date(value);
  if (Number.isNaN(leavingAt.getTime())) {
    return "Leaving time not set";
  }
  return leavingAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatusLabel(status: WalkGroupRecord["status"]) {
  switch (status) {
    case "active":
      return "Waiting to leave";
    case "started":
      return "Walking now";
    case "ended":
      return "Ended";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function formatRelativeTime(value?: string) {
  if (!value) {
    return "Just now";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffMs = Date.now() - timestamp;
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
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
    return null;
  }

  return { west, south, east, north };
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createPinnedMarkerElement(label: string, color: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.style.cssText = [
    "width:42px",
    "height:42px",
    "border-radius:999px",
    "border:none",
    "padding:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `background:${color}`,
    "color:#ffffff",
    "box-shadow:0 12px 26px rgba(15,23,42,0.2)",
    "font:700 12px/1 system-ui, sans-serif",
  ].join(";");
  el.textContent = label;
  return el;
}

function buildDemoMemberProfile(
  member: WalkGroupMemberRecord,
  trustProfile:
    | {
        name: string | null;
        score: number;
        tierKey: TrustTierKey;
        tierLabel: string;
      }
    | undefined,
  currentUserOpenId?: string
): DemoMemberProfile {
  const memberOpenId = `supabase:${member.userId}`;
  const fallbackTier = getTrustTier(TRUST_SCORE_DEFAULT);
  const isCurrentUser = currentUserOpenId === memberOpenId;

  return {
    id: member.id,
    userId: member.userId,
    name: isCurrentUser
      ? "You"
      : trustProfile?.name?.trim() || `Member ${member.userId.slice(0, 6)}`,
    trustScore: trustProfile?.score ?? TRUST_SCORE_DEFAULT,
    trustTierKey: trustProfile?.tierKey ?? fallbackTier.key,
    trustTierLabel: trustProfile?.tierLabel ?? fallbackTier.label,
    isCreator: member.role === "creator",
    isCurrentUser,
  };
}

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
      border: "#fde68a",
    }
  );
}

export default function WalkGroupPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [, params] = useRoute("/walk-group/:id");
  const groupId = params?.id ?? null;
  const cachedCampusBundle = getCachedCampusPlaceData();

  const mapRef = useRef<CactusMapHandle>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const meetingMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasFittedRef = useRef(false);
  const mapSourcesReadyRef = useRef(false);
  const hazardLoadErrorShownRef = useRef(false);
  const startYRef = useRef(0);
  const startTranslateYRef = useRef(0);
  const currentTranslateYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const activeSnapRef = useRef<SheetSnap>("mid");

  const [campusData, setCampusData] = useState<CampusDataset | null>(
    cachedCampusBundle?.campusData ?? null
  );
  const [group, setGroup] = useState<WalkGroupRecord | null>(null);
  const [myActiveGroupId, setMyActiveGroupId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [routeSummary, setRouteSummary] =
    useState<WalkGroupRouteSummary | null>(null);
  const [hazards, setHazards] = useState<HazardRecord[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<HazardRecord | null>(
    null
  );
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [activeAction, setActiveAction] = useState<
    null | "join" | "leave" | "start" | "end"
  >(null);
  const [memberActionKey, setMemberActionKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WalkGroupTab>("main");
  const [activeSnap, setActiveSnap] = useState<SheetSnap>("mid");
  const downvoteWalkGroupMember =
    trpc.trust.downvoteWalkGroupMember.useMutation();

  const canJoin = Boolean(
    group &&
    group.status === "active" &&
    !group.isCurrentUserMember &&
    (!myActiveGroupId || myActiveGroupId === group.id)
  );
  const canLeave = Boolean(
    group &&
    group.isCurrentUserMember &&
    !group.isCreator &&
    (group.status === "active" || group.status === "started")
  );
  const canStart = Boolean(group?.isCreator && group.status === "active");
  const canEnd = Boolean(
    group?.isCreator &&
    (group.status === "active" || group.status === "started")
  );
  const canManageMembers = Boolean(
    group?.isCreator &&
    (group.status === "active" || group.status === "started")
  );
  const canDownvoteMembers = Boolean(
    group?.isCurrentUserMember &&
    (group.status === "active" || group.status === "started")
  );

  const refreshGroup = useCallback(async () => {
    if (!groupId) {
      setLoadError("Walk group id is missing.");
      setIsLoading(false);
      return;
    }

    try {
      const [nextGroup, nextMyGroup] = await Promise.all([
        loadWalkGroup(groupId),
        loadMyActiveWalkGroup().catch(() => null),
      ]);

      setGroup(nextGroup);
      setMyActiveGroupId(nextMyGroup?.id ?? null);
      setLoadError(nextGroup ? null : "This walk group could not be found.");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load this walk group right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.all([loadCampusPlaceData(), refreshGroup()])
      .then(([campusResponse]) => {
        if (!cancelled) {
          setCampusData(campusResponse.campusData);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load the walk group map."
          );
          setIsLoading(false);
        }
      });

    const intervalId = window.setInterval(() => {
      void refreshGroup();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loading, navigate, refreshGroup, user]);

  useEffect(() => {
    setViewportHeight(window.innerHeight);
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      position => {
        setUserLocation({
          coordinates: [
            position.coords.longitude,
            position.coords.latitude,
          ] as Coord2,
          accuracyM: position.coords.accuracy,
        });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
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

    void refreshHazards();
    const interval = window.setInterval(refreshHazards, HAZARD_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    hasFittedRef.current = false;
    mapSourcesReadyRef.current = false;
  }, [groupId]);

  const sheetMetrics = useMemo(() => {
    const frameHeight = viewportHeight - TAB_BAR_HEIGHT;
    const collapsedVisible = 160;
    const midVisible = Math.round(frameHeight * 0.5);
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

  useEffect(() => {
    let frameId = 0;
    let cancelled = false;

    const waitForMap = () => {
      if (cancelled) {
        return;
      }
      const map = mapRef.current?.getMap();
      if (map?.isStyleLoaded()) {
        setIsMapReady(true);
        return;
      }
      frameId = window.requestAnimationFrame(waitForMap);
    };

    waitForMap();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      setIsMapReady(false);
    };
  }, []);

  const requestWalkingRoute = useCallback(async (waypoints: Coord2[]) => {
    if (!MAPBOX_TOKEN) {
      throw new Error("Mapbox token is missing.");
    }

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${waypoints
        .map(([lng, lat]) => `${lng},${lat}`)
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
          .filter(coord => Array.isArray(coord) && coord.length >= 2)
          .map(coord => [coord[0], coord[1]] as Coord2)
      : [];

    if (coordinates.length < 2) {
      throw new Error("Mapbox directions did not return a usable path.");
    }

    return {
      coordinates,
      distanceM: route?.distance ?? 0,
      durationSec: route?.duration ?? 0,
    } satisfies DirectionsRoute;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function buildRoutes() {
      if (!group) {
        setRouteSummary(null);
        return;
      }

      const meetingCoord: Coord2 = [group.meetingLng, group.meetingLat];
      const destinationCoord: Coord2 = [
        group.destinationLng,
        group.destinationLat,
      ];
      const userTarget =
        group.status === "started" ? destinationCoord : meetingCoord;
      let groupCoordinates = mergeRouteCoordinates(
        [meetingCoord],
        [destinationCoord]
      );
      let groupDistanceM = haversineMeters(meetingCoord, destinationCoord);
      let groupDurationSec = groupDistanceM / 1.2;

      if (campusData && group.meetingNodeId && group.destinationNodeId) {
        const campusRoute = planCampusRouteBetweenNodes(
          campusData,
          group.meetingNodeId,
          group.destinationNodeId,
          "shortest"
        );

        if (campusRoute) {
          const lastCampusCoord =
            campusRoute.coordinates[campusRoute.coordinates.length - 1];
          const finalConnectorDistanceM = lastCampusCoord
            ? haversineMeters(lastCampusCoord, destinationCoord)
            : 0;

          groupCoordinates = mergeRouteCoordinates(
            campusRoute.coordinates,
            finalConnectorDistanceM > 1 ? [destinationCoord] : []
          );
          groupDistanceM = campusRoute.distanceM + finalConnectorDistanceM;
          groupDurationSec =
            campusRoute.walkTimeSec + finalConnectorDistanceM / 1.2;
        }
      }

      let userCoordinates: Coord2[] = [];
      let userDistanceM = 0;
      let userDurationSec = 0;

      if (userLocation) {
        try {
          const route = await requestWalkingRoute([
            userLocation.coordinates,
            userTarget,
          ]);
          userCoordinates = route.coordinates;
          userDistanceM = route.distanceM;
          userDurationSec = route.durationSec;
        } catch {
          userDistanceM = haversineMeters(userLocation.coordinates, userTarget);
          userDurationSec = userDistanceM / 1.35;
          userCoordinates = mergeRouteCoordinates(
            [userLocation.coordinates],
            [userTarget]
          );
        }
      }

      if (!cancelled) {
        setRouteSummary({
          userCoordinates,
          userDistanceM,
          userDurationSec,
          groupCoordinates,
          groupDistanceM,
          groupDurationSec,
        });
      }
    }

    void buildRoutes();

    return () => {
      cancelled = true;
    };
  }, [campusData, group, requestWalkingRoute, userLocation]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || mapSourcesReadyRef.current) {
      return;
    }

    if (!map.getSource("walk-group-user-route")) {
      map.addSource("walk-group-user-route", {
        type: "geojson",
        data: EMPTY_ROUTE_COLLECTION,
      });
    }
    if (!map.getSource("walk-group-campus-route")) {
      map.addSource("walk-group-campus-route", {
        type: "geojson",
        data: EMPTY_ROUTE_COLLECTION,
      });
    }

    if (!map.getLayer("walk-group-user-route-casing")) {
      map.addLayer({
        id: "walk-group-user-route-casing",
        type: "line",
        source: "walk-group-user-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#14532d",
          "line-width": 8,
          "line-opacity": 0.18,
        },
      });
    }
    if (!map.getLayer("walk-group-user-route-line")) {
      map.addLayer({
        id: "walk-group-user-route-line",
        type: "line",
        source: "walk-group-user-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#00c853",
          "line-width": 4.5,
          "line-opacity": 0.92,
        },
      });
    }
    if (!map.getLayer("walk-group-campus-route-casing")) {
      map.addLayer({
        id: "walk-group-campus-route-casing",
        type: "line",
        source: "walk-group-campus-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#1e3a8a",
          "line-width": 8,
          "line-opacity": 0.2,
        },
      });
    }
    if (!map.getLayer("walk-group-campus-route-line")) {
      map.addLayer({
        id: "walk-group-campus-route-line",
        type: "line",
        source: "walk-group-campus-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#2563eb",
          "line-width": 4.5,
          "line-opacity": 0.94,
          "line-dasharray": [1, 0.2],
        },
      });
    }

    mapSourcesReadyRef.current = true;
  }, [isMapReady]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || !group) {
      return;
    }

    const meetingCoord: Coord2 = [group.meetingLng, group.meetingLat];
    const destinationCoord: Coord2 = [
      group.destinationLng,
      group.destinationLat,
    ];

    if (!meetingMarkerRef.current) {
      meetingMarkerRef.current = new mapboxgl.Marker({
        element: createWalkGroupMeetingMarkerElement({
          title: "Walk group meeting point",
          isSelected: true,
        }),
        anchor: "center",
      })
        .setLngLat(meetingCoord)
        .addTo(map);
    }
    meetingMarkerRef.current
      .setLngLat(meetingCoord)
      .setPopup(
        new mapboxgl.Popup({ offset: 16 }).setHTML(
          `<div style="font:600 12px/1.4 system-ui,sans-serif"><div>Meeting Point</div><div style="font-weight:400;color:#475569">${group.meetingPointName}</div></div>`
        )
      );

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({
        element: createPinnedMarkerElement("D", "#0f172a"),
        anchor: "center",
      })
        .setLngLat(destinationCoord)
        .addTo(map);
    }
    destinationMarkerRef.current
      .setLngLat(destinationCoord)
      .setPopup(
        new mapboxgl.Popup({ offset: 16 }).setHTML(
          `<div style="font:600 12px/1.4 system-ui,sans-serif"><div>Destination</div><div style="font-weight:400;color:#475569">${group.destinationName}</div></div>`
        )
      );
  }, [group, isMapReady]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || !mapSourcesReadyRef.current) {
      return;
    }

    const userRouteSource = map.getSource("walk-group-user-route") as
      | mapboxgl.GeoJSONSource
      | undefined;
    const groupRouteSource = map.getSource("walk-group-campus-route") as
      | mapboxgl.GeoJSONSource
      | undefined;

    userRouteSource?.setData(
      createRouteFeatureCollection(routeSummary?.userCoordinates ?? [])
    );
    groupRouteSource?.setData(
      createRouteFeatureCollection(
        group?.status === "started"
          ? (routeSummary?.groupCoordinates ?? [])
          : []
      )
    );
  }, [group?.status, isMapReady, routeSummary]);

  const focusGroupOnMap = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !group) {
      return;
    }

    const fitCoordinates = [
      ...(routeSummary?.userCoordinates ?? []),
      ...(group.status === "started"
        ? (routeSummary?.groupCoordinates ?? [])
        : []),
      [group.meetingLng, group.meetingLat] as Coord2,
      [group.destinationLng, group.destinationLat] as Coord2,
      ...(userLocation ? [userLocation.coordinates] : []),
    ];

    const boundsData = createBoundsFromCoordinates(fitCoordinates);
    if (!boundsData) {
      return;
    }

    map.fitBounds(
      new mapboxgl.LngLatBounds(
        [boundsData.west, boundsData.south],
        [boundsData.east, boundsData.north]
      ),
      {
        padding: {
          top: 110,
          right: 28,
          bottom: TAB_BAR_HEIGHT + 360,
          left: 28,
        },
        maxZoom: 18,
        duration: 900,
      }
    );
  }, [group, routeSummary, userLocation]);

  useEffect(() => {
    if (!group || !isMapReady || hasFittedRef.current) {
      return;
    }
    focusGroupOnMap();
    hasFittedRef.current = true;
  }, [focusGroupOnMap, group, isMapReady]);

  const handleJoin = useCallback(async () => {
    if (!group) {
      return;
    }

    setActiveAction("join");
    try {
      const joinedGroup = await joinWalkGroup(group.id);
      setGroup(joinedGroup);
      setMyActiveGroupId(joinedGroup.id);
      toast.success("Joined walk group.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to join this walk group right now."
      );
    } finally {
      setActiveAction(null);
    }
  }, [group]);

  const handleLeave = useCallback(async () => {
    if (!group) {
      return;
    }

    setActiveAction("leave");
    try {
      await leaveWalkGroup(group.id);
      toast.success("You left the walk group.");
      navigate("/map");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to leave this walk group right now."
      );
    } finally {
      setActiveAction(null);
    }
  }, [group, navigate]);

  const handleUpdateStatus = useCallback(
    async (nextStatus: "started" | "ended") => {
      if (!group) {
        return;
      }

      setActiveAction(nextStatus === "started" ? "start" : "end");
      try {
        await updateWalkGroupStatus(group.id, nextStatus);
        if (nextStatus === "ended") {
          toast.success("Walk group ended.");
          navigate("/map");
          return;
        }

        toast.success("Walk group started.");
        await refreshGroup();
        hasFittedRef.current = false;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to update this walk group right now."
        );
      } finally {
        setActiveAction(null);
      }
    },
    [group, navigate, refreshGroup]
  );

  const handleDownvoteMember = useCallback(
    async (member: DemoMemberProfile) => {
      if (!group) {
        return;
      }

      const actionKey = `downvote:${member.userId}`;
      setMemberActionKey(actionKey);
      try {
        const result = await downvoteWalkGroupMember.mutateAsync({
          walkGroupId: group.id,
          targetUserId: member.userId,
        });
        await utils.trust.getProfilesByOpenIds.invalidate();
        toast.success(
          `${member.name} was downvoted. Trust is now ${result.summary.score}% (${result.summary.tierLabel}).`
        );
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to downvote this member right now."
        );
      } finally {
        setMemberActionKey(null);
      }
    },
    [downvoteWalkGroupMember, group, utils.trust.getProfilesByOpenIds]
  );

  const handleRemoveMember = useCallback(
    async (member: DemoMemberProfile) => {
      if (!group) {
        return;
      }

      const actionKey = `remove:${member.userId}`;
      setMemberActionKey(actionKey);
      try {
        const removed = await removeWalkGroupMember(group.id, member.userId);
        if (!removed) {
          throw new Error("This member could not be removed.");
        }

        toast.success(`${member.name} was removed from the walk group.`);
        await refreshGroup();
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to remove this member right now."
        );
      } finally {
        setMemberActionKey(null);
      }
    },
    [group, refreshGroup]
  );

  const handleHazardClick = useCallback(
    (hazard: Hazard) => {
      const fullHazard =
        hazards.find(item => String(item.id) === String(hazard.id)) ?? null;
      setSelectedHazard(fullHazard);
    },
    [hazards]
  );

  const handleSubmitHazardWithOption = useCallback(
    async (optionType: string) => {
      const category = getHazardCategory(optionType);
      const mapCenter = mapRef.current?.getMap()?.getCenter();
      const lat =
        userLocation?.coordinates[1] ?? mapCenter?.lat ?? group?.meetingLat;
      const lng =
        userLocation?.coordinates[0] ?? mapCenter?.lng ?? group?.meetingLng;

      if (lat == null || lng == null) {
        toast.error("Unable to find a point on the map for this report.");
        return;
      }

      try {
        const created = await createSupabaseHazard({
          reportType: optionType,
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
      } catch (error) {
        console.error(error);
        toast.error("Unable to submit the hazard report.");
      }
    },
    [group?.meetingLat, group?.meetingLng, userLocation]
  );

  const visibleHazards = useMemo<Hazard[]>(
    () =>
      hazards.map((hazard) => ({
        id: typeof hazard.id === 'string' ? (parseInt(hazard.id, 10) || 0) : (hazard.id as number),
        reportType: hazard.reportType,
        lat: hazard.lat,
        lng: hazard.lng,
        severity: hazard.severity,
        description: hazard.description,
      })),
    [hazards]
  );

  const memberOpenIds = useMemo(
    () =>
      Array.from(
        new Set(
          (group?.members ?? []).map(member => `supabase:${member.userId}`)
        )
      ),
    [group?.members]
  );
  const memberTrustQuery = trpc.trust.getProfilesByOpenIds.useQuery(
    { openIds: memberOpenIds },
    {
      enabled: memberOpenIds.length > 0 && Boolean(user),
    }
  );
  const memberTrustByOpenId = useMemo(
    () =>
      new Map(
        (memberTrustQuery.data ?? []).map(trustProfile => [
          trustProfile.openId,
          trustProfile,
        ])
      ),
    [memberTrustQuery.data]
  );
  const demoMembers = useMemo(
    () =>
      (group?.members ?? []).map(member =>
        buildDemoMemberProfile(
          member,
          memberTrustByOpenId.get(`supabase:${member.userId}`),
          user?.openId
        )
      ),
    [group?.members, memberTrustByOpenId, user?.openId]
  );

  const userLat = userLocation?.coordinates[1];
  const userLng = userLocation?.coordinates[0];
  const activeHazardCount = visibleHazards.length;
  const sheetVisibleHeight =
    sheetMetrics.sheetHeight - sheetMetrics.snaps[activeSnap];
  const estimatedWalkTimeLabel = useMemo(() => {
    const liveDuration =
      routeSummary?.userDurationSec && routeSummary.userDurationSec > 0
        ? routeSummary.userDurationSec
        : (routeSummary?.groupDurationSec ?? 0);
    return formatDurationLabel(liveDuration);
  }, [routeSummary?.groupDurationSec, routeSummary?.userDurationSec]);
  const statusTone = useMemo(() => {
    switch (group?.status) {
      case "started":
        return "border-blue-100 bg-blue-50 text-blue-700";
      case "ended":
        return "border-gray-200 bg-gray-100 text-gray-600";
      case "cancelled":
      case "expired":
        return "border-amber-100 bg-amber-50 text-amber-700";
      default:
        return "border-[#d2f5df] bg-[#e8faf0] text-[#00a844]";
    }
  }, [group?.status]);

  const handleSheetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      startYRef.current = event.clientY;
      startTranslateYRef.current = currentTranslateYRef.current;
      isDraggingRef.current = true;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    },
    []
  );

  if (loading || isLoading) {
    return (
      <AppLayout activeTab="map" noScroll>
        <div className="flex h-full items-center justify-center bg-[#f5f7fa]">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#00c853]" />
            <span className="text-sm font-semibold text-gray-700">
              Loading walk group...
            </span>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!group || loadError) {
    return (
      <AppLayout activeTab="map">
        <div className="flex min-h-full items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Walk Group Unavailable
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {loadError ?? "This walk group could not be found."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/map")}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#00c853] px-4 text-sm font-semibold text-white transition hover:bg-[#00b84a]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Map
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="relative" style={{ height: "calc(100vh - 64px)" }}>
        <CactusMap
          ref={mapRef}
          userLat={userLat}
          userLng={userLng}
          hazards={visibleHazards}
          onHazardClick={handleHazardClick}
        />

        {selectedHazard ? (
          <HazardInfoCard
            hazard={selectedHazard}
            userLat={userLat}
            userLng={userLng}
            onClose={() => setSelectedHazard(null)}
          />
        ) : null}

        <div className="absolute inset-x-0 top-4 z-20 flex items-start justify-between gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/map")}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-slate-700 shadow-xl transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Map
          </button>

          <div className="rounded-full border border-white/70 bg-white/95 px-4 py-2 shadow-xl backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Walk Group
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {group.destinationName}
            </p>
          </div>
        </div>

        <div className="absolute right-4 top-24 z-20 flex flex-col gap-3">
          <button
            type="button"
            onClick={focusGroupOnMap}
            className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/70 bg-white text-slate-600 shadow-xl transition hover:scale-[1.03]"
            aria-label="Focus walk group"
          >
            <LocateFixed className="h-6 w-6" />
          </button>

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

        <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none">
          <div
            ref={sheetRef}
            className="pointer-events-auto flex flex-col rounded-t-[32px] border-t border-gray-100 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.18)]"
            style={{
              height: sheetMetrics.sheetHeight,
              willChange: "transform",
            }}
          >
            <div
              className="shrink-0 cursor-grab select-none touch-none px-6 pb-3 pt-3 active:cursor-grabbing"
              onPointerDown={handleSheetPointerDown}
              style={{ touchAction: "none" }}
            >
              <div className="mb-3 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>
            </div>

            <div className="border-b border-gray-100 px-4 pb-4 pt-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {group.isCreator
                      ? "Hosting Walk Group"
                      : "Joined Walk Group"}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900">
                    {group.isCreator
                      ? `Walking to ${group.destinationName}`
                      : group.destinationName}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Estimated walk time {estimatedWalkTimeLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}
                >
                  {formatStatusLabel(group.status)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#f8fafc] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("main")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === "main"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Main
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === "comments"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Comments
                </button>
              </div>
            </div>

            <div
              className="cactus-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-4"
              style={{
                maxHeight: Math.max(220, sheetVisibleHeight - 150),
              }}
            >
              {activeTab === "main" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {canJoin ? (
                      <ActionButton
                        disabled={Boolean(activeAction)}
                        showSpinner={activeAction === "join"}
                        color="green"
                        icon={Users}
                        label={
                          activeAction === "join"
                            ? "Joining..."
                            : "Join Walk Group"
                        }
                        onClick={() => void handleJoin()}
                      />
                    ) : null}
                    {canLeave ? (
                      <ActionButton
                        disabled={Boolean(activeAction)}
                        showSpinner={activeAction === "leave"}
                        color="slate"
                        icon={ArrowLeft}
                        label={
                          activeAction === "leave"
                            ? "Leaving..."
                            : "Leave Group"
                        }
                        onClick={() => void handleLeave()}
                      />
                    ) : null}
                    {canStart ? (
                      <ActionButton
                        disabled={Boolean(activeAction)}
                        showSpinner={activeAction === "start"}
                        color="blue"
                        icon={Play}
                        label={
                          activeAction === "start"
                            ? "Starting..."
                            : "Start Group"
                        }
                        onClick={() => void handleUpdateStatus("started")}
                      />
                    ) : null}
                    {canEnd ? (
                      <ActionButton
                        disabled={Boolean(activeAction)}
                        showSpinner={activeAction === "end"}
                        color="red"
                        icon={XCircle}
                        label={
                          activeAction === "end" ? "Ending..." : "End Group"
                        }
                        onClick={() => void handleUpdateStatus("ended")}
                      />
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* <InfoTile
                      icon={Clock3}
                      label="Estimated walk"
                      value={estimatedWalkTimeLabel}
                    /> */}
                    {/* <InfoTile
                      icon={MapPin}
                      label="Meeting point"
                      value={group.meetingPointName}
                    /> */}
                  </div>

                  <div className="rounded-[26px] border border-gray-100 bg-white p-4 shadow-sm">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Joined Members
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-slate-900">
                        Walking together
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Trust tiers are shared across the app and help members
                        judge reliability at a glance.
                      </p>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      {demoMembers.map(member => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          canDownvote={
                            canDownvoteMembers && !member.isCurrentUser
                          }
                          canRemove={
                            canManageMembers &&
                            !member.isCurrentUser &&
                            !member.isCreator
                          }
                          isDownvoting={
                            memberActionKey === `downvote:${member.userId}`
                          }
                          isRemoving={
                            memberActionKey === `remove:${member.userId}`
                          }
                          onDownvote={() => void handleDownvoteMember(member)}
                          onRemove={() => void handleRemoveMember(member)}
                        />
                      ))}
                    </div>
                  </div>

                  {group.note ? (
                    <div className="rounded-[24px] border border-[#d2f5df] bg-[#f5fff8] px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00a844]">
                        Note
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {group.note}
                      </p>
                    </div>
                  ) : null}

                  {group.status === "started" ? (
                    <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-700">
                      The group is already walking. The blue route on the map
                      now shows the shared path from the meeting point to the
                      destination.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[26px] border border-dashed border-gray-200 bg-[#f8fafc] px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900">
                    Comments coming soon
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">
                    This tab is reserved for quick Walk Group messages like
                    “Wait for me”, “I’m coming”, or “Where exactly are you
                    meeting?”
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <MapHazardReportSheet
        open={isReportOpen}
        title="Report a Path Issue"
        subtitle="Flag a problem other students should know about."
        helperText="Pick the issue type first. After that, we will save it to Supabase and show it on the map."
        options={HAZARD_CATEGORIES}
        onClose={() => setIsReportOpen(false)}
        onSelect={option => {
          void handleSubmitHazardWithOption(option.type);
        }}
      />
    </AppLayout>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function MemberRow({
  member,
  canDownvote,
  canRemove,
  isDownvoting,
  isRemoving,
  onDownvote,
  onRemove,
}: {
  member: DemoMemberProfile;
  canDownvote: boolean;
  canRemove: boolean;
  isDownvoting: boolean;
  isRemoving: boolean;
  onDownvote: () => void;
  onRemove: () => void;
}) {
  const tierStyles = getTrustTierStyles(member.trustTierKey);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[#fbfcfd] px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">
            {member.name}
          </p>
          {member.isCreator ? (
            <span className="rounded-full bg-[#e8faf0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00a844]">
              Host
            </span>
          ) : null}
          {member.isCurrentUser ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              You
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={tierStyles.badgeClassName}>
            {member.trustTierLabel}
          </span>
          <span className="text-xs text-slate-500">
            {member.trustScore}% trust
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div
          className={`h-2.5 w-2.5 rounded-full ${tierStyles.dotClassName}`}
        />
        {canDownvote || canRemove ? (
          <div className="flex flex-wrap justify-end gap-2">
            {canDownvote ? (
              <button
                type="button"
                onClick={onDownvote}
                disabled={isDownvoting || isRemoving}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDownvoting ? "Downvoting..." : "Downvote"}
              </button>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={isRemoving || isDownvoting}
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemoving ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getTrustTierStyles(tierKey: TrustTierKey) {
  switch (tierKey) {
    case "flagged":
      return {
        badgeClassName:
          "rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700",
        dotClassName: "bg-red-500",
      };
    case "watchlist":
      return {
        badgeClassName:
          "rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700",
        dotClassName: "bg-orange-500",
      };
    case "low_trust":
      return {
        badgeClassName:
          "rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700",
        dotClassName: "bg-amber-500",
      };
    case "trusted_peer":
      return {
        badgeClassName:
          "rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700",
        dotClassName: "bg-emerald-500",
      };
    case "campus_ally":
      return {
        badgeClassName:
          "rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700",
        dotClassName: "bg-teal-500",
      };
    case "guardian":
      return {
        badgeClassName:
          "rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700",
        dotClassName: "bg-blue-500",
      };
    case "neutral":
    default:
      return {
        badgeClassName:
          "rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600",
        dotClassName: "bg-slate-400",
      };
  }
}

function ActionButton({
  disabled,
  showSpinner,
  color,
  icon: Icon,
  label,
  onClick,
}: {
  disabled: boolean;
  showSpinner: boolean;
  color: "green" | "blue" | "red" | "slate";
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  const styles: Record<typeof color, string> = {
    green: "bg-[#00c853] text-white hover:bg-[#00b84a]",
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    red: "bg-red-600 text-white hover:bg-red-700",
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[color]}`}
    >
      {showSpinner ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {label}
    </button>
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
  const distance =
    userLat == null || userLng == null
      ? null
      : formatDistanceLabel(
          haversineMeters([userLng, userLat], [hazard.lng, hazard.lat])
        );

  return (
    <div className="absolute left-4 right-4 top-20 z-30">
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
