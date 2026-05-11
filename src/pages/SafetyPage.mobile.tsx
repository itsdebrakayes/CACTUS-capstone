import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Phone, Shield, Flame, Cross, Radio, ChevronRight, MapPin, Bookmark, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBJECTS = [
  { label: "I had an accident", color: "bg-rose-50 text-rose-700",   ring: "ring-rose-200",   icon: AlertTriangle },
  { label: "I have an injury",  color: "bg-amber-50 text-amber-700", ring: "ring-amber-200",  icon: Cross },
  { label: "I'm feeling lost",  color: "bg-violet-50 text-violet-700",ring:"ring-violet-200", icon: MapPin },
  { label: "Suspicious nearby", color: "bg-sky-50 text-sky-700",     ring: "ring-sky-200",    icon: Shield },
];

const SERVICES = [
  { label: "Medical",  icon: Cross,  tone: "from-rose-400 to-rose-600" },
  { label: "Fire",     icon: Flame,  tone: "from-orange-400 to-rose-500" },
  { label: "Security", icon: Shield, tone: "from-sky-500 to-indigo-600" },
  { label: "Cops",     icon: Radio,  tone: "from-slate-700 to-slate-900" },
];

export default function SafetyMobile() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  if (!loading && !user) { navigate("/login"); return null; }

  return (
    <AppLayout activeTab="safety">
      <div className="px-4 pt-12 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-rose-600">
            <Bookmark className="w-4 h-4 fill-rose-500" />
            <p className="text-xs font-bold">Complete profile</p>
          </div>
          <p className="text-xs text-slate-400">UWI Mona · Live</p>
        </div>

        <h1 className="text-3xl font-black text-[hsl(var(--cactus-ink))] tracking-tight leading-tight">
          Emergency help<br/>needed?
        </h1>
        <p className="text-sm text-slate-500 mt-2 text-center">Just hold the button to call</p>

        <div className="my-8 flex items-center justify-center">
          <button className="w-56 h-56 rounded-full cactus-honey-grad pulse-emergency flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, hsl(var(--cactus-rose)), #b91c1c)" }}
          >
            <div className="w-44 h-44 rounded-full ring-8 ring-white/20 flex items-center justify-center">
              <Radio className="w-20 h-20" strokeWidth={1.6} />
            </div>
          </button>
        </div>

        <p className="text-center text-sm text-slate-700 font-bold">Not sure what to do?</p>
        <p className="text-center text-xs text-slate-400 mb-4">Pick the subject to chat</p>

        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2">
          {SUBJECTS.map(s => {
            const I = s.icon;
            return (
              <button key={s.label} className={cn(
                "shrink-0 w-40 p-4 rounded-2xl ring-1 text-left bg-white",
                s.ring
              )}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-2", s.color)}>
                  <I className="w-5 h-5" />
                </div>
                <p className="text-sm font-black text-[hsl(var(--cactus-ink))]">{s.label}</p>
                <ChevronRight className="w-4 h-4 text-slate-300 mt-2" />
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {SERVICES.map(svc => {
            const I = svc.icon;
            return (
              <button key={svc.label} className={cn("rounded-2xl p-4 text-white text-left bg-gradient-to-br shadow-lg", svc.tone)}>
                <I className="w-6 h-6 mb-3" />
                <p className="font-black text-base">{svc.label}</p>
                <p className="text-[11px] opacity-80 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> Tap to call</p>
              </button>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
