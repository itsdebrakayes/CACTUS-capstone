import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import {
  User,
  Star,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  BookOpen,
  MapPin,
  Award,
  GraduationCap,
  Building2,
  Plus,
  X,
  Settings,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Mock data for preview ────────────────────────────────────────────────────

const AVAILABLE_COURSES = [
  { id: 1, courseCode: "COMP3161", courseName: "Database Management Systems", faculty: "FST" },
  { id: 2, courseCode: "COMP2201", courseName: "Discrete Mathematics", faculty: "FST" },
  { id: 3, courseCode: "COMP2190", courseName: "Net-Centric Computing", faculty: "FST" },
  { id: 4, courseCode: "STAT2202", courseName: "Advanced Statistics", faculty: "FST" },
  { id: 5, courseCode: "PSYC1001", courseName: "Introduction to Psychology", faculty: "FMS" },
  { id: 6, courseCode: "SOCI2001", courseName: "Social Research Methods", faculty: "FSS" },
  { id: 7, courseCode: "ECON1001", courseName: "Principles of Economics", faculty: "FSS" },
  { id: 8, courseCode: "COMP3901", courseName: "Final Year Project", faculty: "FST" },
];

const FACULTIES = ["FST", "FMS", "FSS", "FHE", "FE", "FLW"];

// ─── Course Enrollment Sheet ──────────────────────────────────────────────────

function CourseEnrollmentSheet({
  enrolledIds,
  onEnroll,
  onClose,
}: {
  enrolledIds: number[];
  onEnroll: (id: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterFaculty, setFilterFaculty] = useState<string | null>(null);

  const filtered = AVAILABLE_COURSES.filter((c) => {
    if (enrolledIds.includes(c.id)) return false;
    if (filterFaculty && c.faculty !== filterFaculty) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.courseCode.toLowerCase().includes(q) || c.courseName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <div className="fixed inset-0 bg-charcoal/30 z-30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Enroll in Courses</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses..."
            className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
          />

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterFaculty(null)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors",
                !filterFaculty ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}
            >
              All
            </button>
            {FACULTIES.map((f) => (
              <button
                key={f}
                onClick={() => setFilterFaculty(f === filterFaculty ? null : f)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors",
                  filterFaculty === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No courses found</p>
            </div>
          ) : (
            filtered.map((course) => (
              <button
                key={course.id}
                onClick={() => { onEnroll(course.id); toast.success(`Enrolled in ${course.courseCode}`); }}
                className="w-full flex items-center gap-3 p-3 bg-secondary rounded-xl hover:bg-muted transition-colors text-left"
              >
                <div className="w-9 h-9 bg-teal-light rounded-xl flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{course.courseCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{course.courseName}</p>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground bg-card px-2 py-0.5 rounded-full">{course.faculty}</span>
                <Plus className="w-4 h-4 text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const trustQuery = trpc.walking.getTrustScore.useQuery(undefined, { enabled: !!user });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  // Local state for enrollment (will be replaced with real DB queries)
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([1, 3, 5]);
  const [showEnrollSheet, setShowEnrollSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Profile info (mock defaults, would come from DB)
  const [faculty, setFaculty] = useState("Faculty of Science & Technology");
  const [degree, setDegree] = useState("BSc. Computer Science");
  const [year, setYear] = useState("3rd Year");

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const displayName = user?.name || "Student";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const trustScore = trustQuery.data?.score ?? 0.78;
  const trustPercent = Math.round(trustScore * 100);
  const ratingCount = trustQuery.data?.ratingCount ?? 12;
  const avgStars = trustQuery.data?.averageStars ?? 4.3;

  const enrolledCourses = AVAILABLE_COURSES.filter((c) => enrolledCourseIds.includes(c.id));

  const handleEnroll = (id: number) => {
    setEnrolledCourseIds((prev) => [...prev, id]);
  };

  const handleDrop = (id: number) => {
    setEnrolledCourseIds((prev) => prev.filter((cid) => cid !== id));
    toast.success("Course dropped");
  };

  const menuSections = [
    {
      title: "Academic",
      items: [
        { icon: BookOpen, label: "My Schedule", onClick: () => navigate("/schedule") },
        { icon: MapPin, label: "Campus Map", onClick: () => navigate("/map") },
      ],
    },
    {
      title: "Safety",
      items: [
        { icon: Shield, label: "My Check-Ins", onClick: () => navigate("/check-in") },
        { icon: Award, label: "Walking History", onClick: () => navigate("/walking") },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          icon: Bell,
          label: "Notifications",
          onClick: () => toast.info("Notification settings coming soon"),
        },
        {
          icon: HelpCircle,
          label: "Help & Support",
          onClick: () => toast.info("Help centre coming soon"),
        },
      ],
    },
  ];

  return (
    <AppLayout activeTab="profile">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Profile</h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Avatar + name + info */}
      <div className="bg-card px-4 py-5 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{displayName}</h2>
            <p className="text-sm text-muted-foreground truncate">{user?.email || "UWI Mona Student"}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs text-primary font-medium">Active</span>
            </div>
          </div>
        </div>

        {/* Academic info pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="flex items-center gap-1.5 bg-teal-light rounded-full px-3 py-1.5">
            <GraduationCap className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-primary">{degree}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1.5">
            <Building2 className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{faculty}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">{year}</span>
          </div>
        </div>
      </div>

      {/* Trust Score Card */}
      <div className="mx-4 mt-4 mb-3 bg-foreground rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-primary-foreground/50 uppercase tracking-wide font-medium">Trust Score</p>
            <p className="text-3xl font-bold text-primary-foreground mt-0.5">{trustPercent}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Shield className="w-6 h-6" style={{ color: "hsl(185 80% 50%)" }} />
          </div>
        </div>

        <div className="h-2 bg-primary-foreground/10 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${trustPercent}%`, background: "hsl(185 80% 50%)" }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-primary-foreground/50">
          <span>{ratingCount} ratings</span>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" style={{ color: "hsl(40 90% 55%)" }} />
            <span>{avgStars > 0 ? avgStars.toFixed(1) : "—"} avg</span>
          </div>
        </div>
      </div>

      {/* My Courses Section */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            My Courses ({enrolledCourses.length})
          </p>
          <button
            onClick={() => setShowEnrollSheet(true)}
            className="flex items-center gap-1 text-xs text-primary font-semibold"
          >
            <Plus className="w-3 h-3" />
            Add Course
          </button>
        </div>

        {enrolledCourses.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-6 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No courses enrolled yet</p>
            <button
              onClick={() => setShowEnrollSheet(true)}
              className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
            >
              Enroll in Courses
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {enrolledCourses.map((course) => (
              <div
                key={course.id}
                className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 bg-teal-light rounded-xl flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{course.courseCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{course.courseName}</p>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full mr-1">{course.faculty}</span>
                <button
                  onClick={() => handleDrop(course.id)}
                  className="w-7 h-7 rounded-full bg-orange-light flex items-center justify-center shrink-0 hover:bg-destructive/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu sections */}
      <div className="px-4 space-y-3 mb-4">
        {menuSections.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">
              {section.title}
            </p>
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-teal-light flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground text-left">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-card rounded-2xl border border-border hover:bg-orange-light hover:border-destructive/20 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-orange-light flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-destructive" />
          </div>
          <span className="flex-1 text-sm font-medium text-destructive text-left">
            {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground pb-24">
        CACTUS v1.0 · UWI Mona Campus
      </p>

      {/* Enrollment Sheet */}
      {showEnrollSheet && (
        <CourseEnrollmentSheet
          enrolledIds={enrolledCourseIds}
          onEnroll={handleEnroll}
          onClose={() => setShowEnrollSheet(false)}
        />
      )}
    </AppLayout>
  );
}
