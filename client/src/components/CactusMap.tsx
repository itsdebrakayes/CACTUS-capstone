import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface CactusMapProps {
  userLat?: number;
  userLng?: number;
  walkers?: Array<{ id: number; lat: number; lng: number; trustScore: number }>;
  hazards?: Array<{ id: number; lat: number; lng: number; severity: number; type: string }>;
  onMapReady?: (map: mapboxgl.Map) => void;
}

/**
 * Mapbox map component for CACTUS
 * Displays user location, nearby walkers, and hazard reports
 */
export function CactusMap({ userLat = 18.0235, userLng = -76.8099, walkers = [], hazards = [], onMapReady }: CactusMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [userLng, userLat],
      zoom: 15,
      accessToken: "pk.eyJ1IjoiY2FjdHVzLXBvYyIsImEiOiJjbHp6enp6In0.placeholder", // Placeholder token
    });

    map.current.on("load", () => {
      // Add user location marker
      if (userLat && userLng) {
        const userMarker = document.createElement("div");
        userMarker.className = "w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg";

        new mapboxgl.Marker(userMarker).setLngLat([userLng, userLat]).addTo(map.current!);
      }

      // Add walker markers
      walkers.forEach((walker) => {
        const walkerMarker = document.createElement("div");
        walkerMarker.className = "w-3 h-3 bg-green-500 rounded-full border border-white shadow";

        new mapboxgl.Marker(walkerMarker)
          .setLngLat([walker.lng, walker.lat])
          .setPopup(new mapboxgl.Popup().setHTML(`<strong>Walker</strong><br/>Trust: ${walker.trustScore.toFixed(2)}`))
          .addTo(map.current!);
      });

      // Add hazard markers with severity-based colors
      hazards.forEach((hazard) => {
        const color = hazard.severity >= 4 ? "red" : hazard.severity >= 2 ? "orange" : "yellow";
        const hazardMarker = document.createElement("div");
        hazardMarker.className = `w-3 h-3 bg-${color}-500 rounded-full border border-white shadow`;

        new mapboxgl.Marker(hazardMarker)
          .setLngLat([hazard.lng, hazard.lat])
          .setPopup(
            new mapboxgl.Popup().setHTML(
              `<strong>${hazard.type}</strong><br/>Severity: ${hazard.severity}/5`
            )
          )
          .addTo(map.current!);
      });

      if (onMapReady && map.current) {
        onMapReady(map.current);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, [userLat, userLng, walkers, hazards, onMapReady]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
