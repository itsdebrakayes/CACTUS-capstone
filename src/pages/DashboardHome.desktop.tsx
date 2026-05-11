// @ts-nocheck
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout, { DesktopTopBar } from "@/components/AppLayout";
import {
  Sparkles, MapPin, MessageSquare, ShieldAlert, ChevronRight,
  Play, BookOpen, Users, Activity, ArrowUpRight, GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getGreeting(name: string) {
  const h = new Date().getHours();
  const f = name.split(" ")[0];
  if (h < 12) return `Good Morning, ${f}`;
  if (h < 17) return `Good Afternoon, ${f}`;
  return `Good Evening, ${f}`;
}

const COURSES_FALLBACK = [
  { code: "PSYC1001", name: "Psych 101",          tutor: "Dr. Williams", progress: 62, accent: "from-amber-300 to-amber-500", chip: "bg-amber-100 text-amber-700" },
  { code: "STAT2202", name: "Advanced Statistics", tutor: "Prof. Miller", progress: 48, accent: "from-rose-300 to-rose-500",   chip: "bg-rose-100 text-rose-700" },
  { code: "COMP3161", name: "Database Mgmt",       tutor: "Dr. Brown",    progress: 81, accent: "from-emerald-300 to-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
];

const ACCENTS = [
  { accent: "from-amber-300 to-amber-500",   chip: "bg-amber-100 text-amber-700" },
  { accent: "from-rose-300 to-rose-500",     chip: "bg-rose-100 text-rose-700" },
  { accent: "from-emerald-300 to-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  { accent: "from-violet-300 to-violet-500", chip: "bg-violet-100 text-violet-700" },
  { accent: "from-sky-300 to-sky-500",       chip: "bg-sky-100 text-sky-700" },
];

const NOTIFICATIONS_FALLBACK = [
  { tag: "CANCELLED", color: "rose",   text: "Sociology 4PM lecture cancelled (Room 102).",   time: "2m ago" },
  { tag: "CONFIRMED", color: "emerald",text: "Psych 101 confirmed as scheduled.",             time: "1h ago" },
  { tag: "ROOM",      color: "amber",  text: "Stats 202 moved to Room 205 from Lab 4.",       time: "3h ago" },
  { tag: "EVENT",     color: "violet", text: "Career Fair RSVPs open — UWI Mona Bowl.",       time: "Yesterday" },
];

const TYPE_TO_TAG: Record<string, { tag: string; color: string }> = {
  cancelled:          { tag: "CANCELLED", color: "rose" },
  room_changed:       { tag: "ROOM",      color: "amber" },
  lecturer_late:      { tag: "LATE",      color: "amber" },
  rescheduled:        { tag: "RESCHED",   color: "violet" },
  materials_uploaded: { tag: "MATERIALS", color: "emerald" },
  general:            { tag: "UPDATE",    color: "violet" },
};

function timeAgo(ts: any) {
  if (!ts) return "";
  const d = new Date(ts).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export default function DashboardDesktop() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  if (!loading && !user) { navigate("/login"); return null; }
  const name = user?.name || "Student";

  const myCoursesQuery = trpc.courses.getMyCourses.useQuery(undefined, { enabled: !!user });
  const myCourses = (myCoursesQuery.data ?? []).slice(0, 3).map((c: any, i: number) => ({
    id: c.id,
    code: c.code || `C${c.id}`,
    name: c.name || c.title || "Untitled course",
    tutor: c.lecturer || c.department || "UWI Mona",
    progress: 50 + ((c.id * 13) % 45),
    accent: ACCENTS[i % ACCENTS.length].accent,
    chip: ACCENTS[i % ACCENTS.length].chip,
  }));
  const COURSES = myCourses.length ? myCourses : COURSES_FALLBACK;

  // Recent announcements from the user's first enrolled course
  const firstCourseId = (myCoursesQuery.data ?? [])[0]?.id;
  const annQuery = trpc.courses.getCourseAnnouncements.useQuery(
    { courseId: firstCourseId },
    { enabled: !!firstCourseId }
  );
  const allAnnouncements = (annQuery.data ?? [])
    .slice()
    .sort((a: any, b: any) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()))
    .slice(0, 4);
  const NOTIFICATIONS = allAnnouncements.length
    ? allAnnouncements.map((a: any) => {
        const meta = TYPE_TO_TAG[a.announcementType] ?? TYPE_TO_TAG.general;
        return { tag: meta.tag, color: meta.color, text: a.title, time: timeAgo(a.createdAt) };
      })
    : NOTIFICATIONS_FALLBACK;

  return (
    <AppLayout activeTab="dashboard">
      <DesktopTopBar title="Dashboard" subtitle={new Date().toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric" })} />

      <div className="px-8 pb-12 max-w-[1400px]">
        {/* HANGING HERO */}
        <section className="relative">
          <div className="hanging-hero cactus-honey-grad px-10 py-8 text-white shadow-2xl shadow-amber-500/30">
            <div className="grid grid-cols-12 gap-8 items-center">
              <div className="col-span-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
                    <span className="font-black text-lg">{name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/80 font-semibold">{getGreeting(name).split(",")[0]}</p>
                    <p className="text-xl font-black tracking-tight leading-tight">{name}</p>
                  </div>
                </div>
              </div>
              <div className="col-span-4 text-center relative">
                <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur ring-1 ring-white/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Quote of the day</span>
                </div>
                <h2 className="text-2xl font-black tracking-tight drop-shadow-sm leading-snug px-2">
                  "The roots of education are bitter, but the fruit is sweet."
                </h2>
                <p className="text-xs text-white/85 mt-2 font-semibold">3 classes · 1 update · Mona Campus</p>
              </div>
              <div className="col-span-4 text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-white/80 font-semibold">Trust Score</p>
                <p className="text-4xl font-black mt-1 leading-none">86%</p>
                <p className="text-xs text-white/80 mt-1">↑ +4 this week</p>
              </div>
            </div>
          </div>

          {/* Quick Actions row floating below the hero */}
          <div className="grid grid-cols-4 gap-4 -mt-4 relative z-10">
            {[
              { icon: MapPin,         label: "Find My Way",  sub: "Smart route on campus", to: "/find-way",   ring: "ring-emerald-200", color: "text-emerald-600", bg: "bg-emerald-50" },
              { icon: MessageSquare,  label: "Class Chat",   sub: "Updates & rep notes",   to: "/class-chat", ring: "ring-sky-200",     color: "text-sky-600",     bg: "bg-sky-50" },
              { icon: BookOpen,       label: "My Courses",   sub: "Materials & schedule",  to: "/courses",    ring: "ring-violet-200",  color: "text-violet-600",  bg: "bg-violet-50" },
              { icon: ShieldAlert,    label: "Emergency",    sub: "Hold to call campus",    to: "/safety",     ring: "ring-rose-200",    color: "text-rose-600",    bg: "bg-rose-50" },
            ].map(a => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className={cn("glass-panel rounded-2xl p-4 flex items-center gap-4 text-left hover:-translate-y-0.5 transition-all ring-2 ring-transparent hover:ring-offset-2", a.ring)}
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", a.bg)}>
                    <Icon className={cn("w-5 h-5", a.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[hsl(var(--cactus-ink))] text-sm">{a.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{a.sub}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                </button>
              );
            })}
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="grid grid-cols-12 gap-6 mt-8">
          {/* Courses in progress */}
          <div className="col-span-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-[hsl(var(--cactus-ink))] tracking-tight">Courses in Progress</h3>
              <button onClick={() => navigate("/courses")} className="text-xs font-bold text-[hsl(var(--cactus-ink))] hover:text-amber-600 flex items-center gap-1">
                View All <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {COURSES.map(c => (
                <div key={c.code} className="glass-panel rounded-3xl p-5 group hover:-translate-y-1 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider", c.chip)}>{c.code}</span>
                    <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center text-slate-400 group-hover:text-[hsl(var(--cactus-ink))]">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                  </div>
                  <h4 className="font-black text-[hsl(var(--cactus-ink))] text-base leading-snug">{c.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">Learn from your trainer</p>
                  <p className="text-[11px] text-slate-400 mt-2">{c.tutor}</p>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-bold text-[hsl(var(--cactus-ink))]">{c.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={cn("h-full rounded-full bg-gradient-to-r", c.accent)} style={{ width: `${c.progress}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Live now strip */}
            <div className="mt-6 glass-panel rounded-3xl p-5 flex items-center gap-5">
              <div className="relative w-16 h-16 rounded-2xl cactus-ink-grad flex items-center justify-center">
                <Play className="w-6 h-6 text-amber-300" fill="currentColor" />
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-black text-white tracking-wider">LIVE</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-600">In Session Now</p>
                <p className="font-black text-[hsl(var(--cactus-ink))] text-lg leading-tight truncate">PSYC1001 · Introduction to Psychology</p>
                <p className="text-xs text-slate-500 mt-0.5">SLT 2 · Dr. Williams · Ends in 32 min</p>
              </div>
              <button
                onClick={() => navigate("/courses/1")}
                className="px-5 py-3 rounded-2xl cactus-honey-grad text-white font-bold text-sm shadow-lg shadow-amber-500/30 hover:scale-[1.02] transition-transform"
              >
                Join class
              </button>
            </div>
          </div>

          {/* Notifications panel */}
          <aside className="col-span-4">
            <div className="glass-panel-dark rounded-3xl p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black tracking-tight">Recent Updates</h3>
                <span className="px-2.5 py-1 rounded-full bg-amber-300/20 text-amber-200 text-[10px] font-black uppercase tracking-wider ring-1 ring-amber-300/30">
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {NOTIFICATIONS.map((n,i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors ring-1 ring-white/5">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1",
                      n.color === "rose"    && "bg-rose-500/20 ring-rose-300/30 text-rose-200",
                      n.color === "emerald" && "bg-emerald-500/20 ring-emerald-300/30 text-emerald-200",
                      n.color === "amber"   && "bg-amber-500/20 ring-amber-300/30 text-amber-200",
                      n.color === "violet"  && "bg-violet-500/20 ring-violet-300/30 text-violet-200",
                    )}>
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          n.color === "rose" && "text-rose-300",
                          n.color === "emerald" && "text-emerald-300",
                          n.color === "amber" && "text-amber-300",
                          n.color === "violet" && "text-violet-300",
                        )}>{n.tag}</span>
                        <span className="text-[10px] text-white/50">{n.time}</span>
                      </div>
                      <p className="text-xs text-white/85 leading-snug">{n.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => navigate("/class-chat")} className="mt-4 w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-center gap-1 ring-1 ring-white/10">
                See all updates <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        </section>

        {/* Bottom: top mentors / popular */}
        <section className="grid grid-cols-12 gap-6 mt-8">
          <div className="col-span-5 glass-panel rounded-3xl p-5">
            <h3 className="text-lg font-black text-[hsl(var(--cactus-ink))] mb-3 tracking-tight">Popular at Mona</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "UI/UX Design", count: "18 Courses",   color: "from-amber-200 to-amber-400" },
                { label: "Marketing",    count: "14 Courses",   color: "from-rose-200 to-rose-400" },
                { label: "Development",  count: "126 Courses",  color: "from-violet-200 to-violet-400" },
                { label: "Business",     count: "21 Courses",   color: "from-emerald-200 to-emerald-400" },
              ].map(p => (
                <div key={p.label} className="rounded-2xl bg-white/70 p-4 border border-white/60 hover:-translate-y-0.5 transition-transform">
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br mb-3", p.color)} />
                  <p className="font-black text-[hsl(var(--cactus-ink))] text-sm">{p.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{p.count}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-7 glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-[hsl(var(--cactus-ink))] tracking-tight">Class Reps to Follow</h3>
              <button className="text-xs font-bold text-slate-500 hover:text-[hsl(var(--cactus-ink))]">View All</button>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { name: "Shine Smith",   role: "Class Rep · PSYC1001", followers: "1,200" },
                { name: "Mikel Adams",   role: "Class Rep · STAT2202", followers: "900"   },
                { name: "Tohid Golakar", role: "Class Rep · COMP3161", followers: "1,590" },
              ].map(r => (
                <div key={r.name} className="flex items-center gap-3 py-3">
                  <div className="w-10 h-10 rounded-2xl cactus-ink-grad text-white font-bold flex items-center justify-center">
                    {r.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[hsl(var(--cactus-ink))] text-sm truncate">{r.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{r.role}</p>
                  </div>
                  <span className="text-[11px] text-slate-400">{r.followers} followers</span>
                  <button className="px-4 py-1.5 rounded-full cactus-honey-grad text-white text-xs font-black">Follow</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
