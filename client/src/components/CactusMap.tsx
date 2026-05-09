import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getCategoryMeta, type PlaceLocation } from "@/lib/campusPlaces";
import {
  createCampusPlaceMarkerElement as createCampusPlaceMarkerButton,
  createCrowdReportMarkerElement,
  createWalkGroupMeetingMarkerElement,
} from "@/lib/placeMarkerIcons";
import { type CampusDataset } from "@/lib/findWayGeo";

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
  id: string | number;
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
  geoJson: unknown;
}

export interface WalkGroupMapMarker {
  id: string;
  lat: number;
  lng: number;
  destinationName: string;
  meetingPointName: string;
  memberCount: number;
  status: string;
}

export interface CactusMapHandle {
  showRoute: (fromLat: number, fromLng: number, toLat: number, toLng: number) => void;
  clearRoute: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  getMap: () => mapboxgl.Map | null;
}

interface CactusMapProps {
  userLat?: number;
  userLng?: number;
  walkers?: Walker[];
  hazards?: Hazard[];
  walkGroups?: WalkGroupMapMarker[];
  footpaths?: Footpath[];
  places?: PlaceLocation[];
  campusData?: CampusDataset | null;
  isSelectingDest?: boolean;
  onDestinationSelected?: (lat: number, lng: number) => void;
  onWalkerClick?: (walker: Walker) => void;
  onHazardClick?: (hazard: Hazard) => void;
  onWalkGroupClick?: (walkGroup: WalkGroupMapMarker) => void;
  onPlaceClick?: (place: PlaceLocation) => void;
}

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

const CactusMap = forwardRef<CactusMapHandle, CactusMapProps>(
  (
    {
      userLat,
      userLng,
      walkers = [],
      hazards = [],
      walkGroups = [],
      footpaths = [],
      places = [],
      campusData = null,
      isSelectingDest = false,
      onDestinationSelected,
      onWalkerClick,
      onHazardClick,
      onWalkGroupClick,
      onPlaceClick,
    },
    ref
  ) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const walkerMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const hazardMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const walkGroupMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const placeMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const isSelectingRef = useRef(isSelectingDest);
    const mapReadyRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);

    useImperativeHandle(ref, () => ({
      showRoute: (fromLat, fromLng, toLat, toLng) => {
        if (!mapRef.current || !mapReadyRef.current) {
          return;
        }
        showRoute(mapRef.current, fromLat, fromLng, toLat, toLng);
      },
      clearRoute: () => {
        if (!mapRef.current || !mapReadyRef.current) {
          return;
        }
        clearRoute(mapRef.current);
      },
      flyTo: (lat, lng, zoom = 16) => {
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200 });
      },
      getMap: () => mapRef.current,
    }));

    useEffect(() => {
      isSelectingRef.current = isSelectingDest;
      if (!mapContainer.current) {
        return;
      }

      if (isSelectingDest) {
        mapContainer.current.classList.add("map-selecting-dest");
      } else {
        mapContainer.current.classList.remove("map-selecting-dest");
      }
    }, [isSelectingDest]);

    useEffect(() => {
      if (!mapContainer.current || mapRef.current) {
        return;
      }

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

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        mapReadyRef.current = true;
        setMapReady(true);

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

        if (footpaths.length > 0) {
          renderFootpaths(map, footpaths);
        }
      });

      map.on("click", (event) => {
        if (!isSelectingRef.current) {
          return;
        }

        const { lng, lat } = event.lngLat;
        if (destMarkerRef.current) {
          destMarkerRef.current.setLngLat([lng, lat]);
        } else {
          const element = document.createElement("div");
          element.className = "cactus-dest-marker";
          destMarkerRef.current = new mapboxgl.Marker(element)
            .setLngLat([lng, lat])
            .addTo(map);
        }

        onDestinationSelected?.(lat, lng);
      });

      mapRef.current = map;

      return () => {
        placeMarkersRef.current.forEach((marker) => marker.remove());
        walkerMarkersRef.current.forEach((marker) => marker.remove());
        hazardMarkersRef.current.forEach((marker) => marker.remove());
        walkGroupMarkersRef.current.forEach((marker) => marker.remove());
        userMarkerRef.current?.remove();
        destMarkerRef.current?.remove();
        placeMarkersRef.current = [];
        walkerMarkersRef.current = [];
        hazardMarkersRef.current = [];
        walkGroupMarkersRef.current = [];
        map.remove();
        mapRef.current = null;
        mapReadyRef.current = false;
        setMapReady(false);
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || userLat == null || userLng == null) {
        return;
      }

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLng, userLat]);
      } else {
        const element = document.createElement("div");
        element.className = "cactus-user-marker";
        element.title = "Your location";
        userMarkerRef.current = new mapboxgl.Marker(element)
          .setLngLat([userLng, userLat])
          .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML("<strong>You</strong>"))
          .addTo(map);
        map.flyTo({ center: [userLng, userLat], zoom: UWI_MONA_ZOOM, duration: 1000 });
      }
    }, [mapReady, userLat, userLng]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      walkerMarkersRef.current.forEach((marker) => marker.remove());
      walkerMarkersRef.current = [];

      if (walkers.length === 0) {
        return;
      }

      const clusters = clusterPoints(walkers, 0.0005);

      clusters.forEach((cluster) => {
        const element = document.createElement("div");
        if (cluster.count > 1) {
          element.className = "cactus-cluster-marker";
          element.style.width = `${Math.min(36, 24 + cluster.count * 2)}px`;
          element.style.height = `${Math.min(36, 24 + cluster.count * 2)}px`;
          element.textContent = String(cluster.count);
          element.title = `${cluster.count} walkers nearby`;
        } else {
          element.className = "cactus-walker-marker";
          element.title = `Walker (Trust: ${cluster.items[0].trustScore.toFixed(2)})`;
        }

        const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
          cluster.count > 1
            ? `<strong>${cluster.count} walkers nearby</strong>`
            : `<strong>Walker available</strong><br/>
               Trust score: ${cluster.items[0].trustScore.toFixed(2)}<br/>
               <span style="color:#059669">Available</span>`
        );

        const marker = new mapboxgl.Marker(element)
          .setLngLat([cluster.lng, cluster.lat])
          .setPopup(popup)
          .addTo(map);

        if (cluster.count === 1 && onWalkerClick) {
          element.addEventListener("click", () => onWalkerClick(cluster.items[0]));
        }

        walkerMarkersRef.current.push(marker);
      });
    }, [mapReady, walkers, onWalkerClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      hazardMarkersRef.current.forEach((marker) => marker.remove());
      hazardMarkersRef.current = [];

      hazards.forEach((hazard) => {
        const element = createCrowdReportMarkerElement({
          title: `${REPORT_TYPE_LABELS[hazard.reportType] || hazard.reportType} (Severity ${hazard.severity})`,
          reportType: hazard.reportType,
          severity: hazard.severity,
        });

        const marker = new mapboxgl.Marker(element)
          .setLngLat([hazard.lng, hazard.lat])
          .addTo(map);

        if (onHazardClick) {
          element.addEventListener("click", () => onHazardClick(hazard));
        }

        hazardMarkersRef.current.push(marker);
      });
    }, [mapReady, hazards, onHazardClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      walkGroupMarkersRef.current.forEach((marker) => marker.remove());
      walkGroupMarkersRef.current = [];

      walkGroups.forEach((walkGroup) => {
        if (!Number.isFinite(walkGroup.lat) || !Number.isFinite(walkGroup.lng)) {
          return;
        }

        const markerElement = createWalkGroupMarkerElement(walkGroup);
        const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
          createWalkGroupPopupHtml(walkGroup)
        );

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat([walkGroup.lng, walkGroup.lat])
          .setPopup(popup)
          .addTo(map);

        markerElement.addEventListener("click", (event) => {
          event.stopPropagation();
          marker.togglePopup();
          onWalkGroupClick?.(walkGroup);
        });

        walkGroupMarkersRef.current.push(marker);
      });
    }, [mapReady, onWalkGroupClick, walkGroups]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      placeMarkersRef.current.forEach((marker) => marker.remove());
      placeMarkersRef.current = [];

      places.forEach((place) => {
        const markerElement = createCampusPlaceMarkerElement(place);
        const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
          createCampusPlacePopupHtml(place)
        );

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat(place.coordinates)
          .setPopup(popup)
          .addTo(map);

        markerElement.addEventListener("click", (event) => {
          event.stopPropagation();
          marker.togglePopup();
          onPlaceClick?.(place);
        });

        placeMarkersRef.current.push(marker);
      });
    }, [mapReady, places, onPlaceClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }
      renderFootpaths(map, footpaths);
    }, [mapReady, footpaths]);

    return <div ref={mapContainer} className="relative h-full w-full" />;
  }
);

CactusMap.displayName = "CactusMap";
export { CactusMap };

function renderFootpaths(map: mapboxgl.Map, footpaths: Footpath[]) {
  const source = map.getSource("footpaths") as mapboxgl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }

  const features = footpaths
    .map((footpath) => {
      try {
        const geoJson =
          typeof footpath.geoJson === "string"
            ? JSON.parse(footpath.geoJson)
            : footpath.geoJson;
        return {
          type: "Feature" as const,
          properties: { name: footpath.name || "Footpath" },
          geometry: geoJson,
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
    const response = await fetch(url);
    const data = await response.json();
    const route = data.routes?.[0]?.geometry;
    if (!route) {
      return;
    }

    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: route }],
    });
  } catch (error) {
    console.error("[CactusMap] Route fetch failed:", error);
  }
}

function clearRoute(map: mapboxgl.Map) {
  const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features: [] });
}

function createCampusPlaceMarkerElement(place: PlaceLocation) {
  return createCampusPlaceMarkerButton({
    category: place.category,
    title: place.name,
  });
}

function createCampusPlacePopupHtml(place: PlaceLocation) {
  const meta = getCategoryMeta(place.category);
  return `
    <div style="padding:8px 10px;background:#fff;color:#0f172a;border-radius:10px;min-width:150px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="font-size:13px;font-weight:700;line-height:1.3;color:#0f172a">${place.name}</div>
      <div style="font-size:11px;color:${meta.color};margin-top:2px">${meta.label}</div>
    </div>
  `;
}

function createWalkGroupMarkerElement(walkGroup: WalkGroupMapMarker) {
  const element = createWalkGroupMeetingMarkerElement({
    title: `Walk Group to ${walkGroup.destinationName} meeting at ${walkGroup.meetingPointName}`,
  });

  if (walkGroup.memberCount > 1) {
    const badge = document.createElement("span");
    badge.style.cssText = [
      "position:absolute",
      "right:-5px",
      "top:-5px",
      "min-width:18px",
      "height:18px",
      "border-radius:999px",
      "padding:0 4px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:#0f172a",
      "border:2px solid #ffffff",
      "color:#ffffff",
      "font:800 9px/1 system-ui, sans-serif",
    ].join(";");
    badge.textContent = String(walkGroup.memberCount);
    element.appendChild(badge);
  }

  return element;
}

function createWalkGroupPopupHtml(walkGroup: WalkGroupMapMarker) {
  return `
    <div style="padding:8px 10px;background:#fff;color:#0f172a;border-radius:10px;min-width:180px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#00a844">Walk Group</div>
      <div style="margin-top:4px;font-size:13px;font-weight:700;line-height:1.3;color:#0f172a">${walkGroup.destinationName}</div>
      <div style="margin-top:3px;font-size:11px;color:#475569">Meet at ${walkGroup.meetingPointName}</div>
      <div style="margin-top:6px;font-size:11px;color:#64748b">${walkGroup.memberCount} joined</div>
    </div>
  `;
}

interface Cluster<T extends { lat: number; lng: number }> {
  lat: number;
  lng: number;
  count: number;
  items: T[];
}

function clusterPoints<T extends { lat: number; lng: number }>(
  points: T[],
  radius: number
): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  const used = new Set<number>();

  points.forEach((point, index) => {
    if (used.has(index)) {
      return;
    }

    const cluster: Cluster<T> = {
      lat: point.lat,
      lng: point.lng,
      count: 1,
      items: [point],
    };
    used.add(index);

    points.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) {
        return;
      }

      const latDistance = Math.abs(point.lat - candidate.lat);
      const lngDistance = Math.abs(point.lng - candidate.lng);
      if (latDistance < radius && lngDistance < radius) {
        cluster.count += 1;
        cluster.items.push(candidate);
        used.add(candidateIndex);
      }
    });

    clusters.push(cluster);
  });

  return clusters;
}
