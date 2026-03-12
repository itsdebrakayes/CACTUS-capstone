import { forwardRef, useEffect } from "react";
import { CactusMap, type CactusMapHandle, UWI_MONA_CENTER } from "./CactusMap";

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: unknown) => void;
}

// Legacy compatibility wrapper. The active app uses Mapbox through CactusMap.
export const MapView = forwardRef<CactusMapHandle, MapViewProps>(function MapView(
  {
    className,
    initialCenter = { lat: UWI_MONA_CENTER[1], lng: UWI_MONA_CENTER[0] },
    onMapReady,
  },
  ref
) {
  useEffect(() => {
    if (onMapReady) {
      onMapReady(null);
    }
  }, [onMapReady]);

  return (
    <CactusMap
      ref={ref}
      className={className}
      userLat={initialCenter.lat}
      userLng={initialCenter.lng}
    />
  );
});
