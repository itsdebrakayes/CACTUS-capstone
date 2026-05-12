import { haversineMeters, mergeRouteCoordinates } from "@/lib/fstRouting";
import type { HazardRecord } from "@/lib/supabaseHazards";

export type Coord2 = [number, number];

export interface RouteLike {
  coordinates: Coord2[];
  distanceM: number;
}

export const SCENIC_ROUTE_WAYPOINTS: Coord2[] = [
  [-76.74517, 18.00549],
  [-76.74704, 18.00543],
  [-76.74726, 18.00747],
];

const HAZARD_AVOID_RADIUS_M = 45;
const DETOUR_DISTANCE_M = 95;
const METERS_PER_DEGREE_LAT = 111_320;

export function buildScenicWaypoints(origin: Coord2, destination: Coord2) {
  return mergeRouteCoordinates([origin], SCENIC_ROUTE_WAYPOINTS, [destination]);
}

export function getRouteHazards(
  coordinates: Coord2[],
  hazards: HazardRecord[],
  radiusM = HAZARD_AVOID_RADIUS_M
) {
  if (coordinates.length < 2 || hazards.length === 0) {
    return [];
  }

  return hazards.filter(hazard => {
    const hazardPoint: Coord2 = [hazard.lng, hazard.lat];
    return coordinates.some((coordinate, index) => {
      if (index === 0) {
        return haversineMeters(coordinate, hazardPoint) <= radiusM;
      }
      return (
        distancePointToSegmentMeters(
          hazardPoint,
          coordinates[index - 1],
          coordinate
        ) <= radiusM
      );
    });
  });
}

export function routeIntersectsHazards(
  coordinates: Coord2[],
  hazards: HazardRecord[]
) {
  return getRouteHazards(coordinates, hazards).length > 0;
}

export function sortRoutesBySafety<T extends RouteLike>(
  routes: T[],
  hazards: HazardRecord[],
  preferLongest = false
) {
  return [...routes].sort((left, right) => {
    const leftHazards = getRouteHazards(left.coordinates, hazards).length;
    const rightHazards = getRouteHazards(right.coordinates, hazards).length;
    if (leftHazards !== rightHazards) {
      return leftHazards - rightHazards;
    }
    return preferLongest
      ? right.distanceM - left.distanceM
      : left.distanceM - right.distanceM;
  });
}

export function buildHazardAvoidanceWaypoints(
  origin: Coord2,
  destination: Coord2,
  hazards: HazardRecord[]
) {
  const relevantHazards = hazards
    .map(hazard => ({
      hazard,
      distanceM: distancePointToSegmentMeters(
        [hazard.lng, hazard.lat],
        origin,
        destination
      ),
    }))
    .filter(item => item.distanceM <= HAZARD_AVOID_RADIUS_M * 1.5)
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, 3);

  if (relevantHazards.length === 0) {
    return [origin, destination];
  }

  const detours = relevantHazards.map(({ hazard }) =>
    buildDetourPoint(origin, destination, [hazard.lng, hazard.lat])
  );

  return mergeRouteCoordinates([origin], detours, [destination]);
}

function buildDetourPoint(origin: Coord2, destination: Coord2, hazard: Coord2) {
  const midPoint: Coord2 = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2,
  ];
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos(toRadians(hazard[1]));
  const routeX = (destination[0] - origin[0]) * lngScale;
  const routeY = (destination[1] - origin[1]) * METERS_PER_DEGREE_LAT;
  const length = Math.hypot(routeX, routeY) || 1;
  let normalX = -routeY / length;
  let normalY = routeX / length;

  const midToHazardX = (hazard[0] - midPoint[0]) * lngScale;
  const midToHazardY = (hazard[1] - midPoint[1]) * METERS_PER_DEGREE_LAT;
  if (normalX * midToHazardX + normalY * midToHazardY > 0) {
    normalX *= -1;
    normalY *= -1;
  }

  return [
    hazard[0] + (normalX * DETOUR_DISTANCE_M) / lngScale,
    hazard[1] + (normalY * DETOUR_DISTANCE_M) / METERS_PER_DEGREE_LAT,
  ] as Coord2;
}

function distancePointToSegmentMeters(point: Coord2, start: Coord2, end: Coord2) {
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos(toRadians(point[1]));
  const px = point[0] * lngScale;
  const py = point[1] * METERS_PER_DEGREE_LAT;
  const sx = start[0] * lngScale;
  const sy = start[1] * METERS_PER_DEGREE_LAT;
  const ex = end[0] * lngScale;
  const ey = end[1] * METERS_PER_DEGREE_LAT;

  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - sx, py - sy);
  }

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
