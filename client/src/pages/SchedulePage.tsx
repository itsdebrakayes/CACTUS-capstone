import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Search, CheckCircle, MapPin, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import {
  getCoursesForDay,
  mergeCoursesWithSchedule,
} from "@/lib/courseSchedule";

type ClassStatus = "confirmed" | "live";

type RenderedScheduleClass = ReturnType<typeof getCoursesForDay>[number] & {
  status: ClassStatus;
  professor: string;
};

const today = new Date();
const todayDow = today.getDay();

function dayOffset(targetDow: number) {
  const diff = targetDow - todayDow;
  const date = new Date(today);
  date.setDate(today.getDate() + diff);
  return date;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_DAYS = [1, 2, 3, 4, 5];

function getWeekDates() {
  return WEEK_DAYS.map((dow) => {
    const date = dayOffset(dow);
    return { dow, date: date.getDate(), label: DOW_LABELS[dow], full: date };
  });
}

function StatusBadge({ status }: { status: ClassStatus }) {
  const configs = {
    confirmed: { label: "CONFIRMED", color: "#00c853", bg: "#e8faf0" },
    live: { label: "LIVE NOW", color: "#00c853", bg: "#e8faf0" },
  };
  const config = configs[status];

  return (
    <span
      className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

function ClassCard({ cls }: { cls: RenderedScheduleClass }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3.5 transition-all shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="font-semibold text-sm leading-tight text-gray-900">
          {cls.courseName}
        </h3>
        <StatusBadge status={cls.status} />
      </div>

      <div className="flex items-center gap-1.5 mb-1">
        <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
        <span className="text-xs text-gray-500">{cls.room ?? "Room TBA"}</span>
      </div>

      <div className="text-[10px] text-gray-400 mt-1.5">
        {cls.professor}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const cachedCourses = getCachedSupabaseCourses();
  const [supabaseCourses, setSupabaseCourses] = useState<
    Awaited<ReturnType<typeof loadSupabaseCourses>>
  >(cachedCourses ?? []);
  const [coursesLoading, setCoursesLoading] = useState(!cachedCourses);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [selectedDow, setSelectedDow] = useState(
    todayDow === 0 || todayDow === 6 ? 1 : todayDow
  );
  const [activeTab, setActiveTab] = useState<"my" | "events">("my");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (loading) {
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setSupabaseCourses([]);
      setCoursesError(null);
      setCoursesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!cachedCourses) {
      setCoursesLoading(true);
    }
    setCoursesError(null);

    void loadSupabaseCourses()
      .then((courses) => {
        if (!cancelled) {
          setSupabaseCourses(courses);
          setCoursesLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSupabaseCourses([]);
          setCoursesError(
            error instanceof Error
              ? error.message
              : "Unable to load the Supabase course schedule."
          );
          setCoursesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cachedCourses, loading, user]);

  const weekDates = getWeekDates();
  const filteredClasses = useMemo(() => {
    const merged = mergeCoursesWithSchedule(
      supabaseCourses.map((course) => toCourseWithRole(course)),
      supabaseCourses
    );

    return getCoursesForDay(merged, selectedDow)
      .map((course) => ({
        ...course,
        status: course.isLive ? ("live" as const) : ("confirmed" as const),
        professor: course.lecturer ?? "Lecturer TBA",
      }))
      .filter((course) => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return (
          course.courseName.toLowerCase().includes(q) ||
          course.courseCode.toLowerCase().includes(q) ||
          course.professor.toLowerCase().includes(q)
        );
      });
  }, [search, selectedDow, supabaseCourses]);

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="schedule">
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">Schedule</h1>
          <button className="w-8 h-8 rounded-full bg-[#00c853] flex items-center justify-center shadow-sm hover:bg-[#00b84a] transition-colors">
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Find specific courses"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#f5f7fa] border border-transparent rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-[#00c853]/30 focus:bg-white transition-all"
          />
        </div>

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
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    isSelected ? "text-[#00c853]" : "text-gray-400"
                  )}
                >
                  {label}
                </span>
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    isSelected
                      ? "bg-[#00c853] text-white shadow-sm shadow-[#00c853]/30"
                      : isToday
                        ? "bg-[#e8faf0] text-[#00c853]"
                        : "text-gray-700"
                  )}
                >
                  {date}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3">
        {activeTab === "events" ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f5f7fa] flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">Campus events coming soon</p>
          </div>
        ) : coursesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-[#00c853]/30 border-t-[#00c853] rounded-full animate-spin" />
          </div>
        ) : coursesError ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Unable to load your class schedule</p>
                <p className="text-xs mt-1 break-words">{coursesError}</p>
              </div>
            </div>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f5f7fa] flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No classes today</p>
            <p className="text-xs text-gray-400">
              Your scheduled courses will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredClasses.map((cls, index) => {
              const prevCls = index > 0 ? filteredClasses[index - 1] : null;
              const showTime =
                !prevCls ||
                prevCls.startDate!.getHours() !== cls.startDate!.getHours();

              return (
                <div key={cls.id}>
                  {showTime && (
                    <div className="flex items-center gap-3 py-2">
                      <span className="text-xs text-gray-400 font-medium w-16 shrink-0">
                        {cls.startDate!.toLocaleTimeString("en-US", {
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

function toCourseWithRole(course: SupabaseCourseRecord) {
  return {
    id: course.id,
    courseCode: course.courseCode,
    courseName: course.courseName,
    description: course.description ?? null,
    thumbnailUrl: null,
    room: course.room ?? null,
    lecturer: course.lecturer ?? null,
    department: course.department ?? null,
    classSize: course.classSize ?? 0,
    isActive: true,
    membershipRole: "student",
  };
}
