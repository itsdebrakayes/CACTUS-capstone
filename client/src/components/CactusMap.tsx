import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
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
  className?: string;
  userLat?: number;
  userLng?: number;
  walkers?: Walker[];
  hazards?: Hazard[];
  footpaths?: Footpath[];
  places?: PlaceLocation[];
  selectedPlaceId?: string | null;
  selectedFilters?: MapPlaceFilterKey[];
  campusData?: CampusDataset | null;
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
      className,
      userLat,
      userLng,
      walkers = [],
      hazards = [],
      footpaths = [],
      places = [],
      selectedPlaceId = null,
      selectedFilters = DEFAULT_MAP_PLACE_FILTER_KEYS,
      campusData = null,
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
    const walkerMarkersRef = useRef<ManagedMapMarker[]>([]);
    const hazardMarkersRef = useRef<ManagedMapMarker[]>([]);
    const walkGroupMarkersRef = useRef<ManagedMapMarker[]>([]);
    const markerVisibilityRef = useRef<MapMarkerVisibilityBinding | null>(null);
    const placePopupRef = useRef<mapboxgl.Popup | null>(null);
    const placeLookupRef = useRef<Map<string, PlaceLocation>>(new Map());
    const loadedPlaceIconKeysRef = useRef<Set<string>>(new Set());
    const placeLayerEventsBoundRef = useRef(false);
    const onPlaceClickRef = useRef(onPlaceClick);
    const isSelectingRef = useRef(isSelectingDest);
    const mapReadyRef = useRef(false);

    useEffect(() => {
      onPlaceClickRef.current = onPlaceClick;
    }, [onPlaceClick]);

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

    const showPlacePopup = (lng: number, lat: number, html: string) => {
      const map = mapRef.current;
      if (!map) return;

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
      if (!feature || feature.geometry.type !== "Point") return;

      const properties = feature.properties as Partial<PlaceLayerFeatureProperties> | null;
      const placeId = properties?.placeId;
      const place = placeId ? placeLookupRef.current.get(placeId) ?? null : null;
      const [lng, lat] = feature.geometry.coordinates as [number, number];

      if (place) {
        showPlacePopup(lng, lat, createCampusPlacePopupHtml(place));
        onPlaceClickRef.current?.(place);
      }
    };

    const bindPlaceLayerEvents = (map: mapboxgl.Map) => {
      if (placeLayerEventsBoundRef.current) return;

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

      markerVisibilityRef.current = bindManagedMapMarkerVisibility(map, () => [
        ...walkerMarkersRef.current,
        ...hazardMarkersRef.current,
        ...walkGroupMarkersRef.current,
      ]);

      // Map controls (from main)
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

        if (footpaths.length > 0) {
          renderFootpaths(map, footpaths);
        }
      });

      // Click handler for destination selection
      map.on("click", (e) => {
        if (!isSelectingRef.current) return;
        const { lng, lat } = e.lngLat;

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
          .setPopup(
            new mapboxgl.Popup({ offset: 15 }).setHTML("<strong>You</strong>")
          )
          .addTo(map);
        map.flyTo({ center: [userLng, userLat], zoom: UWI_MONA_ZOOM, duration: 1000 });
      }
    }, [userLat, userLng]);

    // Update walker markers with simple clustering
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      walkerMarkersRef.current.forEach((m) => m.marker.remove());
      walkerMarkersRef.current = [];

      if (walkers.length === 0) return;

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

        walkerMarkersRef.current.push({ marker, element: el, baseSizePx: 36, priority: 10 });
      });
    }, [walkers, onWalkerClick]);

    // Update hazard markers
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      hazardMarkersRef.current.forEach((m) => m.marker.remove());
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

        hazardMarkersRef.current.push({ marker, element: el, baseSizePx: 28, priority: 20 });
      });
    }, [hazards, onHazardClick]);

    // Update walk group markers
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      walkGroupMarkersRef.current.forEach(({ marker }) => marker.remove());
      walkGroupMarkersRef.current = [];

      markerVisibilityRef.current?.sync();
    }, [mapReadyRef.current]);

    // Sync place layers
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;

      let cancelled = false;
      placeLookupRef.current = new Map(places.map(place => [place.id, place]));

      const syncPlaceLayers = async () => {
        const selectedPlace = selectedPlaceId
          ? placeLookupRef.current.get(selectedPlaceId) ?? null
          : null;
        const { categories, sourceData } = buildCampusPlaceLayerData(places);

        await ensurePlaceLayerIcons(map, categories, loadedPlaceIconKeysRef.current);

        if (cancelled) return;

        ensurePlaceSourcesAndLayers(map);
        bindPlaceLayerEvents(map);

        const source = map.getSource(PLACE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        source?.setData(sourceData);

        const selectedSource = map.getSource(SELECTED_PLACE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        selectedSource?.setData(
          buildSelectedPlaceFeatureCollection(selectedPlace, selectedFilters)
        );

        syncPlaceLayerFilter(map, selectedFilters);
      };

      void syncPlaceLayers();

      return () => {
        cancelled = true;
      };
    }, [places, selectedFilters, selectedPlaceId]);

    // Update footpaths
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;
      renderFootpaths(map, footpaths);
    }, [footpaths]);

    return (
      <div ref={mapContainer} className={className ?? "w-full h-full relative"}>
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
    return { type: "FeatureCollection" as const, features: [] };
  }

  const filterKey = getPlaceFilterKey(selectedPlace);
  if (!selectedFilters.includes(filterKey)) {
    return { type: "FeatureCollection" as const, features: [] };
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
        pixelRatio: PLACE_MARKER_CANVAS_SIZE_PX / PLACE_MARKER_DISPLAY_SIZE_PX,
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
          13, 0.92,
          16, 1,
          19, 1.06,
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

function syncPlaceLayerFilter(map: mapboxgl.Map, selectedFilters: MapPlaceFilterKey[]) {
  if (!map.getLayer(PLACE_LAYER_ID)) return;
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
    image.onerror = () => reject(new Error(`Unable to load place icon for ${url}.`));
    image.src = url;
  });
}

function createPlaceMarkerCanvas(image: HTMLImageElement, ringColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = PLACE_MARKER_CANVAS_SIZE_PX;
  canvas.height = PLACE_MARKER_CANVAS_SIZE_PX;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create place marker canvas.");

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