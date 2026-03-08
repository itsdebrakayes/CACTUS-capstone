/**
 * CACTUS Pathfinding Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-criteria weighted Dijkstra over the campus footpath graph.
 *
 * Four route profiles:
 *
 *  1. SHORTEST  — minimise total walk time, penalise active hazards and
 *                 night-time unsafe conditions.
 *
 *  2. SAFE_NIGHT — heavy penalty for low lighting, isolated paths, and any
 *                 confirmed violence reports. Blocks edges with ≥3 confirmed
 *                 violence reports in the last 24 h.
 *
 *  3. SCENIC    — rewards paths that pass landmark nodes and edges with high
 *                 scenic scores. Still avoids blocked edges.
 *
 *  4. ACCESSIBLE — excludes edges with steps or slope > 8 %. Prefers smooth,
 *                 wide, paved surfaces.
 *
 * Cost formula per profile (applied to each edge):
 *
 *   base_cost = walkTimeSec
 *
 *   SHORTEST:
 *     cost = base_cost
 *          + HAZARD_PENALTY  * confirmedHazardCount
 *          + NIGHT_PENALTY   * (1 - lighting) * isNight
 *          + WEATHER_PENALTY * (1 - weatherCoverage) * isRainy
 *
 *   SAFE_NIGHT:
 *     cost = base_cost
 *          + LIGHTING_W      * (1 - lighting)^2          (quadratic — darkness hurts a lot)
 *          + ISOLATION_W     * (1 - isolation)
 *          + VIOLENCE_W      * confirmedViolenceCount
 *          + HAZARD_PENALTY  * confirmedHazardCount
 *          + WEATHER_PENALTY * (1 - weatherCoverage) * isRainy
 *     BLOCK if confirmedViolenceCount >= VIOLENCE_BLOCK_THRESHOLD
 *
 *   SCENIC:
 *     cost = base_cost
 *          - SCENIC_REWARD   * scenicScore               (negative = cheaper)
 *          - LANDMARK_BONUS  * (toNode.isLandmark ? 1 : 0)
 *          + HAZARD_PENALTY  * confirmedHazardCount
 *     cost = max(cost, MIN_SCENIC_COST)                  (never go negative)
 *
 *   ACCESSIBLE:
 *     SKIP if hasSteps || abs(slopeGrade) > MAX_SLOPE_GRADE
 *     cost = base_cost
 *          + SURFACE_PENALTY * (1 - surfaceQuality)
 *          + HAZARD_PENALTY  * confirmedHazardCount
 */

import type { PathEdge, PathNode } from "../drizzle/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confirmed hazard reports add this many seconds of penalty per report */
const HAZARD_PENALTY = 120;

/** Night-time lighting penalty weight (seconds per unit of darkness) */
const NIGHT_LIGHTING_W = 300;

/** Safe-night profile: lighting weight (quadratic) */
const SAFE_NIGHT_LIGHTING_W = 600;

/** Safe-night profile: isolation weight */
const SAFE_NIGHT_ISOLATION_W = 200;

/** Safe-night profile: confirmed violence weight */
const SAFE_NIGHT_VIOLENCE_W = 500;

/** Edges with this many confirmed violence reports in 24 h are BLOCKED */
export const VIOLENCE_BLOCK_THRESHOLD = 3;

/** Weather exposure penalty (seconds per unit of exposure) */
const WEATHER_PENALTY = 60;

/** Scenic reward (seconds subtracted per unit of scenic score) */
const SCENIC_REWARD = 180;

/** Bonus seconds subtracted when the destination node is a landmark */
const LANDMARK_BONUS = 90;

/** Minimum cost for any scenic edge (prevents negative total cost) */
const MIN_SCENIC_COST = 10;

/** Accessible profile: surface quality penalty */
const SURFACE_PENALTY = 90;

/** Maximum slope grade (%) for accessible routes (ADA guideline) */
export const MAX_SLOPE_GRADE = 8;

/** Night hours: 19:00 – 06:00 */
export function isNightHour(hour: number): boolean {
  return hour >= 19 || hour < 6;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteMode = "shortest" | "scenic" | "accessible" | "safe_night";

export interface GraphNode {
  id: number;
  name: string | null;
  lat: number;
  lng: number;
  isLandmark: boolean;
  scenicScore: number;
  isAccessible: boolean;
  category: string | null;
}

export interface GraphEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  distanceM: number;
  walkTimeSec: number;
  lighting: number;
  weatherCoverage: number;
  isolation: number;
  isAccessible: boolean;
  surfaceQuality: number;
  scenicScore: number;
  hasSteps: boolean;
  slopeGrade: number;
  confirmedViolenceCount: number;
  confirmedHazardCount: number;
  isActive: boolean;
}

export interface RouteResult {
  mode: RouteMode;
  /** Ordered list of node IDs from origin to destination */
  nodeIds: number[];
  /** GeoJSON LineString coordinates [[lng, lat], ...] */
  coordinates: [number, number][];
  distanceM: number;
  walkTimeSec: number;
  /** 0-1 safety score (1 = perfectly safe) */
  safetyScore: number;
  /** Human-readable summary */
  summary: string;
  /** Names of landmark nodes along the route */
  landmarks: string[];
}

export interface PlanRouteOptions {
  fromNodeId: number;
  toNodeId: number;
  mode: RouteMode;
  /** Current hour of day (0-23) for time-sensitive cost calculation */
  hourOfDay: number;
  /** Whether it is currently raining (affects weather-exposure cost) */
  isRainy?: boolean;
  nodes: Map<number, GraphNode>;
  edges: GraphEdge[];
}

// ─── Cost functions ───────────────────────────────────────────────────────────

/**
 * Convert a raw PathNode row to a GraphNode (parse decimal strings to numbers).
 */
export function toGraphNode(row: PathNode): GraphNode {
  return {
    id: row.id,
    name: row.name ?? null,
    lat: parseFloat(row.lat as unknown as string),
    lng: parseFloat(row.lng as unknown as string),
    isLandmark: row.isLandmark,
    scenicScore: row.scenicScore,
    isAccessible: row.isAccessible,
    category: row.category ?? null,
  };
}

/**
 * Convert a raw PathEdge row to a GraphEdge (parse decimal strings to numbers).
 */
export function toGraphEdge(row: PathEdge): GraphEdge {
  return {
    id: row.id,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    distanceM: row.distanceM,
    walkTimeSec: row.walkTimeSec,
    lighting: row.lighting,
    weatherCoverage: row.weatherCoverage,
    isolation: row.isolation,
    isAccessible: row.isAccessible,
    surfaceQuality: row.surfaceQuality,
    scenicScore: row.scenicScore,
    hasSteps: row.hasSteps,
    slopeGrade: row.slopeGrade,
    confirmedViolenceCount: row.confirmedViolenceCount,
    confirmedHazardCount: row.confirmedHazardCount,
    isActive: row.isActive,
  };
}

/**
 * Calculate the traversal cost of an edge for a given route profile.
 * Returns Infinity if the edge is blocked for this profile.
 */
export function edgeCost(
  edge: GraphEdge,
  toNode: GraphNode,
  mode: RouteMode,
  hourOfDay: number,
  isRainy: boolean
): number {
  // Always skip inactive edges
  if (!edge.isActive) return Infinity;

  // Always block edges with ≥ VIOLENCE_BLOCK_THRESHOLD confirmed violence reports
  if (edge.confirmedViolenceCount >= VIOLENCE_BLOCK_THRESHOLD) return Infinity;

  const night = isNightHour(hourOfDay);
  const base = edge.walkTimeSec;

  switch (mode) {
    case "shortest": {
      let cost = base;
      cost += HAZARD_PENALTY * edge.confirmedHazardCount;
      if (night) cost += NIGHT_LIGHTING_W * (1 - edge.lighting);
      if (isRainy) cost += WEATHER_PENALTY * (1 - edge.weatherCoverage);
      return cost;
    }

    case "safe_night": {
      let cost = base;
      // Quadratic lighting penalty — darkness is very costly at night
      const darknessFactor = 1 - edge.lighting;
      cost += SAFE_NIGHT_LIGHTING_W * darknessFactor * darknessFactor;
      cost += SAFE_NIGHT_ISOLATION_W * (1 - edge.isolation);
      cost += SAFE_NIGHT_VIOLENCE_W * edge.confirmedViolenceCount;
      cost += HAZARD_PENALTY * edge.confirmedHazardCount;
      if (isRainy) cost += WEATHER_PENALTY * (1 - edge.weatherCoverage);
      return cost;
    }

    case "scenic": {
      let cost = base;
      cost -= SCENIC_REWARD * edge.scenicScore;
      if (toNode.isLandmark) cost -= LANDMARK_BONUS;
      cost += HAZARD_PENALTY * edge.confirmedHazardCount;
      // Still apply a night penalty so scenic routes aren't suicidal at night
      if (night) cost += NIGHT_LIGHTING_W * 0.5 * (1 - edge.lighting);
      return Math.max(cost, MIN_SCENIC_COST);
    }

    case "accessible": {
      // Hard exclusions
      if (edge.hasSteps) return Infinity;
      if (Math.abs(edge.slopeGrade) > MAX_SLOPE_GRADE) return Infinity;
      if (!edge.isAccessible) return Infinity;

      let cost = base;
      cost += SURFACE_PENALTY * (1 - edge.surfaceQuality);
      cost += HAZARD_PENALTY * edge.confirmedHazardCount;
      return cost;
    }
  }
}

// ─── Dijkstra ─────────────────────────────────────────────────────────────────

/**
 * A simple binary min-heap priority queue for Dijkstra.
 */
class MinHeap {
  private heap: { id: number; cost: number }[] = [];

  push(id: number, cost: number) {
    this.heap.push({ id, cost });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { id: number; cost: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size() {
    return this.heap.length;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].cost <= this.heap[i].cost) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.heap[l].cost < this.heap[smallest].cost) smallest = l;
      if (r < n && this.heap[r].cost < this.heap[smallest].cost) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

/**
 * Run weighted Dijkstra from `fromNodeId` to `toNodeId`.
 * Returns null if no path exists.
 */
export function dijkstra(opts: PlanRouteOptions): RouteResult | null {
  const { fromNodeId, toNodeId, mode, hourOfDay, isRainy = false, nodes, edges } = opts;

  if (!nodes.has(fromNodeId) || !nodes.has(toNodeId)) return null;

  // Build adjacency list
  const adj = new Map<number, GraphEdge[]>();
  for (const edge of edges) {
    if (!adj.has(edge.fromNodeId)) adj.set(edge.fromNodeId, []);
    adj.get(edge.fromNodeId)!.push(edge);
    // Treat all edges as bidirectional (campus paths are two-way)
    if (!adj.has(edge.toNodeId)) adj.set(edge.toNodeId, []);
    adj.get(edge.toNodeId)!.push({
      ...edge,
      fromNodeId: edge.toNodeId,
      toNodeId: edge.fromNodeId,
      // Reverse slope for the return direction
      slopeGrade: -edge.slopeGrade,
    });
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const pq = new MinHeap();

  for (const id of Array.from(nodes.keys())) {
    dist.set(id, Infinity);
  }
  dist.set(fromNodeId, 0);
  pq.push(fromNodeId, 0);

  while (pq.size > 0) {
    const { id: u, cost: uCost } = pq.pop()!;
    if (uCost > dist.get(u)!) continue; // stale entry
    if (u === toNodeId) break;

    const neighbours = adj.get(u) ?? [];
    for (const edge of neighbours) {
      const v = edge.toNodeId;
      const toNode = nodes.get(v);
      if (!toNode) continue;

      const w = edgeCost(edge, toNode, mode, hourOfDay, isRainy);
      if (w === Infinity) continue;

      const newDist = dist.get(u)! + w;
      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist);
        prev.set(v, u);
        pq.push(v, newDist);
      }
    }
  }

  // Reconstruct path
  if (!isFinite(dist.get(toNodeId) ?? Infinity)) return null;

  const nodeIds: number[] = [];
  let cur: number | undefined = toNodeId;
  while (cur !== undefined) {
    nodeIds.unshift(cur);
    cur = prev.get(cur);
  }

  if (nodeIds[0] !== fromNodeId) return null;

  // Build GeoJSON coordinates and compute real distance/time
  const coordinates: [number, number][] = [];
  let totalDistanceM = 0;
  let totalWalkTimeSec = 0;
  const landmarks: string[] = [];

  for (let i = 0; i < nodeIds.length; i++) {
    const node = nodes.get(nodeIds[i])!;
    coordinates.push([node.lng, node.lat]);
    if (node.isLandmark && node.name) landmarks.push(node.name);

    if (i > 0) {
      // Find the edge between nodeIds[i-1] and nodeIds[i]
      const prevId = nodeIds[i - 1];
      const edge = edges.find(
        (e) =>
          (e.fromNodeId === prevId && e.toNodeId === nodeIds[i]) ||
          (e.fromNodeId === nodeIds[i] && e.toNodeId === prevId)
      );
      if (edge) {
        totalDistanceM += edge.distanceM;
        totalWalkTimeSec += edge.walkTimeSec;
      }
    }
  }

  // Calculate safety score (0-1)
  const safetyScore = computeSafetyScore(nodeIds, edges, nodes);

  const summary = buildSummary(mode, totalDistanceM, totalWalkTimeSec, landmarks, hourOfDay);

  return {
    mode,
    nodeIds,
    coordinates,
    distanceM: Math.round(totalDistanceM),
    walkTimeSec: Math.round(totalWalkTimeSec),
    safetyScore,
    summary,
    landmarks,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute an aggregate safety score for a route (0 = very unsafe, 1 = safe).
 * Based on average lighting, isolation, and hazard counts along the path.
 */
function computeSafetyScore(
  nodeIds: number[],
  edges: GraphEdge[],
  _nodes: Map<number, GraphNode>
): number {
  if (nodeIds.length < 2) return 1;

  let totalLighting = 0;
  let totalIsolation = 0;
  let totalViolence = 0;
  let totalHazards = 0;
  let edgeCount = 0;

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const a = nodeIds[i];
    const b = nodeIds[i + 1];
    const edge = edges.find(
      (e) =>
        (e.fromNodeId === a && e.toNodeId === b) ||
        (e.fromNodeId === b && e.toNodeId === a)
    );
    if (!edge) continue;
    totalLighting += edge.lighting;
    totalIsolation += edge.isolation;
    totalViolence += edge.confirmedViolenceCount;
    totalHazards += edge.confirmedHazardCount;
    edgeCount++;
  }

  if (edgeCount === 0) return 1;

  const avgLighting = totalLighting / edgeCount;
  const avgIsolation = totalIsolation / edgeCount;
  const violencePenalty = Math.min(totalViolence * 0.2, 0.8);
  const hazardPenalty = Math.min(totalHazards * 0.05, 0.4);

  const raw = 0.4 * avgLighting + 0.3 * avgIsolation + 0.3 * (1 - violencePenalty) - hazardPenalty;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Build a human-readable route summary string.
 */
function buildSummary(
  mode: RouteMode,
  distanceM: number,
  walkTimeSec: number,
  landmarks: string[],
  hourOfDay: number
): string {
  const mins = Math.ceil(walkTimeSec / 60);
  const dist =
    distanceM >= 1000
      ? `${(distanceM / 1000).toFixed(1)} km`
      : `${Math.round(distanceM)} m`;

  const modeLabels: Record<RouteMode, string> = {
    shortest: "Fastest route",
    safe_night: "Safe night route",
    scenic: "Scenic route",
    accessible: "Accessible route",
  };

  let summary = `${modeLabels[mode]} · ${dist} · ~${mins} min`;

  if (mode === "scenic" && landmarks.length > 0) {
    summary += ` · Passes: ${landmarks.slice(0, 3).join(", ")}`;
  }

  if (mode === "safe_night" && isNightHour(hourOfDay)) {
    summary += " · Optimised for night-time safety";
  }

  return summary;
}

/**
 * Find the nearest graph node to a given lat/lng coordinate.
 * Used to snap a user's GPS position to the graph.
 */
export function nearestNode(
  lat: number,
  lng: number,
  nodes: Map<number, GraphNode>
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;

  for (const node of Array.from(nodes.values())) {
    const dlat = node.lat - lat;
    const dlng = node.lng - lng;
    const d = dlat * dlat + dlng * dlng; // squared Euclidean (good enough for snapping)
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }

  return best;
}

/**
 * Haversine distance between two lat/lng points in metres.
 */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate walk time in seconds from distance (1.4 m/s average walking speed).
 */
export function walkTimeFromDistance(distanceM: number): number {
  return Math.round(distanceM / 1.4);
}

/**
 * Plan all four routes simultaneously and return them sorted by walk time.
 * Returns only the routes that have valid paths.
 */
export function planAllRoutes(
  fromNodeId: number,
  toNodeId: number,
  hourOfDay: number,
  isRainy: boolean,
  nodes: Map<number, GraphNode>,
  edges: GraphEdge[]
): RouteResult[] {
  const modes: RouteMode[] = ["shortest", "safe_night", "scenic", "accessible"];
  const results: RouteResult[] = [];

  for (const mode of modes) {
    const result = dijkstra({ fromNodeId, toNodeId, mode, hourOfDay, isRainy, nodes, edges });
    if (result) results.push(result);
  }

  return results;
}
