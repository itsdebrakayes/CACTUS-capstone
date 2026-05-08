type Coord2 = [number, number];

type RawRoutingNodeFile = {
  FSTnodes?: {
    metadata?: {
      entranceNodeIds?: string[];
    };
    nodes?: Record<
      string,
      {
        id?: string;
        name?: string;
        kind?: string;
        coordinates?: number[];
        neighbors?: string[];
      }
    >;
  };
};

export interface RoutingNode {
  id: string;
  name: string;
  kind: string;
  coordinates: Coord2;
  neighbors: string[];
}

export interface RoutingDataset {
  nodes: Map<string, RoutingNode>;
  entranceNodeIds: string[];
  nodeCollection: GeoJSON.FeatureCollection<GeoJSON.Point>;
  usesInferredEdges: boolean;
}

export interface RoutingNodeMatch {
  nodeId: string;
  nodeName: string;
  coordinates: Coord2;
  distanceM: number;
}

export interface InternalRoute {
  nodeIds: string[];
  coordinates: Coord2[];
  distanceM: number;
}

interface DistancePair {
  from: string;
  to: string;
  distanceM: number;
}

const LOCAL_EDGE_THRESHOLD_M = 42;

export function buildRoutingDataset(raw: unknown): RoutingDataset {
  const nodesById = (raw as RawRoutingNodeFile)?.FSTnodes?.nodes ?? {};
  const parsedNodes = Object.values(nodesById)
    .filter(
      node => Array.isArray(node.coordinates) && node.coordinates.length >= 2
    )
    .map(node => ({
      id: node.id?.trim() || node.name?.trim() || "routing-node",
      name: node.name?.trim() || node.id?.trim() || "Routing Node",
      kind: node.kind?.trim() || "junction",
      coordinates: [node.coordinates![0], node.coordinates![1]] as Coord2,
      neighbors: (node.neighbors ?? []).filter(Boolean),
    }));

  if (parsedNodes.length === 0) {
    throw new Error("No routing nodes were found in nodeForPath.json.");
  }

  const explicitNeighborCount = parsedNodes.reduce(
    (sum, node) => sum + node.neighbors.length,
    0
  );

  const neighborMap =
    explicitNeighborCount > 0
      ? createExplicitNeighborMap(parsedNodes)
      : inferNeighborMap(parsedNodes);

  const nodes = new Map<string, RoutingNode>(
    parsedNodes.map(node => [
      node.id,
      {
        ...node,
        neighbors: Array.from(neighborMap.get(node.id) ?? []).sort(),
      },
    ])
  );

  const configuredEntranceIds = (
    (raw as RawRoutingNodeFile)?.FSTnodes?.metadata?.entranceNodeIds ?? []
  ).filter(entranceId => nodes.has(entranceId));
  const entranceNodeIds =
    configuredEntranceIds.length > 0
      ? configuredEntranceIds
      : Array.from(nodes.values())
          .filter(node => normalizeText(node.kind) === "entrance")
          .map(node => node.id);

  return {
    nodes,
    entranceNodeIds,
    usesInferredEdges: explicitNeighborCount === 0,
    nodeCollection: {
      type: "FeatureCollection",
      features: Array.from(nodes.values()).map(node => ({
        type: "Feature",
        properties: {
          id: node.id,
          name: node.name,
          kind: node.kind,
        },
        geometry: {
          type: "Point",
          coordinates: node.coordinates,
        },
      })),
    },
  };
}

export function findNearestRoutingNode(
  dataset: RoutingDataset,
  coordinates: Coord2
): RoutingNodeMatch | null {
  let bestMatch: RoutingNodeMatch | null = null;

  for (const node of Array.from(dataset.nodes.values())) {
    const distanceM = haversineMeters(coordinates, node.coordinates);
    if (!bestMatch || distanceM < bestMatch.distanceM) {
      bestMatch = {
        nodeId: node.id,
        nodeName: node.name,
        coordinates: node.coordinates,
        distanceM,
      };
    }
  }

  return bestMatch;
}

export function findShortestNodeRoute(
  dataset: RoutingDataset,
  startNodeId: string,
  endNodeId: string
): InternalRoute | null {
  if (!dataset.nodes.has(startNodeId) || !dataset.nodes.has(endNodeId)) {
    return null;
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const nodeId of Array.from(dataset.nodes.keys())) {
    distances.set(nodeId, Number.POSITIVE_INFINITY);
    previous.set(nodeId, null);
    unvisited.add(nodeId);
  }

  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    const currentNodeId = getLowestDistanceNode(unvisited, distances);
    if (!currentNodeId) {
      break;
    }

    unvisited.delete(currentNodeId);
    if (currentNodeId === endNodeId) {
      break;
    }

    const currentNode = dataset.nodes.get(currentNodeId);
    if (!currentNode) {
      continue;
    }

    const currentDistance =
      distances.get(currentNodeId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentDistance)) {
      continue;
    }

    for (const neighborId of currentNode.neighbors) {
      if (!unvisited.has(neighborId)) {
        continue;
      }

      const neighbor = dataset.nodes.get(neighborId);
      if (!neighbor) {
        continue;
      }

      const nextDistance =
        currentDistance +
        haversineMeters(currentNode.coordinates, neighbor.coordinates);

      if (
        nextDistance < (distances.get(neighborId) ?? Number.POSITIVE_INFINITY)
      ) {
        distances.set(neighborId, nextDistance);
        previous.set(neighborId, currentNodeId);
      }
    }
  }

  const endDistance = distances.get(endNodeId) ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(endDistance)) {
    return null;
  }

  const nodeIds: string[] = [];
  let cursor: string | null = endNodeId;
  while (cursor) {
    nodeIds.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }

  const coordinates = nodeIds
    .map(nodeId => dataset.nodes.get(nodeId)?.coordinates ?? null)
    .filter((value): value is Coord2 => value !== null);

  if (coordinates.length === 0) {
    return null;
  }

  return {
    nodeIds,
    coordinates,
    distanceM: endDistance,
  };
}

export function mergeRouteCoordinates(...parts: Coord2[][]): Coord2[] {
  const merged: Coord2[] = [];

  for (const part of parts) {
    for (const coordinate of part) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous[0] === coordinate[0] &&
        previous[1] === coordinate[1]
      ) {
        continue;
      }
      merged.push(coordinate);
    }
  }

  return merged;
}

export function createRouteFeatureCollection(
  coordinates: Coord2[]
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature",
              properties: {
                id: "active-route",
              },
              geometry: {
                type: "LineString",
                coordinates,
              },
            },
          ]
        : [],
  };
}

export function haversineMeters([lng1, lat1]: Coord2, [lng2, lat2]: Coord2) {
  const earthRadiusM = 6371000;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const normalizedLat1 = toRadians(lat1);
  const normalizedLat2 = toRadians(lat2);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(normalizedLat1) *
      Math.cos(normalizedLat2) *
      Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createExplicitNeighborMap(
  nodes: Array<{
    id: string;
    neighbors: string[];
  }>
) {
  const nodeIds = new Set(nodes.map(node => node.id));
  const neighborMap = new Map<string, Set<string>>(
    nodes.map(node => [node.id, new Set<string>()])
  );

  for (const node of nodes) {
    for (const neighborId of node.neighbors) {
      if (!nodeIds.has(neighborId) || neighborId === node.id) {
        continue;
      }
      neighborMap.get(node.id)?.add(neighborId);
      neighborMap.get(neighborId)?.add(node.id);
    }
  }

  return neighborMap;
}

function inferNeighborMap(
  nodes: Array<{
    id: string;
    coordinates: Coord2;
  }>
) {
  const neighborMap = new Map<string, Set<string>>(
    nodes.map(node => [node.id, new Set<string>()])
  );
  const pairs = buildDistancePairs(nodes);

  for (const pair of pairs) {
    if (pair.distanceM > LOCAL_EDGE_THRESHOLD_M) {
      break;
    }
    neighborMap.get(pair.from)?.add(pair.to);
    neighborMap.get(pair.to)?.add(pair.from);
  }

  while (countComponents(nodes, neighborMap) > 1) {
    const components = collectComponents(nodes, neighborMap);
    let bridgePair: DistancePair | null = null;

    for (let leftIndex = 0; leftIndex < components.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < components.length;
        rightIndex += 1
      ) {
        for (const pair of pairs) {
          const isAcrossComponents =
            (components[leftIndex].has(pair.from) &&
              components[rightIndex].has(pair.to)) ||
            (components[leftIndex].has(pair.to) &&
              components[rightIndex].has(pair.from));

          if (isAcrossComponents) {
            bridgePair = pair;
            break;
          }
        }

        if (bridgePair) {
          break;
        }
      }

      if (bridgePair) {
        break;
      }
    }

    if (!bridgePair) {
      break;
    }

    neighborMap.get(bridgePair.from)?.add(bridgePair.to);
    neighborMap.get(bridgePair.to)?.add(bridgePair.from);
  }

  return neighborMap;
}

function buildDistancePairs(
  nodes: Array<{
    id: string;
    coordinates: Coord2;
  }>
) {
  const pairs: DistancePair[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    for (
      let innerIndex = index + 1;
      innerIndex < nodes.length;
      innerIndex += 1
    ) {
      pairs.push({
        from: nodes[index].id,
        to: nodes[innerIndex].id,
        distanceM: haversineMeters(
          nodes[index].coordinates,
          nodes[innerIndex].coordinates
        ),
      });
    }
  }

  return pairs.sort((left, right) => left.distanceM - right.distanceM);
}

function countComponents(
  nodes: Array<{
    id: string;
  }>,
  neighborMap: Map<string, Set<string>>
) {
  return collectComponents(nodes, neighborMap).length;
}

function collectComponents(
  nodes: Array<{
    id: string;
  }>,
  neighborMap: Map<string, Set<string>>
) {
  const visited = new Set<string>();
  const components: Array<Set<string>> = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }

    const component = new Set<string>();
    const stack = [node.id];

    while (stack.length > 0) {
      const currentNodeId = stack.pop();
      if (!currentNodeId || visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);
      component.add(currentNodeId);

      for (const neighborId of Array.from(
        neighborMap.get(currentNodeId) ?? []
      )) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      }
    }

    components.push(component);
  }

  return components;
}

function getLowestDistanceNode(
  queue: Set<string>,
  distances: Map<string, number>
) {
  let bestNodeId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const nodeId of Array.from(queue)) {
    const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNodeId = nodeId;
    }
  }

  return bestNodeId;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
