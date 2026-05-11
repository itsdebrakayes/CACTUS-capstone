import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { CactusMap, type CactusMapHandle, type Hazard } from "@/components/CactusMap";
import { useGeolocation, useSSE } from "@/hooks/useSSE";
import {
  Bookmark, Car, X, Clock, Settings, History, Star, MapPin, Navigation,
  Footprints, Shield, AlertTriangle, Check, UserPlus, Accessibility, Trees
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_HAZARDS: Hazard[] = [
  { id: 1, reportType: "light_out", lat: 18.0042, lng: -76.7485, severity: 4, ttlMinutes: 45 },
  { id: 2, reportType: "flooding",  lat: 18.0028, lng: -76.7510, severity: 3, ttlMinutes: 30 },
  { id: 3, reportType: "broken_path",lat: 18.0055, lng: -76.7475, severity: 3, ttlMinutes: 60 },
];
const DEMO_WALKERS = [
  { id: 101, lat: 18.0038, lng: -76.7492, trustScore: 0.85 },
  { id: 102, lat: 18.0031, lng: -76.7505, trustScore: 0.72 },
];

const SAVED_PLACES = [
  { name: "Library", sub: "Main Library, 5 min", icon: MapPin },
  { name: "SLT 2",   sub: "Lecture, 8 min",      icon: MapPin },
  { name: "Mona Bowl", sub: "Sports, 12 min",    icon: MapPin },
];

export default function MapDesktop() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const mapRef = useRef<CactusMapHandle>(null);
  const [userLat, setUserLat] = useState<number>();
  const [userLng, setUserLng] = useState<number>();
  const [hazards] = useState<Hazard[]>(DEMO_HAZARDS);

  useGeolocation((lat, lng) => { setUserLat(lat); setUserLng(lng); }, 5000);
  useSSE(() => {});

  if (!loading && !user) { navigate("/login"); return null; }

  return (
    <AppLayout activeTab="map" noScroll>
      <div className="h-screen flex">
        {/* LEFT RAIL */}
        <aside className="w-[280px] shrink-0 bg-white/70 backdrop-blur-xl border-r border-white/60 flex flex-col">
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-3xl cactus-ink-grad flex items-center justify-center text-white">
                <Navigation className="w-7 h-7 text-amber-300" />
              </div>
              <p className="font-black text-[hsl(var(--cactus-ink))] mt-3 text-lg tracking-tight">CACTUS Routes</p>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">Mona Campus</p>
              <div className="mt-3 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                Campus Help · 333-5566
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[
                { v: "4.8", l: "Trust", icon: Star },
                { v: "126", l: "Routes", icon: Footprints },
                { v: "3", l: "Hazards", icon: MapPin },
              ].map((s,i) => {
                const I = s.icon;
                return (
                  <div key={i} className="rounded-2xl bg-white p-3 text-center border border-slate-100">
                    <I className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                    <p className="text-base font-black text-[hsl(var(--cactus-ink))] mt-1 leading-none">{s.v}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{s.l}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <nav className="px-4 flex-1 space-y-2 overflow-y-auto">
            {[
              { icon: Shield,         label: "Trust Score",       sub: "86%", tone: "bg-amber-50 text-amber-700" },
              { icon: AlertTriangle,  label: "Routes & Hazards",  sub: "3",   tone: "bg-rose-50 text-rose-700" },
              { icon: Bookmark,       label: "Saved Places",      sub: "5",   tone: "bg-violet-50 text-violet-700" },
              { icon: History,        label: "History",           sub: "12",  tone: "bg-sky-50 text-sky-700" },
              { icon: Settings,       label: "Settings",          sub: "",    tone: "bg-slate-50 text-slate-700" },
            ].map(item => {
              const I = item.icon;
              return (
                <button key={item.label} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white transition-colors text-left">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", item.tone)}>
                    <I className="w-4 h-4" />
                  </div>
                  <span className="flex-1 text-sm font-bold text-[hsl(var(--cactus-ink))]">{item.label}</span>
                  {item.sub && <span className="text-xs text-slate-400">{item.sub}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* CENTER MAP */}
        <div className="flex-1 relative">
          <CactusMap
            ref={mapRef}
            userLat={userLat}
            userLng={userLng}
            walkers={DEMO_WALKERS}
            hazards={hazards}
          />

          {/* Saved Places pill */}
          <div className="absolute top-6 left-6 z-10">
            <button className="glass-panel rounded-2xl px-4 py-2.5 flex items-center gap-3 hover:bg-white">
              <Bookmark className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-bold text-[hsl(var(--cactus-ink))]">Saved Places</span>
            </button>
          </div>

          {/* Vehicle toggle */}
          <div className="absolute top-6 right-6 z-10">
            <button className="w-12 h-12 rounded-2xl cactus-ink-grad shadow-lg flex items-center justify-center text-amber-300">
              <Car className="w-5 h-5" />
            </button>
          </div>

          {/* ETA chip */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-12 z-10">
            <div className="px-3 py-1.5 rounded-full cactus-honey-grad text-white text-xs font-black shadow-lg float-slow">3 min</div>
          </div>

        </div>

        {/* RIGHT PANEL — Arriving */}
        <aside className="w-[320px] shrink-0 bg-white/70 backdrop-blur-xl border-l border-white/60 p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Possible Walking Partner</p>
            <span className="text-xs text-amber-600 font-bold">5 min away</span>
          </div>

          <div className="glass-panel rounded-3xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl cactus-ink-grad text-white font-bold flex items-center justify-center">?</div>
              <div className="flex-1">
                <p className="font-black text-[hsl(var(--cactus-ink))]">Anonymous</p>
                <div className="flex items-center gap-1 text-xs">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span className="font-bold text-[hsl(var(--cactus-ink))]">4.3</span>
                  <span className="text-slate-400">· Trust 82%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button className="h-10 rounded-xl bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> Accept</button>
              <button className="h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center gap-1"><X className="w-3.5 h-3.5" /> Decline</button>
              <button className="h-10 rounded-xl cactus-honey-grad text-white text-xs font-black flex items-center justify-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Group</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: Navigation,   label: "Fastest",    km: "1.2 km", active: true  },
              { icon: Trees,        label: "Scenic",     km: "1.8 km", active: false },
              { icon: Accessibility,label: "Accessible", km: "1.5 km", active: false },
            ].map((o,i) => {
              const I = o.icon;
              return (
                <button key={i} className={cn(
                  "rounded-2xl p-3 text-center border-2",
                  o.active ? "cactus-honey-grad text-white border-transparent shadow-lg" : "border-slate-100 bg-white text-[hsl(var(--cactus-ink))]"
                )}>
                  <I className={cn("w-4 h-4 mx-auto", o.active ? "text-white" : "text-slate-400")} />
                  <p className={cn("text-[10px] uppercase tracking-wider font-bold mt-1", o.active ? "text-white/80" : "text-slate-400")}>{o.label}</p>
                  <p className="text-sm font-black mt-0.5">{o.km}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">From</p>
              <div className="rounded-2xl bg-white p-3 border border-slate-100 text-sm font-bold text-[hsl(var(--cactus-ink))]">Your location</div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">To</p>
              <input className="w-full rounded-2xl bg-white p-3 border border-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/60" placeholder="Pick a destination on campus" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Saved Places</p>
              <div className="space-y-2">
                {SAVED_PLACES.map(p => {
                  const I = p.icon;
                  return (
                    <button key={p.name} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white hover:bg-amber-50 border border-slate-100 text-left">
                      <I className="w-4 h-4 text-amber-600" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-[hsl(var(--cactus-ink))]">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.sub}</p>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </AppLayout>
  );
}
