import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import {
  leaveWalkGroup,
  loadMyActiveWalkGroup,
  type WalkGroupRecord,
} from "@/lib/supabaseWalkGroups";
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
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Clock,
  CheckCircle,
  RefreshCw,
  Users,
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
    <div className="mx-4 mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 transition-all">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 bg-red-100 p-1.5 rounded-lg border border-red-50 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-red-600 uppercase tracking-[0.15em] mb-1">
            Urgent Update
          </p>
          <p className="text-sm font-medium text-gray-900 leading-relaxed">
            {alert.message}
          </p>
        </div>
        {alerts.length > 1 && (
          <button
            onClick={() => setCurrent(value => (value + 1) % alerts.length)}
            className="text-red-400 hover:text-red-600 transition-colors pt-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatLeavingTime(value?: string) {
  if (!value) return "TBA";
  const leavingAt = new Date(value);
  if (Number.isNaN(leavingAt.getTime())) {
    return "TBA";
  }
  return leavingAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActiveWalkGroupCard({
  group,
  onOpen,
  onLeave,
  isLeaving,
}: {
  group: WalkGroupRecord;
  onOpen: () => void;
  onLeave: () => void;
  isLeaving: boolean;
}) {
  return (
    <div className="mx-4 mb-6 rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 py-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/90 drop-shadow-sm">
          {group.isCreator ? "Hosting Walk Group" : "Active Walk Group"}
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight leading-tight">
          {group.destinationName}
        </h2>
        <p className="mt-1 text-xs font-medium text-emerald-50">
          {group.isCreator
            ? "You are the creator and can manage this group."
            : "You are currently part of this Walk Group."}
        </p>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-emerald-50/50 border border-emerald-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">
              Meeting
            </p>
            <p className="text-xs font-bold text-gray-900 leading-tight">
              {group.meetingPointName}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/50 border border-emerald-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">
              Leaving
            </p>
            <p className="text-xs font-bold text-gray-900 leading-tight">
              {formatLeavingTime(group.leavingAt)}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/50 border border-emerald-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">
              Members
            </p>
            <p className="text-xs font-bold text-gray-900 leading-tight">
              {group.memberCount} joined
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onOpen}
            className="flex flex-[2] items-center justify-between rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {group.isCreator ? "Manage Group" : "Open Group"}
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
          {!group.isCreator ? (
            <button
              onClick={onLeave}
              disabled={isLeaving}
              className="flex-1 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-600 transition-colors active:bg-gray-50 disabled:opacity-50"
            >
              {isLeaving ? "..." : "Leave"}
            </button>
          ) : null}
        </div>
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
    <div className="mx-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Play className="w-4 h-4 text-emerald-500" fill="currentColor" />
        <span className="text-sm font-bold text-gray-900 tracking-tight">
          Current Class
        </span>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="relative h-36 bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3a] flex items-end p-4">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />
          <span className="relative z-10 bg-emerald-500 text-white text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-widest shadow-sm">
            Live Now
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-lg leading-tight tracking-tight">
                {cls.courseName}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">
                  {cls.room ?? "Room TBA"}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
              <span className="text-xl font-black text-emerald-500 block leading-none">
                {minsLeft}
              </span>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                Mins Left
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onViewDetails}
              className="flex-[4] bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
            >
              View Details
            </button>
            <button className="flex-1 h-12 border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 active:bg-gray-50 transition-colors">
              <span className="text-lg leading-none font-bold">...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisteredCoursesDeck({
  courses,
  activeCourseId,
  onActiveCourseChange,
  onOpenCourse,
}: {
  courses: ScheduledCourse[];
  activeCourseId: number | null;
  onActiveCourseChange: (courseId: number) => void;
  onOpenCourse: (courseId: number) => void;
}) {
  const pointerStartXRef = useRef<number | null>(null);
  const activeIndex = Math.max(
    0,
    courses.findIndex(course => course.id === activeCourseId)
  );
  const activeCourse = courses[activeIndex] ?? null;
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < courses.length - 1;
  const stackCourses = [
    courses[activeIndex + 2],
    courses[activeIndex + 1],
    activeCourse,
  ].filter((course): course is ScheduledCourse => Boolean(course));

  const moveToCourse = (nextIndex: number) => {
    const nextCourse = courses[nextIndex];
    if (!nextCourse) {
      return;
    }
    onActiveCourseChange(nextCourse.id);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartXRef.current = event.clientX;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartXRef.current == null) {
      return;
    }

    const deltaX = event.clientX - pointerStartXRef.current;
    pointerStartXRef.current = null;

    if (Math.abs(deltaX) < 40) {
      return;
    }

    if (deltaX < 0 && canGoForward) {
      moveToCourse(activeIndex + 1);
      return;
    }

    if (deltaX > 0 && canGoBack) {
      moveToCourse(activeIndex - 1);
    }
  };

  if (!activeCourse) {
    return null;
  }

  return (
    <div className="mx-4 mb-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight leading-none">
            Classes
          </h3>
          <p className="text-[11px] font-bold text-gray-400 mt-1.5 uppercase tracking-widest">
            {activeIndex + 1} of {courses.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => moveToCourse(activeIndex - 1)}
            disabled={!canGoBack}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm text-gray-600 transition active:scale-95 disabled:opacity-30 disabled:active:scale-100"
            aria-label="Previous class"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => moveToCourse(activeIndex + 1)}
            disabled={!canGoForward}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm text-gray-600 transition active:scale-95 disabled:opacity-30 disabled:active:scale-100"
            aria-label="Next class"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative h-[290px] touch-pan-y select-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartXRef.current = null;
        }}
      >
        {stackCourses.map((course, stackIndex) => {
          const depth = stackCourses.length - stackIndex - 1;
          const isActive = course.id === activeCourse.id;
          const statusLabel = course.isLive
            ? "Live Now"
            : course.isUpcoming
              ? "Next Up"
              : "Registered";
          const timeMetric =
            course.isLive && course.endDate
              ? Math.max(
                  0,
                  Math.round((course.endDate.getTime() - Date.now()) / 60000)
                )
              : course.isUpcoming && course.startDate
                ? Math.max(
                    0,
                    Math.round(
                      (course.startDate.getTime() - Date.now()) / 60000
                    )
                  )
                : null;
          const metricValue =
            timeMetric !== null ? String(timeMetric) : "";
          const metricLabel = course.isLive
            ? "Mins Left"
            : course.isUpcoming
              ? "Starts In"
              : "Status";

          return (
            <div
              key={course.id}
              className="absolute inset-x-0 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl shadow-gray-200/40 transition-all duration-300"
              style={{
                top: depth * 14,
                transform: `scale(${1 - depth * 0.04})`,
                opacity: isActive ? 1 : 1 - depth * 0.15,
                zIndex: stackCourses.length - depth,
              }}
            >
              <div
                className={`relative flex h-36 items-end p-5 text-white ${
                  isActive
                    ? "bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3a]"
                    : "bg-gradient-to-br from-gray-500 to-gray-600"
                }`}
              >
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                  }}
                />
                <div className="flex items-start justify-between w-full gap-3 relative z-10">
                  <div className="min-w-0">
                    <span className="inline-block px-2 py-1 rounded bg-white/20 text-[9px] font-bold uppercase tracking-[0.2em] text-white">
                      {course.courseCode}
                    </span>
                    <h2 className="mt-2 line-clamp-1 text-xl font-bold leading-tight tracking-tight">
                      {course.courseName}
                    </h2>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm ${
                      course.isLive
                        ? "bg-emerald-500 text-white animate-pulse"
                        : course.isUpcoming
                          ? "bg-white text-gray-900"
                          : "bg-white/10 text-white border border-white/20"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate text-xs font-semibold text-gray-500">
                        {course.room ?? "Room TBA"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-gray-900 bg-gray-50 px-2 py-1 rounded inline-block">
                      {formatCourseScheduleLine(course)}
                    </p>
                  </div>
                  {/* <div className="shrink-0 text-right">
                    <span className="block text-xl font-black text-emerald-500 leading-none">
                      {metricValue}
                    </span>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                      {metricLabel}
                    </p>
                  </div> */}
                </div>

                <div className="mb-4 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                    Lecturer
                  </p>
                  <p className="truncate text-sm font-bold text-gray-800">
                    {course.lecturer ?? "TBA"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenCourse(course.id)}
                  className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
                >
                  View Course Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickActions({
  onFindWay,
  onClassChat,
  onEmergency,
  isCourseActionsDisabled,
}: {
  onFindWay: () => void;
  onClassChat: () => void;
  onEmergency: () => void;
  isCourseActionsDisabled: boolean;
}) {
  const actions = [
    {
      icon: MapPin,
      label: "Find Way",
      color: "#10b981", // Tailwind emerald-500
      bg: "#f0fdf4", // Tailwind emerald-50
      onClick: onFindWay,
      disabled: isCourseActionsDisabled,
    },
    {
      icon: MessageSquare,
      label: "Class Chat",
      color: "#3b82f6", // Tailwind blue-500
      bg: "#eff6ff", // Tailwind blue-50
      onClick: onClassChat,
      disabled: isCourseActionsDisabled,
    },
    {
      icon: AlertCircle,
      label: "Emergency",
      color: "#ef4444", // Tailwind red-500
      bg: "#fef2f2", // Tailwind red-50
      onClick: onEmergency,
      disabled: false,
    },
  ];

  return (
    <div className="mx-4 mb-8 grid grid-cols-3 gap-3">
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: action.bg }}
            >
              <Icon className="w-5 h-5" style={{ color: action.color }} />
            </div>
            <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">
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
  const upcoming = classes.filter(course => course.isUpcoming);
  if (!upcoming.length) return null;

  return (
    <div className="mx-4 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
          Up Next
        </h3>
      </div>

      <div className="space-y-3">
        {upcoming.slice(0, 2).map(course => (
          <div
            key={course.id}
            onClick={() => navigate(`/courses/${course.id}`)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 cursor-pointer active:bg-gray-50 transition-colors"
          >
            <div className="text-center shrink-0 w-14 border-r border-gray-100 pr-3">
              <p className="text-sm font-black text-gray-900 leading-none">
                {course.startDate
                  ?.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .split(" ")[0] ?? "--:--"}
              </p>
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                {course.startDate
                  ?.toLocaleTimeString("en-US", { hour12: true })
                  .includes("AM")
                  ? "AM"
                  : "PM"}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate tracking-tight">
                {course.courseName}
              </p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                {course.room ?? "TBA"} • {course.lecturer ?? "TBA"}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const cachedCourses = getCachedSupabaseCourses();
  const [supabaseCourses, setSupabaseCourses] = useState<
    Awaited<ReturnType<typeof loadSupabaseCourses>>
  >(cachedCourses ?? []);
  const [coursesLoading, setCoursesLoading] = useState(!cachedCourses);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [activeWalkGroup, setActiveWalkGroup] =
    useState<WalkGroupRecord | null>(null);
  const [isLeavingWalkGroup, setIsLeavingWalkGroup] = useState(false);
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);

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
      .then(courses => {
        if (!cancelled) {
          setSupabaseCourses(courses);
          setCoursesLoading(false);
        }
      })
      .catch(error => {
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

  const handleLeaveWalkGroup = async () => {
    if (!activeWalkGroup || activeWalkGroup.isCreator) {
      return;
    }

    setIsLeavingWalkGroup(true);
    try {
      await leaveWalkGroup(activeWalkGroup.id);
      setActiveWalkGroup(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLeavingWalkGroup(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (loading || !user) {
      setActiveWalkGroup(null);
      return () => {
        cancelled = true;
      };
    }

    const refresh = async () => {
      try {
        const nextGroup = await loadMyActiveWalkGroup();
        if (!cancelled) {
          setActiveWalkGroup(nextGroup);
        }
      } catch {
        if (!cancelled) {
          setActiveWalkGroup(null);
        }
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loading, user]);

  const mergedCourses = useMemo(
    () =>
      mergeCoursesWithSchedule(
        supabaseCourses.map(course => toCourseWithRole(course)),
        supabaseCourses
      ),
    [supabaseCourses]
  );

  const currentClass = mergedCourses.find(course => course.isLive);
  const activeCourse = useMemo(
    () =>
      mergedCourses.find(course => course.id === activeCourseId) ??
      mergedCourses[0] ??
      null,
    [activeCourseId, mergedCourses]
  );
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

  useEffect(() => {
    if (mergedCourses.length === 0) {
      setActiveCourseId(null);
      return;
    }

    setActiveCourseId(current => {
      if (
        current !== null &&
        mergedCourses.some(course => course.id === current)
      ) {
        return current;
      }

      return currentClass?.id ?? mergedCourses[0].id;
    });
  }, [currentClass?.id, mergedCourses]);

  if (loading || coursesLoading) {
    return (
      <AppLayout activeTab="dashboard">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
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
      <div className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-5 pt-12 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-emerald-500/20">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="block font-black text-gray-900 text-lg leading-none tracking-tight">
                CACTUS
              </span>
              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-[0.2em] mt-1 block">
                University
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors relative">
              <Bell className="w-5 h-5" />
              {activeAlerts.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pt-8 pb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
          {getGreeting(displayName)}
        </h1>
        <p className="text-sm font-semibold text-gray-400 mt-1.5">
          {formatDate()}
        </p>
      </div>

      {activeWalkGroup ? (
        <ActiveWalkGroupCard
          group={activeWalkGroup}
          onOpen={() => navigate(`/walk-group/${activeWalkGroup.id}`)}
          onLeave={() => void handleLeaveWalkGroup()}
          isLeaving={isLeavingWalkGroup}
        />
      ) : (<></>
        // <UrgentAlertBanner alerts={activeAlerts} />
      )}

      {coursesError ? (
        <div className="mx-4 mb-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Unable to load your class schedule
              </p>
              <p className="text-xs font-medium text-amber-800 mt-1 break-words">
                {coursesError}
              </p>
            </div>
          </div>
        </div>
      ) : mergedCourses.length > 0 ? (
        <RegisteredCoursesDeck
          courses={mergedCourses}
          activeCourseId={activeCourseId}
          onActiveCourseChange={setActiveCourseId}
          onOpenCourse={courseId => navigate(`/courses/${courseId}`)}
        />
      ) : (
        <div className="mx-4 mb-8 bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-500">
            No registered classes were found.
          </p>
        </div>
      )}

      <QuickActions
        onFindWay={() =>
          navigate(
            activeCourse
              ? `/find-way?courseId=${encodeURIComponent(String(activeCourse.id))}`
              : "/find-way"
          )
        }
        onClassChat={() =>
          navigate(
            activeCourse
              ? `/class-chat?courseId=${encodeURIComponent(String(activeCourse.id))}`
              : "/class-chat"
          )
        }
        onEmergency={() => navigate("/map?emergency=true")}
        isCourseActionsDisabled={!activeCourse}
      />

      <UpNextSection classes={mergedCourses} />

      <div className="mx-4 mb-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-gray-900 uppercase tracking-widest">
            Recent Updates
          </span>
          <button
            onClick={() => navigate("/class-chat")}
            className="text-xs text-emerald-600 font-bold"
          >
            See all
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {mergedCourses.slice(0, 3).map(course => {
            const isLive = course.isLive;
            const Icon = isLive ? CheckCircle : Clock;
            const bgClass = isLive
              ? "bg-emerald-50 text-emerald-600"
              : "bg-blue-50 text-blue-600";
            const badgeBg = isLive
              ? "bg-emerald-500 text-white"
              : "bg-gray-100 text-gray-500";

            return (
              <div key={course.id} className="flex items-center gap-4 p-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate tracking-tight">
                    {course.courseName}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                    {isLive ? "Live now" : formatCourseScheduleLine(course)}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-black px-2 py-1 rounded-md shrink-0 uppercase tracking-widest ${badgeBg}`}
                >
                  {isLive ? "LIVE" : "SCHEDULED"}
                </span>
              </div>
            );
          })}
          {mergedCourses.length === 0 && (
            <div className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-50">
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate tracking-tight">
                  No class updates yet
                </p>
                <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                  Your schedule will appear here
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
