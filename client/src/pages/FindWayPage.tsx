import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  ArrowLeft,
  Navigation,
  TreePine,
  Accessibility,
  Moon,
  Clock,
  Route,
  MapPin,
  ChevronDown,
  Shield,
  Loader2,
  CheckCircle2,
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// UWI Mona center
const UWI_CENTER: [number, number] = [-76.7497, 18.0035];

type RouteMode = "shortest" | "scenic" | "accessible" | "safe_night";

interface RouteOption {
  mode: RouteMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const ROUTE_OPTIONS: RouteOption[] = [
  {
    mode: "shortest",
    label: "Shortest",
    description: "Fastest path considering time, weather & hazards",
    icon: <Navigation className="w-5 h-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    mode: "scenic",
    label: "Scenic",
    description: "Passes key landmarks and beautiful spots",
    icon: <TreePine className="w-5 h-5" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  {
    mode: "accessible",
    label: "Accessible",
    description: "No steps, gentle slopes, smooth surfaces",
    icon: <Accessibility className="w-5 h-5" />,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  {
    mode: "safe_night",
    label: "Safe Night",
    description: "Well-lit, busy paths — safer after dark",
    icon: <Moon className="w-5 h-5" />,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
];

const ROUTE_LINE_COLORS: Record<RouteMode, string> = {
  shortest: "#2563eb",
  scenic: "#059669",
  accessible: "#7c3aed",
  safe_night: "#d97706",
};

function formatWalkTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function safetyLabel(score: number): { label: string; color: string } {
  if (score >= 0.8) return { label: "Very Safe", color: "text-emerald-600" };
  if (score >= 0.6) return { label: "Safe", color: "text-green-600" };
  if (score >= 0.4) return { label: "Moderate", color: "text-amber-600" };
  return { label: "Caution", color: "text-red-600" };
}

export default function FindWayPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [fromNodeId, setFromNodeId] = useState<number | null>(null);
  const [toNodeId, setToNodeId] = useState<number | null>(null);
  const [fromName, setFromName] = useState<string>("");
  const [toName, setToName] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<RouteMode>("shortest");
  const [activeRoute, setActiveRoute] = useState<any>(null);
  const [allRoutes, setAllRoutes] = useState<Record<RouteMode, any> | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [isRainy, setIsRainy] = useState(false);
  const [step, setStep] = useState<"pick" | "routes" | "navigating">("pick");

  // Load graph nodes
  const { data: graphNodes = [] } = trpc.footpaths.getGraphNodes.useQuery();

  // Plan all routes mutation
  const planAllRoutesMutation = trpc.footpaths.planAllRoutes.useMutation({
    onSuccess: (data) => {
      setAllRoutes(data as any);
      const firstRoute = (data as any)[selectedMode];
      if (firstRoute) {
        setActiveRoute(firstRoute);
        drawRouteOnMap(firstRoute, selectedMode);
      }
      setStep("routes");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to plan routes");
    },
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: UWI_CENTER,
      zoom: 15,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapInstance.current = map;

    map.on("load", () => {
      // Add node markers when nodes are loaded
      addNodeMarkersToMap(map);
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Add node markers when nodes load
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded() || graphNodes.length === 0) return;
    addNodeMarkersToMap(map);
  }, [graphNodes]);

  const addNodeMarkersToMap = useCallback(
    (map: mapboxgl.Map) => {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      for (const node of graphNodes) {
        const el = document.createElement("div");
        el.className = "node-marker";
        el.style.cssText = `
          width: 10px; height: 10px; border-radius: 50%;
          background: ${node.isLandmark ? "#16a34a" : "#6b7280"};
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([parseFloat(String(node.lng)), parseFloat(String(node.lat))] as [number, number])
          .setPopup(
            new mapboxgl.Popup({ offset: 15 }).setHTML(
              `<div style="font-size:13px;font-weight:600">${node.name ?? "Junction"}</div>
               <div style="font-size:11px;color:#6b7280">${node.category ?? ""}</div>`
            )
          )
          .addTo(map);

        markersRef.current.push(marker);
      }
    },
    [graphNodes]
  );

  const drawRouteOnMap = useCallback(
    (route: any, mode: RouteMode) => {
      const map = mapInstance.current;
      if (!map || !map.isStyleLoaded()) return;

      // Remove existing route layers
      ["route-line", "route-line-border"].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });

      if (!route?.path || route.path.length < 2) return;

      // Build GeoJSON from path nodes
      const coords: [number, number][] = route.path.map((node: any) => [
        parseFloat(node.lng),
        parseFloat(node.lat),
      ]);

      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      };

      const color = ROUTE_LINE_COLORS[mode];

      map.addSource("route-line-border", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route-line-border",
        type: "line",
        source: "route-line-border",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8 },
      });

      map.addSource("route-line", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": color, "line-width": 5 },
      });

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 17 });
    },
    []
  );

  const handleSelectMode = (mode: RouteMode) => {
    setSelectedMode(mode);
    if (allRoutes) {
      const route = (allRoutes as any)[mode];
      if (route) {
        setActiveRoute(route);
        drawRouteOnMap(route, mode);
      }
    }
  };

  const handlePlanRoutes = () => {
    if (!fromNodeId || !toNodeId) {
      toast.error("Please select both origin and destination");
      return;
    }
    if (fromNodeId === toNodeId) {
      toast.error("Origin and destination must be different");
      return;
    }
    planAllRoutesMutation.mutate({
      fromNodeId,
      toNodeId,
      hourOfDay: new Date().getHours(),
      isRainy,
    });
  };

  const filteredNodes = graphNodes.filter((n) =>
    (n.name ?? "").toLowerCase().includes(nodeSearch.toLowerCase())
  );

  const selectNode = (node: any, type: "from" | "to") => {
    if (type === "from") {
      setFromNodeId(node.id);
      setFromName(node.name ?? `Node ${node.id}`);
      setShowFromPicker(false);
    } else {
      setToNodeId(node.id);
      setToName(node.name ?? `Node ${node.id}`);
      setShowToPicker(false);
    }
    setNodeSearch("");
    // Fly to node
    const map = mapInstance.current;
    if (map) {
      map.flyTo({ center: [parseFloat(node.lng), parseFloat(node.lat)], zoom: 16 });
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      gate: "🚪", library: "📚", admin: "🏛️", cafeteria: "🍽️",
      faculty: "🎓", medical: "🏥", sports: "⚽", landmark: "📍",
      junction: "🔀", residence: "🏠",
    };
    return icons[category] ?? "📌";
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 z-10">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-900 text-base">Find Way</h1>
          <p className="text-xs text-gray-500">UWI Mona Campus Navigation</p>
        </div>
        {/* Rainy toggle */}
        <button
          onClick={() => setIsRainy(!isRainy)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            isRainy
              ? "bg-blue-100 text-blue-700 border-blue-300"
              : "bg-gray-100 text-gray-600 border-gray-200"
          }`}
        >
          🌧️ {isRainy ? "Rainy" : "Dry"}
        </button>
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapRef} className="w-full h-full" />

        {/* Route info overlay */}
        {activeRoute && step === "routes" && (
          <div className="absolute top-3 left-3 right-3 bg-white rounded-xl shadow-lg p-3 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: ROUTE_LINE_COLORS[selectedMode] }}
                />
                <span className="font-semibold text-sm text-gray-900">
                  {ROUTE_OPTIONS.find((r) => r.mode === selectedMode)?.label} Route
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatWalkTime(activeRoute.walkTimeSec)}
                </span>
                <span className="flex items-center gap-1">
                  <Route className="w-3.5 h-3.5" />
                  {formatDistance(activeRoute.distanceM)}
                </span>
                <span className={`flex items-center gap-1 font-medium ${safetyLabel(activeRoute.safetyScore).color}`}>
                  <Shield className="w-3.5 h-3.5" />
                  {safetyLabel(activeRoute.safetyScore).label}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Node picker dropdowns */}
        {(showFromPicker || showToPicker) && (
          <div className="absolute inset-0 bg-black/40 z-20 flex items-end">
            <div className="bg-white w-full rounded-t-2xl max-h-[70vh] flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-bold text-gray-900 mb-3">
                  {showFromPicker ? "Select Starting Point" : "Select Destination"}
                </h3>
                <input
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Search locations..."
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                />
              </div>
              <div className="overflow-y-auto flex-1 p-2">
                {filteredNodes.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">No locations found</p>
                ) : (
                  filteredNodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => selectNode(node, showFromPicker ? "from" : "to")}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-xl">{getCategoryIcon(node.category ?? "")}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {node.name ?? `Node ${node.id}`}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{node.category}</p>
                      </div>
                      {node.isLandmark && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Landmark</Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="p-3 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowFromPicker(false);
                    setShowToPicker(false);
                    setNodeSearch("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bg-white border-t shadow-lg">
        {step === "pick" && (
          <div className="p-4 space-y-3">
            {/* Origin picker */}
            <button
              onClick={() => { setShowFromPicker(true); setShowToPicker(false); }}
              className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-green-400 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs text-gray-500">From</p>
                <p className={`text-sm font-medium ${fromName ? "text-gray-900" : "text-gray-400"}`}>
                  {fromName || "Select starting point"}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Destination picker */}
            <button
              onClick={() => { setShowToPicker(true); setShowFromPicker(false); }}
              className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-red-400 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs text-gray-500">To</p>
                <p className={`text-sm font-medium ${toName ? "text-gray-900" : "text-gray-400"}`}>
                  {toName || "Select destination"}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
              disabled={!fromNodeId || !toNodeId || planAllRoutesMutation.isPending}
              onClick={handlePlanRoutes}
            >
              {planAllRoutesMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Planning routes...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Find Routes
                </>
              )}
            </Button>
          </div>
        )}

        {step === "routes" && allRoutes && (
          <div className="p-4">
            {/* Route selector tabs */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {ROUTE_OPTIONS.map((opt) => {
                const route = (allRoutes as any)[opt.mode];
                const isSelected = selectedMode === opt.mode;
                const isAvailable = !!route;
                return (
                  <button
                    key={opt.mode}
                    onClick={() => isAvailable && handleSelectMode(opt.mode)}
                    disabled={!isAvailable}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                      isSelected
                        ? `${opt.bgColor} ${opt.borderColor} ${opt.color}`
                        : isAvailable
                        ? "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                        : "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {opt.icon}
                    <span className="text-xs font-semibold leading-tight text-center">{opt.label}</span>
                    {route && (
                      <span className="text-xs opacity-70">{formatWalkTime(route.walkTimeSec)}</span>
                    )}
                    {!isAvailable && <span className="text-xs">N/A</span>}
                  </button>
                );
              })}
            </div>

            {/* Active route details */}
            {activeRoute && (
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">
                      {fromName} → {toName}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {ROUTE_OPTIONS.find((r) => r.mode === selectedMode)?.description}
                    </p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                </div>
                <div className="flex gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatWalkTime(activeRoute.walkTimeSec)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Route className="w-3.5 h-3.5" />
                    {formatDistance(activeRoute.distanceM)}
                  </span>
                  <span className={`flex items-center gap-1 font-medium ${safetyLabel(activeRoute.safetyScore).color}`}>
                    <Shield className="w-3.5 h-3.5" />
                    {safetyLabel(activeRoute.safetyScore).label} ({Math.round(activeRoute.safetyScore * 100)}%)
                  </span>
                </div>
                {/* Path landmarks */}
                {activeRoute.path && activeRoute.path.filter((n: any) => n.isLandmark).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Passes through:</p>
                    <div className="flex flex-wrap gap-1">
                      {activeRoute.path
                        .filter((n: any) => n.isLandmark)
                        .map((n: any) => (
                          <Badge key={n.id} className="bg-white border border-gray-200 text-gray-700 text-xs">
                            {n.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("pick");
                  setAllRoutes(null);
                  setActiveRoute(null);
                  // Clear route from map
                  const map = mapInstance.current;
                  if (map) {
                    ["route-line", "route-line-border"].forEach((id) => {
                      if (map.getLayer(id)) map.removeLayer(id);
                      if (map.getSource(id)) map.removeSource(id);
                    });
                  }
                }}
              >
                Change Route
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  setStep("navigating");
                  toast.success("Navigation started! Follow the highlighted path.");
                }}
              >
                <Navigation className="w-4 h-4 mr-2" />
                Start
              </Button>
            </div>
          </div>
        )}

        {step === "navigating" && activeRoute && (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: ROUTE_LINE_COLORS[selectedMode] + "20" }}
              >
                <Navigation className="w-5 h-5" style={{ color: ROUTE_LINE_COLORS[selectedMode] }} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-sm">Navigating to {toName}</p>
                <p className="text-xs text-gray-500">
                  {formatWalkTime(activeRoute.walkTimeSec)} · {formatDistance(activeRoute.distanceM)} ·{" "}
                  <span className={safetyLabel(activeRoute.safetyScore).color}>
                    {safetyLabel(activeRoute.safetyScore).label}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => {
                setStep("routes");
                toast.info("Navigation ended");
              }}
            >
              End Navigation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
