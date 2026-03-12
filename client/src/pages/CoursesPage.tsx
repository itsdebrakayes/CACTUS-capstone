import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, CheckCircle, Clock, AlertTriangle, BookMarked } from "lucide-react";

// Course thumbnail placeholder images (green-themed academic subjects)
const THUMBNAIL_COLORS: Record<string, string> = {
  PSYC: "from-teal to-teal-mid",
  STAT: "from-teal-mid to-primary",
  SOCI: "from-primary to-teal",
  COMP: "from-charcoal to-teal",
  MATH: "from-teal to-charcoal",
  LIT: "from-teal-mid to-primary",
  ECON: "from-primary to-teal-mid",
  BIOL: "from-teal to-teal-mid",
  CHEM: "from-charcoal to-teal-mid",
  PHYS: "from-teal to-charcoal",
};

function getThumbnailGradient(courseCode: string) {
  const prefix = courseCode.replace(/[^A-Z]/g, "").slice(0, 4);
  return THUMBNAIL_COLORS[prefix] ?? "from-primary to-teal";
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
  const hash = course.id % 4;
  if (hash === 0) return "update";
  if (hash === 1) return "new";
  return "none";
}

function StatusBadge({ status }: { status: AnnouncementStatus }) {
  if (status === "update") {
    return (
      <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
        Active Update
      </span>
    );
  }
  if (status === "new") {
    return (
      <span className="absolute top-2 left-2 bg-teal-light text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
        New Content
      </span>
    );
  }
  return null;
}

function CourseUpdateLine({ status }: { status: AnnouncementStatus }) {
  if (status === "update") {
    return (
      <div className="flex items-center gap-1 text-primary text-xs font-medium mt-1">
        <CheckCircle className="w-3 h-3" />
        Update available
      </div>
    );
  }
  if (status === "new") {
    return (
      <div className="flex items-center gap-1 text-teal-mid text-xs font-medium mt-1">
        <BookMarked className="w-3 h-3" />
        New material
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1">
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
      className="bg-card rounded-2xl overflow-hidden border border-border hover:border-primary/30 transition-all text-left w-full"
    >
      {/* Thumbnail */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt={course.courseName} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-primary-foreground/40" />
        )}
        <StatusBadge status={status} />
        {course.membershipRole === "class_rep" && (
          <span className="absolute top-2 right-2 bg-orange text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            Rep
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-foreground text-sm leading-tight">{course.courseCode}</p>
        <p className="text-muted-foreground text-xs mt-0.5 truncate">{course.courseName}</p>
        <CourseUpdateLine status={status} />
      </div>
    </button>
  );
}

function CourseCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border">
      <Skeleton className="h-36 w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// ─── Mock data for preview ────────────────────────────────────────────────────
const MOCK_COURSES: CourseWithRole[] = [
  { id: 1, courseCode: "PSYC1001", courseName: "Introduction to Psychology", room: "SLT 2", lecturer: "Dr. Williams", department: "Psychology", classSize: 150, isActive: true, createdAt: new Date(), updatedAt: new Date(), membershipRole: "student" },
  { id: 2, courseCode: "STAT2202", courseName: "Advanced Statistics", room: "Lab 4", lecturer: "Prof. Miller", department: "Mathematics", classSize: 45, isActive: true, createdAt: new Date(), updatedAt: new Date(), membershipRole: "class_rep" },
  { id: 3, courseCode: "COMP3161", courseName: "Database Management", room: "FST 1", lecturer: "Dr. Brown", department: "Computing", classSize: 60, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 4, courseCode: "MATH2401", courseName: "Calculus II", room: "FST 3", lecturer: "Dr. Clarke", department: "Mathematics", classSize: 80, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 5, courseCode: "SOCI2001", courseName: "Social Theory", room: "Room 102", lecturer: "Dr. Davis", department: "Sociology", classSize: 35, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 6, courseCode: "ECON1001", courseName: "Principles of Economics", room: "LT 1", lecturer: "Prof. Taylor", department: "Economics", classSize: 200, isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

type Tab = "ongoing" | "saved" | "all";

export default function CoursesPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("ongoing");
  const [search, setSearch] = useState("");

  const { data: myCourses, isLoading: loadingMy } = trpc.courses.getMyCourses.useQuery();
  const { data: savedCourses, isLoading: loadingSaved } = trpc.courses.getSavedCourses.useQuery();
  const { data: allCourses, isLoading: loadingAll } = trpc.courses.getAllCourses.useQuery();

  // Use mock data when backend data isn't available
  const fallbackCourses = MOCK_COURSES;

  const displayCourses = useMemo(() => {
    let list: CourseWithRole[] = [];
    if (activeTab === "ongoing") list = (myCourses as CourseWithRole[]) ?? fallbackCourses;
    else if (activeTab === "saved") list = (savedCourses as CourseWithRole[]) ?? fallbackCourses.slice(0, 3);
    else list = (allCourses as CourseWithRole[]) ?? fallbackCourses;

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
  }, [activeTab, myCourses, savedCourses, allCourses, search, fallbackCourses]);

  const isLoading =
    (activeTab === "ongoing" && loadingMy) ||
    (activeTab === "saved" && loadingSaved) ||
    (activeTab === "all" && loadingAll);

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-foreground">All Courses</h1>
          <button
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
            onClick={() => navigate("/courses/enroll")}
          >
            <BookMarked className="w-4 h-4 text-primary-foreground" />
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
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "ongoing" ? "My Courses" : tab === "saved" ? "Saved" : "Discover"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search your courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border rounded-xl text-sm"
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
            <div className="w-16 h-16 bg-teal-light rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-muted-foreground font-medium">
              {activeTab === "ongoing"
                ? "No courses enrolled yet"
                : activeTab === "saved"
                ? "No saved courses"
                : "No courses found"}
            </p>
            {activeTab === "ongoing" && (
              <button
                onClick={() => setActiveTab("all")}
                className="mt-3 text-primary text-sm font-medium"
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
