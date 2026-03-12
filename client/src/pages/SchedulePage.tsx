import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types & data ────────────────────────────────────────────────────────────

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

const MOCK_EVENTS: CalendarEvent[] = [
  { id: 1, title: "Psych 101", startHour: 9, startMin: 0, endHour: 10, endMin: 0, dayIndex: 2, room: "SLT 2", professor: "Dr. Williams", color: PASTEL_COLORS[0].bg, textColor: PASTEL_COLORS[0].text },
  { id: 2, title: "Stats 202", startHour: 10, startMin: 0, endHour: 11, endMin: 45, dayIndex: 1, room: "Lab 4", professor: "Prof. Miller", color: PASTEL_COLORS[1].bg, textColor: PASTEL_COLORS[1].text },
  { id: 3, title: "Database Mgmt", startHour: 10, startMin: 0, endHour: 10, endMin: 45, dayIndex: 2, room: "FST 1", professor: "Dr. Brown", color: PASTEL_COLORS[2].bg, textColor: PASTEL_COLORS[2].text },
  { id: 4, title: "Calculus II", startHour: 11, startMin: 0, endHour: 12, endMin: 0, dayIndex: 0, room: "FST 3", professor: "Dr. Clarke", color: PASTEL_COLORS[4].bg, textColor: PASTEL_COLORS[4].text },
  { id: 5, title: "Sociology", startHour: 14, startMin: 0, endHour: 15, endMin: 30, dayIndex: 2, room: "Room 102", professor: "Dr. Thompson", color: PASTEL_COLORS[3].bg, textColor: PASTEL_COLORS[3].text },
  { id: 6, title: "Web Development", startHour: 9, startMin: 0, endHour: 9, endMin: 30, dayIndex: 3, room: "CS Lab", color: PASTEL_COLORS[5].bg, textColor: PASTEL_COLORS[5].text },
  { id: 7, title: "Linear Algebra", startHour: 11, startMin: 0, endHour: 11, endMin: 45, dayIndex: 3, room: "M201", color: PASTEL_COLORS[0].bg, textColor: PASTEL_COLORS[0].text },
  { id: 8, title: "Design Thinking", startHour: 10, startMin: 0, endHour: 11, endMin: 0, dayIndex: 3, room: "Arts 301", color: PASTEL_COLORS[1].bg, textColor: PASTEL_COLORS[1].text },
  { id: 9, title: "AI Fundamentals", startHour: 11, startMin: 0, endHour: 12, endMin: 0, dayIndex: 4, room: "CS 102", color: PASTEL_COLORS[2].bg, textColor: PASTEL_COLORS[2].text },
  { id: 10, title: "Research Methods", startHour: 13, startMin: 0, endHour: 14, endMin: 0, dayIndex: 0, room: "SLT 1", color: PASTEL_COLORS[4].bg, textColor: PASTEL_COLORS[4].text },
];

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8AM - 5PM
const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const MOCK_UPDATES = [
  { id: 1, text: "Sociology cancelled — Dr. Thompson unwell", type: "cancelled" as const, time: "2h ago" },
  { id: 2, text: "Stats 202 moved to Room 205", type: "updated" as const, time: "4h ago" },
  { id: 3, text: "Psych 101 exam date confirmed: Mar 20", type: "confirmed" as const, time: "1d ago" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");

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
              {/* View mode toggle */}
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
          {/* Calendar grid — takes 3 cols on desktop */}
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
              {MOCK_EVENTS.map((event) => {
                const startOffset = (event.startHour - 8) * 64 + (event.startMin / 60) * 64;
                const duration = ((event.endHour - event.startHour) * 60 + (event.endMin - event.startMin)) / 60 * 64;
                const colWidth = `calc((100% - 60px) / 5)`;
                const left = `calc(60px + ${event.dayIndex} * ${colWidth})`;

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

          {/* Right sidebar — class updates */}
          <div className="lg:col-span-1 space-y-6">
            {/* Today's summary */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-3">Today's Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Classes</span>
                  <span className="text-sm font-bold text-foreground">3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Tasks Due</span>
                  <span className="text-sm font-bold text-orange">2</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Free Hours</span>
                  <span className="text-sm font-bold text-primary">4</span>
                </div>
              </div>
            </div>

            {/* Class updates */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Recent Updates
              </h3>
              <div className="space-y-2">
                {MOCK_UPDATES.map((update) => {
                  const colors = {
                    cancelled: { bg: "bg-orange-light", text: "text-destructive", badge: "CANCELLED" },
                    updated: { bg: "bg-orange-light", text: "text-orange", badge: "UPDATED" },
                    confirmed: { bg: "bg-teal-light", text: "text-primary", badge: "CONFIRMED" },
                  };
                  const c = colors[update.type];
                  return (
                    <div key={update.id} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", c.bg, c.text)}>
                          {c.badge}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{update.time}</span>
                      </div>
                      <p className="text-xs text-foreground">{update.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
