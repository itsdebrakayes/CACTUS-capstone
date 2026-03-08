import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  ChevronRight,
  Megaphone,
  BarChart3,
  BookOpen,
  CheckCheck,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type RepStats = {
  activeIssues: number;
  pendingReports: number;
  verifiedToday: number;
};

type PendingAnnouncement = {
  id: number;
  courseId: number;
  authorId: number;
  announcementType: string;
  title: string;
  body?: string | null;
  isOfficial: boolean;
  status: string;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
};

type CourseHealth = {
  openIssues: number;
  status: "stable" | "minor" | "critical";
};

type Course = {
  id: number;
  courseCode: string;
  courseName: string;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function HealthBar({ health, courseCode }: { health: CourseHealth; courseCode: string }) {
  const pct = health.status === "stable" ? 100 : health.status === "minor" ? 65 : 25;
  const barColor =
    health.status === "stable"
      ? "bg-green-500"
      : health.status === "minor"
      ? "bg-amber-400"
      : "bg-red-500";
  const textColor =
    health.status === "stable"
      ? "text-green-600"
      : health.status === "minor"
      ? "text-amber-600"
      : "text-red-600";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-gray-700 w-20 truncate">{courseCode}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold capitalize w-12 text-right ${textColor}`}>
        {health.status}
      </span>
    </div>
  );
}

// ─── Pending report card ──────────────────────────────────────────────────────

function PendingReportCard({
  announcement,
  onApprove,
  onReject,
  isLoading,
}: {
  announcement: PendingAnnouncement;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
}) {
  const typeLabels: Record<string, string> = {
    lecturer_late: "Lecturer Late",
    cancelled: "Class Cancelled",
    room_changed: "Room Changed",
    rescheduled: "Rescheduled",
    materials_uploaded: "Materials Uploaded",
    general: "General Update",
  };

  const typeColors: Record<string, string> = {
    lecturer_late: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
    room_changed: "bg-blue-100 text-blue-700",
    rescheduled: "bg-purple-100 text-purple-700",
    materials_uploaded: "bg-green-100 text-green-700",
    general: "bg-gray-100 text-gray-600",
  };

  const timeAgo = (date: Date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-2">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            typeColors[announcement.announcementType] ?? typeColors.general
          }`}
        >
          {typeLabels[announcement.announcementType] ?? announcement.announcementType}
        </span>
        <span className="text-[10px] text-gray-400">{timeAgo(announcement.createdAt)}</span>
      </div>
      <p className="text-sm text-gray-800 font-medium">{announcement.title}</p>
      {announcement.body && (
        <p className="text-xs text-gray-500 mt-1">{announcement.body}</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onApprove}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Verify
        </button>
        <button
          onClick={onReject}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClassRepDashboard() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/courses/:id/rep");
  const courseId = params?.id ? parseInt(params.id) : 0;

  const { data: stats, isLoading: loadingStats } = trpc.courses.getClassRepStats.useQuery();
  const { data: repCourses, isLoading: loadingCourses } = trpc.courses.getClassRepCourses.useQuery();
  const {
    data: pendingAnnouncements,
    isLoading: loadingPending,
    refetch: refetchPending,
  } = trpc.courses.getPendingAnnouncements.useQuery(
    { courseId },
    { enabled: courseId > 0 }
  );

  const { data: health } = trpc.courses.getCourseHealth.useQuery(
    { courseId },
    { enabled: courseId > 0 }
  );

  const reviewMutation = trpc.courses.reviewAnnouncement.useMutation({
    onSuccess: (_, variables) => {
      const action = variables.status === "approved" ? "approved" : "rejected";
      toast.success(`Report ${action}`, { description: "The community update has been updated." });
      refetchPending();
    },
    onError: (err) => {
      toast.error("Error", { description: err.message });
    },
  });

  const statsData = stats as RepStats | undefined;
  const courses = (repCourses as Course[]) ?? [];
  const pending = (pendingAnnouncements as PendingAnnouncement[]) ?? [];

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(courseId > 0 ? `/courses/${courseId}` : "/courses")}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-yellow-500" />
              <h1 className="text-lg font-bold text-gray-900">Rep Dashboard</h1>
            </div>
            <p className="text-xs text-gray-500">Class Representative Portal</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Stats grid */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Overview
          </p>
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={AlertTriangle}
                label="Active Issues"
                value={statsData?.activeIssues ?? 0}
                color="bg-red-50 text-red-500"
              />
              <StatCard
                icon={ClipboardList}
                label="Pending Reports"
                value={statsData?.pendingReports ?? 0}
                color="bg-amber-50 text-amber-500"
              />
              <StatCard
                icon={CheckCircle2}
                label="Verified Today"
                value={statsData?.verifiedToday ?? 0}
                color="bg-green-50 text-green-600"
              />
              <StatCard
                icon={TrendingUp}
                label="My Courses"
                value={courses.length}
                color="bg-blue-50 text-blue-500"
              />
            </div>
          )}
        </div>

        {/* Broadcast button */}
        <button
          onClick={() => navigate(courseId > 0 ? `/courses/${courseId}/reporting` : "/courses")}
          className="w-full flex items-center justify-between bg-green-500 text-white rounded-2xl px-4 py-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            <span className="text-sm font-semibold">Post Official Announcement</span>
          </div>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </button>

        {/* Pending reports */}
        {courseId > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Pending Student Reports
              </p>
              <span className="text-xs text-gray-400">{pending.length} waiting</span>
            </div>

            {loadingPending ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
            ) : pending.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">All caught up!</p>
                <p className="text-xs text-gray-400">No pending reports to review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((ann) => (
                  <PendingReportCard
                    key={ann.id}
                    announcement={ann}
                    isLoading={reviewMutation.isPending}
                    onApprove={() =>
                      reviewMutation.mutate({
                        announcementId: ann.id,
                        courseId: ann.courseId,
                        status: "approved",
                      })
                    }
                    onReject={() =>
                      reviewMutation.mutate({
                        announcementId: ann.id,
                        courseId: ann.courseId,
                        status: "rejected",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Course health */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Course Health
          </p>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            {loadingCourses ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-4">
                <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No courses assigned</p>
              </div>
            ) : (
              courses.map((c) => (
                <HealthBar
                  key={c.id}
                  courseCode={c.courseCode}
                  health={
                    c.id === courseId && health
                      ? (health as CourseHealth)
                      : { openIssues: 0, status: "stable" }
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* My courses list */}
        {courses.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              My Courses
            </p>
            <div className="space-y-2">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/courses/${c.id}/rep`)}
                  className="w-full bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex items-center justify-between hover:border-green-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{c.courseCode}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[180px]">{c.courseName}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
