import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

// ─── Types & data ─────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: number;
  title: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  dayIndex: number; // 0-4 Mon-Fri
  room: string;
  professor?: string;
  color: string;
  textColor: string;
}

const PASTEL_COLORS = [
  { bg: "hsl(185 40% 92%)", text: "hsl(185 100% 23%)" },
  { bg: "hsl(40 80% 92%)", text: "hsl(40 60% 35%)" },
  { bg: "hsl(300 30% 92%)", text: "hsl(300 40% 35%)" },
  { bg: "hsl(18 90% 93%)", text: "hsl(18 70% 40%)" },
  { bg: "hsl(210 60% 92%)", text: "hsl(210 60% 35%)" },
  { bg: "hsl(130 30% 90%)", text: "hsl(130 40% 30%)" },
];

const DAY_NAME_TO_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4,
};

function sessionsToCalendarEvents(sessions: Array<{
  id: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  roomCode?: string | null;
  courseName?: string | null;
  lecturer?: string | null;
  courseCode?: string | null;
}>): CalendarEvent[] {
  return sessions
    .filter((s) => DAY_NAME_TO_INDEX[s.dayOfWeek] !== undefined)
    .map((s, idx) => {
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      const colorIdx = idx % PASTEL_COLORS.length;
      return {
        id: s.id,
        title: s.courseCode ?? s.courseName ?? "Class",
        startHour: sh,
        startMin: sm,
        endHour: eh,
        endMin: em,
        dayIndex: DAY_NAME_TO_INDEX[s.dayOfWeek],
        room: s.roomCode ?? "—",
        professor: s.lecturer ?? undefined,
        color: PASTEL_COLORS[colorIdx].bg,
        textColor: PASTEL_COLORS[colorIdx].text,
      };
    });
}

function getWeekDates(baseDate: Date) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8AM - 5PM
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");

  const { data: timetable } = trpc.timetable.getMyTimetable.useQuery(undefined, { enabled: !!user });
  const calendarEvents = sessionsToCalendarEvents(timetable ?? []);

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayName = dayNames[new Date().getDay()];
  const todayCount = (timetable ?? []).filter((s) => s.dayOfWeek === todayName).length;

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const weekDates = getWeekDates(baseDate);
  const today = new Date();

  const prevWeek = () => setBaseDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setBaseDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const monthYear = weekDates[2].toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dateRange = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDates[4].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <AppLayout activeTab="schedule">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={prevWeek} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg lg:text-xl font-bold text-foreground">{monthYear}</h1>
              <button onClick={nextWeek} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex bg-card border border-border rounded-xl overflow-hidden">
                {(["Daily", "Weekly", "Monthly"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-all",
                      viewMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5" />
                Create Event
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{dateRange}</p>
        </div>

        <div className="px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-4 gap-6 pb-8">
          {/* Calendar grid */}
          <div className="lg:col-span-3 bg-card border border-border rounded-2xl overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-border">
              <div className="p-2 text-xs text-muted-foreground text-center">GMT-5</div>
              {weekDates.map((date, i) => {
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div
                    key={i}
                    className={cn(
                      "p-3 text-center border-l border-border",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{DAY_SHORT[i]}</p>
                    <p className={cn(
                      "text-2xl font-bold mt-0.5",
                      isToday ? "text-primary" : "text-foreground"
                    )}>
                      {date.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="relative">
              {HOURS.map((hour) => (
                <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] h-16 border-b border-border/50">
                  <div className="px-2 pt-1 text-[10px] text-muted-foreground text-right pr-3">
                    {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                  </div>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="border-l border-border/50 relative" />
                  ))}
                </div>
              ))}

              {/* Events */}
              {calendarEvents.map((event) => {
                const startOffset = (event.startHour - 8) * 64 + (event.startMin / 60) * 64;
                const duration = ((event.endHour - event.startHour) * 60 + (event.endMin - event.startMin)) / 60 * 64;
                return (
                  <div
                    key={event.id}
                    className="absolute rounded-lg px-2 py-1.5 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                    style={{
                      top: `${startOffset}px`,
                      height: `${Math.max(duration, 28)}px`,
                      left: `calc(60px + ${event.dayIndex} * ((100% - 60px) / 5) + 2px)`,
                      width: `calc((100% - 60px) / 5 - 4px)`,
                      backgroundColor: event.color,
                    }}
                  >
                    <p className="text-[11px] font-bold leading-tight truncate" style={{ color: event.textColor }}>
                      {event.title}
                    </p>
                    {duration > 36 && (
                      <p className="text-[9px] mt-0.5 flex items-center gap-0.5" style={{ color: event.textColor, opacity: 0.7 }}>
                        <Clock className="w-2.5 h-2.5" />
                        {event.startHour > 12 ? event.startHour - 12 : event.startHour}:{String(event.startMin).padStart(2, "0")} - {event.endHour > 12 ? event.endHour - 12 : event.endHour}:{String(event.endMin).padStart(2, "0")}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Current time indicator */}
              {(() => {
                const now = new Date();
                const nowDayIndex = now.getDay() - 1;
                if (nowDayIndex < 0 || nowDayIndex > 4) return null;
                const nowOffset = (now.getHours() - 8) * 64 + (now.getMinutes() / 60) * 64;
                if (nowOffset < 0 || nowOffset > HOURS.length * 64) return null;
                return (
                  <div
                    className="absolute left-[60px] right-0 h-0.5 bg-destructive z-10 pointer-events-none"
                    style={{ top: `${nowOffset}px` }}
                  >
                    <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-destructive" />
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Today's summary */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-3">Today's Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Classes</span>
                  <span className="text-sm font-bold text-foreground">{todayCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Tasks Due</span>
                  <span className="text-sm font-bold text-orange">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total Sessions</span>
                  <span className="text-sm font-bold text-primary">{calendarEvents.length}</span>
                </div>
              </div>
            </div>

            {/* Class updates */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Recent Updates
              </h3>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Clock className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No recent updates</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
