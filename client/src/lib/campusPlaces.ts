import {
  Bath,
  BookOpen,
  BriefcaseBusiness,
  Building,
  Building2,
  CarFront,
  CircleDollarSign,
  FlaskConical,
  GraduationCap,
  Leaf,
  MapPin,
  TreePine,
  UtensilsCrossed,
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
const SOURCE_CATEGORY_OVERRIDES = new Set(["atm", "food", "hall", "study_area"]);

export type Coord2 = [number, number];

export interface CategoryMeta {
  label: string;
  color: string;
  icon: LucideIcon;
}

export type MapPlaceFilterKey =
  | "atm"
  | "classroom"
  | "food"
  | "study_area"
  | "hall"
  | "faculty"
  | "library"
  | "landmark"
  | "office"
  | "parking"
  | "restroom";

export interface MapPlaceFilterOption {
  key: MapPlaceFilterKey;
  label: string;
  color: string;
  icon: LucideIcon;
}

export interface PlaceLocation {
  id: string;
  name: string;
  category: string;
  coordinates: Coord2;
  parentName?: string | null;
  sourceCategory?: string | null;
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
  parent_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_active?: boolean | null;
}

type RawPlaceGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.MultiLineString,
  { id?: string; name?: string; category?: string }
>;

const CATEGORY_META: Record<string, CategoryMeta> = {
  atm: { label: "ATM", color: "#0f766e", icon: CircleDollarSign },
  building: { label: "Building", color: "#0d9488", icon: Building2 },
  classroom: { label: "Classroom", color: "#2563eb", icon: GraduationCap },
  faculty: { label: "Faculty", color: "#059669", icon: Building2 },
  food: { label: "Food", color: "#ea580c", icon: UtensilsCrossed },
  garden: { label: "Garden", color: "#16a34a", icon: TreePine },
  hall: { label: "Hall", color: "#b45309", icon: Building },
  lab: { label: "Lab", color: "#7c3aed", icon: FlaskConical },
  landmark: { label: "Landmark", color: "#0284c7", icon: MapPin },
  library: { label: "Library", color: "#0891b2", icon: BookOpen },
  office: { label: "Office", color: "#d97706", icon: BriefcaseBusiness },
  parking: { label: "Parking", color: "#64748b", icon: CarFront },
  restroom: { label: "Restroom", color: "#94a3b8", icon: Bath },
  study_area: { label: "Study Area", color: "#65a30d", icon: Leaf },
};

const MAP_PLACE_FILTERS_BY_KEY: Record<MapPlaceFilterKey, MapPlaceFilterOption> =
{
  atm: {
    key: "atm",
    label: "ATM",
    color: CATEGORY_META.atm.color,
    icon: CircleDollarSign,
  },
  classroom: {
    key: "classroom",
    label: "Classrooms",
    color: CATEGORY_META.classroom.color,
    icon: GraduationCap,
  },
  food: {
    key: "food",
    label: "Food",
    color: CATEGORY_META.food.color,
    icon: UtensilsCrossed,
  },
  study_area: {
    key: "study_area",
    label: "Study Areas",
    color: CATEGORY_META.study_area.color,
    icon: BookOpen,
  },
  hall: {
    key: "hall",
    label: "Halls",
    color: CATEGORY_META.hall.color,
    icon: Building,
  },
  faculty: {
    key: "faculty",
    label: "Faculty",
    color: CATEGORY_META.faculty.color,
    icon: Building2,
  },
  library: {
    key: "library",
    label: "Libraries",
    color: CATEGORY_META.library.color,
    icon: BookOpen,
  },
  landmark: {
    key: "landmark",
    label: "Landmarks",
    color: CATEGORY_META.landmark.color,
    icon: MapPin,
  },
  office: {
    key: "office",
    label: "Offices",
    color: CATEGORY_META.office.color,
    icon: BriefcaseBusiness,
  },
  parking: {
    key: "parking",
    label: "Parking",
    color: CATEGORY_META.parking.color,
    icon: CarFront,
  },
  restroom: {
    key: "restroom",
    label: "Restrooms",
    color: CATEGORY_META.restroom.color,
    icon: Bath,
  },
};

export const MAP_PLACE_FILTERS: MapPlaceFilterOption[] = [
  MAP_PLACE_FILTERS_BY_KEY.atm,
  MAP_PLACE_FILTERS_BY_KEY.classroom,
  MAP_PLACE_FILTERS_BY_KEY.food,
  MAP_PLACE_FILTERS_BY_KEY.study_area,
  MAP_PLACE_FILTERS_BY_KEY.hall,
  MAP_PLACE_FILTERS_BY_KEY.faculty,
  MAP_PLACE_FILTERS_BY_KEY.library,
  MAP_PLACE_FILTERS_BY_KEY.landmark,
  MAP_PLACE_FILTERS_BY_KEY.office,
  MAP_PLACE_FILTERS_BY_KEY.parking,
  MAP_PLACE_FILTERS_BY_KEY.restroom,
];

export const DEFAULT_MAP_PLACE_FILTER_KEYS = MAP_PLACE_FILTERS.map(
  filter => filter.key
);

let cachedCampusPlaceData: CampusPlaceDataBundle | null = null;
let campusPlaceDataPromise: Promise<CampusPlaceDataBundle> | null = null;

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[normalizePlaceCategory(category)] ?? CATEGORY_META.landmark;
}

export function getPlaceFilterMeta(filterKey: MapPlaceFilterKey) {
  return MAP_PLACE_FILTERS_BY_KEY[filterKey];
}

export function getPlaceFilterKey(
  place: Pick<PlaceLocation, "category" | "name" | "sourceCategory">
): MapPlaceFilterKey {
  const sourceCategory = normalizePlaceCategory(place.sourceCategory);
  if (isMapPlaceFilterKey(sourceCategory)) {
    return sourceCategory;
  }

  const category = normalizePlaceCategory(place.category);
  const normalizedName = normalizeSearchText(place.name);

  switch (category) {
    case "atm":
    case "classroom":
    case "food":
    case "study_area":
    case "hall":
    case "faculty":
    case "library":
    case "office":
    case "parking":
    case "restroom":
      return category;
    case "building":
      return "faculty";
    case "garden":
      return "study_area";
    case "lab":
      return "classroom";
    case "landmark":
      if (normalizedName.includes("atm") || normalizedName.includes("bank")) {
        return "atm";
      }
      if (
        normalizedName.includes("gazebo") ||
        normalizedName.includes("study")
      ) {
        return "study_area";
      }
      return "landmark";
    default:
      return "landmark";
  }
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
        category: normalizePlaceCategory(
          sourceFeature?.properties?.category?.trim() ||
          location.category ||
          "landmark"
        ),
        coordinates: location.coordinates,
        parentName: null,
        sourceCategory: normalizePlaceCategory(
          sourceFeature?.properties?.category?.trim() ||
          location.category ||
          "landmark"
        ),
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
  const locations: PlaceLocation[] = [];

  rows.forEach((row, index) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!row.name || !row.type || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const coordinates = [lng, lat] as Coord2;
    const snap = findNearestCampusPathSnap(campusData, coordinates);
    locations.push({
      id:
        row.source_id?.trim() ||
        row.id?.trim() ||
        `supabase-place-${index + 1}`,
      name: row.name.trim(),
      category: resolveSupabasePlaceCategory(row),
      coordinates,
      parentName: row.parent_name?.trim() || null,
      sourceCategory: normalizePlaceCategory(row.source_category),
      nearestNodeId: snap?.startNodeId ?? "",
      nearestNodeName: "Campus Path",
      nearestNodeDistanceM: snap?.distanceM ?? 0,
    });
  });

  locations.sort((a, b) => a.name.localeCompare(b.name));

  if (locations.length === 0) {
    throw new Error("Supabase map_places returned no valid rows.");
  }

  return {
    locations,
    bounds: createBoundsFromCoordinates(locations.map(location => location.coordinates)),
  };
}

function resolveSupabasePlaceCategory(row: SupabaseMapPlaceRow) {
  const typeCategory = normalizePlaceCategory(row.type);
  const sourceCategory = normalizePlaceCategory(row.source_category);

  if (sourceCategory && SOURCE_CATEGORY_OVERRIDES.has(sourceCategory)) {
    return sourceCategory;
  }

  return typeCategory || "landmark";
}

function isMapPlaceFilterKey(value: string): value is MapPlaceFilterKey {
  return Object.prototype.hasOwnProperty.call(MAP_PLACE_FILTERS_BY_KEY, value);
}

function normalizePlaceCategory(category?: string | null) {
  const normalized = (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) {
    return "";
  }

  if (normalized === "bathroom") {
    return "restroom";
  }

  return normalized;
}
