import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import {
  formatCourseScheduleLine,
  mergeCoursesWithSchedule,
  type ScheduledCourse,
} from "@/lib/courseSchedule";
import {
  AlertTriangle,
  Play,
  MapPin,
  MessageSquare,
  AlertCircle,
  ChevronRight,
  Bell,
  Search,
  Clock,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

type DashboardAlert = {
  id: string;
  message: string;
};

function getGreeting(name: string) {
  const hour = new Date().getHours();
  const first = name.split(" ")[0];
  if (hour < 12) return `Good Morning, ${first}`;
  if (hour < 17) return `Good Afternoon, ${first}`;
  return `Good Evening, ${first}`;
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function UrgentAlertBanner({ alerts }: { alerts: DashboardAlert[] }) {
  const [current, setCurrent] = useState(0);
  if (!alerts.length) return null;
  const alert = alerts[current];

  return (
    <div className="mx-4 mb-3 bg-[#fff5f5] border border-[#ffcccc] rounded-xl p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#e53935] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[#e53935] uppercase tracking-wide mb-0.5">
            Urgent Update
          </p>
          <p className="text-sm text-[#333] leading-snug">{alert.message}</p>
        </div>
        {alerts.length > 1 && (
          <button
            onClick={() => setCurrent((value) => (value + 1) % alerts.length)}
            className="text-[#e53935] shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function CurrentClassCard({
  cls,
  onViewDetails,
}: {
  cls: ScheduledCourse;
  onViewDetails: () => void;
}) {
  const [minsLeft, setMinsLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      if (!cls.endDate) {
        setMinsLeft(0);
        return;
      }

      const now = new Date();
      const diff = Math.max(
        0,
        Math.round((cls.endDate.getTime() - now.getTime()) / 60000)
      );
      setMinsLeft(diff);
    };

    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [cls.endDate]);

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Play className="w-4 h-4 text-[#00c853]" fill="#00c853" />
        <span className="text-sm font-semibold text-gray-800">Current Class</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="relative h-36 bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3a] flex items-end p-3">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />
          <span className="relative z-10 bg-[#00c853] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Live Now
          </span>
        </div>

        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                {cls.courseName}
              </h3>
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">
                  {cls.room ?? "Room TBA"}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-lg font-bold text-[#00c853]">{minsLeft}</span>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none">
                Mins Left
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onViewDetails}
              className="flex-1 bg-[#00c853] hover:bg-[#00b84a] text-white text-sm font-semibold py-2 rounded-xl transition-colors"
            >
              View Details
            </button>
            <button className="w-9 h-9 border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
              <span className="text-lg leading-none font-bold">...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActions({
  onFindWay,
  onClassChat,
  onEmergency,
}: {
  onFindWay: () => void;
  onClassChat: () => void;
  onEmergency: () => void;
}) {
  const actions = [
    {
      icon: MapPin,
      label: "Find Way",
      color: "#00c853",
      bg: "#e8faf0",
      onClick: onFindWay,
    },
    {
      icon: MessageSquare,
      label: "Class Chat",
      color: "#1565c0",
      bg: "#e3f0ff",
      onClick: onClassChat,
    },
    {
      icon: AlertCircle,
      label: "Emergency",
      color: "#e53935",
      bg: "#ffebee",
      onClick: onEmergency,
    },
  ];

  return (
    <div className="mx-4 mb-4 grid grid-cols-3 gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: action.bg }}
            >
              <Icon className="w-5 h-5" style={{ color: action.color }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function UpNextSection({ classes }: { classes: ScheduledCourse[] }) {
  const [, navigate] = useLocation();
  const upcoming = classes.filter((course) => course.isUpcoming);
  if (!upcoming.length) return null;

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-0.5">
          <ChevronRight className="w-3.5 h-3.5 text-[#00c853]" />
          <ChevronRight className="w-3.5 h-3.5 text-[#00c853]" />
        </div>
        <span className="text-sm font-semibold text-gray-800">Up Next</span>
      </div>

      <div className="space-y-2">
        {upcoming.slice(0, 2).map((course) => (
          <div
            key={course.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3"
          >
            <div className="text-center shrink-0 w-12">
              <p className="text-sm font-bold text-gray-900 leading-none">
                {course.startDate
                  ?.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .split(" ")[0] ?? "--:--"}
              </p>
              <p className="text-[10px] text-gray-400 uppercase">
                {course.startDate
                  ?.toLocaleTimeString("en-US", { hour12: true })
                  .includes("AM")
                  ? "AM"
                  : "PM"}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {course.courseName}
              </p>
              <p className="text-xs text-gray-500">
                {course.room ?? "Room TBA"} - {course.lecturer ?? "Lecturer TBA"}
              </p>
            </div>
            <button
              onClick={() => navigate(`/courses/${course.id}`)}
              className="w-8 h-8 rounded-full bg-[#e8faf0] flex items-center justify-center shrink-0 hover:bg-[#d0f5e0] transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[#00c853]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [supabaseCourses, setSupabaseCourses] = useState<
    Awaited<ReturnType<typeof loadSupabaseCourses>>
  >([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);

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

    setCoursesLoading(true);
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
  }, [loading, user]);

  const mergedCourses = useMemo(
    () =>
      mergeCoursesWithSchedule(
        supabaseCourses.map((course) => toCourseWithRole(course)),
        supabaseCourses
      ),
    [supabaseCourses]
  );

  const currentClass = mergedCourses.find((course) => course.isLive);
  const activeAlerts: DashboardAlert[] = currentClass
    ? [
        {
          id: `live-${currentClass.id}`,
          message: `${currentClass.courseName} is live now in ${currentClass.room ?? "its assigned room"}.`,
        },
      ]
    : mergedCourses.length > 0
      ? [
          {
            id: `next-${mergedCourses[0].id}`,
            message: `${mergedCourses[0].courseName} is scheduled for ${formatCourseScheduleLine(mergedCourses[0])}.`,
          },
        ]
      : [];

  if (loading || coursesLoading) {
    return (
      <AppLayout activeTab="dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-[#00c853]/30 border-t-[#00c853] rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const displayName = user.name || "Student";

  return (
    <AppLayout activeTab="dashboard">
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00c853] to-[#00b84a] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="font-bold text-gray-900 text-base">CACTUS</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
              <Search className="w-4 h-4" />
            </button>
            <button className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors relative">
              <Bell className="w-4 h-4" />
              {activeAlerts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#e53935] rounded-full" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {getGreeting(displayName)}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{formatDate()}</p>
      </div>

      <UrgentAlertBanner alerts={activeAlerts} />

      {coursesError ? (
        <div className="mx-4 mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Unable to load your class schedule
              </p>
              <p className="text-xs text-amber-800 mt-1 break-words">
                {coursesError}
              </p>
            </div>
          </div>
        </div>
      ) : currentClass ? (
        <CurrentClassCard
          cls={currentClass}
          onViewDetails={() => navigate(`/courses/${currentClass.id}`)}
        />
      ) : (
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No class in session right now</p>
        </div>
      )}

      <QuickActions
        onFindWay={() =>
          navigate(
            currentClass?.room
              ? `/find-way?room=${encodeURIComponent(currentClass.room)}`
              : "/find-way"
          )
        }
        onClassChat={() => navigate("/class-chat")}
        onEmergency={() => navigate("/map?emergency=true")}
      />

      <UpNextSection classes={mergedCourses} />

      <div className="mx-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800">
            Recent Class Updates
          </span>
          <button
            onClick={() => navigate("/class-chat")}
            className="text-xs text-[#00c853] font-medium"
          >
            See all
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {mergedCourses.slice(0, 2).map((course) => {
            const isLive = course.isLive;
            const Icon = isLive ? CheckCircle : Clock;
            const bg = isLive ? "#e8faf0" : "#e3f0ff";
            const color = isLive ? "#00c853" : "#1565c0";
            return (
              <div key={course.id} className="flex items-center gap-3 p-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: bg }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">
                    {course.courseName} - {formatCourseScheduleLine(course)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {isLive ? "Live now" : "Scheduled class"}
                  </p>
                </div>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ color, backgroundColor: bg }}
                >
                  {isLive ? "LIVE" : "SCHEDULED"}
                </span>
              </div>
            );
          })}
          {mergedCourses.length === 0 && (
            <div className="flex items-center gap-3 p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-100">
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate">No class updates yet</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Your enrolled course schedule will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
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
