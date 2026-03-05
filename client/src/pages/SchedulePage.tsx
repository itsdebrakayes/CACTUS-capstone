import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, CheckCircle, AlertTriangle, XCircle, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ClassStatus = "confirmed" | "updated" | "cancelled" | "live";

interface ScheduleClass {
  id: number;
  courseCode: string;
  courseName: string;
  room: string;
  newRoom?: string;
  startTime: Date;
  endTime: Date;
  professor: string;
  status: ClassStatus;
  updateNote?: string;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const today = new Date();
const todayDow = today.getDay(); // 0=Sun, 1=Mon...

function dayOffset(targetDow: number) {
  // Mon=1..Fri=5, get date for this week
  const diff = targetDow - todayDow;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

const MOCK_CLASSES: ScheduleClass[] = [
  {
    id: 1,
    courseCode: "PSYC1001",
    courseName: "Psych 101",
    room: "SLT 2",
    startTime: (() => { const d = dayOffset(3); d.setHours(9, 0); return d; })(),
    endTime: (() => { const d = dayOffset(3); d.setHours(10, 0); return d; })(),
    professor: "Dr. Williams",
    status: "confirmed",
  },
  {
    id: 2,
    courseCode: "STAT2202",
    courseName: "Stats 202",
    room: "Lab 4",
    newRoom: "Room 205",
    startTime: (() => { const d = dayOffset(3); d.setHours(11, 30); return d; })(),
    endTime: (() => { const d = dayOffset(3); d.setHours(13, 0); return d; })(),
    professor: "Prof. Miller",
    status: "updated",
    updateNote: "Moving to Room 205",
  },
  {
    id: 3,
    courseCode: "SOCI2001",
    courseName: "Sociology",
    room: "Room 102",
    startTime: (() => { const d = dayOffset(3); d.setHours(14, 0); return d; })(),
    endTime: (() => { const d = dayOffset(3); d.setHours(15, 30); return d; })(),
    professor: "Dr. Thompson",
    status: "cancelled",
  },
  {
    id: 4,
    courseCode: "COMP3161",
    courseName: "Database Management",
    room: "FST 1",
    startTime: (() => { const d = dayOffset(2); d.setHours(10, 0); return d; })(),
    endTime: (() => { const d = dayOffset(2); d.setHours(11, 30); return d; })(),
    professor: "Dr. Brown",
    status: "confirmed",
  },
  {
    id: 5,
    courseCode: "MATH2401",
    courseName: "Calculus II",
    room: "FST 3",
    startTime: (() => { const d = dayOffset(4); d.setHours(8, 0); return d; })(),
    endTime: (() => { const d = dayOffset(4); d.setHours(9, 30); return d; })(),
    professor: "Dr. Clarke",
    status: "confirmed",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri

function getWeekDates() {
  return WEEK_DAYS.map((dow) => {
    const d = dayOffset(dow);
    return { dow, date: d.getDate(), label: DOW_LABELS[dow], full: d };
  });
}

function StatusBadge({ status }: { status: ClassStatus }) {
  const configs = {
    confirmed: { label: "CONFIRMED", color: "#00c853", bg: "#e8faf0" },
    updated: { label: "UPDATED", color: "#e65100", bg: "#fff3e0" },
    cancelled: { label: "CANCELLED", color: "#9e9e9e", bg: "#f5f5f5" },
    live: { label: "LIVE NOW", color: "#00c853", bg: "#e8faf0" },
  };
  const c = configs[status];
  return (
    <span
      className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0"
      style={{ color: c.color, backgroundColor: c.bg }}
    >
      {c.label}
    </span>
  );
}

function ClassCard({ cls }: { cls: ScheduleClass }) {
  const isCancelled = cls.status === "cancelled";
  const isUpdated = cls.status === "updated";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border p-3.5 transition-all",
        isCancelled && "opacity-60 border-gray-100",
        isUpdated && "border-[#ffe0b2] bg-[#fffbf5]",
        !isCancelled && !isUpdated && "border-gray-100 shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className={cn(
          "font-semibold text-sm leading-tight",
          isCancelled ? "line-through text-gray-400" : "text-gray-900"
        )}>
          {cls.courseName}
        </h3>
        <StatusBadge status={cls.status} />
      </div>

      <div className="flex items-center gap-1.5 mb-1">
        <MapPin className={cn("w-3 h-3 shrink-0", isCancelled ? "text-gray-300" : "text-gray-400")} />
        <span className={cn("text-xs", isCancelled ? "text-gray-400" : "text-gray-500")}>
          {cls.room}
        </span>
      </div>

      {isUpdated && cls.updateNote && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[10px] text-[#e65100] font-medium">↳ {cls.updateNote}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [selectedDow, setSelectedDow] = useState(todayDow === 0 || todayDow === 6 ? 1 : todayDow);
  const [activeTab, setActiveTab] = useState<"my" | "events">("my");
  const [search, setSearch] = useState("");

  const weekDates = getWeekDates();

  const filteredClasses = MOCK_CLASSES.filter((c) => {
    const classDow = c.startTime.getDay();
    const matchDay = classDow === selectedDow;
    const matchSearch = !search ||
      c.courseName.toLowerCase().includes(search.toLowerCase()) ||
      c.courseCode.toLowerCase().includes(search.toLowerCase()) ||
      c.professor.toLowerCase().includes(search.toLowerCase());
    return matchDay && matchSearch;
  }).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="schedule">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">Schedule</h1>
          <button className="w-8 h-8 rounded-full bg-[#00c853] flex items-center justify-center shadow-sm hover:bg-[#00b84a] transition-colors">
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Find specific courses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#f5f7fa] border border-transparent rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-[#00c853]/30 focus:bg-white transition-all"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#f5f7fa] rounded-xl p-1">
          {[
            { id: "my", label: "My Classes" },
            { id: "events", label: "Campus Events" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "my" | "events")}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Calendar Strip */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          {weekDates.map(({ dow, date, label, full }) => {
            const isToday = full.toDateString() === today.toDateString();
            const isSelected = dow === selectedDow;
            return (
              <button
                key={dow}
                onClick={() => setSelectedDow(dow)}
                className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all duration-200"
              >
                <span className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  isSelected ? "text-[#00c853]" : "text-gray-400"
                )}>
                  {label}
                </span>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  isSelected
                    ? "bg-[#00c853] text-white shadow-sm shadow-[#00c853]/30"
                    : isToday
                    ? "bg-[#e8faf0] text-[#00c853]"
                    : "text-gray-700"
                )}>
                  {date}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Class List */}
      <div className="px-4 py-3">
        {activeTab === "events" ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f5f7fa] flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">Campus events coming soon</p>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f5f7fa] flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No classes today</p>
            <p className="text-xs text-gray-400">Enjoy your free time!</p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredClasses.map((cls, i) => {
              const prevCls = i > 0 ? filteredClasses[i - 1] : null;
              const showTime = !prevCls ||
                prevCls.startTime.getHours() !== cls.startTime.getHours();

              return (
                <div key={cls.id}>
                  {showTime && (
                    <div className="flex items-center gap-3 py-2">
                      <span className="text-xs text-gray-400 font-medium w-16 shrink-0">
                        {cls.startTime.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  )}
                  <div className="ml-20 mb-2">
                    <ClassCard cls={cls} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
