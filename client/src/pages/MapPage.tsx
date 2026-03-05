import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { CactusMap, type CactusMapHandle } from "@/components/CactusMap";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import { X, Navigation, Shield, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type MapMode = "explore" | "walking" | "reports" | "checkin";

export default function MapPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [activeMode, setActiveMode] = useState<MapMode>("explore");
  const [selectedDestination, setSelectedDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const mapRef = useRef<CactusMapHandle>(null);

  // SSE events (no-op handler for now)
  useSSE(() => {});

  // Geolocation tracking
  useGeolocation((lat, lng) => {
    setUserLat(lat);
    setUserLng(lng);
  }, 3000);

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const modes = [
    { id: "explore" as MapMode, icon: Navigation, label: "Explore", color: "#1565c0" },
    { id: "walking" as MapMode, icon: Users, label: "Walking", color: "#00c853" },
    { id: "reports" as MapMode, icon: AlertTriangle, label: "Reports", color: "#e65100" },
    { id: "checkin" as MapMode, icon: Shield, label: "Check-In", color: "#7b1fa2" },
  ];

  return (
    <AppLayout activeTab="map">
      <div className="relative h-[calc(100vh-4rem)] flex flex-col">
        {/* Mode selector */}
        <div className="absolute top-4 left-0 right-0 z-10 px-4">
          <div className="flex gap-2 justify-center">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all duration-200 shadow-md",
                    isActive
                      ? "text-white shadow-lg"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  )}
                  style={isActive ? { backgroundColor: mode.color } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1">
          <CactusMap
            ref={mapRef}
            userLat={userLat}
            userLng={userLng}
            walkers={[]}
            hazards={[]}
            footpaths={[]}
            isSelectingDest={activeMode === "checkin"}
            onDestinationSelected={activeMode === "checkin" ? (lat: number, lng: number) => {
              setSelectedDestination({ lat, lng });
            } : undefined}
          />
        </div>

        {/* Destination selected banner */}
        {selectedDestination && activeMode === "checkin" && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-4 border border-[#7b1fa2]/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Destination Selected</p>
                <p className="text-xs text-gray-500">
                  {selectedDestination.lat.toFixed(5)}, {selectedDestination.lng.toFixed(5)}
                </p>
              </div>
              <button
                onClick={() => setSelectedDestination(null)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
            <button
              onClick={() => navigate(`/check-in?lat=${selectedDestination.lat}&lng=${selectedDestination.lng}`)}
              className="w-full py-2.5 bg-[#7b1fa2] text-white text-sm font-semibold rounded-xl hover:bg-[#6a1b9a] transition-colors"
            >
              Set as Check-In Destination
            </button>
          </div>
        )}

        {/* Walking mode panel */}
        {activeMode === "walking" && !selectedDestination && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-4 border border-[#00c853]/20">
            <p className="text-sm font-semibold text-gray-900 mb-1">Walking Body</p>
            <p className="text-xs text-gray-500 mb-3">Find a walking partner nearby on campus</p>
            <button
              onClick={() => navigate("/walking")}
              className="w-full py-2.5 bg-[#00c853] text-white text-sm font-semibold rounded-xl hover:bg-[#00b84a] transition-colors"
            >
              Open Walking Panel
            </button>
          </div>
        )}

        {/* Reports mode panel */}
        {activeMode === "reports" && !selectedDestination && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg p-4 border border-[#e65100]/20">
            <p className="text-sm font-semibold text-gray-900 mb-1">Caution Reports</p>
            <p className="text-xs text-gray-500 mb-3">Report hazards or view active alerts on campus</p>
            <button
              onClick={() => navigate("/reports")}
              className="w-full py-2.5 bg-[#e65100] text-white text-sm font-semibold rounded-xl hover:bg-[#d84315] transition-colors"
            >
              Open Reports Panel
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
