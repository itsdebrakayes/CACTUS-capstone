import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { CactusMap, type CactusMapHandle, type Hazard } from "@/components/CactusMap";
import { useSSE, useGeolocation } from "@/hooks/useSSE";
import {
  AlertTriangle, Users, Shield, Navigation, X, ChevronRight,
  ThumbsUp, ThumbsDown, MapPin, Clock, CheckCircle, Zap,
  Droplets, Eye, Construction, Footprints, Flame, Wind,
  PersonStanding, Route, Accessibility, TreePine, Star,
  ChevronDown, Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import NavigationPanel from "@/components/NavigationPanel";

// ─── Hazard categories ────────────────────────────────────────────────────────
const HAZARD_CATEGORIES = [
  { type: "light_out", label: "Broken Light", icon: Zap, color: "hsl(40 90% 55%)", bg: "hsl(40 90% 92%)", severity: 4, description: "Street or path light not working" },
  { type: "flooding", label: "Flooding", icon: Droplets, color: "hsl(185 60% 40%)", bg: "hsl(185 40% 92%)", severity: 4, description: "Water on path / flooded area" },
  { type: "broken_path", label: "Broken Path", icon: Footprints, color: "hsl(18 100% 50%)", bg: "hsl(18 100% 95%)", severity: 3, description: "Damaged or unsafe walkway" },
  { type: "suspicious", label: "Suspicious Activity", icon: Eye, color: "hsl(0 0% 40%)", bg: "hsl(47 19% 90%)", severity: 4, description: "Suspicious person or behaviour" },
  { type: "obstruction", label: "Obstruction", icon: Construction, color: "hsl(18 80% 55%)", bg: "hsl(18 80% 93%)", severity: 2, description: "Path blocked or under work" },
  { type: "violent_incident", label: "Violent Incident", icon: Flame, color: "hsl(0 70% 45%)", bg: "hsl(0 70% 93%)", severity: 5, description: "Fight, assault, or threat" },
  { type: "slippery", label: "Slippery Surface", icon: Wind, color: "hsl(185 100% 23%)", bg: "hsl(185 40% 92%)", severity: 3, description: "Wet or slippery path surface" },
  { type: "poor_visibility", label: "Poor Visibility", icon: PersonStanding, color: "hsl(0 0% 40%)", bg: "hsl(47 19% 90%)", severity: 3, description: "Dark or obscured area" },
] as const;

type HazardType = (typeof HAZARD_CATEGORIES)[number]["type"];

const DEMO_HAZARDS: Hazard[] = [
  { id: 1, reportType: "light_out", lat: 18.0042, lng: -76.7485, severity: 4, ttlMinutes: 45, description: "Lamp post near Engineering broken" },
  { id: 2, reportType: "flooding", lat: 18.0028, lng: -76.7510, severity: 3, ttlMinutes: 30, description: "Water pooling after rain near Chapel" },
  { id: 3, reportType: "broken_path", lat: 18.0055, lng: -76.7475, severity: 3, ttlMinutes: 60, description: "Cracked pavement near Mona Bowl" },
  { id: 4, reportType: "suspicious", lat: 18.0035, lng: -76.7500, severity: 4, ttlMinutes: 20, description: "Suspicious individual near car park" },
  { id: 5, reportType: "obstruction", lat: 18.0020, lng: -76.7490, severity: 2, ttlMinutes: 90, description: "Construction materials blocking path" },
];

const DEMO_WALKERS = [
  { id: 101, lat: 18.0038, lng: -76.7492, trustScore: 0.85, faculty: "FST", reviews: ["Friendly, great pace", "Reliable walking partner"] },
  { id: 102, lat: 18.0031, lng: -76.7505, trustScore: 0.72, faculty: "FMS", reviews: ["On time", "Good conversation"] },
  { id: 103, lat: 18.0048, lng: -76.7480, trustScore: 0.91, faculty: "FST", reviews: ["Very trustworthy", "Always available"] },
  { id: 104, lat: 18.0025, lng: -76.7515, trustScore: 0.60, faculty: "FHE", reviews: ["Okay", "Sometimes late"] },
];

const ROUTE_OPTIONS = [
  { id: "fastest", label: "Fastest Route", icon: Route, desc: "5 min · 350m", detail: "Via Engineering Parking", active: true },
  { id: "accessible", label: "Accessible Route", icon: Accessibility, desc: "8 min · 420m", detail: "Ramp-friendly, no stairs", active: false },
  { id: "scenic", label: "Scenic Route", icon: TreePine, desc: "12 min · 600m", detail: "Through Botanical Gardens", active: false },
  { id: "safest", label: "Safest Route", icon: Shield, desc: "7 min · 380m", detail: "Well-lit, CCTV coverage", active: false },
];

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "hsl(185 60% 40%)" },
  2: { label: "Minor", color: "hsl(185 100% 23%)" },
  3: { label: "Moderate", color: "hsl(40 90% 55%)" },
  4: { label: "High", color: "hsl(18 100% 50%)" },
  5: { label: "Critical", color: "hsl(0 70% 45%)" },
};

// ─── Route panel (left side on desktop, bottom sheet on mobile) ───────────────

function RoutePanel({
  activeRoute,
  onSelectRoute,
  onFindPartner,
  showWalkers,
}: {
  activeRoute: string;
  onSelectRoute: (id: string) => void;
  onFindPartner: () => void;
  showWalkers: boolean;
}) {
  const [destQuery, setDestQuery] = useState("SLT 2 — Science Lecture Theatre 2");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-base font-bold text-foreground mb-3">Find Your Way</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-xl">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground flex-1">My Location (GPS)</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-xl">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <input
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              className="text-xs text-foreground bg-transparent flex-1 focus:outline-none"
              placeholder="Where to?"
            />
          </div>
        </div>
      </div>

      {/* Route options */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Route Options
        </p>
        {ROUTE_OPTIONS.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRoute;
          return (
            <button
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              className={cn(
                "w-full text-left p-3 rounded-xl border-2 transition-all",
                isActive
                  ? "border-primary bg-teal-light"
                  : "border-transparent bg-card hover:bg-secondary"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{route.label}</p>
                  <p className="text-xs text-muted-foreground">{route.desc}</p>
                </div>
                {isActive && (
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    SELECTED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 ml-12">{route.detail}</p>
            </button>
          );
        })}

        {/* Delivery/order info style card */}
        <div className="mt-4 p-3 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Route Details</span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-light text-primary">
              WALKING
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Distance</p>
              <p className="text-sm font-bold text-foreground">350m</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Duration</p>
              <p className="text-sm font-bold text-foreground">5 min</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Elevation</p>
              <p className="text-sm font-bold text-foreground">+2m</p>
            </div>
          </div>
        </div>

        {/* Walking partner button */}
        <button
          onClick={onFindPartner}
          className="w-full mt-3 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Users className="w-4 h-4" />
          Find Walking Partner
        </button>
      </div>

      {/* Caution report */}
      <div className="p-4 border-t border-border">
        <button className="w-full py-2.5 bg-orange-light text-orange rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-orange/30 hover:bg-orange/10 transition-colors">
          <AlertTriangle className="w-4 h-4" />
          Report Caution
        </button>
      </div>
    </div>
  );
}

// ─── Walking Partners Panel ──────────────────────────────────────────────────

function WalkingPartnersPanel({ walkers, onClose }: { walkers: typeof DEMO_WALKERS; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">Walking Partners</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-muted-foreground mb-2">
          {walkers.length} students available near you
        </p>
        {walkers.map((w, i) => (
          <div key={w.id} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Student #{i + 123}</p>
                <p className="text-xs text-muted-foreground">{w.faculty} · Trust: {Math.round(w.trustScore * 100)}%</p>
              </div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, j) => (
                  <Star
                    key={j}
                    className={cn("w-3 h-3", j < Math.round(w.trustScore * 5) ? "text-orange fill-orange" : "text-border")}
                  />
                ))}
              </div>
            </div>
            {/* Recent reviews */}
            <div className="space-y-1 ml-13">
              {w.reviews.map((review, j) => (
                <p key={j} className="text-[10px] text-muted-foreground italic">"{review}"</p>
              ))}
            </div>
            <button className="w-full mt-2 py-2 bg-teal-light text-primary rounded-lg text-xs font-semibold hover:bg-primary/15 transition-colors">
              Request Walk
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main MapPage ─────────────────────────────────────────────────────────────

export default function MapPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [activeRoute, setActiveRoute] = useState("fastest");
  const [showWalkers, setShowWalkers] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"none" | "report" | "hazard">("none");
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [hazards, setHazards] = useState<Hazard[]>(DEMO_HAZARDS);
  const mapRef = useRef<CactusMapHandle>(null);
  const hasGps = userLat !== undefined && userLng !== undefined;

  // Mobile panel state
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const createReportMutation = trpc.reports.createReport.useMutation({
    onSuccess: () => { toast.success("Hazard reported!"); setActiveSheet("none"); },
    onError: (err: any) => toast.error(err.message),
  });

  const voteReportMutation = trpc.reports.voteReport.useMutation({
    onSuccess: (data: any) => { toast.success(data.newTTL > 0 ? "Thanks!" : "Resolved."); setActiveSheet("none"); setSelectedHazard(null); },
    onError: (err: any) => toast.error(err.message),
  });

  useSSE((event) => {
    if (event.type === "reports.created") {
      const d = event.data as any;
      setHazards((prev) => [...prev, { id: d.reportId, reportType: d.reportType, lat: d.lat, lng: d.lng, severity: d.severity, ttlMinutes: d.severity >= 4 ? 60 : 30 }]);
    }
  });

  useGeolocation((lat, lng) => { setUserLat(lat); setUserLng(lng); }, 3000);

  const handleHazardClick = useCallback((hazard: Hazard) => { setSelectedHazard(hazard); setActiveSheet("hazard"); }, []);
  const activeHazardCount = hazards.filter((h) => (h.ttlMinutes ?? 0) > 0).length;

  if (!loading && !user) { navigate("/login"); return null; }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="flex h-full">
        {/* Left panel — desktop only */}
        <div className="hidden lg:flex w-80 bg-card border-r border-border flex-col shrink-0">
          {showWalkers ? (
            <WalkingPartnersPanel walkers={DEMO_WALKERS} onClose={() => setShowWalkers(false)} />
          ) : (
            <RoutePanel
              activeRoute={activeRoute}
              onSelectRoute={setActiveRoute}
              onFindPartner={() => setShowWalkers(true)}
              showWalkers={showWalkers}
            />
          )}
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          <CactusMap
            ref={mapRef}
            userLat={userLat}
            userLng={userLng}
            walkers={DEMO_WALKERS}
            hazards={hazards}
            isSelectingDest={false}
            onDestinationSelected={() => {}}
            onHazardClick={handleHazardClick}
          />

          {/* Mobile: collapsed search bar at top */}
          <div className="lg:hidden absolute top-4 left-4 right-4 z-20">
            <button
              onClick={() => setMobilePanelOpen(true)}
              className="w-full bg-card/97 backdrop-blur-sm rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left border border-border"
            >
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground flex-1">Where would you like to go?</span>
              <Navigation className="w-4 h-4 text-primary shrink-0" />
            </button>
          </div>

          {/* Mobile bottom sheet panel */}
          {mobilePanelOpen && (
            <>
              <div className="lg:hidden fixed inset-0 bg-charcoal/30 z-30" onClick={() => setMobilePanelOpen(false)} />
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-border rounded-full" />
                </div>
                {showWalkers ? (
                  <WalkingPartnersPanel walkers={DEMO_WALKERS} onClose={() => { setShowWalkers(false); setMobilePanelOpen(false); }} />
                ) : (
                  <RoutePanel
                    activeRoute={activeRoute}
                    onSelectRoute={setActiveRoute}
                    onFindPartner={() => setShowWalkers(true)}
                    showWalkers={showWalkers}
                  />
                )}
              </div>
            </>
          )}

          {/* Right-side FABs */}
          <div className="absolute right-4 bottom-24 lg:bottom-8 z-20 flex flex-col gap-3">

            <button
              onClick={() => setActiveSheet("report")}
              className="w-12 h-12 rounded-full bg-card flex items-center justify-center hover:scale-105 transition-transform active:scale-95 border-2 border-orange"
            >
              <AlertTriangle className="w-5 h-5 text-orange" />
              {activeHazardCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {activeHazardCount}
                </span>
              )}
            </button>
          </div>


          {/* Info card at bottom of map — delivery/transit style */}
          <div className="hidden lg:block absolute bottom-0 left-0 right-0 z-10">
            <div className="bg-card backdrop-blur-sm rounded-t-2xl px-6 py-5 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Current Route</p>
                <p className="text-base font-bold text-foreground">
                  My Location → SLT 2
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-base font-bold text-foreground">350m</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">ETA</p>
                  <p className="text-base font-bold text-primary">5 min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hazard report sheet (mobile) */}
      {activeSheet === "report" && (
        <>
          <div className="fixed inset-0 bg-charcoal/30 z-30" onClick={() => setActiveSheet("none")} />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-border rounded-full" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Report a Hazard</h2>
              <button onClick={() => setActiveSheet("none")} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <p className="text-xs text-muted-foreground mb-4">What hazard are you reporting?</p>
              <div className="grid grid-cols-3 gap-3">
                {HAZARD_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.type}
                      onClick={() => {
                        const newHazard: Hazard = { id: Date.now(), reportType: cat.type, lat: userLat ?? 18.0035, lng: userLng ?? -76.7497, severity: cat.severity, ttlMinutes: cat.severity >= 4 ? 60 : 30 };
                        setHazards((prev) => [...prev, newHazard]);
                        toast.success("Hazard reported!");
                        setActiveSheet("none");
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 border-transparent hover:border-border hover:bg-secondary transition-all active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: cat.bg }}>
                        <Icon className="w-6 h-6" style={{ color: cat.color }} />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground text-center leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hazard detail sheet */}
      {activeSheet === "hazard" && selectedHazard && (
        <>
          <div className="fixed inset-0 bg-charcoal/30 z-30" onClick={() => { setActiveSheet("none"); setSelectedHazard(null); }} />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-border rounded-full" /></div>
            <div className="px-5 py-4">
              {(() => {
                const cat = HAZARD_CATEGORIES.find((c) => c.type === selectedHazard.reportType);
                const Icon = cat?.icon ?? AlertTriangle;
                const severity = SEVERITY_LABELS[selectedHazard.severity] ?? SEVERITY_LABELS[3];
                return (
                  <>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat?.bg }}>
                        <Icon className="w-6 h-6" style={{ color: cat?.color }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-foreground">{cat?.label ?? selectedHazard.reportType}</h3>
                        {selectedHazard.description && <p className="text-sm text-muted-foreground">{selectedHazard.description}</p>}
                      </div>
                      <button onClick={() => { setActiveSheet("none"); setSelectedHazard(null); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 text-center">Is this hazard still there?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setHazards((prev) => prev.map((h) => h.id === selectedHazard.id ? { ...h, ttlMinutes: Math.max(0, (h.ttlMinutes ?? 30) + 15) } : h));
                          toast.success("Confirmed!");
                          setActiveSheet("none"); setSelectedHazard(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-orange-light border-2 border-orange text-orange font-bold text-sm"
                      >
                        <ThumbsUp className="w-4 h-4" /> Still There
                      </button>
                      <button
                        onClick={() => {
                          setHazards((prev) => prev.map((h) => h.id === selectedHazard.id ? { ...h, ttlMinutes: 0 } : h));
                          toast.success("Resolved!");
                          setActiveSheet("none"); setSelectedHazard(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-teal-light border-2 border-primary text-primary font-bold text-sm"
                      >
                        <CheckCircle className="w-4 h-4" /> It's Gone
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
