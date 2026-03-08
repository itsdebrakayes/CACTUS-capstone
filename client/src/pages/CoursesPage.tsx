import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, CheckCircle, Clock, AlertTriangle, BookMarked } from "lucide-react";

// Course thumbnail placeholder images (green-themed academic subjects)
const THUMBNAIL_COLORS: Record<string, string> = {
  PSYC: "from-emerald-800 to-emerald-600",
  STAT: "from-green-700 to-teal-600",
  SOCI: "from-lime-700 to-green-600",
  COMP: "from-teal-800 to-cyan-600",
  MATH: "from-green-800 to-emerald-500",
  LIT: "from-emerald-700 to-lime-600",
  ECON: "from-teal-700 to-green-500",
  BIOL: "from-green-600 to-emerald-400",
  CHEM: "from-cyan-700 to-teal-500",
  PHYS: "from-emerald-900 to-teal-700",
};

function getThumbnailGradient(courseCode: string) {
  const prefix = courseCode.replace(/[^A-Z]/g, "").slice(0, 4);
  return THUMBNAIL_COLORS[prefix] ?? "from-green-700 to-emerald-500";
}

type CourseWithRole = {
  id: number;
  courseCode: string;
  courseName: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  room?: string | null;
  lecturer?: string | null;
  department?: string | null;
  classSize: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  membershipRole?: string;
};

type AnnouncementStatus = "update" | "new" | "none";

function getCourseStatus(course: CourseWithRole): AnnouncementStatus {
  // In a real app this would come from the latest announcement
  // For demo purposes, derive from course code hash
  const hash = course.id % 4;
  if (hash === 0) return "update";
  if (hash === 1) return "new";
  return "none";
}

function StatusBadge({ status }: { status: AnnouncementStatus }) {
  if (status === "update") {
    return (
      <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
        Active Update
      </span>
    );
  }
  if (status === "new") {
    return (
      <span className="absolute top-2 left-2 bg-lime-400 text-lime-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
        New Content
      </span>
    );
  }
  return null;
}

function CourseUpdateLine({ status }: { status: AnnouncementStatus }) {
  if (status === "update") {
    return (
      <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-1">
        <CheckCircle className="w-3 h-3" />
        Update available
      </div>
    );
  }
  if (status === "new") {
    return (
      <div className="flex items-center gap-1 text-lime-600 text-xs font-medium mt-1">
        <BookMarked className="w-3 h-3" />
        New material
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
      <Clock className="w-3 h-3" />
      No updates
    </div>
  );
}

function CourseCard({ course, onClick }: { course: CourseWithRole; onClick: () => void }) {
  const status = getCourseStatus(course);
  const gradient = getThumbnailGradient(course.courseCode);

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-green-200 transition-all text-left w-full"
    >
      {/* Thumbnail */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt={course.courseName} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-white/40" />
        )}
        <StatusBadge status={status} />
        {course.membershipRole === "class_rep" && (
          <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            Rep
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm leading-tight">{course.courseCode}</p>
        <p className="text-gray-500 text-xs mt-0.5 truncate">{course.courseName}</p>
        <CourseUpdateLine status={status} />
      </div>
    </button>
  );
}

function CourseCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <Skeleton className="h-36 w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

type Tab = "ongoing" | "saved" | "all";

export default function CoursesPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("ongoing");
  const [search, setSearch] = useState("");

  const { data: myCourses, isLoading: loadingMy } = trpc.courses.getMyCourses.useQuery();
  const { data: savedCourses, isLoading: loadingSaved } = trpc.courses.getSavedCourses.useQuery();
  const { data: allCourses, isLoading: loadingAll } = trpc.courses.getAllCourses.useQuery();

  const displayCourses = useMemo(() => {
    let list: CourseWithRole[] = [];
    if (activeTab === "ongoing") list = (myCourses as CourseWithRole[]) ?? [];
    else if (activeTab === "saved") list = (savedCourses as CourseWithRole[]) ?? [];
    else list = (allCourses as CourseWithRole[]) ?? [];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.courseCode.toLowerCase().includes(q) ||
          c.courseName.toLowerCase().includes(q) ||
          (c.lecturer ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, myCourses, savedCourses, allCourses, search]);

  const isLoading =
    (activeTab === "ongoing" && loadingMy) ||
    (activeTab === "saved" && loadingSaved) ||
    (activeTab === "all" && loadingAll);

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">All Courses</h1>
          <button
            className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center"
            onClick={() => navigate("/courses/enroll")}
          >
            <BookMarked className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 text-sm font-medium mb-3">
          {(["ongoing", "saved", "all"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-1 capitalize transition-colors ${
                activeTab === tab
                  ? "text-green-600 border-b-2 border-green-500"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab === "ongoing" ? "My Courses" : tab === "saved" ? "Saved" : "Discover"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search your courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-200 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Course Grid */}
      <div className="p-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : displayCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-gray-500 font-medium">
              {activeTab === "ongoing"
                ? "No courses enrolled yet"
                : activeTab === "saved"
                ? "No saved courses"
                : "No courses found"}
            </p>
            {activeTab === "ongoing" && (
              <button
                onClick={() => setActiveTab("all")}
                className="mt-3 text-green-600 text-sm font-medium"
              >
                Browse all courses →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {displayCourses.map((course) => (
              <CourseCard
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
