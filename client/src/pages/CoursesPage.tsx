import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  Clock3,
  MoreVertical,
  Search,
  User,
} from "lucide-react";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";

type Tab = "ongoing" | "saved" | "all";

const COURSE_COVER_THEMES = [
  {
    background:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 12px, rgba(255,255,255,0.02) 12px 24px), repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 12px, rgba(255,255,255,0.02) 12px 24px), linear-gradient(135deg, #14b8a6 0%, #0f9b8e 100%)",
  },
  {
    background:
      "repeating-linear-gradient(60deg, rgba(255,255,255,0.14) 0 22px, rgba(255,255,255,0.03) 22px 44px), repeating-linear-gradient(-60deg, rgba(0,0,0,0.04) 0 22px, rgba(0,0,0,0.01) 22px 44px), linear-gradient(135deg, #f5c45f 0%, #eab54a 100%)",
  },
  {
    background:
      "repeating-linear-gradient(60deg, rgba(255,255,255,0.12) 0 30px, rgba(255,255,255,0.03) 30px 60px), repeating-linear-gradient(-60deg, rgba(0,0,0,0.05) 0 30px, rgba(0,0,0,0.01) 30px 60px), linear-gradient(135deg, #ef6aa0 0%, #e25b94 100%)",
  },
  {
    background:
      "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.08) 0 18px, transparent 18px), radial-gradient(circle at 68% 34%, rgba(255,255,255,0.07) 0 20px, transparent 20px), linear-gradient(135deg, #2486d1 0%, #1f78c4 100%)",
  },
  {
    background:
      "repeating-linear-gradient(60deg, rgba(255,255,255,0.1) 0 26px, rgba(255,255,255,0.02) 26px 52px), repeating-linear-gradient(-60deg, rgba(0,0,0,0.03) 0 26px, rgba(0,0,0,0.01) 26px 52px), linear-gradient(135deg, #6ca7e8 0%, #5c96d8 100%)",
  },
  {
    background:
      "radial-gradient(circle at 12% 22%, rgba(0,0,0,0.07) 0 12px, transparent 12px), radial-gradient(circle at 88% 70%, rgba(0,0,0,0.07) 0 18px, transparent 18px), radial-gradient(circle at 32% 22%, rgba(0,0,0,0.08) 0 22px, transparent 22px), linear-gradient(135deg, #dfe6eb 0%, #d1dae2 100%)",
  },
];

function getCoverStyle(courseCode: string) {
  const hash = Array.from(courseCode).reduce(
    (value, char) => value + char.charCodeAt(0),
    0
  );

  return {
    backgroundImage:
      COURSE_COVER_THEMES[hash % COURSE_COVER_THEMES.length].background,
  };
}

function formatDayLabel(dayOfWeek?: string) {
  if (!dayOfWeek) return "Shared Catalog";

  const labels = dayOfWeek
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean)
    .map((day) => day.slice(0, 3));

  return labels.length > 0 ? labels.join("/") : "Shared Catalog";
}

function formatScheduleLine(course: SupabaseCourseRecord) {
  const dayLabel = formatDayLabel(course.dayOfWeek);
  const timeLabel =
    course.startTime && course.endTime
      ? `${course.startTime} - ${course.endTime}`
      : "Time TBA";

  return `${dayLabel} - ${timeLabel}`;
}

function formatSupportLine(course: SupabaseCourseRecord) {
  const pieces = [course.department, course.room].filter(Boolean);
  return pieces.length > 0 ? pieces.join(" - ") : "Campus course listing";
}

function CatalogCourseCard({
  course,
  onClick,
}: {
  course: SupabaseCourseRecord;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
    >
      <div
        className="h-28 border-b border-gray-100 md:h-32"
        style={getCoverStyle(course.courseCode)}
      />

      <div className="p-4">
        <p className="text-sm text-[#546987]">
          {course.courseCode} | {formatDayLabel(course.dayOfWeek)}
        </p>
        <h3 className="mt-1 text-[1.02rem] font-medium leading-snug text-[#d62828]">
          {course.courseName}
        </h3>
        <p className="mt-1 text-base leading-snug text-[#11284a]">
          {formatSupportLine(course)}
        </p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="space-y-1 text-sm text-[#5f6f86]">
            <div className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              <span>{formatScheduleLine(course)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>{course.lecturer ?? "Lecturer TBA"}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full p-2 text-[#11284a]">
            <MoreVertical className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function CatalogCourseSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <Skeleton className="h-28 w-full md:h-32" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export default function CoursesPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const cachedCourses = getCachedSupabaseCourses();
  const [activeTab, setActiveTab] = useState<Tab>("ongoing");
  const [search, setSearch] = useState("");
  const [catalogCourses, setCatalogCourses] = useState<SupabaseCourseRecord[]>(
    cachedCourses ?? []
  );
  const [catalogLoading, setCatalogLoading] = useState(!cachedCourses);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (loading) {
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setCatalogCourses([]);
      setCatalogError(null);
      setCatalogLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!cachedCourses) {
      setCatalogLoading(true);
    }
    setCatalogError(null);

    void loadSupabaseCourses()
      .then((courses) => {
        if (!cancelled) {
          setCatalogCourses(courses);
          setCatalogLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCatalogCourses([]);
          setCatalogError(
            error instanceof Error
              ? error.message
              : "Unable to load the shared course catalog."
          );
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cachedCourses, loading, user]);

  const displayCourses = useMemo(() => {
    let list: SupabaseCourseRecord[] =
      activeTab === "saved" ? [] : catalogCourses;

    const query = search.trim().toLowerCase();
    if (!query) {
      return list;
    }

    return list.filter((course) => {
      return (
        course.courseCode.toLowerCase().includes(query) ||
        course.courseName.toLowerCase().includes(query) ||
        (course.lecturer ?? "").toLowerCase().includes(query) ||
        (course.department ?? "").toLowerCase().includes(query) ||
        (course.room ?? "").toLowerCase().includes(query)
      );
    });
  }, [activeTab, catalogCourses, search]);

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="courses">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">All Courses</h1>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 transition-colors hover:bg-green-600"
            onClick={() => {
              setActiveTab("all");
              setSearch("");
            }}
            aria-label="Show course catalog"
          >
            <BookMarked className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="mb-3 flex gap-4 text-sm font-medium">
          {(["ongoing", "saved", "all"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-1 transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-green-500 text-green-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab === "ongoing"
                ? "My Courses"
                : tab === "saved"
                  ? "Saved"
                  : "Discover"}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search your courses..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-xl border-gray-200 bg-gray-50 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="p-4">
        {catalogLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <CatalogCourseSkeleton key={index} />
            ))}
          </div>
        ) : catalogError ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  Unable to load the course catalog
                </p>
                <p className="mt-1 break-words text-xs">{catalogError}</p>
              </div>
            </div>
          </div>
        ) : displayCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              {activeTab === "saved" ? (
                <BookMarked className="h-8 w-8 text-green-400" />
              ) : (
                <BookOpen className="h-8 w-8 text-green-400" />
              )}
            </div>
            <p className="font-medium text-gray-600">
              {activeTab === "saved"
                ? "Saved courses coming soon"
                : "No courses matched your search"}
            </p>
            <button
              onClick={() => {
                setActiveTab("all");
                setSearch("");
              }}
              className="mt-3 text-sm font-medium text-green-600"
            >
              {"Browse all courses ->"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayCourses.map((course) => (
              <CatalogCourseCard
                key={course.id}
                course={course}
                onClick={() => navigate(`/courses/${course.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
