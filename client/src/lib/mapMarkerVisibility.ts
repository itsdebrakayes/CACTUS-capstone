import mapboxgl from "mapbox-gl";

export interface ManagedMapMarker {
  marker: mapboxgl.Marker;
  element: HTMLElement;
  baseSizePx: number;
  priority?: number;
  fullSizeZoom?: number;
  minRenderSizePx?: number;
}

export interface MapMarkerVisibilityBinding {
  destroy: () => void;
  sync: () => void;
}

interface MarkerBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const MARKER_VISIBILITY_EVENTS = [
  "move",
  "zoom",
  "resize",
  "rotate",
  "pitch",
] as const;
const DEFAULT_FULL_SIZE_ZOOM = 15.5;
const DEFAULT_MIN_RENDER_SIZE_PX = 2;
const COLLISION_PADDING_PX = 2;

export function bindManagedMapMarkerVisibility(
  map: mapboxgl.Map,
  getMarkers: () => ManagedMapMarker[]
): MapMarkerVisibilityBinding {
  const sync = () => {
    syncManagedMapMarkerVisibility(map, getMarkers());
  };

  for (const eventName of MARKER_VISIBILITY_EVENTS) {
    map.on(eventName, sync);
  }

  sync();

  return {
    destroy: () => {
      for (const eventName of MARKER_VISIBILITY_EVENTS) {
        map.off(eventName, sync);
      }
    },
    sync,
  };
}

export function syncManagedMapMarkerVisibility(
  map: mapboxgl.Map,
  markers: ManagedMapMarker[]
) {
  const zoom = map.getZoom();
  const occupiedBounds: MarkerBounds[] = [];
  const orderedMarkers = [...markers].sort((left, right) => {
    const leftPriority = left.marker.getPopup()?.isOpen()
      ? Number.MAX_SAFE_INTEGER
      : (left.priority ?? 0);
    const rightPriority = right.marker.getPopup()?.isOpen()
      ? Number.MAX_SAFE_INTEGER
      : (right.priority ?? 0);

    return rightPriority - leftPriority;
  });

  for (const managedMarker of orderedMarkers) {
    const renderSizePx = getMarkerRenderSizePx(managedMarker, zoom);
    if (
      renderSizePx <=
      (managedMarker.minRenderSizePx ?? DEFAULT_MIN_RENDER_SIZE_PX)
    ) {
      hideManagedMarker(managedMarker);
      continue;
    }

    const point = map.project(managedMarker.marker.getLngLat());
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      hideManagedMarker(managedMarker);
      continue;
    }

    const bounds = createMarkerBounds(point.x, point.y, renderSizePx);
    const overlapsExistingMarker = occupiedBounds.some(occupied =>
      markerBoundsOverlap(bounds, occupied)
    );

    if (overlapsExistingMarker) {
      hideManagedMarker(managedMarker);
      continue;
    }

    showManagedMarker(managedMarker, renderSizePx / managedMarker.baseSizePx);
    occupiedBounds.push(bounds);
  }
}

function createMarkerBounds(
  x: number,
  y: number,
  sizePx: number
): MarkerBounds {
  const halfSizePx = sizePx / 2 + COLLISION_PADDING_PX;

  return {
    bottom: y + halfSizePx,
    left: x - halfSizePx,
    right: x + halfSizePx,
    top: y - halfSizePx,
  };
}

function getMarkerRenderSizePx(marker: ManagedMapMarker, zoom: number) {
  const fullSizeZoom = marker.fullSizeZoom ?? DEFAULT_FULL_SIZE_ZOOM;
  const scale = clamp(Math.pow(2, zoom - fullSizeZoom), 0, 1);

  return marker.baseSizePx * scale;
}

function hideManagedMarker(marker: ManagedMapMarker) {
  marker.element.style.opacity = "0";
  marker.element.style.pointerEvents = "none";
  marker.element.style.transform = "scale(0)";
  marker.element.style.visibility = "hidden";
}

function markerBoundsOverlap(left: MarkerBounds, right: MarkerBounds) {
  return !(
    left.right <= right.left ||
    left.left >= right.right ||
    left.bottom <= right.top ||
    left.top >= right.bottom
  );
}

function showManagedMarker(marker: ManagedMapMarker, scale: number) {
  marker.element.style.opacity = "1";
  marker.element.style.pointerEvents = "auto";
  marker.element.style.transform = `scale(${scale})`;
  marker.element.style.transformOrigin = "center center";
  marker.element.style.visibility = "visible";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
