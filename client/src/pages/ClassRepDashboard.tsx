import { useState } from "react";
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
  ChevronRight,
  Megaphone,
  BookOpen,
  CheckCheck,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

// ─── Mock data for preview ────────────────────────────────────────────────────

const MOCK_STATS: RepStats = { activeIssues: 3, pendingReports: 5, verifiedToday: 12 };

const MOCK_COURSES: Course[] = [
  { id: 1, courseCode: "COMP3161", courseName: "Database Management Systems" },
  { id: 2, courseCode: "COMP2201", courseName: "Discrete Mathematics" },
  { id: 3, courseCode: "COMP2190", courseName: "Net-Centric Computing" },
];

const MOCK_PENDING: PendingAnnouncement[] = [
  { id: 101, courseId: 1, authorId: 5, announcementType: "lecturer_late", title: "Dr. Brown running 15 mins late", body: "Confirmed via WhatsApp group", isOfficial: false, status: "pending", upvotes: 8, downvotes: 1, createdAt: new Date(Date.now() - 600000) },
  { id: 102, courseId: 1, authorId: 12, announcementType: "room_changed", title: "Lab moved to FST C2", body: null, isOfficial: false, status: "pending", upvotes: 3, downvotes: 0, createdAt: new Date(Date.now() - 1800000) },
];

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  bgClass: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 border border-border flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bgClass)}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function HealthBar({ health, courseCode }: { health: CourseHealth; courseCode: string }) {
  const pct = health.status === "stable" ? 100 : health.status === "minor" ? 65 : 25;
  const barColor =
    health.status === "stable"
      ? "bg-primary"
      : health.status === "minor"
      ? "bg-orange"
      : "bg-destructive";
  const textColor =
    health.status === "stable"
      ? "text-primary"
      : health.status === "minor"
      ? "text-orange"
      : "text-destructive";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-foreground w-20 truncate">{courseCode}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs font-semibold capitalize w-12 text-right", textColor)}>
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
    lecturer_late: "bg-orange-light text-orange",
    cancelled: "bg-orange-light text-destructive",
    room_changed: "bg-teal-light text-primary",
    rescheduled: "bg-teal-light text-teal-mid",
    materials_uploaded: "bg-teal-light text-primary",
    general: "bg-secondary text-muted-foreground",
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
    <div className="bg-card rounded-2xl p-4 border border-border">
      <div className="flex items-start justify-between mb-2">
        <span
          className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full",
            typeColors[announcement.announcementType] ?? typeColors.general
          )}
        >
          {typeLabels[announcement.announcementType] ?? announcement.announcementType}
        </span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(announcement.createdAt)}</span>
      </div>
      <p className="text-sm text-foreground font-medium">{announcement.title}</p>
      {announcement.body && (
        <p className="text-xs text-muted-foreground mt-1">{announcement.body}</p>
      )}
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>👍 {announcement.upvotes}</span>
        <span>👎 {announcement.downvotes}</span>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onApprove}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-teal-light text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Verify
        </button>
        <button
          onClick={onReject}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-light text-destructive rounded-xl text-xs font-semibold hover:bg-destructive/10 transition-colors disabled:opacity-50"
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
  const courseId = params?.id ? parseInt((params as any).id) : 0;

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

  // Use real data if available, otherwise use mock
  const statsData = (stats as RepStats | undefined) ?? MOCK_STATS;
  const courses = ((repCourses as Course[]) ?? []).length > 0 ? (repCourses as Course[]) : MOCK_COURSES;
  const pending = ((pendingAnnouncements as PendingAnnouncement[]) ?? []).length > 0
    ? (pendingAnnouncements as PendingAnnouncement[])
    : MOCK_PENDING;

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-12 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(courseId > 0 ? `/courses/${courseId}` : "/courses")}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange" />
              <h1 className="text-lg font-bold text-foreground">Rep Dashboard</h1>
            </div>
            <p className="text-xs text-muted-foreground">Class Representative Portal</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Stats grid */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Overview
          </p>
          {loadingStats && !stats ? (
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
                value={statsData.activeIssues}
                color="text-destructive"
                bgClass="bg-orange-light"
              />
              <StatCard
                icon={ClipboardList}
                label="Pending Reports"
                value={statsData.pendingReports}
                color="text-orange"
                bgClass="bg-orange-light"
              />
              <StatCard
                icon={CheckCircle2}
                label="Verified Today"
                value={statsData.verifiedToday}
                color="text-primary"
                bgClass="bg-teal-light"
              />
              <StatCard
                icon={TrendingUp}
                label="My Courses"
                value={courses.length}
                color="text-primary"
                bgClass="bg-teal-light"
              />
            </div>
          )}
        </div>

        {/* Broadcast button */}
        <button
          onClick={() => navigate(courseId > 0 ? `/courses/${courseId}/reporting` : "/courses")}
          className="w-full flex items-center justify-between bg-primary text-primary-foreground rounded-2xl px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            <span className="text-sm font-semibold">Post Official Announcement</span>
          </div>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </button>

        {/* Pending reports */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Student Reports
            </p>
            <span className="text-xs text-muted-foreground">{pending.length} waiting</span>
          </div>

          {loadingPending && !pendingAnnouncements ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="bg-card rounded-2xl p-6 text-center border border-border">
              <CheckCircle2 className="w-8 h-8 text-primary/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground/70">No pending reports to review.</p>
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

        {/* Course health */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Course Health
          </p>
          <div className="bg-card rounded-2xl p-4 border border-border space-y-3">
            {loadingCourses && !repCourses ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-4">
                <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No courses assigned</p>
              </div>
            ) : (
              courses.map((c, i) => (
                <HealthBar
                  key={c.id}
                  courseCode={c.courseCode}
                  health={
                    c.id === courseId && health
                      ? (health as CourseHealth)
                      : { openIssues: i, status: i === 0 ? "stable" : i === 1 ? "minor" : "stable" }
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* My courses list */}
        {courses.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              My Courses
            </p>
            <div className="space-y-2">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/courses/${c.id}/rep`)}
                  className="w-full bg-card rounded-2xl px-4 py-3 border border-border flex items-center justify-between hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-teal-light rounded-xl flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{c.courseCode}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{c.courseName}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
