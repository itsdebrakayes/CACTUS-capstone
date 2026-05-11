// @ts-nocheck
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout, { DesktopTopBar } from "@/components/AppLayout";
import { ChevronLeft, ChevronRight, Plus, Clock, Flame, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "Daily" | "Weekly" | "Monthly";

const today = new Date();
const todayDow = today.getDay();
function dayOffset(targetDow: number) {
  const diff = targetDow - todayDow;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const DOWS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Block {
  day: number;          // dow
  start: number;        // hour
  duration: number;     // hours
  title: string;
  time: string;
  tone: "amber" | "violet" | "mint" | "rose" | "sky";
}

const BLOCKS_FALLBACK: Block[] = [
  { day: 1, start: 8,  duration: 1, title: "Psych 101",        time: "8 AM – 9 AM",   tone: "amber" },
  { day: 1, start: 11, duration: 1, title: "Group Study",      time: "11 AM – 12 PM", tone: "violet" },
  { day: 2, start: 9,  duration: 2, title: "COMP3161 Lab",     time: "9 AM – 11 AM",  tone: "mint" },
  { day: 3, start: 10, duration: 1, title: "Stats 202",        time: "10 AM – 11 AM", tone: "amber" },
  { day: 3, start: 13, duration: 2, title: "Database Project", time: "1 PM – 3 PM",   tone: "sky" },
  { day: 4, start: 8,  duration: 1, title: "Calculus II",      time: "8 AM – 9 AM",   tone: "rose" },
  { day: 4, start: 14, duration: 1, title: "Sociology",        time: "2 PM – 3 PM",   tone: "violet" },
  { day: 5, start: 11, duration: 1, title: "Career Fair",      time: "11 AM – 12 PM", tone: "amber" },
];

const DOW_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const TONES: Block["tone"][] = ["amber", "violet", "mint", "rose", "sky"];

function parseHM(t: string): number {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}
function fmtHour(h: number) {
  const hh = Math.floor(h);
  const ampm = hh < 12 ? "AM" : "PM";
  const disp = hh === 0 ? 12 : hh <= 12 ? hh : hh - 12;
  return `${disp} ${ampm}`;
}

const toneStyles: Record<Block["tone"], string> = {
  amber:  "bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900 ring-amber-400/40",
  violet: "bg-gradient-to-br from-violet-200 to-violet-300 text-violet-900 ring-violet-400/40",
  mint:   "bg-gradient-to-br from-emerald-200 to-emerald-300 text-emerald-900 ring-emerald-400/40",
  rose:   "bg-gradient-to-br from-rose-200 to-rose-300 text-rose-900 ring-rose-400/40",
  sky:    "bg-gradient-to-br from-sky-200 to-sky-300 text-sky-900 ring-sky-400/40",
};

export default function ScheduleDesktop() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>("Weekly");
  const [dark, setDark] = useState(false);
  if (!loading && !user) { navigate("/login"); return null; }

  const timetableQuery = trpc.timetable.getMyTimetable.useQuery(undefined, { enabled: !!user });
  const coursesQuery = trpc.courses.getMyCourses.useQuery(undefined, { enabled: !!user });
  const courseById = useMemo(() => {
    const m: Record<number, any> = {};
    (coursesQuery.data ?? []).forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [coursesQuery.data]);

  const BLOCKS: Block[] = useMemo(() => {
    const sessions = timetableQuery.data ?? [];
    if (!sessions.length) return BLOCKS_FALLBACK;
    return sessions.map((s: any, i: number) => {
      const start = parseHM(s.override?.newStartTime || s.startTime);
      const end   = parseHM(s.override?.newEndTime   || s.endTime);
      const dur = Math.max(1, Math.round(end - start));
      const course = courseById[s.courseId];
      return {
        day: DOW_TO_NUM[s.dayOfWeek] ?? 1,
        start: Math.floor(start),
        duration: dur,
        title: course?.code || course?.name || s.sessionType || "Class",
        time: `${fmtHour(start)} – ${fmtHour(end)}`,
        tone: TONES[i % TONES.length],
      };
    });
  }, [timetableQuery.data, courseById]);

  const weekDates = DOWS.map(dow => ({ dow, date: dayOffset(dow), label: DOW_LABELS[dow] }));
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <AppLayout activeTab="schedule">
      <DesktopTopBar title="My Calendar" subtitle="Information designed for accurate insights" />

      <div className="px-8 pb-12 max-w-[1400px]">
        {/* Top control bar */}
        <div className="flex items-center justify-between mb-6">
          <div className={cn("inline-flex p-1 rounded-2xl", dark ? "bg-slate-900/80" : "bg-white/70 backdrop-blur border border-white/60")}>
            {(["Daily","Weekly","Monthly"] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-5 py-2 rounded-xl text-sm font-bold transition-all",
                  view === v
                    ? "bg-[hsl(var(--cactus-ink))] text-white shadow"
                    : dark ? "text-slate-400" : "text-slate-500"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="glass-panel rounded-2xl px-4 py-2.5 flex items-center gap-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold leading-none">Study time today</p>
                <p className="text-sm font-black text-[hsl(var(--cactus-ink))] mt-0.5">5h 45m</p>
              </div>
            </div>
            <div className="glass-panel rounded-2xl px-4 py-2.5 flex items-center gap-3">
              <Flame className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold leading-none">Attendance streak</p>
                <p className="text-sm font-black text-[hsl(var(--cactus-ink))] mt-0.5">12 <span className="text-xs font-bold text-slate-500">days</span></p>
              </div>
            </div>
            <button onClick={() => setDark(!dark)} className="w-11 h-11 rounded-2xl glass-panel flex items-center justify-center text-slate-600">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button className="px-5 py-3 rounded-2xl cactus-honey-grad text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/30">
              <Plus className="w-4 h-4" /> Add class
            </button>
          </div>
        </div>

        {/* Two-column: mini calendar + week grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* LEFT mini cal + checklist */}
          <aside className="col-span-3 space-y-4">
            <div className="glass-panel rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[hsl(var(--cactus-ink))]">{monthLabel}</p>
                <div className="flex gap-1">
                  <button className="w-7 h-7 rounded-lg hover:bg-white"><ChevronLeft className="w-4 h-4 mx-auto" /></button>
                  <button className="w-7 h-7 rounded-lg hover:bg-white"><ChevronRight className="w-4 h-4 mx-auto" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 font-bold mb-1">
                {["M","T","W","T","F","S","S"].map((d,i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {Array.from({length:31}).map((_,i) => {
                  const day = i+1;
                  const isToday = day === today.getDate();
                  return (
                    <button key={i} className={cn(
                      "h-8 rounded-lg font-semibold",
                      isToday ? "cactus-honey-grad text-white shadow" : "text-slate-600 hover:bg-white"
                    )}>{day}</button>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-black text-[hsl(var(--cactus-ink))] text-sm">My Calendar</p>
                <button className="text-[11px] font-bold text-amber-600">Checklist</button>
              </div>
              <div className="space-y-2">
                {[
                  { txt: "Submit COMP3161 ER diagram", done: false },
                  { txt: "Read Psych ch. 4", done: true },
                  { txt: "Pickup library books", done: false },
                ].map((t,i) => (
                  <label key={i} className="flex items-center gap-2.5 text-sm">
                    <span className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0",
                      t.done ? "bg-emerald-400 border-emerald-400" : "border-slate-300"
                    )} />
                    <span className={cn("text-slate-600", t.done && "line-through text-slate-300")}>{t.txt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-4">
              <p className="font-black text-[hsl(var(--cactus-ink))] text-sm mb-3">Other Calendars</p>
              <div className="space-y-2 text-sm">
                {[
                  { c:"bg-amber-400",  l:"Holidays" },
                  { c:"bg-violet-400", l:"UWI Mona Events" },
                  { c:"bg-emerald-400",l:"Study Groups" },
                ].map((x,i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className={cn("w-2.5 h-2.5 rounded-full", x.c)} />
                    <span className="text-slate-600">{x.l}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* RIGHT week grid */}
          <section className="col-span-9 glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-black text-[hsl(var(--cactus-ink))] tracking-tight">
                {weekDates[0].date.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – {weekDates[6].date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
              </p>
              <button className="text-xs font-bold text-amber-600 flex items-center gap-1">Today <ChevronRight className="w-3 h-3" /></button>
            </div>

          {view === "Weekly" && (
            <div className="grid" style={{ gridTemplateColumns: "72px repeat(7, 1fr)" }}>
              {/* Day headers */}
              <div />
              {weekDates.map(({ dow, date, label }) => {
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div key={dow} className="text-center pb-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
                    <p className={cn("text-lg font-black mt-1", isToday ? "text-amber-600" : "text-[hsl(var(--cactus-ink))]")}>
                      {date.getDate()}
                    </p>
                  </div>
                );
              })}
              {/* Hour rows */}
              {HOURS.map(h => (
                <div key={`row-${h}`} className="contents">
                  <div className="text-[10px] text-slate-400 font-bold pr-3 pt-1 text-right border-t border-slate-100 whitespace-nowrap">
                    {h <= 12 ? `${h} AM` : `${h-12} PM`}
                  </div>
                  {DOWS.map(dow => {
                    const block = BLOCKS.find(b => b.day === dow && b.start === h);
                    return (
                      <div key={`${dow}-${h}`} className="border-t border-l border-slate-100 h-16 p-1 relative">
                        {block && (
                          <div
                            className={cn(
                              "absolute inset-x-1 top-1 rounded-2xl p-2 ring-1 shadow-sm hover:scale-[1.02] transition-transform cursor-pointer",
                              toneStyles[block.tone]
                            )}
                            style={{ height: `${block.duration * 64 - 8}px` }}
                          >
                            <p className="text-[11px] font-black leading-tight">{block.title}</p>
                            <p className="text-[10px] opacity-75 mt-0.5">{block.time}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {view === "Daily" && (
            <div className="grid" style={{ gridTemplateColumns: "72px 1fr" }}>
              <div />
              <div className="text-center pb-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  {today.toLocaleDateString("en-US",{ weekday:"long" })}
                </p>
                <p className="text-lg font-black mt-1 text-amber-600">{today.getDate()}</p>
              </div>
              {Array.from({ length: 24 }, (_, h) => h).map(h => {
                const block = BLOCKS.find(b => b.day === todayDow && b.start === h);
                const label = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h-12} PM`;
                return (
                  <div key={`d-${h}`} className="contents">
                    <div className="text-[10px] text-slate-400 font-bold pr-3 pt-1 text-right border-t border-slate-100 whitespace-nowrap">{label}</div>
                    <div className="border-t border-l border-slate-100 h-12 p-1 relative">
                      {block && (
                        <div className={cn("absolute inset-x-1 top-1 rounded-2xl p-2 ring-1 shadow-sm", toneStyles[block.tone])} style={{ height: `${block.duration*48 - 8}px` }}>
                          <p className="text-[11px] font-black leading-tight">{block.title}</p>
                          <p className="text-[10px] opacity-75 mt-0.5">{block.time}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "Monthly" && (
            <div className="space-y-6">
              {[0,1,2].map(monthOffset => {
                const base = new Date(today.getFullYear(), today.getMonth()+monthOffset, 1);
                const monthName = base.toLocaleDateString("en-US",{month:"long", year:"numeric"});
                const daysInMonth = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
                const firstDow = base.getDay();
                return (
                  <div key={monthOffset}>
                    <p className="font-black text-[hsl(var(--cactus-ink))] mb-2">{monthName}</p>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 font-bold mb-1">
                      {["S","M","T","W","T","F","S"].map((d,i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({length:firstDow}).map((_,i) => <div key={`p-${i}`} />)}
                      {Array.from({length:daysInMonth}).map((_,i) => {
                        const day = i+1;
                        const isToday = monthOffset===0 && day===today.getDate();
                        const hasClass = BLOCKS.some(b => true) && (day % 3 === 0);
                        return (
                          <div key={i} className={cn(
                            "h-14 rounded-lg border border-slate-100 p-1 text-left text-[11px] font-bold",
                            isToday ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-slate-600"
                          )}>
                            {day}
                            {hasClass && <div className="mt-1 h-1 rounded-full bg-amber-400/70" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
