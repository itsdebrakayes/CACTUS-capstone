// @ts-nocheck
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout, { DesktopTopBar } from "@/components/AppLayout";
import {
  Bell, Search, Edit3, BookOpen, MapPin, Award, Shield, HelpCircle, LogOut,
  TrendingUp, Calendar, CheckCircle2, AlertTriangle, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const UPDATES_FALLBACK = [
  { d:29, m:"Sep", title:"PSYC1001 Lecture", time:"11:00 – 13:00", state:"Cancelled",      detail:"By Dr. Williams",            tone:"rose",    late:null },
  { d:28, m:"Sep", title:"STAT2202 Tutorial", time:"09:00 – 10:00", state:"Room booked",    detail:"Moved to Room 205",          tone:"amber",   late:null },
  { d:27, m:"Sep", title:"COMP3161 Lab",     time:"13:45 – 16:30", state:"Lecturer late",  detail:"Dr. Brown running behind",   tone:"violet",  late:"15 min" },
  { d:26, m:"Sep", title:"SOCI2001 Lecture", time:"14:00 – 15:30", state:"Lecturer late",  detail:"Prof. Thompson arriving",    tone:"violet",  late:"8 min" },
  { d:25, m:"Sep", title:"MATH2401 Class",   time:"08:00 – 09:30", state:"Cancelled",      detail:"Notice from class rep",      tone:"rose",    late:null },
];

const STATE_MAP: Record<string, { state: string; tone: string }> = {
  cancelled:          { state: "Cancelled",     tone: "rose"   },
  room_changed:       { state: "Room booked",   tone: "amber"  },
  lecturer_late:      { state: "Lecturer late", tone: "violet" },
  rescheduled:        { state: "Rescheduled",   tone: "amber"  },
  materials_uploaded: { state: "Materials",     tone: "violet" },
  general:            { state: "Update",        tone: "violet" },
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ProfileDesktop() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const trustQuery = trpc.walking.getTrustScore.useQuery(undefined, { enabled: !!user });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.href = "/login"; } });
  const coursesQuery = trpc.courses.getMyCourses.useQuery(undefined, { enabled: !!user });
  const firstCourseId = (coursesQuery.data ?? [])[0]?.id;
  const annQuery = trpc.courses.getCourseAnnouncements.useQuery(
    { courseId: firstCourseId },
    { enabled: !!firstCourseId }
  );
  const courseById: Record<number, any> = {};
  (coursesQuery.data ?? []).forEach((c: any) => { courseById[c.id] = c; });
  const liveUpdates = (annQuery.data ?? [])
    .slice()
    .sort((a: any, b: any) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()))
    .slice(0, 5)
    .map((a: any) => {
      const d = new Date(a.createdAt || Date.now());
      const meta = STATE_MAP[a.announcementType] ?? STATE_MAP.general;
      const c = courseById[a.courseId];
      return {
        d: d.getDate(),
        m: MONTHS[d.getMonth()],
        title: `${c?.code || "Course"} ${a.title}`,
        time: a.body ? a.body.slice(0, 40) : "",
        state: meta.state,
        detail: a.isOfficial ? "Official notice" : "Student report",
        tone: meta.tone,
        late: null,
      };
    });
  const UPDATES = liveUpdates.length ? liveUpdates : UPDATES_FALLBACK;

  if (!loading && !user) { navigate("/login"); return null; }
  const name = user?.name || "Student";
  const initials = name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
  const trust = Math.round((trustQuery.data?.score ?? 0.86) * 100);
  const courseCount = (coursesQuery.data ?? []).length || 6;

  return (
    <AppLayout activeTab="profile">
      <DesktopTopBar title="Client Profile" subtitle="Manage your campus identity" />

      <div className="px-8 pb-12 max-w-[1400px] grid grid-cols-12 gap-6">
        {/* LEFT — profile card */}
        <div className="col-span-4">
          <div className="glass-panel rounded-3xl p-6 text-center">
            <div className="relative inline-block">
              <div className="w-28 h-28 rounded-full cactus-honey-grad flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-amber-500/30">
                {initials}
              </div>
              <button className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-slate-500">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="font-black text-[hsl(var(--cactus-ink))] text-xl tracking-tight mt-4">{name}</p>
            <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black uppercase tracking-widest">
              Active student
            </span>

            <button className="mt-5 w-full py-3 rounded-2xl cactus-ink-grad text-white font-bold shadow-lg shadow-slate-900/20 hover:scale-[1.01] transition-transform">
              Add new appointment
            </button>

            <div className="mt-6 space-y-3 text-left">
              {[
                { l: "Email",  v: user?.email || "student@uwimona.edu.jm" },
                { l: "Major",  v: "Computing & IT" },
                { l: "Alerts", v: "Allows campus notifications" },
              ].map((f,i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-white px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{f.l}</p>
                  <p className="text-sm text-[hsl(var(--cactus-ink))] font-semibold mt-0.5 truncate">{f.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — stats + appointments */}
        <div className="col-span-8 space-y-6">
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { n: String(courseCount), l: "All Courses",   trend: "Enrolled",  color: "from-sky-200 to-sky-400",       ring:"ring-sky-200" },
              { n: "3", l: "Today",         trend: "Scheduled", color: "from-violet-200 to-violet-400", ring:"ring-violet-200" },
              { n: trust+"%", l: "Trust Score", trend: "+4 pts", color: "from-amber-200 to-amber-400",  ring:"ring-amber-200" },
            ].map((s,i) => (
              <div key={i} className={cn("glass-panel rounded-3xl p-5 ring-2 ring-transparent hover:ring-offset-2 transition", s.ring)}>
                <div className="flex items-start justify-between">
                  <p className="text-5xl font-black text-[hsl(var(--cactus-ink))] tracking-tight leading-none">{s.n}</p>
                  <div className={cn("w-14 h-10 rounded-xl bg-gradient-to-br", s.color)} />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600">{s.trend}</span>
                  <span className="text-xs text-slate-400">{s.l}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Updates */}
          <div className="glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-6">
                <button className="font-black text-[hsl(var(--cactus-ink))] border-b-2 border-amber-400 pb-1">Updates</button>
              </div>
              <button className="text-xs font-bold text-slate-500 px-3 py-1.5 rounded-lg bg-slate-100">This week ({UPDATES.length}) ▾</button>
            </div>

            <div className="divide-y divide-slate-100">
              {UPDATES.map((a,i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="text-center w-12 shrink-0">
                    <p className="text-xl font-black text-[hsl(var(--cactus-ink))] leading-none">{a.d}</p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">{a.m}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[hsl(var(--cactus-ink))] text-sm truncate">{a.title}</p>
                    <p className="text-[11px] text-slate-400">{a.time} · {a.detail}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full",
                    a.tone === "rose" && "bg-rose-100 text-rose-700",
                    a.tone === "amber" && "bg-amber-100 text-amber-700",
                    a.tone === "violet" && "bg-violet-100 text-violet-700",
                  )}>
                    {a.tone === "rose" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                    {a.state}
                  </span>
                  <span className="text-xs font-black text-rose-600 w-16 text-right">
                    {a.late ? `+${a.late}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Settings menu grid */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: BookOpen, label: "My Courses",   to: "/courses",  tone:"bg-amber-50 text-amber-700" },
              { icon: MapPin,   label: "Campus Map",   to: "/map",      tone:"bg-violet-50 text-violet-700" },
              { icon: Award,    label: "Walking Hist", to: "/walking",  tone:"bg-emerald-50 text-emerald-700" },
              { icon: Shield,   label: "Check-ins",    to: "/check-in", tone:"bg-sky-50 text-sky-700" },
              { icon: Bell,     label: "Notifications",to: "#",         tone:"bg-rose-50 text-rose-700" },
              { icon: HelpCircle,label:"Help & Support",to:"#",         tone:"bg-slate-100 text-slate-600" },
            ].map((m,i) => {
              const I = m.icon;
              return (
                <button
                  key={i}
                  onClick={() => m.to !== "#" && navigate(m.to)}
                  className="glass-panel rounded-2xl p-4 flex items-center gap-3 text-left hover:-translate-y-0.5 transition-all"
                >
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", m.tone)}>
                    <I className="w-5 h-5" />
                  </div>
                  <span className="flex-1 font-bold text-[hsl(var(--cactus-ink))] text-sm">{m.label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="glass-panel rounded-2xl p-4 w-full flex items-center justify-center gap-2 text-rose-600 font-black hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {logoutMutation.isPending ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
