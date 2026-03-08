import { describe, it, expect } from "vitest";
import {
  dijkstra,
  planAllRoutes,
  nearestNode,
  haversineM,
  walkTimeFromDistance,
  isNightHour,
  toGraphNode,
  toGraphEdge,
  VIOLENCE_BLOCK_THRESHOLD,
  MAX_SLOPE_GRADE,
  type GraphNode,
  type GraphEdge,
  type RouteMode,
} from "./pathfinding";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeNode(id: number, lat: number, lng: number, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    lat,
    lng,
    name: `Node ${id}`,
    category: "junction",
    isLandmark: false,
    scenicScore: 0.3,
    isAccessible: true,
    ...overrides,
  };
}

function makeEdge(id: number, fromNodeId: number, toNodeId: number, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    distanceM: 100,
    walkTimeSec: 72, // 100m / 1.4 m/s ≈ 72s
    lighting: 0.8,
    weatherCoverage: 0.5,
    isolation: 0.7,
    isAccessible: true,
    surfaceQuality: 0.8,
    scenicScore: 0.3,
    hasSteps: false,
    slopeGrade: 0,
    confirmedViolenceCount: 0,
    confirmedHazardCount: 0,
    isActive: true,
    ...overrides,
  };
}

// Simple 3-node graph: A(1) ──100m── B(2) ──100m── C(3)
//                      A(1) ──300m─────────────── C(3)
function buildSimpleGraph() {
  const nodes = new Map<number, GraphNode>([
    [1, makeNode(1, 18.0, -76.75)],
    [2, makeNode(2, 18.001, -76.75)],
    [3, makeNode(3, 18.002, -76.75)],
  ]);
  const edges: GraphEdge[] = [
    makeEdge(1, 1, 2, { distanceM: 100, walkTimeSec: 72 }),
    makeEdge(2, 2, 3, { distanceM: 100, walkTimeSec: 72 }),
    makeEdge(3, 1, 3, { distanceM: 300, walkTimeSec: 214 }),
  ];
  return { nodes, edges };
}

// ─── isNightHour ─────────────────────────────────────────────────────────────

describe("isNightHour", () => {
  it("returns true for hours 19-23", () => {
    expect(isNightHour(19)).toBe(true);
    expect(isNightHour(22)).toBe(true);
    expect(isNightHour(23)).toBe(true);
  });

  it("returns true for early morning hours 0-5", () => {
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(3)).toBe(true);
    expect(isNightHour(5)).toBe(true);
  });

  it("returns false for daytime hours 6-18", () => {
    expect(isNightHour(6)).toBe(false);
    expect(isNightHour(12)).toBe(false);
    expect(isNightHour(18)).toBe(false);
  });
});

// ─── haversineM ──────────────────────────────────────────────────────────────

describe("haversineM", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineM(18.0, -76.75, 18.0, -76.75)).toBe(0);
  });

  it("returns a positive distance for different coordinates", () => {
    const d = haversineM(18.0, -76.75, 18.001, -76.75);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(500);
  });

  it("is symmetric", () => {
    const d1 = haversineM(18.0, -76.75, 18.005, -76.74);
    const d2 = haversineM(18.005, -76.74, 18.0, -76.75);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });

  it("approximates 111m per 0.001 degree latitude", () => {
    const d = haversineM(18.0, -76.75, 18.001, -76.75);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

// ─── walkTimeFromDistance ─────────────────────────────────────────────────────

describe("walkTimeFromDistance", () => {
  it("converts 140m to 100 seconds at 1.4 m/s", () => {
    expect(walkTimeFromDistance(140)).toBe(100);
  });

  it("converts 0m to 0 seconds", () => {
    expect(walkTimeFromDistance(0)).toBe(0);
  });

  it("returns a positive integer", () => {
    const t = walkTimeFromDistance(250);
    expect(t).toBeGreaterThan(0);
    expect(Number.isInteger(t)).toBe(true);
  });
});

// ─── nearestNode ─────────────────────────────────────────────────────────────

describe("nearestNode", () => {
  it("finds the closest node to a given coordinate", () => {
    const { nodes } = buildSimpleGraph();
    const nearest = nearestNode(18.001, -76.75, nodes);
    expect(nearest?.id).toBe(2);
  });

  it("returns null for an empty node map", () => {
    expect(nearestNode(18.0, -76.75, new Map())).toBeNull();
  });

  it("returns the only node when map has one entry", () => {
    const nodes = new Map([[1, makeNode(1, 18.0, -76.75)]]);
    expect(nearestNode(99.0, 99.0, nodes)?.id).toBe(1);
  });
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("VIOLENCE_BLOCK_THRESHOLD is 3", () => {
    expect(VIOLENCE_BLOCK_THRESHOLD).toBe(3);
  });

  it("MAX_SLOPE_GRADE is 8", () => {
    expect(MAX_SLOPE_GRADE).toBe(8);
  });
});

// ─── dijkstra ────────────────────────────────────────────────────────────────

describe("dijkstra", () => {
  it("finds the shortest path in a simple 3-node graph", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    // Should prefer A→B→C (200m total) over A→C (300m direct)
    expect(result!.nodeIds).toEqual([1, 2, 3]);
    expect(result!.distanceM).toBeLessThanOrEqual(300);
  });

  it("returns null when no path exists", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75)],
    ]);
    const result = dijkstra({ fromNodeId: 1, toNodeId: 2, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges: [] });
    expect(result).toBeNull();
  });

  it("returns null when fromNodeId does not exist in graph", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 999, toNodeId: 3, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).toBeNull();
  });

  it("returns a single-node path when from === to", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 2, toNodeId: 2, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toHaveLength(1);
    expect(result!.distanceM).toBe(0);
  });

  it("avoids blocked edges (confirmedViolenceCount >= threshold)", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75)],
      [3, makeNode(3, 18.002, -76.75)],
    ]);
    const edges: GraphEdge[] = [
      makeEdge(1, 1, 2, { confirmedViolenceCount: VIOLENCE_BLOCK_THRESHOLD }), // blocked in safe_night
      makeEdge(2, 2, 3, { distanceM: 100 }),
      makeEdge(3, 1, 3, { distanceM: 300 }), // only viable direct path
    ];
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "safe_night", hourOfDay: 22, isRainy: false, nodes, edges });
    // Should skip A→B (violence blocked) and use A→C directly
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual([1, 3]);
  });

  it("accessible mode skips edges with steps", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75)],
      [3, makeNode(3, 18.002, -76.75)],
    ]);
    const edges: GraphEdge[] = [
      makeEdge(1, 1, 2, { hasSteps: true, distanceM: 50 }), // has steps — skip in accessible
      makeEdge(2, 2, 3, { distanceM: 100 }),
      makeEdge(3, 1, 3, { distanceM: 300, hasSteps: false }),
    ];
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "accessible", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    // Should not go through node 2 (edge 1→2 has steps)
    expect(result!.nodeIds).not.toContain(2);
  });

  it("accessible mode skips edges with slope > MAX_SLOPE_GRADE", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75)],
      [3, makeNode(3, 18.002, -76.75)],
    ]);
    const edges: GraphEdge[] = [
      makeEdge(1, 1, 2, { slopeGrade: MAX_SLOPE_GRADE + 1, distanceM: 50 }), // too steep
      makeEdge(2, 2, 3, { distanceM: 100 }),
      makeEdge(3, 1, 3, { distanceM: 300, slopeGrade: 0 }),
    ];
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "accessible", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    expect(result!.nodeIds).not.toContain(2);
  });

  it("result includes required fields", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("mode", "shortest");
    expect(result).toHaveProperty("nodeIds");
    expect(result).toHaveProperty("coordinates");
    expect(result).toHaveProperty("distanceM");
    expect(result).toHaveProperty("walkTimeSec");
    expect(result).toHaveProperty("safetyScore");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("landmarks");
  });

  it("safety score is between 0 and 1", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result!.safetyScore).toBeGreaterThanOrEqual(0);
    expect(result!.safetyScore).toBeLessThanOrEqual(1);
  });

  it("coordinates array has one entry per node", () => {
    const { nodes, edges } = buildSimpleGraph();
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "shortest", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result!.coordinates).toHaveLength(result!.nodeIds.length);
  });

  it("scenic mode includes landmark names in result", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75, { isLandmark: true, name: "Main Library", scenicScore: 1.0 })],
      [3, makeNode(3, 18.002, -76.75)],
    ]);
    const edges: GraphEdge[] = [
      makeEdge(1, 1, 2, { distanceM: 100, scenicScore: 1.0 }),
      makeEdge(2, 2, 3, { distanceM: 100, scenicScore: 1.0 }),
    ];
    const result = dijkstra({ fromNodeId: 1, toNodeId: 3, mode: "scenic", hourOfDay: 12, isRainy: false, nodes, edges });
    expect(result).not.toBeNull();
    expect(result!.landmarks).toContain("Main Library");
  });

  it("night mode penalises dark paths more than day mode", () => {
    // Two parallel paths: one well-lit, one dark
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.74, { name: "Lit Path Mid" })],
      [3, makeNode(3, 18.001, -76.76, { name: "Dark Path Mid" })],
      [4, makeNode(4, 18.002, -76.75)],
    ]);
    const edges: GraphEdge[] = [
      makeEdge(1, 1, 2, { distanceM: 120, walkTimeSec: 86, lighting: 0.95 }), // well-lit
      makeEdge(2, 2, 4, { distanceM: 120, walkTimeSec: 86, lighting: 0.95 }),
      makeEdge(3, 1, 3, { distanceM: 100, walkTimeSec: 72, lighting: 0.1 }), // dark but shorter
      makeEdge(4, 3, 4, { distanceM: 100, walkTimeSec: 72, lighting: 0.1 }),
    ];
    const nightResult = dijkstra({ fromNodeId: 1, toNodeId: 4, mode: "safe_night", hourOfDay: 22, isRainy: false, nodes, edges });
    // Safe night should prefer the well-lit path even though it's longer
    expect(nightResult).not.toBeNull();
    expect(nightResult!.nodeIds).toContain(2); // well-lit path
    expect(nightResult!.nodeIds).not.toContain(3); // dark path
  });
});

// ─── planAllRoutes ────────────────────────────────────────────────────────────

describe("planAllRoutes", () => {
  it("returns an array of route results", () => {
    const { nodes, edges } = buildSimpleGraph();
    const results = planAllRoutes(1, 3, 12, false, nodes, edges);
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns up to 4 routes for a connected graph", () => {
    const { nodes, edges } = buildSimpleGraph();
    const results = planAllRoutes(1, 3, 12, false, nodes, edges);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(4);
  });

  it("returns empty array for disconnected graph", () => {
    const nodes = new Map<number, GraphNode>([
      [1, makeNode(1, 18.0, -76.75)],
      [2, makeNode(2, 18.001, -76.75)],
    ]);
    const results = planAllRoutes(1, 2, 12, false, nodes, []);
    expect(results).toHaveLength(0);
  });

  it("all returned routes have required fields", () => {
    const { nodes, edges } = buildSimpleGraph();
    const results = planAllRoutes(1, 3, 12, false, nodes, edges);
    for (const route of results) {
      expect(route).toHaveProperty("mode");
      expect(route).toHaveProperty("nodeIds");
      expect(route).toHaveProperty("distanceM");
      expect(route).toHaveProperty("walkTimeSec");
      expect(route).toHaveProperty("safetyScore");
      expect(Array.isArray(route.nodeIds)).toBe(true);
      expect(route.nodeIds.length).toBeGreaterThan(0);
    }
  });

  it("each mode appears at most once", () => {
    const { nodes, edges } = buildSimpleGraph();
    const results = planAllRoutes(1, 3, 12, false, nodes, edges);
    const modes = results.map((r) => r.mode);
    const uniqueModes = new Set(modes);
    expect(uniqueModes.size).toBe(modes.length);
  });
});

// ─── toGraphNode / toGraphEdge ────────────────────────────────────────────────

describe("toGraphNode", () => {
  it("maps a database row to a GraphNode with numeric lat/lng", () => {
    const row = {
      id: 1,
      lat: "18.0035",
      lng: "-76.7497",
      name: "Main Gate",
      category: "gate",
      isLandmark: true,
      scenicScore: 0.4,
      isAccessible: true,
    };
    const node = toGraphNode(row as any);
    expect(node.id).toBe(1);
    expect(node.name).toBe("Main Gate");
    expect(node.isLandmark).toBe(true);
    expect(typeof node.lat).toBe("number");
    expect(typeof node.lng).toBe("number");
    expect(node.lat).toBeCloseTo(18.0035);
    expect(node.lng).toBeCloseTo(-76.7497);
  });
});

describe("toGraphEdge", () => {
  it("maps a database row to a GraphEdge with numeric fields", () => {
    const row = {
      id: 5,
      fromNodeId: 1,
      toNodeId: 2,
      distanceM: 150,
      walkTimeSec: 107,
      lighting: 0.8,
      weatherCoverage: 0.6,
      isolation: 0.7,
      isAccessible: true,
      surfaceQuality: 0.9,
      scenicScore: 0.5,
      hasSteps: false,
      slopeGrade: 2,
      confirmedViolenceCount: 0,
      confirmedHazardCount: 2,
      isActive: true,
    };
    const edge = toGraphEdge(row as any);
    expect(edge.id).toBe(5);
    expect(edge.fromNodeId).toBe(1);
    expect(edge.toNodeId).toBe(2);
    expect(edge.confirmedHazardCount).toBe(2);
    expect(edge.hasSteps).toBe(false);
    expect(edge.isActive).toBe(true);
  });
});
