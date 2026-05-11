import { useLocation } from "wouter";
import AppLayout, { DesktopTopBar } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Phone, Shield, Flame, Cross, Radio, MapPin, AlertTriangle, ChevronRight, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SafetyDesktop() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  if (!loading && !user) { navigate("/login"); return null; }

  return (
    <AppLayout activeTab="safety">
      <DesktopTopBar title="Safety & Emergency" subtitle="Hold the button to call campus help instantly" />

      <div className="px-8 pb-12 max-w-[1400px] grid grid-cols-12 gap-6">
        {/* CENTER — emergency hero */}
        <div className="col-span-7 glass-panel rounded-3xl p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{
            background: "radial-gradient(800px 400px at 50% -10%, hsl(var(--cactus-rose) / 0.4), transparent 60%)"
          }} />
          <div className="relative">
            <span className="inline-block px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-[11px] font-black uppercase tracking-widest">
              Emergency line
            </span>
            <h2 className="text-5xl font-black text-[hsl(var(--cactus-ink))] tracking-tight mt-3 leading-tight">
              Need help on campus?
            </h2>
            <p className="text-slate-500 mt-2">Press and hold to alert UWI Mona Campus Security and your trusted contacts.</p>

            <div className="my-10 flex flex-col items-center justify-center gap-5">
              <button
                className="w-64 h-64 rounded-full flex items-center justify-center text-white shadow-2xl shadow-rose-500/40 hover:scale-[1.02] active:scale-[0.99] transition-transform"
                style={{ background: "radial-gradient(circle at 30% 30%, #ef4444, #991b1b 75%)" }}
              >
                <Radio className="w-24 h-24" strokeWidth={1.6} />
              </button>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-700">Hold to call</p>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-6">
              {[
                { label: "Medical",  icon: Cross,  tone: "from-rose-400 to-rose-600" },
                { label: "Fire",     icon: Flame,  tone: "from-orange-400 to-rose-500" },
                { label: "Security", icon: Shield, tone: "from-sky-500 to-indigo-600" },
                { label: "Cops",     icon: Radio,  tone: "from-slate-700 to-slate-900" },
              ].map(s => {
                const I = s.icon;
                return (
                  <button key={s.label} className={cn("rounded-2xl p-4 bg-gradient-to-br text-white text-left shadow-lg hover:scale-[1.03] transition-transform", s.tone)}>
                    <I className="w-6 h-6 mb-3" />
                    <p className="font-black">{s.label}</p>
                    <p className="text-[11px] opacity-80 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> Tap to call</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — profile data + subjects */}
        <div className="col-span-5 space-y-4">
          <div className="glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Profile data · 60%</p>
              <button className="text-amber-600 text-xs font-black">Edit</button>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl cactus-ink-grad text-white flex items-center justify-center font-black">
                {(user?.name || "S").charAt(0)}
              </div>
              <div>
                <p className="font-black text-[hsl(var(--cactus-ink))] text-lg tracking-tight">{user?.name || "Susan Simmons"}</p>
                <p className="text-xs text-slate-500">14 January 1982</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              {[
                { l: "Age",         v: "28 years" },
                { l: "Blood type",  v: "ORh+" },
                { l: "Height",      v: "185 cm" },
                { l: "Weight",      v: "85 kg" },
              ].map((f,i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{f.l}</p>
                  <p className="text-sm font-bold text-[hsl(var(--cactus-ink))] mt-0.5">{f.v}</p>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Allergies & reactions</p>
              <div className="space-y-2">
                {[
                  { food: "Grape",  reaction: "Blocked nose" },
                  { food: "Orange", reaction: "Watering eyes" },
                  { food: "Pear",   reaction: "Rush" },
                ].map((a,i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-black">
                        {a.food.charAt(0)}
                      </span>
                      <span className="text-sm font-bold text-[hsl(var(--cactus-ink))]">{a.food}</span>
                    </div>
                    <span className="text-xs text-slate-500">{a.reaction}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Pick the subject to chat</p>
            <div className="space-y-2">
              {[
                { label: "I had an accident", icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
                { label: "I have an injury",  icon: Cross,         tone: "bg-amber-50 text-amber-700" },
                { label: "I'm feeling lost",  icon: MapPin,        tone: "bg-violet-50 text-violet-700" },
              ].map(s => {
                const I = s.icon;
                return (
                  <button key={s.label} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100 hover:bg-amber-50 transition-colors text-left">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.tone)}>
                      <I className="w-4 h-4" />
                    </div>
                    <span className="flex-1 font-bold text-[hsl(var(--cactus-ink))] text-sm">{s.label}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
            <button className="mt-4 w-full py-3 rounded-2xl cactus-ink-grad text-white font-black flex items-center justify-center gap-2">
              <Mic className="w-4 h-4 text-amber-300" />
              Start audio recording
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
