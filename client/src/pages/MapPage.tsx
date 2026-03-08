import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { CactusMap, type CactusMapHandle, type Hazard } from "@/components/CactusMap";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import {
  AlertTriangle,
  Users,
  Shield,
  Navigation,
  X,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  MapPin,
  Clock,
  CheckCircle,
  Zap,
  Droplets,
  Eye,
  Construction,
  Footprints,
  Flame,
  Wind,
  PersonStanding,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Campus hazard categories ─────────────────────────────────────────────────
const HAZARD_CATEGORIES = [
  { type: "light_out", label: "Broken Light", icon: Zap, color: "#f59e0b", bg: "#fef3c7", severity: 4, description: "Street or path light not working" },
  { type: "flooding", label: "Flooding", icon: Droplets, color: "#3b82f6", bg: "#dbeafe", severity: 4, description: "Water on path / flooded area" },
  { type: "broken_path", label: "Broken Path", icon: Footprints, color: "#ef4444", bg: "#fee2e2", severity: 3, description: "Damaged or unsafe walkway" },
  { type: "suspicious", label: "Suspicious Activity", icon: Eye, color: "#8b5cf6", bg: "#ede9fe", severity: 4, description: "Suspicious person or behaviour" },
  { type: "obstruction", label: "Obstruction", icon: Construction, color: "#f97316", bg: "#ffedd5", severity: 2, description: "Path blocked or under work" },
  { type: "violent_incident", label: "Violent Incident", icon: Flame, color: "#dc2626", bg: "#fee2e2", severity: 5, description: "Fight, assault, or threat" },
  { type: "slippery", label: "Slippery Surface", icon: Wind, color: "#0ea5e9", bg: "#e0f2fe", severity: 3, description: "Wet or slippery path surface" },
  { type: "poor_visibility", label: "Poor Visibility", icon: PersonStanding, color: "#6b7280", bg: "#f3f4f6", severity: 3, description: "Dark or obscured area" },
] as const;

type HazardType = (typeof HAZARD_CATEGORIES)[number]["type"];

// ─── Demo data: mock hazards on UWI Mona campus ───────────────────────────────
const DEMO_HAZARDS: Hazard[] = [
  { id: 1, reportType: "light_out", lat: 18.0042, lng: -76.7485, severity: 4, ttlMinutes: 45, description: "Lamp post near Engineering broken" },
  { id: 2, reportType: "flooding", lat: 18.0028, lng: -76.7510, severity: 3, ttlMinutes: 30, description: "Water pooling after rain near Chapel" },
  { id: 3, reportType: "broken_path", lat: 18.0055, lng: -76.7475, severity: 3, ttlMinutes: 60, description: "Cracked pavement near Mona Bowl" },
  { id: 4, reportType: "suspicious", lat: 18.0035, lng: -76.7500, severity: 4, ttlMinutes: 20, description: "Suspicious individual near car park" },
  { id: 5, reportType: "obstruction", lat: 18.0020, lng: -76.7490, severity: 2, ttlMinutes: 90, description: "Construction materials blocking path" },
];

// ─── Demo walkers ─────────────────────────────────────────────────────────────
const DEMO_WALKERS = [
  { id: 101, lat: 18.0038, lng: -76.7492, trustScore: 0.85 },
  { id: 102, lat: 18.0031, lng: -76.7505, trustScore: 0.72 },
  { id: 103, lat: 18.0048, lng: -76.7480, trustScore: 0.91 },
  { id: 104, lat: 18.0025, lng: -76.7515, trustScore: 0.60 },
];

// ─── Severity label ───────────────────────────────────────────────────────────
const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "#22c55e" },
  2: { label: "Minor", color: "#84cc16" },
  3: { label: "Moderate", color: "#f59e0b" },
  4: { label: "High", color: "#ef4444" },
  5: { label: "Critical", color: "#dc2626" },
};

function timeAgo(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// ─── Hazard Report Bottom Sheet ───────────────────────────────────────────────
function HazardReportSheet({
  onClose,
  onSubmit,
  selectedLat,
  selectedLng,
}: {
  onClose: () => void;
  onSubmit: (type: HazardType, description: string, lat: number, lng: number) => void;
  selectedLat?: number;
  selectedLng?: number;
}) {
  const [step, setStep] = useState<"category" | "details">("category");
  const [selectedType, setSelectedType] = useState<HazardType | null>(null);
  const [description, setDescription] = useState("");

  const handleCategorySelect = (type: HazardType) => {
    setSelectedType(type);
    setStep("details");
  };

  const handleSubmit = () => {
    if (!selectedType) return;
    const lat = selectedLat ?? 18.0035;
    const lng = selectedLng ?? -76.7497;
    onSubmit(selectedType, description, lat, lng);
  };

  const selectedCat = HAZARD_CATEGORIES.find((c) => c.type === selectedType);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-30"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {step === "details" && (
              <button
                onClick={() => setStep("category")}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mr-1"
              >
                <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
              </button>
            )}
            <h2 className="text-base font-bold text-gray-900">Report a Hazard</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {step === "category" ? (
            <>
              <p className="text-xs text-gray-500 mb-4">
                What hazard are you reporting on this footpath?
              </p>
              <div className="grid grid-cols-3 gap-3">
                {HAZARD_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.type}
                      onClick={() => handleCategorySelect(cat.type)}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                    >
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: cat.bg }}
                      >
                        <Icon className="w-6 h-6" style={{ color: cat.color }} />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            selectedCat && (
              <div>
                {/* Selected category preview */}
                <div
                  className="flex items-center gap-3 p-3 rounded-2xl mb-4"
                  style={{ backgroundColor: selectedCat.bg }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: selectedCat.bg }}
                  >
                    <selectedCat.icon className="w-5 h-5" style={{ color: selectedCat.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: selectedCat.color }}>
                      {selectedCat.label}
                    </p>
                    <p className="text-xs text-gray-500">{selectedCat.description}</p>
                  </div>
                </div>

                {/* Severity indicator */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-500">Auto-severity:</span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: SEVERITY_LABELS[selectedCat.severity]?.color }}
                  >
                    {SEVERITY_LABELS[selectedCat.severity]?.label}
                  </span>
                </div>

                {/* Location indicator */}
                <div className="flex items-center gap-2 mb-4 p-2.5 bg-[#f5f7fa] rounded-xl">
                  <MapPin className="w-4 h-4 text-[#00c853] shrink-0" />
                  <span className="text-xs text-gray-600">
                    {selectedLat && selectedLng
                      ? `${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`
                      : "Your current location on campus"}
                  </span>
                </div>

                {/* Description */}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`Describe the ${selectedCat.label.toLowerCase()} (optional)`}
                  className="w-full p-3 bg-[#f5f7fa] rounded-xl text-sm text-gray-700 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#00c853]/30 mb-4"
                  rows={3}
                  maxLength={300}
                />

                {/* Submit buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-colors"
                    style={{ backgroundColor: selectedCat.color }}
                  >
                    Report
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

// ─── Hazard Detail Sheet ──────────────────────────────────────────────────────
function HazardDetailSheet({
  hazard,
  onClose,
  onVote,
}: {
  hazard: Hazard;
  onClose: () => void;
  onVote: (reportId: number, vote: "still_there" | "not_there") => void;
}) {
  const cat = HAZARD_CATEGORIES.find((c) => c.type === hazard.reportType);
  const Icon = cat?.icon ?? AlertTriangle;
  const severity = SEVERITY_LABELS[hazard.severity] ?? SEVERITY_LABELS[3];
  const ttlPct = Math.min(100, ((hazard.ttlMinutes ?? 30) / 60) * 100);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 py-4">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: cat?.bg ?? "#f3f4f6" }}
            >
              <Icon className="w-6 h-6" style={{ color: cat?.color ?? "#6b7280" }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base font-bold text-gray-900">{cat?.label ?? hazard.reportType}</h3>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: severity.color }}
                >
                  {severity.label}
                </span>
              </div>
              {hazard.description && (
                <p className="text-sm text-gray-600">{hazard.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* TTL bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Expires in ~{hazard.ttlMinutes ?? 30} min</span>
              </div>
              <span>{Math.round(ttlPct)}% remaining</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${ttlPct}%`,
                  backgroundColor: ttlPct > 50 ? "#22c55e" : ttlPct > 25 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
          </div>

          {/* Vote buttons */}
          <p className="text-xs text-gray-500 mb-3 text-center">Is this hazard still there?</p>
          <div className="flex gap-3">
            <button
              onClick={() => onVote(hazard.id, "still_there")}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#fff8e1] border-2 border-[#f59e0b] text-[#b45309] font-bold text-sm hover:bg-[#fef3c7] transition-colors active:scale-95"
            >
              <ThumbsUp className="w-4 h-4" />
              Still There
            </button>
            <button
              onClick={() => onVote(hazard.id, "not_there")}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#f0fdf4] border-2 border-[#22c55e] text-[#15803d] font-bold text-sm hover:bg-[#dcfce7] transition-colors active:scale-95"
            >
              <CheckCircle className="w-4 h-4" />
              It's Gone
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Walking Request Sheet ────────────────────────────────────────────────────
function WalkingSheet({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Walking Body</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {DEMO_WALKERS.length} students available to walk with you near campus right now.
          </p>
          <div className="space-y-2 mb-4">
            {DEMO_WALKERS.map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-3 bg-[#f5f7fa] rounded-xl">
                <div className="w-9 h-9 rounded-full bg-[#e8faf0] flex items-center justify-center">
                  <Users className="w-4 h-4 text-[#00c853]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Student #{w.id}</p>
                  <p className="text-xs text-gray-500">Trust: {Math.round(w.trustScore * 100)}%</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-[#00c853] animate-pulse" />
              </div>
            ))}
          </div>
          <button
            onClick={() => { onClose(); navigate("/walking"); }}
            className="w-full py-3 bg-[#00c853] text-white font-bold text-sm rounded-2xl hover:bg-[#00b84a] transition-colors"
          >
            Request Walking Partner
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Check-In Sheet ───────────────────────────────────────────────────────────
function CheckInSheet({
  onClose,
  selectedDest,
  onSelectDest,
}: {
  onClose: () => void;
  selectedDest: { lat: number; lng: number } | null;
  onSelectDest: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Safety Check-In</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Set your destination. If you don't arrive in time, your emergency contact will be notified.
          </p>

          {/* Destination picker */}
          <button
            onClick={onSelectDest}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-4 transition-all",
              selectedDest
                ? "border-[#00c853] bg-[#f0fdf4]"
                : "border-dashed border-gray-300 bg-[#f5f7fa] hover:border-[#00c853]"
            )}
          >
            <MapPin className={cn("w-5 h-5 shrink-0", selectedDest ? "text-[#00c853]" : "text-gray-400")} />
            <span className={cn("text-sm font-medium", selectedDest ? "text-[#00c853]" : "text-gray-500")}>
              {selectedDest
                ? `${selectedDest.lat.toFixed(5)}, ${selectedDest.lng.toFixed(5)}`
                : "Tap map to set destination"}
            </span>
          </button>

          <button
            onClick={() => { onClose(); navigate("/check-in"); }}
            className="w-full py-3 bg-[#7b1fa2] text-white font-bold text-sm rounded-2xl hover:bg-[#6a1a8f] transition-colors"
          >
            Set Up Check-In
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main MapPage ─────────────────────────────────────────────────────────────
type ActiveSheet = "none" | "report" | "hazard" | "walking" | "checkin";

export default function MapPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>("none");
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [isSelectingDest, setIsSelectingDest] = useState(false);
  const [selectedDest, setSelectedDest] = useState<{ lat: number; lng: number } | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [hazards, setHazards] = useState<Hazard[]>(DEMO_HAZARDS);
  const [reportLat, setReportLat] = useState<number | undefined>();
  const [reportLng, setReportLng] = useState<number | undefined>();
  const mapRef = useRef<CactusMapHandle>(null);

  const createReportMutation = trpc.reports.createReport.useMutation({
    onSuccess: (data) => {
      toast.success("Hazard reported! Other students will be notified.");
      setActiveSheet("none");
    },
    onError: (err) => toast.error(err.message),
  });

  const voteReportMutation = trpc.reports.voteReport.useMutation({
    onSuccess: (data) => {
      toast.success(data.newTTL > 0 ? "Thanks for confirming!" : "Report marked as resolved.");
      setActiveSheet("none");
      setSelectedHazard(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // SSE for live hazard updates
  useSSE((event) => {
    if (event.type === "reports.created") {
      const d = event.data as { reportId: number; reportType: string; severity: number; lat: number; lng: number };
      setHazards((prev) => [
        ...prev,
        {
          id: d.reportId,
          reportType: d.reportType,
          lat: d.lat,
          lng: d.lng,
          severity: d.severity,
          ttlMinutes: d.severity >= 4 ? 60 : 30,
        },
      ]);
    }
  });

  // Geolocation
  useGeolocation((lat, lng) => {
    setUserLat(lat);
    setUserLng(lng);
  }, 3000);

  // Active hazard count
  const activeHazardCount = hazards.filter((h) => (h.ttlMinutes ?? 0) > 0).length;

  const handleHazardClick = useCallback((hazard: Hazard) => {
    setSelectedHazard(hazard);
    setActiveSheet("hazard");
  }, []);

  const handleDestinationSelected = useCallback((lat: number, lng: number) => {
    setSelectedDest({ lat, lng });
    setIsSelectingDest(false);
    setActiveSheet("checkin");
  }, []);

  const handleReportSubmit = (type: HazardType, description: string, lat: number, lng: number) => {
    const cat = HAZARD_CATEGORIES.find((c) => c.type === type);
    if (!cat) return;

    // Optimistic update for demo
    const newHazard: Hazard = {
      id: Date.now(),
      reportType: type,
      lat,
      lng,
      severity: cat.severity,
      ttlMinutes: cat.severity >= 4 ? 60 : 30,
      description,
    };
    setHazards((prev) => [...prev, newHazard]);

    // Real API call
    createReportMutation.mutate({
      reportType: type as any,
      severity: cat.severity,
      lat,
      lng,
      description,
    });
  };

  const handleVote = (reportId: number, vote: "still_there" | "not_there") => {
    // Optimistic TTL update
    setHazards((prev) =>
      prev.map((h) => {
        if (h.id !== reportId) return h;
        const adj = vote === "still_there" ? (h.severity >= 4 ? 30 : 15) : -(h.severity >= 4 ? 30 : 15);
        return { ...h, ttlMinutes: Math.max(0, (h.ttlMinutes ?? 30) + adj) };
      })
    );
    voteReportMutation.mutate({ reportId, vote });
  };

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="map" noScroll>
      {/* Full-height map container — fills all space above the bottom nav (64px) */}
      <div className="relative" style={{ height: "calc(100vh - 64px)" }}>
        {/* Map */}
        <CactusMap
          ref={mapRef}
          userLat={userLat}
          userLng={userLng}
          walkers={DEMO_WALKERS}
          hazards={hazards}
          isSelectingDest={isSelectingDest}
          onDestinationSelected={handleDestinationSelected}
          onHazardClick={handleHazardClick}
        />

        {/* ── Top bar: mode indicator ─────────────────────────────────────── */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-2.5 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#00c853]" />
            <span className="text-sm font-semibold text-gray-800">UWI Mona Campus</span>
            {activeHazardCount > 0 && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#dc2626]">
                {activeHazardCount} alerts
              </span>
            )}
          </div>
          {isSelectingDest && (
            <button
              onClick={() => setIsSelectingDest(false)}
              className="bg-white rounded-2xl shadow-lg px-3 py-2.5 text-xs font-semibold text-[#e53935]"
            >
              Cancel
            </button>
          )}
        </div>

        {/* ── Destination-select hint ─────────────────────────────────────── */}
        {isSelectingDest && (
          <div className="absolute top-20 left-4 right-4 z-10">
            <div className="bg-[#7b1fa2] text-white rounded-2xl px-4 py-3 text-center shadow-lg">
              <p className="text-sm font-bold">Tap the map to set your destination</p>
              <p className="text-xs opacity-80 mt-0.5">Your check-in will monitor your journey</p>
            </div>
          </div>
        )}

        {/* ── Right-side FABs ─────────────────────────────────────────────── */}
        <div className="absolute right-4 bottom-24 z-20 flex flex-col gap-3">
          {/* Walking Body FAB */}
          <button
            onClick={() => setActiveSheet("walking")}
            className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-[#00c853] relative hover:scale-105 transition-transform active:scale-95"
          >
            <Users className="w-6 h-6 text-[#00c853]" />
            {DEMO_WALKERS.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#00c853] text-white text-[9px] font-bold flex items-center justify-center">
                {DEMO_WALKERS.length}
              </span>
            )}
          </button>

          {/* Check-In FAB */}
          <button
            onClick={() => setActiveSheet("checkin")}
            className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-[#7b1fa2] hover:scale-105 transition-transform active:scale-95"
          >
            <Shield className="w-6 h-6 text-[#7b1fa2]" />
          </button>

          {/* Caution / Report FAB — Waze-style yellow triangle */}
          <button
            onClick={() => {
              setReportLat(userLat);
              setReportLng(userLng);
              setActiveSheet("report");
            }}
            className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform active:scale-95 relative"
            style={{ border: "2.5px solid #f59e0b" }}
          >
            {/* Triangle icon matching Waze style */}
            <svg viewBox="0 0 40 36" className="w-7 h-7" fill="none">
              <path
                d="M20 2L38 34H2L20 2Z"
                fill="#f59e0b"
                stroke="#f59e0b"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <text
                x="20"
                y="28"
                textAnchor="middle"
                fontSize="18"
                fontWeight="bold"
                fill="white"
              >
                !
              </text>
            </svg>
            {activeHazardCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#ef4444] text-white text-[9px] font-bold flex items-center justify-center">
                {activeHazardCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Bottom legend strip ─────────────────────────────────────────── */}
        {activeSheet === "none" && !isSelectingDest && (
          <div className="absolute bottom-4 left-4 right-4 z-10">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {[
                    { color: "#ef4444", label: "Critical" },
                    { color: "#f59e0b", label: "High" },
                    { color: "#22c55e", label: "Low" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] text-gray-500">{s.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00c853] animate-pulse" />
                  <span className="text-[10px] text-gray-500">{DEMO_WALKERS.length} walkers nearby</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sheets ──────────────────────────────────────────────────────────── */}
      {activeSheet === "report" && (
        <HazardReportSheet
          onClose={() => setActiveSheet("none")}
          onSubmit={handleReportSubmit}
          selectedLat={reportLat}
          selectedLng={reportLng}
        />
      )}

      {activeSheet === "hazard" && selectedHazard && (
        <HazardDetailSheet
          hazard={selectedHazard}
          onClose={() => { setActiveSheet("none"); setSelectedHazard(null); }}
          onVote={handleVote}
        />
      )}

      {activeSheet === "walking" && (
        <WalkingSheet onClose={() => setActiveSheet("none")} />
      )}

      {activeSheet === "checkin" && (
        <CheckInSheet
          onClose={() => setActiveSheet("none")}
          selectedDest={selectedDest}
          onSelectDest={() => {
            setActiveSheet("none");
            setIsSelectingDest(true);
          }}
        />
      )}
    </AppLayout>
  );
}
