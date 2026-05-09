import {
  Bath,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CarFront,
  FlaskConical,
  GraduationCap,
  MapPin,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import {
  buildCampusDataset,
  findNearestCampusPathSnap,
  type CampusDataset,
} from "@/lib/findWayGeo";

export const PLACE_DATA_URL = new URL("../contexts/uwipath.json", import.meta.url)
  .href;
export const CAMPUS_GRAPH_DATA_URL = new URL(
  "../../../scripts/campus_adjacency_list_only.json",
  import.meta.url
).href;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const SUPABASE_MAP_TABLE = "map_places";

export type Coord2 = [number, number];

export interface CategoryMeta {
  label: string;
  color: string;
  icon: LucideIcon;
}

export interface PlaceLocation {
  id: string;
  name: string;
  category: string;
  coordinates: Coord2;
  nearestNodeId: string;
  nearestNodeName: string;
  nearestNodeDistanceM: number;
}

export interface PlaceDataset {
  locations: PlaceLocation[];
  bounds: { west: number; south: number; east: number; north: number };
}

export interface NavigationDestination {
  id: string;
  label: string;
  lat: number;
  lng: number;
  category: string;
}

export interface CampusPlaceDataBundle {
  raw: unknown;
  campusData: CampusDataset;
  placeData: PlaceDataset;
}

interface SupabaseMapPlaceRow {
  id?: string;
  source_id?: string | null;
  name?: string | null;
  type?: string | null;
  source_category?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_active?: boolean | null;
}

type RawPlaceGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.MultiLineString,
  { id?: string; name?: string; category?: string }
>;

const CATEGORY_META: Record<string, CategoryMeta> = {
  building: { label: "Building", color: "#0d9488", icon: Building2 },
  classroom: { label: "Classroom", color: "#2563eb", icon: GraduationCap },
  faculty: { label: "Faculty", color: "#059669", icon: Building2 },
  garden: { label: "Garden", color: "#16a34a", icon: TreePine },
  lab: { label: "Lab", color: "#7c3aed", icon: FlaskConical },
  landmark: { label: "Landmark", color: "#0284c7", icon: MapPin },
  library: { label: "Library", color: "#0891b2", icon: BookOpen },
  office: { label: "Office", color: "#d97706", icon: BriefcaseBusiness },
  parking: { label: "Parking", color: "#64748b", icon: CarFront },
  restroom: { label: "Restroom", color: "#94a3b8", icon: Bath },
};

let cachedCampusPlaceData: CampusPlaceDataBundle | null = null;
let campusPlaceDataPromise: Promise<CampusPlaceDataBundle> | null = null;

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.landmark;
}

export function buildPlaceDataset(
  raw: unknown,
  campusData: CampusDataset
): PlaceDataset {
  const features = Array.isArray((raw as RawPlaceGeoJson)?.features)
    ? (raw as RawPlaceGeoJson).features
    : [];
  const pointFeatureMap = new Map(
    features
      .filter(
        (
          feature
        ): feature is GeoJSON.Feature<
          GeoJSON.Point,
          { id?: string; name?: string; category?: string }
        > => feature?.geometry?.type === "Point"
      )
      .map(feature => [feature.properties?.id?.trim() ?? "", feature])
  );

  const locations = campusData.locations
    .map((location, index) => {
      const sourceFeature = pointFeatureMap.get(location.id);
      const snap = findNearestCampusPathSnap(campusData, location.coordinates);
      return {
        id: location.id || `place-${index + 1}`,
        name:
          sourceFeature?.properties?.name?.trim() ||
          location.name ||
          `Place ${index + 1}`,
        category:
          sourceFeature?.properties?.category?.trim() ||
          location.category ||
          "landmark",
        coordinates: location.coordinates,
        nearestNodeId: location.snapNodeId,
        nearestNodeName: "Campus Path",
        nearestNodeDistanceM: snap?.distanceM ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (locations.length === 0) {
    throw new Error("No room or place points were found in uwipath.json.");
  }

  return {
    locations,
    bounds: createBoundsFromCoordinates(locations.map(location => location.coordinates)),
  };
}

export function getCachedCampusPlaceData() {
  return cachedCampusPlaceData;
}

export async function loadCampusPlaceData(options?: { force?: boolean }) {
  if (!options?.force && cachedCampusPlaceData) {
    return cachedCampusPlaceData;
  }

  if (!options?.force && campusPlaceDataPromise) {
    return campusPlaceDataPromise;
  }

  campusPlaceDataPromise = (async () => {
    const [raw, graphRaw] = await Promise.all([
      loadCampusGeoJson(),
      loadCampusAdjacencyJson().catch(() => null),
    ]);
    const campusData = graphRaw
      ? buildCampusDataset(graphRaw, raw)
      : buildCampusDataset(raw);
    let placeData: PlaceDataset;

    try {
      const supabasePlaces = await loadSupabasePlaces(campusData);
      placeData =
        supabasePlaces.locations.length > 0
          ? supabasePlaces
          : buildPlaceDataset(raw, campusData);
    } catch {
      placeData = buildPlaceDataset(raw, campusData);
    }

    const bundle = { raw, campusData, placeData };
    cachedCampusPlaceData = bundle;
    return bundle;
  })();

  try {
    return await campusPlaceDataPromise;
  } finally {
    campusPlaceDataPromise = null;
  }
}

export function buildNavigationDestinations(
  places: PlaceLocation[]
): NavigationDestination[] {
  return places.map(place => ({
    id: place.id,
    label: place.name,
    lat: place.coordinates[1],
    lng: place.coordinates[0],
    category: place.category,
  }));
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
      west: -76.7509,
      south: 18.0043,
      east: -76.7489,
      north: 18.0063,
    };
  }

  return { west, south, east, north };
}

async function loadCampusGeoJson() {
  const response = await fetch(PLACE_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load uwipath.json (${response.status})`);
  }
  return response.json();
}

async function loadCampusAdjacencyJson() {
  const response = await fetch(CAMPUS_GRAPH_DATA_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to load campus_adjacency_list_only.json (${response.status})`
    );
  }
  return response.json();
}

async function loadSupabasePlaces(campusData: CampusDataset): Promise<PlaceDataset> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase place env vars are not configured.");
  }

  const url = new URL(`/rest/v1/${SUPABASE_MAP_TABLE}`, SUPABASE_URL);
  url.searchParams.set(
    "select",
    "id,source_id,name,type,source_category,lat,lng,is_active"
  );
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("order", "name.asc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Supabase map places (${response.status})`);
  }

  const rows = (await response.json()) as SupabaseMapPlaceRow[];
  return buildPlaceDatasetFromRows(rows, campusData);
}

function buildPlaceDatasetFromRows(
  rows: SupabaseMapPlaceRow[],
  campusData: CampusDataset
): PlaceDataset {
  const locations = rows
    .map((row, index) => {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!row.name || !row.type || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const coordinates = [lng, lat] as Coord2;
      const snap = findNearestCampusPathSnap(campusData, coordinates);
      return {
        id:
          row.source_id?.trim() ||
          row.id?.trim() ||
          `supabase-place-${index + 1}`,
        name: row.name.trim(),
        category: row.type.trim(),
        coordinates,
        nearestNodeId: snap?.startNodeId ?? "",
        nearestNodeName: "Campus Path",
        nearestNodeDistanceM: snap?.distanceM ?? 0,
      } satisfies PlaceLocation;
    })
    .filter((location): location is PlaceLocation => location !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (locations.length === 0) {
    throw new Error("Supabase map_places returned no valid rows.");
  }

  return {
    locations,
    bounds: createBoundsFromCoordinates(locations.map(location => location.coordinates)),
  };
}
