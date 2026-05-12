import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import AppLayout from "@/components/AppLayout";
import {
  AlertCircle,
  Star,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  BookOpen,
  MapPin,
  Award,
  Clock3,
} from "lucide-react";
import { TRUST_SCORE_DEFAULT, getTrustTier } from "@shared/trust";
import { toast } from "sonner";

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { user, loading, logout } = useAuth();
  const trustQuery = trpc.trust.getMySummary.useQuery(undefined, {
    enabled: !!user,
  });
  const cachedCourses = getCachedSupabaseCourses();
  const [supabaseCourses, setSupabaseCourses] = useState<
    SupabaseCourseRecord[]
  >(cachedCourses ?? []);
  const [loadingSupabaseCourses, setLoadingSupabaseCourses] =
    useState(!cachedCourses);
  const [supabaseCoursesError, setSupabaseCoursesError] = useState<
    string | null
  >(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const displayName = user?.name || "Student";
  const initials = displayName
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const trustPercent = trustQuery.data?.score ?? TRUST_SCORE_DEFAULT;
  const ratingCount = trustQuery.data?.ratingCount ?? 0;
  const avgStars = trustQuery.data?.averageStars ?? 0;
  const trustTier =
    trustQuery.data?.tierLabel ?? getTrustTier(TRUST_SCORE_DEFAULT).label;

  useEffect(() => {
    let cancelled = false;

    async function fetchCourses() {
      try {
        if (!cachedCourses) {
          setLoadingSupabaseCourses(true);
        }
        setSupabaseCoursesError(null);
        const courses = await loadSupabaseCourses();
        if (!cancelled) {
          setSupabaseCourses(courses);
        }
      } catch (error) {
        if (!cancelled) {
          setSupabaseCourses([]);
          setSupabaseCoursesError(
            error instanceof Error
              ? error.message
              : "Unable to load Supabase courses."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSupabaseCourses(false);
        }
      }
    }

    if (loading) {
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setSupabaseCourses([]);
      setLoadingSupabaseCourses(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchCourses();

    return () => {
      cancelled = true;
    };
  }, [cachedCourses, loading, user]);

  const menuSections = [
    {
      title: "Safety",
      items: [
        {
          icon: Award,
          label: "Campus Events",
          onClick: () => navigate("/events"),
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          icon: Bell,
          label: "Notifications",
          onClick: () => navigate('/notifications')
        },
        {
          icon: HelpCircle,
          label: "Help & Support",
          onClick: () => toast.info("Help centre coming soon"),
        },
      ],
    },
  ];

  const formatSchedule = (course: SupabaseCourseRecord) => {
    const dayText = course.dayOfWeek
      ?.split(",")
      .map(day => day.trim())
      .filter(Boolean)
      .join(" / ");

    const timeText =
      course.startTime && course.endTime
        ? `${course.startTime} - ${course.endTime}`
        : undefined;

    return (
      [dayText, timeText].filter(Boolean).join(" - ") || "Schedule not set"
    );
  };

  return (
    <AppLayout activeTab="profile">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">Profile</h1>
      </div>

      {/* Avatar + name */}
      <div className="bg-white px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00c853] to-[#00b84a] flex items-center justify-center text-white text-xl font-bold shadow-md shadow-[#00c853]/20">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {displayName}
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {user?.email || "UWI Mona Student"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full bg-[#00c853]" />
              <span className="text-xs text-[#00c853] font-medium">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Score Card */}
      <div className="mx-4 mt-4 mb-3 bg-gradient-to-br from-[#0f1e35] to-[#1a2f50] rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-[#8899aa] uppercase tracking-wide font-medium">
              Trust Score
            </p>
            <p className="text-3xl font-bold text-white mt-0.5">
              {trustPercent}%
            </p>
            <p className="mt-1 text-sm font-medium text-[#d8e6f8]">
              {trustTier}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#00c853]/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#00c853]" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[#00c853] rounded-full transition-all duration-500"
            style={{ width: `${trustPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#8899aa]">
          <span>{ratingCount} ratings</span>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span>{avgStars > 0 ? avgStars.toFixed(1) : "—"} avg</span>
          </div>
        </div>
      </div>

      {/* <div className="mx-4 mb-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      

        {loadingSupabaseCourses ? (
          <div className="px-4 py-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 animate-pulse"
              >
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-40 bg-gray-200 rounded mt-2" />
                <div className="h-3 w-32 bg-gray-200 rounded mt-2" />
              </div>
            ))}
          </div>
        ) : supabaseCoursesError ? (
          <div className="px-4 py-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    Unable to load Supabase courses
                  </p>
                  <p className="text-xs mt-1 break-words">
                    {supabaseCoursesError}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : supabaseCourses.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-gray-700">
              No courses found in Supabase
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Check the seed rows in <code>create-tables.sql</code>.
            </p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            {supabaseCourses.map(course => (
              <div
                key={course.id}
                className="rounded-2xl border border-gray-100 bg-[#fbfcfb] px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">
                      {course.courseCode}
                    </p>
                    <p className="text-sm text-gray-600 leading-snug">
                      {course.courseName}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#f0faf5] px-2.5 py-1 text-[11px] font-semibold text-[#00a844]">
                    {course.department ?? "Course"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-gray-100">
                    <Clock3 className="w-3 h-3" />
                    {formatSchedule(course)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-gray-100">
                    <MapPin className="w-3 h-3" />
                    {course.room ?? "Room TBA"}
                  </span>
                </div>

                {course.description ? (
                  <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                    {course.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div> */}

      {/* Menu sections */}
      <div className="px-4 space-y-3 mb-4">
        {menuSections.map(section => (
          <div key={section.title}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-1">
              {section.title}
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {section.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#f0faf5] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[#00c853]" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800 text-left">
                      {item.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={async () => {
            try {
              setIsSigningOut(true);
              await logout();
              window.location.href = "/login";
            } finally {
              setIsSigningOut(false);
            }
          }}
          disabled={isSigningOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-red-50 hover:border-red-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-[#ffebee] flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-[#e53935]" />
          </div>
          <span className="flex-1 text-sm font-medium text-[#e53935] text-left">
            {isSigningOut ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-xs text-gray-300 pb-4">
        CACTUS v1.0 · UWI Mona Campus
      </p>
    </AppLayout>
  );
}
