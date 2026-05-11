import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// UWI Mona Campus center coordinates
export const UWI_MONA_CENTER: [number, number] = [-76.7497, 18.0035];
export const UWI_MONA_ZOOM = 15.5;

export interface Walker {
  id: number;
  lat: number;
  lng: number;
  trustScore: number;
  name?: string;
}

export interface Hazard {
  id: number;
  lat: number;
  lng: number;
  severity: number;
  reportType: string;
  description?: string;
  ttlMinutes?: number;
  stillThereCount?: number;
  notThereCount?: number;
}

export interface Footpath {
  id: number;
  name?: string | null;
  geoJson: any;
}

export interface CactusMapHandle {
  showRoute: (fromLat: number, fromLng: number, toLat: number, toLng: number) => void;
  clearRoute: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  getMap: () => mapboxgl.Map | null;
}

interface CactusMapProps {
  className?: string;
  userLat?: number;
  userLng?: number;
  walkers?: Walker[];
  hazards?: Hazard[];
  footpaths?: Footpath[];
  isSelectingDest?: boolean;
  onDestinationSelected?: (lat: number, lng: number) => void;
  onWalkerClick?: (walker: Walker) => void;
  onHazardClick?: (hazard: Hazard) => void;
}

const SEVERITY_COLORS: Record<number, string> = {
  1: "#fbbf24",
  2: "#f97316",
  3: "#ef4444",
  4: "#dc2626",
  5: "#7f1d1d",
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  light_out: "Light Out",
  broken_path: "Broken Path",
  flooding: "Flooding",
  obstruction: "Obstruction",
  suspicious: "Suspicious Activity",
  pothole: "Pothole",
  broken_light: "Broken Light",
  suspicious_person: "Suspicious Person",
  accident: "Accident",
  other: "Other",
};

/**
 * Full-featured Mapbox map for CACTUS
 * - UWI Mona Campus as default center
 * - User location (blue dot)
 * - Walker markers with clustering
 * - Hazard pins with severity colors
 * - Footpath overlays
 * - Click-to-select destination mode
 * - Route visualization
 */
const CactusMap = forwardRef<CactusMapHandle, CactusMapProps>(
  (
    {
      className,
      userLat,
      userLng,
      walkers = [],
      hazards = [],
      footpaths = [],
      isSelectingDest = false,
      onDestinationSelected,
      onWalkerClick,
      onHazardClick,
    },
    ref
  ) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const walkerMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const hazardMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const isSelectingRef = useRef(isSelectingDest);
    const mapReadyRef = useRef(false);

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      showRoute: (fromLat, fromLng, toLat, toLng) => {
        if (!mapRef.current || !mapReadyRef.current) return;
        showRoute(mapRef.current, fromLat, fromLng, toLat, toLng);
      },
      clearRoute: () => {
        if (!mapRef.current || !mapReadyRef.current) return;
        clearRoute(mapRef.current);
      },
      flyTo: (lat, lng, zoom = 16) => {
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200 });
      },
      getMap: () => mapRef.current,
    }));

    // Keep ref in sync
    useEffect(() => {
      isSelectingRef.current = isSelectingDest;
      if (mapContainer.current) {
        if (isSelectingDest) {
          mapContainer.current.classList.add("map-selecting-dest");
        } else {
          mapContainer.current.classList.remove("map-selecting-dest");
        }
      }
    }, [isSelectingDest]);

    // Initialize map once
    useEffect(() => {
      if (!mapContainer.current || mapRef.current) return;

      const token = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!token) {
        console.error("[CactusMap] No Mapbox token found");
        return;
      }

      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: UWI_MONA_CENTER,
        zoom: UWI_MONA_ZOOM,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }), "top-right");

      map.on("load", () => {
        mapReadyRef.current = true;

        // Add footpath source and layer
        map.addSource("footpaths", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "footpaths-line",
          type: "line",
          source: "footpaths",
          paint: {
            "line-color": "#059669",
            "line-width": 3,
            "line-opacity": 0.75,
            "line-dasharray": [2, 1],
          },
        });

        // Add route source and layer
        map.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#7c3aed",
            "line-width": 4,
            "line-opacity": 0.85,
          },
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
        });

        // Render footpaths if any
        if (footpaths.length > 0) {
          renderFootpaths(map, footpaths);
        }
      });

      // Click handler for destination selection
      map.on("click", (e) => {
        if (!isSelectingRef.current) return;
        const { lng, lat } = e.lngLat;

        // Place/move destination marker
        if (destMarkerRef.current) {
          destMarkerRef.current.setLngLat([lng, lat]);
        } else {
          const el = document.createElement("div");
          el.className = "cactus-dest-marker";
          destMarkerRef.current = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .addTo(map);
        }

        onDestinationSelected?.(lat, lng);
      });

      mapRef.current = map;
      (window as any).mapboxgl = mapboxgl;

      return () => {
        if ((window as any).mapboxgl === mapboxgl) {
          delete (window as any).mapboxgl;
        }
        map.remove();
        mapRef.current = null;
        mapReadyRef.current = false;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update user location marker
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current || userLat == null || userLng == null) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLng, userLat]);
      } else {
        const el = document.createElement("div");
        el.className = "cactus-user-marker";
        el.title = "Your location";
        userMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([userLng, userLat])
          .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML("<strong>You</strong>"))
          .addTo(map);
        // Fly to user on first fix
        map.flyTo({ center: [userLng, userLat], zoom: UWI_MONA_ZOOM, duration: 1000 });
      }
    }, [userLat, userLng]);

    // Update walker markers with simple clustering
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      // Remove old markers
      walkerMarkersRef.current.forEach((m) => m.remove());
      walkerMarkersRef.current = [];

      if (walkers.length === 0) return;

      // Simple proximity clustering (group walkers within ~50m)
      const clusters = clusterPoints(walkers, 0.0005);

      clusters.forEach((cluster) => {
        const el = document.createElement("div");
        if (cluster.count > 1) {
          el.className = "cactus-cluster-marker";
          el.style.width = `${Math.min(36, 24 + cluster.count * 2)}px`;
          el.style.height = `${Math.min(36, 24 + cluster.count * 2)}px`;
          el.textContent = String(cluster.count);
          el.title = `${cluster.count} walkers nearby`;
        } else {
          el.className = "cactus-walker-marker";
          el.title = `Walker (Trust: ${cluster.items[0].trustScore.toFixed(2)})`;
        }

        const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
          cluster.count > 1
            ? `<strong>${cluster.count} walkers nearby</strong>`
            : `<strong>Walker available</strong><br/>
               Trust score: ${cluster.items[0].trustScore.toFixed(2)}<br/>
               <span style="color:#059669">● Available</span>`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([cluster.lng, cluster.lat])
          .setPopup(popup)
          .addTo(map);

        if (cluster.count === 1 && onWalkerClick) {
          el.addEventListener("click", () => onWalkerClick(cluster.items[0]));
        }

        walkerMarkersRef.current.push(marker);
      });
    }, [walkers, onWalkerClick]);

    // Update hazard markers
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      hazardMarkersRef.current.forEach((m) => m.remove());
      hazardMarkersRef.current = [];

      hazards.forEach((hazard) => {
        const el = document.createElement("div");
        el.className = "cactus-hazard-marker";
        el.style.background = SEVERITY_COLORS[hazard.severity] || "#ef4444";
        el.title = `${REPORT_TYPE_LABELS[hazard.reportType] || hazard.reportType} (Severity ${hazard.severity})`;

        const ttlText = hazard.ttlMinutes != null
          ? `<br/>TTL: ${hazard.ttlMinutes} min remaining`
          : "";
        const votesText = hazard.stillThereCount != null
          ? `<br/>✓ ${hazard.stillThereCount} still there · ✗ ${hazard.notThereCount} not there`
          : "";

        const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
          `<strong>${REPORT_TYPE_LABELS[hazard.reportType] || hazard.reportType}</strong><br/>
           Severity: ${hazard.severity}/5${ttlText}${votesText}
           ${hazard.description ? `<br/><em>${hazard.description}</em>` : ""}`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([hazard.lng, hazard.lat])
          .setPopup(popup)
          .addTo(map);

        if (onHazardClick) {
          el.addEventListener("click", () => onHazardClick(hazard));
        }

        hazardMarkersRef.current.push(marker);
      });
    }, [hazards, onHazardClick]);

    // Update footpaths
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;
      renderFootpaths(map, footpaths);
    }, [footpaths]);

    return (
      <div ref={mapContainer} className={className ?? "w-full h-full relative"}>
        {/* Destination selection hint */}
        {isSelectingDest && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none">
            Click on the map to set your destination
          </div>
        )}
      </div>
    );
  }
);

CactusMap.displayName = "CactusMap";
export { CactusMap };

// ============================================================
// Helpers
// ============================================================

function renderFootpaths(map: mapboxgl.Map, footpaths: Footpath[]) {
  const source = map.getSource("footpaths") as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  const features = footpaths
    .map((fp) => {
      try {
        const gj = typeof fp.geoJson === "string" ? JSON.parse(fp.geoJson) : fp.geoJson;
        return {
          type: "Feature" as const,
          properties: { name: fp.name || "Footpath" },
          geometry: gj,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as GeoJSON.Feature[];

  source.setData({ type: "FeatureCollection", features });
}

async function showRoute(
  map: mapboxgl.Map,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) {
  try {
    const token = mapboxgl.accessToken;
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0]?.geometry;
    if (!route) return;

    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: route }] });
    }
  } catch (err) {
    console.error("[CactusMap] Route fetch failed:", err);
  }
}

function clearRoute(map: mapboxgl.Map) {
  const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData({ type: "FeatureCollection", features: [] });
  }
}

interface Cluster<T extends { lat: number; lng: number }> {
  lat: number;
  lng: number;
  count: number;
  items: T[];
}

function clusterPoints<T extends { lat: number; lng: number }>(points: T[], radius: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  const used = new Set<number>();

  points.forEach((p, i) => {
    if (used.has(i)) return;
    const cluster: Cluster<T> = { lat: p.lat, lng: p.lng, count: 1, items: [p] };
    used.add(i);

    points.forEach((q, j) => {
      if (used.has(j)) return;
      const dlat = Math.abs(p.lat - q.lat);
      const dlng = Math.abs(p.lng - q.lng);
      if (dlat < radius && dlng < radius) {
        cluster.count++;
        cluster.items.push(q);
        used.add(j);
      }
    });

    clusters.push(cluster);
  });

  return clusters;
}
