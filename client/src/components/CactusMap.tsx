import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  DEFAULT_MAP_PLACE_FILTER_KEYS,
  getCategoryMeta,
  getPlaceFilterKey,
  type MapPlaceFilterKey,
  type PlaceLocation,
} from "@/lib/campusPlaces";
import {
  createCrowdReportMarkerElement,
  getPlaceMarkerIcon,
  createWalkGroupMeetingMarkerElement,
} from "@/lib/placeMarkerIcons";
import { type CampusDataset } from "@/lib/findWayGeo";
import {
  bindManagedMapMarkerVisibility,
  type ManagedMapMarker,
  type MapMarkerVisibilityBinding,
} from "@/lib/mapMarkerVisibility";

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

export interface CampusEventMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  tagline: string;
}

export interface FloorToggleMarker {
  id: string;
  lat: number;
  lng: number;
  buildingName: string;
  targetFloor: number;
  radiusM: number;
}

export interface CactusMapHandle {
  showRoute: (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ) => void;
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
  selectedPlaceId?: string | null;
  selectedFilters?: MapPlaceFilterKey[];
  campusData?: CampusDataset | null;
  isSelectingDest?: boolean;
  onDestinationSelected?: (lat: number, lng: number) => void;
  onWalkerClick?: (walker: Walker) => void;
  onHazardClick?: (hazard: Hazard) => void;
  onWalkGroupClick?: (walkGroup: WalkGroupMapMarker) => void;
  onPlaceClick?: (place: PlaceLocation) => void;
  floorToggles?: FloorToggleMarker[];
  activeFloorToggleId?: string | null;
  onFloorToggleClick?: (toggle: FloorToggleMarker) => void;
  events?: CampusEventMarker[];
  onEventClick?: (event: CampusEventMarker) => void;
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

const PLACE_SOURCE_ID = "campus-places";
const SELECTED_PLACE_SOURCE_ID = "campus-selected-place";
const PLACE_LAYER_ID = "campus-places-symbols";
const SELECTED_PLACE_HALO_LAYER_ID = "campus-selected-place-halo";
const SELECTED_PLACE_LAYER_ID = "campus-selected-place-symbol";
const PLACE_INTERACTIVE_LAYER_IDS = [
  PLACE_LAYER_ID,
  SELECTED_PLACE_LAYER_ID,
] as const;
const PLACE_ICON_BASE_SIZE_PX = 18;
const PLACE_MARKER_DISPLAY_SIZE_PX = 56;
const PLACE_MARKER_CANVAS_SIZE_PX = 72;
const PLACE_MARKER_RADIUS_PX = 16;
const PLACE_MARKER_BORDER_WIDTH_PX = 2.25;

interface PlaceLayerFeatureProperties {
  featureKind: "place";
  featureId: string;
  name: string;
  category: string;
  filterKey: MapPlaceFilterKey;
  iconKey: string;
  markerColor?: string;
  placeId: string;
}

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
      selectedPlaceId = null,
      selectedFilters = DEFAULT_MAP_PLACE_FILTER_KEYS,
      campusData = null,
      isSelectingDest = false,
      onDestinationSelected,
      onWalkerClick,
      onHazardClick,
      onWalkGroupClick,
      onPlaceClick,
      floorToggles = [],
      activeFloorToggleId = null,
      onFloorToggleClick,
      events = [],
      onEventClick,
    },
    ref
  ) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const walkerMarkersRef = useRef<ManagedMapMarker[]>([]);
    const hazardMarkersRef = useRef<ManagedMapMarker[]>([]);
    const walkGroupMarkersRef = useRef<ManagedMapMarker[]>([]);
    const floorToggleMarkersRef = useRef<ManagedMapMarker[]>([]);
    const eventMarkersRef = useRef<ManagedMapMarker[]>([]);
    const markerVisibilityRef = useRef<MapMarkerVisibilityBinding | null>(null);
    const placePopupRef = useRef<mapboxgl.Popup | null>(null);
    const placeLookupRef = useRef<Map<string, PlaceLocation>>(new Map());
    const loadedPlaceIconKeysRef = useRef<Set<string>>(new Set());
    const placeLayerEventsBoundRef = useRef(false);
    const onPlaceClickRef = useRef(onPlaceClick);
    const isSelectingRef = useRef(isSelectingDest);
    const mapReadyRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);

    useEffect(() => {
      onPlaceClickRef.current = onPlaceClick;
    }, [onPlaceClick]);

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

    const showPlacePopup = (lng: number, lat: number, html: string) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      placePopupRef.current?.remove();
      placePopupRef.current = new mapboxgl.Popup({ offset: 12 })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map);
    };

    const handlePlaceFeatureClick = (
      event: mapboxgl.MapMouseEvent & {
        features?: mapboxgl.MapboxGeoJSONFeature[];
      }
    ) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") {
        return;
      }

      const properties = feature.properties as Partial<PlaceLayerFeatureProperties> | null;
      const placeId = properties?.placeId;
      const place = placeId ? placeLookupRef.current.get(placeId) ?? null : null;
      const [lng, lat] = feature.geometry.coordinates as [number, number];

      if (place) {
        showPlacePopup(lng, lat, createCampusPlacePopupHtml(place));
        onPlaceClickRef.current?.(place);
        return;
      }
    };

    const bindPlaceLayerEvents = (map: mapboxgl.Map) => {
      if (placeLayerEventsBoundRef.current) {
        return;
      }

      PLACE_INTERACTIVE_LAYER_IDS.forEach(layerId => {
        map.on("click", layerId, handlePlaceFeatureClick);
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      placeLayerEventsBoundRef.current = true;
    };

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
      markerVisibilityRef.current = bindManagedMapMarkerVisibility(map, () => [
        ...walkerMarkersRef.current,
        ...hazardMarkersRef.current,
        ...walkGroupMarkersRef.current,
        ...floorToggleMarkersRef.current,
        ...eventMarkersRef.current,
      ]);

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

      map.on("click", event => {
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
        markerVisibilityRef.current?.destroy();
        markerVisibilityRef.current = null;
        walkerMarkersRef.current.forEach(({ marker }) => marker.remove());
        hazardMarkersRef.current.forEach(({ marker }) => marker.remove());
        walkGroupMarkersRef.current.forEach(({ marker }) => marker.remove());
        placePopupRef.current?.remove();
        placePopupRef.current = null;
        userMarkerRef.current?.remove();
        destMarkerRef.current?.remove();
        walkerMarkersRef.current = [];
        hazardMarkersRef.current = [];
        walkGroupMarkersRef.current = [];
        floorToggleMarkersRef.current = [];
        eventMarkersRef.current = [];
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
          .setPopup(
            new mapboxgl.Popup({ offset: 15 }).setHTML("<strong>You</strong>")
          )
          .addTo(map);
        map.flyTo({
          center: [userLng, userLat],
          zoom: UWI_MONA_ZOOM,
          duration: 1000,
        });
      }
    }, [mapReady, userLat, userLng]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      walkerMarkersRef.current.forEach(({ marker }) => marker.remove());
      walkerMarkersRef.current = [];

      if (walkers.length === 0) {
        markerVisibilityRef.current?.sync();
        return;
      }

      const clusters = clusterPoints(walkers, 0.0005);

      clusters.forEach(cluster => {
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
          element.addEventListener("click", () =>
            onWalkerClick(cluster.items[0])
          );
        }

        walkerMarkersRef.current.push({
          baseSizePx:
            cluster.count > 1 ? Math.min(36, 24 + cluster.count * 2) : 12,
          element,
          marker,
          priority: cluster.count > 1 ? 18 : 12,
        });
      });

      markerVisibilityRef.current?.sync();
    }, [mapReady, walkers, onWalkerClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      hazardMarkersRef.current.forEach(({ marker }) => marker.remove());
      hazardMarkersRef.current = [];

      hazards.forEach(hazard => {
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

        hazardMarkersRef.current.push({
          baseSizePx: 34,
          element,
          marker,
          priority: 30,
        });
      });

      markerVisibilityRef.current?.sync();
    }, [mapReady, hazards, onHazardClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      walkGroupMarkersRef.current.forEach(({ marker }) => marker.remove());
      walkGroupMarkersRef.current = [];

      walkGroups.forEach(walkGroup => {
        if (
          !Number.isFinite(walkGroup.lat) ||
          !Number.isFinite(walkGroup.lng)
        ) {
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

        markerElement.addEventListener("click", event => {
          event.stopPropagation();
          marker.togglePopup();
          onWalkGroupClick?.(walkGroup);
        });

        walkGroupMarkersRef.current.push({
          baseSizePx: 40,
          element: markerElement,
          marker,
          priority: 24,
        });
      });

      markerVisibilityRef.current?.sync();
    }, [mapReady, onWalkGroupClick, walkGroups]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      floorToggleMarkersRef.current.forEach(({ marker }) => marker.remove());
      floorToggleMarkersRef.current = [];

      floorToggles.forEach(toggle => {
        const isActive = activeFloorToggleId === toggle.id;
        const element = document.createElement("div");
        element.className = `cactus-floor-toggle-marker ${isActive ? "active" : ""}`;
        element.innerHTML = `
          <div class="floor-toggle-inner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 15h-8L4 9h8z"/><path d="M18 15V9h-8"/>
            </svg>
            <span class="floor-label">${isActive ? "G" : toggle.targetFloor}</span>
          </div>
        `;

        const marker = new mapboxgl.Marker({ element, anchor: "center" })
          .setLngLat([toggle.lng, toggle.lat])
          .addTo(map);

        element.addEventListener("click", event => {
          event.stopPropagation();
          onFloorToggleClick?.(toggle);
        });

        floorToggleMarkersRef.current.push({
          baseSizePx: 34,
          element,
          marker,
          priority: 75,
        });
      });

      markerVisibilityRef.current?.sync();
    }, [mapReady, floorToggles, activeFloorToggleId, onFloorToggleClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      eventMarkersRef.current.forEach(({ marker }) => marker.remove());
      eventMarkersRef.current = [];

      events.forEach(event => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "cactus-event-marker";
        element.title = event.name;
        element.style.cssText = [
          "width:36px",
          "height:36px",
          "border-radius:999px",
          "padding:0",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "background:#ffffff",
          "border:2px solid #10b981",
          "box-shadow:0 8px 20px rgba(15,23,42,0.18)",
          "cursor:pointer",
          "color: #10b981",
        ].join(";");

        // GiPartyPopper-like SVG
        element.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01"/><path d="M9 2h.01"/><path d="M15 2h.01"/><path d="M4 8h.01"/><path d="M9 13h.01"/><path d="M18 3.3a3 3 0 0 0-4.4 0L4.6 12.3a3 3 0 0 0 0 4.4l1.1 1.1a3 3 0 0 0 4.4 0l9-9a3 3 0 0 0 0-4.4l-1.1-1.1Z"/><path d="m15 5 2 2"/><path d="m2 2 2.2 2.2"/><path d="m22 22-1.5-1.5"/><path d="m22 2-1.5 1.5"/><path d="m2 22 1.5-1.5"/><path d="M22 2 20.2 3.8"/>
          </svg>
        `;

        const marker = new mapboxgl.Marker(element)
          .setLngLat([event.lng, event.lat])
          .addTo(map);

        if (onEventClick) {
          element.addEventListener("click", () => onEventClick(event));
        }

        eventMarkersRef.current.push({
          baseSizePx: 36,
          element,
          marker,
          priority: 40,
        });
      });

      markerVisibilityRef.current?.sync();
    }, [mapReady, events, onEventClick]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) {
        return;
      }

      let cancelled = false;
      placeLookupRef.current = new Map(places.map(place => [place.id, place]));

      const syncPlaceLayers = async () => {
        const selectedPlace = selectedPlaceId
          ? placeLookupRef.current.get(selectedPlaceId) ?? null
          : null;
        const { categories, sourceData } = buildCampusPlaceLayerData(places);

        await ensurePlaceLayerIcons(map, categories, loadedPlaceIconKeysRef.current);

        if (cancelled) {
          return;
        }

        ensurePlaceSourcesAndLayers(map);
        bindPlaceLayerEvents(map);

        const source = map.getSource(PLACE_SOURCE_ID) as
          | mapboxgl.GeoJSONSource
          | undefined;
        source?.setData(sourceData);

        const selectedSource = map.getSource(SELECTED_PLACE_SOURCE_ID) as
          | mapboxgl.GeoJSONSource
          | undefined;
        selectedSource?.setData(
          buildSelectedPlaceFeatureCollection(selectedPlace, selectedFilters)
        );

        syncPlaceLayerFilter(map, selectedFilters);
      };

      void syncPlaceLayers();

      return () => {
        cancelled = true;
      };
    }, [mapReady, places, selectedFilters, selectedPlaceId]);

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
  const source = map.getSource("footpaths") as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (!source) {
    return;
  }

  const features = footpaths
    .map(footpath => {
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

function createCampusPlacePopupHtml(place: PlaceLocation) {
  const meta = getCategoryMeta(place.category);
  return `
    <div style="padding:8px 10px;background:#fff;color:#0f172a;border-radius:10px;min-width:150px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="font-size:13px;font-weight:700;line-height:1.3;color:#0f172a">${place.name}</div>
      <div style="font-size:11px;color:${meta.color};margin-top:2px">${meta.label}</div>
    </div>
  `;
}

function buildCampusPlaceLayerData(places: PlaceLocation[]) {
  const categories = Array.from(
    new Set(places.map(place => normalizePlaceLayerCategory(place.category)))
  );

  return {
    categories,
    sourceData: {
      type: "FeatureCollection" as const,
      features: places.map(place => createPlaceFeature(place)),
    },
  };
}

function buildSelectedPlaceFeatureCollection(
  selectedPlace: PlaceLocation | null,
  selectedFilters: MapPlaceFilterKey[]
) {
  if (!selectedPlace) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }

  const filterKey = getPlaceFilterKey(selectedPlace);
  if (!selectedFilters.includes(filterKey)) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }

  const meta = getCategoryMeta(selectedPlace.category);
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {
          featureKind: "place" as const,
          featureId: `selected-${selectedPlace.id}`,
          name: selectedPlace.name,
          category: selectedPlace.category,
          filterKey,
          iconKey: getPlaceLayerIconKey(selectedPlace.category),
          markerColor: meta.color,
          placeId: selectedPlace.id,
        },
        geometry: {
          type: "Point" as const,
          coordinates: selectedPlace.coordinates,
        },
      },
    ],
  };
}

async function ensurePlaceLayerIcons(
  map: mapboxgl.Map,
  categories: string[],
  loadedIconKeys: Set<string>
) {
  for (const category of categories) {
    const normalizedCategory = normalizePlaceLayerCategory(category);
    const iconKey = getPlaceLayerIconKey(normalizedCategory);

    if (loadedIconKeys.has(iconKey) || map.hasImage(iconKey)) {
      loadedIconKeys.add(iconKey);
      continue;
    }

    const image = await loadMarkerImage(getPlaceMarkerIcon(normalizedCategory));
    const markerCanvas = createPlaceMarkerCanvas(
      image,
      getCategoryMeta(normalizedCategory).color
    );

    if (!map.hasImage(iconKey)) {
      map.addImage(iconKey, markerCanvas, {
        pixelRatio:
          PLACE_MARKER_CANVAS_SIZE_PX / PLACE_MARKER_DISPLAY_SIZE_PX,
      });
    }

    loadedIconKeys.add(iconKey);
  }
}

function ensurePlaceSourcesAndLayers(map: mapboxgl.Map) {
  if (!map.getSource(PLACE_SOURCE_ID)) {
    map.addSource(PLACE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getSource(SELECTED_PLACE_SOURCE_ID)) {
    map.addSource(SELECTED_PLACE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(PLACE_LAYER_ID)) {
    map.addLayer({
      id: PLACE_LAYER_ID,
      type: "symbol",
      source: PLACE_SOURCE_ID,
      filter: buildSelectedFiltersExpression([]),
      layout: {
        "icon-image": ["get", "iconKey"],
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0.92,
          16,
          1,
          19,
          1.06,
        ],
        "icon-allow-overlap": false,
        "icon-ignore-placement": false,
        "icon-padding": 10,
      },
    });
  }

  if (!map.getLayer(SELECTED_PLACE_HALO_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_PLACE_HALO_LAYER_ID,
      type: "circle",
      source: SELECTED_PLACE_SOURCE_ID,
      paint: {
        "circle-radius": 24,
        "circle-color": ["coalesce", ["get", "markerColor"], "#2563eb"],
        "circle-opacity": 0.18,
        "circle-stroke-width": 2,
        "circle-stroke-color": ["coalesce", ["get", "markerColor"], "#2563eb"],
        "circle-stroke-opacity": 0.3,
      },
    });
  }

  if (!map.getLayer(SELECTED_PLACE_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_PLACE_LAYER_ID,
      type: "symbol",
      source: SELECTED_PLACE_SOURCE_ID,
      layout: {
        "icon-image": ["get", "iconKey"],
        "icon-size": 1.06,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

function syncPlaceLayerFilter(
  map: mapboxgl.Map,
  selectedFilters: MapPlaceFilterKey[]
) {
  if (!map.getLayer(PLACE_LAYER_ID)) {
    return;
  }

  map.setFilter(PLACE_LAYER_ID, buildSelectedFiltersExpression(selectedFilters));
}

function buildSelectedFiltersExpression(selectedFilters: MapPlaceFilterKey[]) {
  if (selectedFilters.length === 0) {
    return ["==", ["get", "filterKey"], "__hidden__"];
  }

  return [
    "any",
    ...selectedFilters.map(filterKey => ["==", ["get", "filterKey"], filterKey]),
  ];
}

function createPlaceFeature(place: PlaceLocation) {
  const meta = getCategoryMeta(place.category);
  const filterKey = getPlaceFilterKey(place);

  return {
    type: "Feature" as const,
    properties: {
      featureKind: "place" as const,
      featureId: place.id,
      name: place.name,
      category: place.category,
      filterKey,
      iconKey: getPlaceLayerIconKey(place.category),
      markerColor: meta.color,
      placeId: place.id,
    },
    geometry: {
      type: "Point" as const,
      coordinates: place.coordinates,
    },
  } satisfies GeoJSON.Feature<GeoJSON.Point, PlaceLayerFeatureProperties>;
}

function normalizePlaceLayerCategory(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getPlaceLayerIconKey(category: string) {
  return `campus-place-icon-${normalizePlaceLayerCategory(category)}`;
}

function loadMarkerImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Unable to load place icon for ${url}.`));
    image.src = url;
  });
}

function createPlaceMarkerCanvas(image: HTMLImageElement, ringColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = PLACE_MARKER_CANVAS_SIZE_PX;
  canvas.height = PLACE_MARKER_CANVAS_SIZE_PX;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create place marker canvas.");
  }

  const center = PLACE_MARKER_CANVAS_SIZE_PX / 2;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 4;
  context.beginPath();
  context.arc(center, center, PLACE_MARKER_RADIUS_PX, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.restore();

  context.beginPath();
  context.arc(center, center, PLACE_MARKER_RADIUS_PX, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = PLACE_MARKER_BORDER_WIDTH_PX;
  context.strokeStyle = ringColor;
  context.stroke();

  const iconSize = PLACE_ICON_BASE_SIZE_PX;
  const iconOffset = (PLACE_MARKER_CANVAS_SIZE_PX - iconSize) / 2;
  context.drawImage(image, iconOffset, iconOffset, iconSize, iconSize);

  return context.getImageData(0, 0, canvas.width, canvas.height);
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
