export type RouteMode = "shortest" | "scenic" | "accessible" | "safe_night" | "shortcut";

type Coord2 = [number, number];
type Coord3 = [number, number, number?];

interface LocationProperties {
  id: string;
  name: string;
  category: string;
}

interface GraphEdge {
  to: string;
  distanceM: number;
  elevationDeltaM: number;
  grade: number;
  scenicScore: number;
  activityScore: number;
}

interface GraphNode {
  id: string;
  name?: string | null;
  coordinates: Coord3;
  edges: GraphEdge[];
}

export interface CampusLocation {
  id: string;
  name: string;
  category: string;
  coordinates: Coord2;
  elevation?: number;
  snapNodeId: string;
}

export interface CampusDataset {
  center: Coord2;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  locations: CampusLocation[];
  network: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  graph: Map<string, GraphNode>;
}

const COMPONENT_CACHE = new WeakMap<CampusDataset, Map<string, number>>();

export function createCampusNodeCollection(
  dataset: CampusDataset
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: Array.from(dataset.graph.values()).map(node => ({
      type: "Feature",
      properties: {
        id: node.id,
        name: node.name ?? node.id,
      },
      geometry: {
        type: "Point",
        coordinates: [node.coordinates[0], node.coordinates[1]],
      },
    })),
  };
}

function buildCampusComponentMap(dataset: CampusDataset): Map<string, number> {
  const cached = COMPONENT_CACHE.get(dataset);
  if (cached) {
    return cached;
  }

  const componentMap = new Map<string, number>();
  let componentId = 0;

  for (const nodeId of Array.from(dataset.graph.keys())) {
    if (componentMap.has(nodeId)) {
      continue;
    }

    const stack = [nodeId];
    componentMap.set(nodeId, componentId);

    while (stack.length > 0) {
      const currentNodeId = stack.pop();
      if (!currentNodeId) {
        continue;
      }

      const node = dataset.graph.get(currentNodeId);
      if (!node) {
        continue;
      }

      for (const edge of node.edges) {
        if (!dataset.graph.has(edge.to) || componentMap.has(edge.to)) {
          continue;
        }

        componentMap.set(edge.to, componentId);
        stack.push(edge.to);
      }
    }

    componentId += 1;
  }

  COMPONENT_CACHE.set(dataset, componentMap);
  return componentMap;
}

export function getCampusNodeComponentId(
  dataset: CampusDataset,
  nodeId: string
): number | null {
  const componentMap = buildCampusComponentMap(dataset);
  return componentMap.get(nodeId) ?? null;
}

export function areCampusNodesConnected(
  dataset: CampusDataset,
  fromNodeId: string,
  toNodeId: string
): boolean {
  const fromComponentId = getCampusNodeComponentId(dataset, fromNodeId);
  const toComponentId = getCampusNodeComponentId(dataset, toNodeId);
  return (
    fromComponentId !== null &&
    toComponentId !== null &&
    fromComponentId === toComponentId
  );
}

export interface CampusComponentNode {
  nodeId: string;
  name: string;
  coordinates: Coord2;
  edgeCount: number;
}

export function listCampusComponentNodes(
  dataset: CampusDataset,
  componentId: number
): CampusComponentNode[] {
  return Array.from(dataset.graph.values())
    .filter(node => getCampusNodeComponentId(dataset, node.id) === componentId)
    .map(node => ({
      nodeId: node.id,
      name: node.name ?? node.id,
      coordinates: [node.coordinates[0], node.coordinates[1]],
      edgeCount: node.edges.length,
    }));
}

export interface PlannedRoute {
  mode: RouteMode;
  coordinates: Coord2[];
  distanceM: number;
  walkTimeSec: number;
  safetyScore: number;
  landmarks: CampusLocation[];
}

export interface CampusNodeMatch {
  nodeId: string;
  coordinates: Coord2;
  distanceM: number;
}

export interface CampusPathSnap {
  coordinates: Coord2;
  distanceM: number;
  startNodeId: string;
  endNodeId: string;
  startNodeCoordinates: Coord2;
  endNodeCoordinates: Coord2;
  distanceToStartM: number;
  distanceToEndM: number;
}

type RawCampusGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.MultiLineString,
  Partial<LocationProperties>
>;

interface RawCampusAdjacencyNode {
  id?: string;
  name?: string | null;
  location?: [number, number] | null;
  lat?: number | null;
  lng?: number | null;
}

interface RawCampusAdjacencyEdge {
  to?: string;
  name?: string | null;
  location?: [number, number] | null;
  distance_m?: number | null;
}

interface RawCampusAdjacencyGraph {
  nodes?: RawCampusAdjacencyNode[];
  adjacency?: Record<
    string,
    RawCampusAdjacencyEdge[] | RawCampusAdjacencyEdge | null | undefined
  >;
}

const LOCATION_SCENIC_WEIGHT: Record<string, number> = {
  garden: 1.8,
  library: 1.2,
  landmark: 0.9,
  building: 0.6,
  classroom: 0.4,
  lab: 0.5,
  office: 0.4,
  restroom: 0.2,
  parking: 0.1,
};

const LOCATION_ACTIVITY_WEIGHT: Record<string, number> = {
  classroom: 1.6,
  building: 1.4,
  lab: 1.3,
  office: 1.2,
  library: 1.1,
  restroom: 0.9,
  landmark: 0.6,
  garden: 0.5,
  parking: 0.3,
};

const WALKING_SPEED_MPS: Record<RouteMode, number> = {
  shortest: 1.42,
  scenic: 1.22,
  shortcut: 1.5,
  accessible: 1.18,
  safe_night: 1.2,
};

export function buildCampusDataset(
  raw: unknown,
  locationRaw?: unknown
): CampusDataset {
  if (isCampusAdjacencyGraph(raw)) {
    return buildCampusDatasetFromAdjacency(
      raw,
      (locationRaw ?? null) as RawCampusGeoJson | null
    );
  }

  return buildCampusDatasetFromGeoJson(
    raw as RawCampusGeoJson,
    (locationRaw ?? raw) as RawCampusGeoJson
  );
}

function buildCampusDatasetFromGeoJson(
  data: RawCampusGeoJson,
  locationSource: RawCampusGeoJson
): CampusDataset {
  const features = Array.isArray(data?.features) ? data.features : [];
  const pointFeatures = extractPointFeatures(locationSource);
  const networkFeatures = features.filter(
    (
      feature
    ): feature is GeoJSON.Feature<
      GeoJSON.MultiLineString,
      Partial<LocationProperties>
    > => feature?.geometry?.type === "MultiLineString"
  );

  if (networkFeatures.length === 0) {
    throw new Error("Campus path network is missing from the map source.");
  }

  const graph = new Map<string, GraphNode>();

  for (const networkFeature of networkFeatures) {
    for (const line of networkFeature.geometry.coordinates) {
      if (line.length < 2) {
        for (const coordinate of line) {
          ensureGraphNode(graph, toCoord3(coordinate));
        }
        continue;
      }

      for (let index = 1; index < line.length; index += 1) {
        const from = toCoord3(line[index - 1]);
        const to = toCoord3(line[index]);
        const fromNode = ensureGraphNode(graph, from);
        const toNode = ensureGraphNode(graph, to);
        connectGraphNodes(fromNode, toNode);
        connectGraphNodes(toNode, fromNode);
      }
    }
  }

  connectIsolatedNodes(graph, 35);
  const locations = buildCampusLocations(graph, pointFeatures);
  annotateGraph(graph, locations);

  const bounds = createBounds(features);
  const network: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: "FeatureCollection",
    features: networkFeatures.flatMap((networkFeature, featureIndex) =>
      networkFeature.geometry.coordinates
        .filter(line => line.length >= 2)
        .map((line, lineIndex) => ({
          type: "Feature",
          properties: {
            id: `segment-${featureIndex + 1}-${lineIndex + 1}`,
          },
          geometry: {
            type: "LineString",
            coordinates: line.map(coordinate => toCoord2(coordinate)),
          },
        }))
    ),
  };

  return {
    center: [
      (bounds.west + bounds.east) / 2,
      (bounds.south + bounds.north) / 2,
    ],
    bounds,
    locations,
    network,
    graph,
  };
}

function buildCampusDatasetFromAdjacency(
  data: RawCampusAdjacencyGraph,
  locationSource: RawCampusGeoJson | null
): CampusDataset {
  const graph = new Map<string, GraphNode>();
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];

  for (const rawNode of rawNodes) {
    const normalized = normalizeAdjacencyNode(rawNode);
    if (!normalized) {
      continue;
    }

    graph.set(normalized.id, {
      id: normalized.id,
      name: normalized.name,
      coordinates: normalized.coordinates,
      edges: [],
    });
  }

  if (graph.size === 0) {
    throw new Error("Campus adjacency graph does not contain any valid nodes.");
  }

  const adjacencyEntries =
    data.adjacency && typeof data.adjacency === "object"
      ? Object.entries(data.adjacency)
      : [];

  for (const [fromNodeId, rawAdjacency] of adjacencyEntries) {
    const fromNode = graph.get(fromNodeId);
    if (!fromNode) {
      continue;
    }

    const neighbors = Array.isArray(rawAdjacency)
      ? rawAdjacency
      : rawAdjacency
        ? [rawAdjacency]
        : [];

    for (const neighbor of neighbors) {
      if (!neighbor?.to) {
        continue;
      }

      const toNode =
        graph.get(neighbor.to) ?? ensureAdjacencyNodeFromEdge(graph, neighbor);
      if (!toNode) {
        continue;
      }

      const distanceM =
        typeof neighbor.distance_m === "number" && Number.isFinite(neighbor.distance_m)
          ? neighbor.distance_m
          : undefined;

      connectGraphNodes(fromNode, toNode, distanceM);
      connectGraphNodes(toNode, fromNode, distanceM);
    }
  }

  const pointFeatures = locationSource ? extractPointFeatures(locationSource) : [];
  const locations = buildCampusLocations(graph, pointFeatures);
  annotateGraph(graph, locations);

  const bounds = createBoundsFromGraphAndLocations(graph, locations);
  const network = createNetworkFeatureCollection(graph);

  return {
    center: [
      (bounds.west + bounds.east) / 2,
      (bounds.south + bounds.north) / 2,
    ],
    bounds,
    locations,
    network,
    graph,
  };
}

function buildCampusLocations(
  graph: Map<string, GraphNode>,
  pointFeatures: Array<
    GeoJSON.Feature<GeoJSON.Point, Partial<LocationProperties>>
  >
): CampusLocation[] {
  return pointFeatures
    .map(feature => {
      const coordinates = toCoord3(feature.geometry.coordinates);
      const nearestNode = findNearestGraphNode(graph, coordinates);
      if (!nearestNode) {
        throw new Error(
          `Unable to snap ${feature.properties?.name ?? "location"} to the path network.`
        );
      }

      return {
        id: feature.properties?.id ?? coordKey(coordinates),
        name: feature.properties?.name ?? "Unknown location",
        category: feature.properties?.category ?? "landmark",
        coordinates: [coordinates[0], coordinates[1]] as Coord2,
        elevation: coordinates[2],
        snapNodeId: nearestNode.id,
      } satisfies CampusLocation;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getLocationById(
  dataset: CampusDataset,
  locationId: string
): CampusLocation | undefined {
  return dataset.locations.find(location => location.id === locationId);
}

export function findNearestCampusNode(
  dataset: CampusDataset,
  coordinates: Coord2
): CampusNodeMatch | null {
  const nearestNode = findNearestGraphNode(dataset.graph, [
    coordinates[0],
    coordinates[1],
  ]);

  if (!nearestNode) {
    return null;
  }

  return {
    nodeId: nearestNode.id,
    coordinates: [nearestNode.coordinates[0], nearestNode.coordinates[1]],
    distanceM: haversineMeters(coordinates, [
      nearestNode.coordinates[0],
      nearestNode.coordinates[1],
    ]),
  };
}

export function findNearestCampusPathSnap(
  dataset: CampusDataset,
  coordinates: Coord2
): CampusPathSnap | null {
  let bestSnap: CampusPathSnap | null = null;
  const visitedSegments = new Set<string>();

  for (const node of Array.from(dataset.graph.values())) {
    for (const edge of node.edges) {
      const segmentId = [node.id, edge.to].sort().join("::");
      if (visitedSegments.has(segmentId)) {
        continue;
      }
      visitedSegments.add(segmentId);

      const toNode = dataset.graph.get(edge.to);
      if (!toNode) {
        continue;
      }

      const startCoordinates: Coord2 = [
        node.coordinates[0],
        node.coordinates[1],
      ];
      const endCoordinates: Coord2 = [
        toNode.coordinates[0],
        toNode.coordinates[1],
      ];
      const projection = projectPointToSegment(
        coordinates,
        startCoordinates,
        endCoordinates
      );

      if (!bestSnap || projection.distanceM < bestSnap.distanceM) {
        bestSnap = {
          coordinates: projection.coordinates,
          distanceM: projection.distanceM,
          startNodeId: node.id,
          endNodeId: toNode.id,
          startNodeCoordinates: startCoordinates,
          endNodeCoordinates: endCoordinates,
          distanceToStartM: edge.distanceM * projection.t,
          distanceToEndM: edge.distanceM * (1 - projection.t),
        };
      }
    }
  }

  if (bestSnap) {
    return bestSnap;
  }

  const nearestNode = findNearestCampusNode(dataset, coordinates);
  if (!nearestNode) {
    return null;
  }

  return {
    coordinates: nearestNode.coordinates,
    distanceM: nearestNode.distanceM,
    startNodeId: nearestNode.nodeId,
    endNodeId: nearestNode.nodeId,
    startNodeCoordinates: nearestNode.coordinates,
    endNodeCoordinates: nearestNode.coordinates,
    distanceToStartM: 0,
    distanceToEndM: 0,
  };
}

export function getCampusNodeCoordinates(
  dataset: CampusDataset,
  nodeId: string
): Coord2 | null {
  const node = dataset.graph.get(nodeId);
  if (!node) {
    return null;
  }

  return [node.coordinates[0], node.coordinates[1]];
}

export function planAllCampusRoutes(
  dataset: CampusDataset,
  fromLocationId: string,
  toLocationId: string,
  options?: {
    isRainy?: boolean;
  }
): Record<RouteMode, PlannedRoute | null> {
  return {
    shortest: planCampusRoute(
      dataset,
      fromLocationId,
      toLocationId,
      "shortest",
      options
    ),
    shortcut: planCampusRoute(
      dataset,
      fromLocationId,
      toLocationId,
      "shortcut",
      options
    ),
    scenic: planCampusRoute(
      dataset,
      fromLocationId,
      toLocationId,
      "scenic",
      options
    ),
    accessible: planCampusRoute(
      dataset,
      fromLocationId,
      toLocationId,
      "accessible",
      options
    ),
    safe_night: planCampusRoute(
      dataset,
      fromLocationId,
      toLocationId,
      "safe_night",
      options
    ),
  };
}

export function planCampusRouteBetweenNodes(
  dataset: CampusDataset,
  fromNodeId: string,
  toNodeId: string,
  mode: RouteMode,
  options?: {
    isRainy?: boolean;
  }
): PlannedRoute | null {
  const { nodeIds, edges } = dijkstra(
    dataset,
    fromNodeId,
    toNodeId,
    mode,
    options?.isRainy ?? false
  );

  if (nodeIds.length === 0) {
    return null;
  }

  const coordinates = nodeIds
    .map(nodeId => getCampusNodeCoordinates(dataset, nodeId))
    .filter((coordinate): coordinate is Coord2 => coordinate != null);

  const distanceM = edges.reduce((sum, edge) => sum + edge.distanceM, 0);
  const walkTimeSec =
    distanceM /
    (WALKING_SPEED_MPS[mode] * ((options?.isRainy ?? false) ? 0.92 : 1));

  return {
    mode,
    coordinates,
    distanceM,
    walkTimeSec,
    safetyScore: computeSafetyScore(edges, mode, options?.isRainy ?? false),
    landmarks: getLandmarksAlongRoute(dataset.locations, nodeIds, coordinates),
  };
}

function planCampusRoute(
  dataset: CampusDataset,
  fromLocationId: string,
  toLocationId: string,
  mode: RouteMode,
  options?: {
    isRainy?: boolean;
  }
): PlannedRoute | null {
  const from = getLocationById(dataset, fromLocationId);
  const to = getLocationById(dataset, toLocationId);

  if (!from || !to) {
    return null;
  }

  return planCampusRouteBetweenNodes(
    dataset,
    from.snapNodeId,
    to.snapNodeId,
    mode,
    options
  );
}

function dijkstra(
  dataset: CampusDataset,
  fromNodeId: string,
  toNodeId: string,
  mode: RouteMode,
  isRainy: boolean
): {
  nodeIds: string[];
  edges: GraphEdge[];
} {
  if (fromNodeId === toNodeId) {
    return {
      nodeIds: [fromNodeId],
      edges: [],
    };
  }

  const queue = new Set<string>(dataset.graph.keys());
  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; edge: GraphEdge }>();

  for (const nodeId of Array.from(queue)) {
    distances.set(nodeId, Number.POSITIVE_INFINITY);
  }
  distances.set(fromNodeId, 0);

  while (queue.size > 0) {
    const currentNodeId = getLowestDistanceNode(queue, distances);
    if (!currentNodeId) {
      break;
    }

    queue.delete(currentNodeId);

    if (currentNodeId === toNodeId) {
      break;
    }

    const currentNode = dataset.graph.get(currentNodeId);
    if (!currentNode) {
      continue;
    }

    const currentDistance =
      distances.get(currentNodeId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentDistance)) {
      break;
    }

    for (const edge of currentNode.edges) {
      if (!queue.has(edge.to)) {
        continue;
      }

      const candidate = currentDistance + getEdgeCost(edge, mode, isRainy);
      if (candidate < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, { nodeId: currentNodeId, edge });
      }
    }

    // --- NODE HOPPING FOR SHORTCUT MODE ---
    if (mode === "shortcut") {
      const HOP_THRESHOLD_M = 60; // Increased distance for hopping
      for (const [targetId, targetNode] of Array.from(dataset.graph.entries())) {
        if (!queue.has(targetId) || targetId === currentNodeId) continue;
        
        const dist = haversineMeters(
          [currentNode.coordinates[0], currentNode.coordinates[1]],
          [targetNode.coordinates[0], targetNode.coordinates[1]]
        );

        if (dist <= HOP_THRESHOLD_M) {
          // Create a virtual edge for hopping
          const virtualEdge: GraphEdge = {
            to: targetId,
            distanceM: dist,
            elevationDeltaM: (targetNode.coordinates[2] ?? 0) - (currentNode.coordinates[2] ?? 0),
            grade: 0,
            scenicScore: 0,
            activityScore: 0
          };

          const candidate = currentDistance + (dist * 0.9); // Slight discount for hopping
          if (candidate < (distances.get(targetId) ?? Number.POSITIVE_INFINITY)) {
            distances.set(targetId, candidate);
            previous.set(targetId, { nodeId: currentNodeId, edge: virtualEdge });
          }
        }
      }
    }
  }

  if (!previous.has(toNodeId)) {
    return { nodeIds: [], edges: [] };
  }

  const nodeIds: string[] = [toNodeId];
  const edges: GraphEdge[] = [];
  let currentNodeId = toNodeId;

  while (currentNodeId !== fromNodeId) {
    const prev = previous.get(currentNodeId);
    if (!prev) {
      return { nodeIds: [], edges: [] };
    }

    edges.push(prev.edge);
    nodeIds.push(prev.nodeId);
    currentNodeId = prev.nodeId;
  }

  nodeIds.reverse();
  edges.reverse();

  return { nodeIds, edges };
}

function getLowestDistanceNode(
  queue: Set<string>,
  distances: Map<string, number>
): string | null {
  let lowestNode: string | null = null;
  let lowestDistance = Number.POSITIVE_INFINITY;

  for (const nodeId of Array.from(queue)) {
    const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
    if (distance < lowestDistance) {
      lowestDistance = distance;
      lowestNode = nodeId;
    }
  }

  return lowestNode;
}

function ensureGraphNode(
  graph: Map<string, GraphNode>,
  coordinates: Coord3
): GraphNode {
  const key = coordKey(coordinates);
  const existing = graph.get(key);
  if (existing) {
    return existing;
  }

  const node: GraphNode = {
    id: key,
    name: null,
    coordinates,
    edges: [],
  };

  graph.set(key, node);
  return node;
}

function connectGraphNodes(
  from: GraphNode,
  to: GraphNode,
  distanceOverrideM?: number
) {
  const computedDistanceM = haversineMeters(
    [from.coordinates[0], from.coordinates[1]],
    [to.coordinates[0], to.coordinates[1]]
  );
  const distanceM =
    typeof distanceOverrideM === "number" && Number.isFinite(distanceOverrideM)
      ? distanceOverrideM
      : computedDistanceM;
  if (distanceM === 0) {
    return;
  }

  const existingIndex = from.edges.findIndex(edge => edge.to === to.id);
  const elevationDeltaM = (to.coordinates[2] ?? 0) - (from.coordinates[2] ?? 0);
  const nextEdge: GraphEdge = {
    to: to.id,
    distanceM,
    elevationDeltaM,
    grade: Math.abs(elevationDeltaM) / distanceM,
    scenicScore: 0,
    activityScore: 0,
  };

  if (existingIndex >= 0) {
    from.edges[existingIndex] = nextEdge;
    return;
  }

  from.edges.push(nextEdge);
}

function connectIsolatedNodes(
  graph: Map<string, GraphNode>,
  thresholdM: number
) {
  const nodes = Array.from(graph.values());
  const anchoredNodes = nodes.filter(node => node.edges.length > 0);
  const isolatedNodes = nodes.filter(node => node.edges.length === 0);

  for (const isolatedNode of isolatedNodes) {
    let nearestNode: GraphNode | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidateNode of anchoredNodes) {
      if (candidateNode.id === isolatedNode.id) {
        continue;
      }

      const distance = haversineMeters(
        [isolatedNode.coordinates[0], isolatedNode.coordinates[1]],
        [candidateNode.coordinates[0], candidateNode.coordinates[1]]
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = candidateNode;
      }
    }

    if (!nearestNode || nearestDistance > thresholdM) {
      continue;
    }

    connectGraphNodes(isolatedNode, nearestNode);
    connectGraphNodes(nearestNode, isolatedNode);
  }
}

function annotateGraph(
  graph: Map<string, GraphNode>,
  locations: CampusLocation[]
) {
  for (const node of Array.from(graph.values())) {
    node.edges = node.edges.map((edge: GraphEdge) => {
      const toNode = graph.get(edge.to);
      if (!toNode) {
        return edge;
      }

      const midpoint: Coord2 = [
        (node.coordinates[0] + toNode.coordinates[0]) / 2,
        (node.coordinates[1] + toNode.coordinates[1]) / 2,
      ];

      let scenicScore = 0;
      let activityScore = 0;

      for (const location of locations) {
        const distance = haversineMeters(midpoint, location.coordinates);
        if (distance > 45) {
          continue;
        }

        const closeness = 1 - distance / 45;
        scenicScore += getScenicWeight(location) * closeness;
        activityScore += getActivityWeight(location) * closeness;
      }

      return {
        ...edge,
        scenicScore,
        activityScore,
      };
    });
  }
}

function getScenicWeight(location: CampusLocation): number {
  let weight = LOCATION_SCENIC_WEIGHT[location.category] ?? 0.3;
  if (
    /garden|botany|library|aquatics|biotechnology|natural/i.test(location.name)
  ) {
    weight += 0.7;
  }
  return weight;
}

function getActivityWeight(location: CampusLocation): number {
  let weight = LOCATION_ACTIVITY_WEIGHT[location.category] ?? 0.5;
  if (
    /lecture|room|office|department|faculty|block|lab|bathrooms/i.test(
      location.name
    )
  ) {
    weight += 0.2;
  }
  return weight;
}

function getEdgeCost(
  edge: GraphEdge,
  mode: RouteMode,
  isRainy: boolean
): number {
  const rainSlopeMultiplier = isRainy ? 1.5 : 1;

  switch (mode) {
    case "shortest":
      return edge.distanceM * (1 + edge.grade * 1.4 * rainSlopeMultiplier);
    case "scenic":
      // Favor longer distances by making them 'cheaper' in the search
      // Using (1000 / distance) forces the algorithm to maximize total path length
      return (1000 / Math.max(1, edge.distanceM)) * (1 + edge.grade * 0.4);
    case "shortcut":
      // Shortcuts favor direct distance with minimal penalties
      return edge.distanceM * 0.8;
    case "accessible":
      return edge.distanceM * (1 + edge.grade * 10 * rainSlopeMultiplier);
    case "safe_night":
      return (
        edge.distanceM * (1 + edge.grade * 1.2 * rainSlopeMultiplier) -
        Math.min(edge.distanceM * 0.18, edge.activityScore * 9)
      );
    default:
      return edge.distanceM;
  }
}

function computeSafetyScore(
  edges: GraphEdge[],
  mode: RouteMode,
  isRainy: boolean
): number {
  if (edges.length === 0) {
    return 0.92;
  }

  const totalActivity = edges.reduce(
    (sum, edge) => sum + edge.activityScore,
    0
  );
  const totalGrade = edges.reduce((sum, edge) => sum + edge.grade, 0);
  const averageActivity = totalActivity / edges.length;
  const averageGrade = totalGrade / edges.length;
  const normalizedActivity = clamp(averageActivity / 1.2, 0, 1);

  let score =
    0.46 +
    normalizedActivity * 0.34 -
    Math.min(0.24, averageGrade * (isRainy ? 9 : 6));
  if (mode === "safe_night") {
    score += 0.08;
  }
  if (mode === "accessible") {
    score += 0.04;
  }
  if (isRainy) {
    score -= 0.04;
  }

  return clamp(score, 0.2, 0.98);
}

function getLandmarksAlongRoute(
  locations: CampusLocation[],
  routeNodeIds: string[],
  routeCoordinates: Coord2[]
): CampusLocation[] {
  const routeNodeIdSet = new Set(routeNodeIds);

  return locations
    .map(location => {
      const nodeIndex = routeNodeIds.indexOf(location.snapNodeId);
      const coordinateIndex = routeCoordinates.findIndex(
        coordinate => haversineMeters(coordinate, location.coordinates) <= 18
      );

      const orderIndex =
        nodeIndex >= 0
          ? nodeIndex
          : coordinateIndex >= 0
            ? coordinateIndex
            : Number.POSITIVE_INFINITY;

      return {
        location,
        orderIndex,
      };
    })
    .filter(
      ({ location, orderIndex }) =>
        routeNodeIdSet.has(location.snapNodeId) || Number.isFinite(orderIndex)
    )
    .sort(
      (left, right) =>
        left.orderIndex - right.orderIndex ||
        left.location.name.localeCompare(right.location.name)
    )
    .map(({ location }) => location);
}

function findNearestGraphNode(
  graph: Map<string, GraphNode>,
  coordinates: Coord3
): GraphNode | null {
  let bestNode: GraphNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of Array.from(graph.values())) {
    const distance = haversineMeters(
      [coordinates[0], coordinates[1]],
      [node.coordinates[0], node.coordinates[1]]
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = node;
    }
  }

  return bestNode;
}

function extractPointFeatures(
  raw: RawCampusGeoJson
): Array<GeoJSON.Feature<GeoJSON.Point, Partial<LocationProperties>>> {
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return features.filter(
    (
      feature
    ): feature is GeoJSON.Feature<GeoJSON.Point, Partial<LocationProperties>> =>
      feature?.geometry?.type === "Point"
  );
}

function isCampusAdjacencyGraph(raw: unknown): raw is RawCampusAdjacencyGraph {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      Array.isArray((raw as RawCampusAdjacencyGraph).nodes) &&
      (raw as RawCampusAdjacencyGraph).adjacency &&
      typeof (raw as RawCampusAdjacencyGraph).adjacency === "object"
  );
}

function normalizeAdjacencyNode(
  rawNode: RawCampusAdjacencyNode
): { id: string; name: string | null; coordinates: Coord3 } | null {
  const id = rawNode.id?.trim();
  const lat =
    typeof rawNode.lat === "number" && Number.isFinite(rawNode.lat)
      ? rawNode.lat
      : Array.isArray(rawNode.location) && rawNode.location.length >= 2
        ? rawNode.location[0]
        : null;
  const lng =
    typeof rawNode.lng === "number" && Number.isFinite(rawNode.lng)
      ? rawNode.lng
      : Array.isArray(rawNode.location) && rawNode.location.length >= 2
        ? rawNode.location[1]
        : null;

  if (!id || lat == null || lng == null) {
    return null;
  }

  return {
    id,
    name: rawNode.name?.trim() ?? null,
    coordinates: [lng, lat],
  };
}

function ensureAdjacencyNodeFromEdge(
  graph: Map<string, GraphNode>,
  edge: RawCampusAdjacencyEdge
): GraphNode | null {
  const id = edge.to?.trim();
  const lat =
    Array.isArray(edge.location) && edge.location.length >= 2
      ? edge.location[0]
      : null;
  const lng =
    Array.isArray(edge.location) && edge.location.length >= 2
      ? edge.location[1]
      : null;

  if (!id || lat == null || lng == null) {
    return null;
  }

  const existing = graph.get(id);
  if (existing) {
    return existing;
  }

  const node: GraphNode = {
    id,
    name: edge.name?.trim() ?? null,
    coordinates: [lng, lat],
    edges: [],
  };
  graph.set(id, node);
  return node;
}

function createBoundsFromGraphAndLocations(
  graph: Map<string, GraphNode>,
  locations: CampusLocation[]
): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const node of Array.from(graph.values())) {
    west = Math.min(west, node.coordinates[0]);
    south = Math.min(south, node.coordinates[1]);
    east = Math.max(east, node.coordinates[0]);
    north = Math.max(north, node.coordinates[1]);
  }

  for (const location of locations) {
    west = Math.min(west, location.coordinates[0]);
    south = Math.min(south, location.coordinates[1]);
    east = Math.max(east, location.coordinates[0]);
    north = Math.max(north, location.coordinates[1]);
  }

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new Error("Campus map bounds could not be calculated.");
  }

  return { west, south, east, north };
}

function createNetworkFeatureCollection(
  graph: Map<string, GraphNode>
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const seen = new Set<string>();
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const node of Array.from(graph.values())) {
    for (const edge of node.edges) {
      const toNode = graph.get(edge.to);
      if (!toNode) {
        continue;
      }

      const key =
        node.id < toNode.id ? `${node.id}::${toNode.id}` : `${toNode.id}::${node.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      features.push({
        type: "Feature",
        properties: { id: key },
        geometry: {
          type: "LineString",
          coordinates: [
            [node.coordinates[0], node.coordinates[1]],
            [toNode.coordinates[0], toNode.coordinates[1]],
          ],
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function createBounds(features: RawCampusGeoJson["features"]): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const feature of features) {
    if (!feature?.geometry) {
      continue;
    }

    if (feature.geometry.type === "Point") {
      const [lng, lat] = feature.geometry.coordinates;
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
      continue;
    }

    for (const line of feature.geometry.coordinates) {
      for (const coordinate of line) {
        west = Math.min(west, coordinate[0]);
        south = Math.min(south, coordinate[1]);
        east = Math.max(east, coordinate[0]);
        north = Math.max(north, coordinate[1]);
      }
    }
  }

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new Error("Campus map bounds could not be calculated.");
  }

  return { west, south, east, north };
}

function coordKey(coordinates: Coord3): string {
  return `${coordinates[0].toFixed(6)},${coordinates[1].toFixed(6)}`;
}

function toCoord2(position: GeoJSON.Position): Coord2 {
  return [position[0], position[1]];
}

function toCoord3(position: GeoJSON.Position): Coord3 {
  return [
    position[0],
    position[1],
    typeof position[2] === "number" ? position[2] : undefined,
  ];
}

function projectPointToSegment(
  point: Coord2,
  start: Coord2,
  end: Coord2
): {
  coordinates: Coord2;
  distanceM: number;
  t: number;
} {
  const originLatitude = ((point[1] + start[1] + end[1]) / 3) * (Math.PI / 180);
  const metersPerLng = 111320 * Math.cos(originLatitude);
  const metersPerLat = 110540;

  const toLocal = ([lng, lat]: Coord2) => ({
    x: (lng - point[0]) * metersPerLng,
    y: (lat - point[1]) * metersPerLat,
  });

  const fromLocal = (x: number, y: number): Coord2 => [
    point[0] + x / metersPerLng,
    point[1] + y / metersPerLat,
  ];

  const startLocal = toLocal(start);
  const endLocal = toLocal(end);
  const dx = endLocal.x - startLocal.x;
  const dy = endLocal.y - startLocal.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      coordinates: start,
      distanceM: haversineMeters(point, start),
      t: 0,
    };
  }

  const t = clamp(
    (-startLocal.x * dx + -startLocal.y * dy) / lengthSquared,
    0,
    1
  );
  const projectedX = startLocal.x + dx * t;
  const projectedY = startLocal.y + dy * t;

  return {
    coordinates: fromLocal(projectedX, projectedY),
    distanceM: Math.hypot(projectedX, projectedY),
    t,
  };
}

function haversineMeters([lng1, lat1]: Coord2, [lng2, lat2]: Coord2): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
