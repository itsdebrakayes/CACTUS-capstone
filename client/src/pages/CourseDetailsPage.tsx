import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  MapPin,
  User,
  Users,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Shield,
  Megaphone,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import ReportSheet, { type ReportCategory } from "@/components/ReportSheet";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Announcement = {
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

type CourseDetail = {
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
  membershipRole?: string;
};

// ─── Mock data for preview ────────────────────────────────────────────────────

const MOCK_COURSE: CourseDetail = {
  id: 1,
  courseCode: "PSYC1001",
  courseName: "Introduction to Psychology",
  description: "Learn essential psychological concepts, including cognition, behaviour, and practical research methods.",
  room: "SLT 2",
  lecturer: "Dr. Williams",
  department: "Psychology",
  classSize: 150,
  isActive: true,
  membershipRole: "student",
};

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: 1, courseId: 1, authorId: 100, announcementType: "lecturer_late", title: "Lecturer running 15 minutes late", body: "Dr. Williams sent email confirming she'll be late today", isOfficial: true, status: "verified", upvotes: 12, downvotes: 1, createdAt: new Date(Date.now() - 1000 * 60 * 10) },
  { id: 2, courseId: 1, authorId: 101, announcementType: "materials_uploaded", title: "Week 8 slides uploaded to Moodle", body: null, isOfficial: false, status: "verified", upvotes: 8, downvotes: 0, createdAt: new Date(Date.now() - 1000 * 60 * 45) },
  { id: 3, courseId: 1, authorId: 102, announcementType: "room_changed", title: "Tutorial moved to Room 205", body: "Due to maintenance in the usual room", isOfficial: true, status: "pending", upvotes: 5, downvotes: 2, createdAt: new Date(Date.now() - 1000 * 60 * 120) },
];

// ─── Quick-report button types ────────────────────────────────────────────────

const QUICK_REPORTS = [
  {
    type: "lecturer_late" as const,
    label: "Lecturer Late",
    icon: Clock,
    color: "bg-orange-light text-orange border-orange/20",
  },
  {
    type: "cancelled" as const,
    label: "Cancelled",
    icon: AlertCircle,
    color: "bg-destructive/10 text-destructive border-destructive/20",
  },
  {
    type: "room_changed" as const,
    label: "Room Changed",
    icon: MapPin,
    color: "bg-teal-light text-primary border-primary/20",
  },
];

// ─── Announcement card ────────────────────────────────────────────────────────

function AnnouncementCard({
  announcement,
  onVote,
}: {
  announcement: Announcement;
  onVote: (id: number, direction: "up" | "down") => void;
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
    cancelled: "bg-destructive/10 text-destructive",
    room_changed: "bg-teal-light text-primary",
    rescheduled: "bg-secondary text-charcoal",
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

  const total = announcement.upvotes + announcement.downvotes;

  return (
    <div className="bg-card rounded-2xl p-4 border border-border">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {announcement.isOfficial ? (
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-foreground">
              {announcement.isOfficial ? "Class Rep" : "Student"}
            </p>
            <p className="text-[10px] text-muted-foreground">{timeAgo(announcement.createdAt)}</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            typeColors[announcement.announcementType] ?? typeColors.general
          }`}
        >
          {typeLabels[announcement.announcementType] ?? announcement.announcementType}
        </span>
      </div>

      {/* Body */}
      <p className="text-sm text-foreground leading-relaxed">{announcement.title}</p>
      {announcement.body && (
        <p className="text-xs text-muted-foreground mt-1">{announcement.body}</p>
      )}

      {/* Voting — Approve / Disapprove */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onVote(announcement.id, "up")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            "bg-teal-light text-primary hover:bg-primary/20"
          )}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          Approve ({announcement.upvotes})
        </button>
        <button
          onClick={() => onVote(announcement.id, "down")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            "bg-orange-light text-destructive hover:bg-destructive/20"
          )}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          Disapprove ({announcement.downvotes})
        </button>
      </div>

      {/* Total votes */}
      {total > 0 && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          {total} students voted · {Math.round((announcement.upvotes / total) * 100)}% approval
        </p>
      )}
    </div>
  );
}

// ─── Thumbnail gradient ───────────────────────────────────────────────────────

const THUMBNAIL_COLORS: Record<string, string> = {
  PSYC: "from-teal to-teal-mid",
  STAT: "from-teal-mid to-primary",
  SOCI: "from-primary to-teal",
  COMP: "from-charcoal to-teal",
  MATH: "from-teal to-charcoal",
};

function getThumbnailGradient(courseCode: string) {
  const prefix = courseCode.replace(/[^A-Z]/g, "").slice(0, 4);
  return THUMBNAIL_COLORS[prefix] ?? "from-primary to-teal";
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TYPES = [
  { key: "all", label: "Overview" },
  { key: "lecturer_late", label: "Late" },
  { key: "cancelled", label: "Cancelled" },
  { key: "room_changed", label: "Room" },
  { key: "materials_uploaded", label: "Resources" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseDetailsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/courses/:id");
  const courseId = params?.id ? parseInt((params as any).id) : 0;
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportInitialType, setReportInitialType] = useState<ReportCategory | undefined>();
  const [activeFilter, setActiveFilter] = useState("all");
  const utils = trpc.useUtils();

  const { data: course, isLoading: loadingCourse, refetch: refetchCourse } = trpc.courses.getCourseById.useQuery(
    { courseId },
    { enabled: courseId > 0 }
  );
  const { data: savedCourses, refetch: refetchSavedCourses } = trpc.courses.getSavedCourses.useQuery();

  const { data: announcements, isLoading: loadingAnnouncements, refetch: refetchAnnouncements } =
    trpc.courses.getCourseAnnouncements.useQuery(
      { courseId },
      { enabled: courseId > 0 }
    );

  const submitReport = trpc.courses.submitCourseReport.useMutation({
    onSuccess: () => {
      toast.success("Report submitted", { description: "Your update has been submitted for review." });
      refetchAnnouncements();
    },
    onError: (err) => {
      toast.error("Error", { description: err.message });
    },
  });

  const voteAnnouncement = trpc.courses.voteAnnouncement.useMutation({
    onSuccess: () => refetchAnnouncements(),
  });
  const enrollMutation = trpc.courses.enroll.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refetchCourse(),
        utils.courses.getMyCourses.invalidate(),
      ]);
      toast.success("Enrolled in course");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });
  const unenrollMutation = trpc.courses.unenroll.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refetchCourse(),
        utils.courses.getMyCourses.invalidate(),
      ]);
      toast.success("Dropped course");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });
  const saveMutation = trpc.courses.saveCourse.useMutation({
    onSuccess: async () => {
      await refetchSavedCourses();
      toast.success("Course saved");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });
  const unsaveMutation = trpc.courses.unsaveCourse.useMutation({
    onSuccess: async () => {
      await refetchSavedCourses();
      toast.success("Removed from saved courses");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const openReportSheet = (type?: ReportCategory) => {
    setReportInitialType(type);
    setReportSheetOpen(true);
  };

  const handleReportSubmit = ({ type, title, comment }: { type: ReportCategory; title: string; comment: string }) => {
    submitReport.mutate(
      { courseId, announcementType: type, title, body: comment || undefined },
      { onSuccess: () => setReportSheetOpen(false) }
    );
  };

  const handleVote = (announcementId: number, direction: "up" | "down") => {
    voteAnnouncement.mutate({ announcementId, direction });
  };

  // Use mock data when backend not available
  const courseData = (course as CourseDetail | undefined) ?? (courseId <= 1 ? MOCK_COURSE : undefined);
  const isSaved = ((savedCourses as CourseDetail[] | undefined) ?? []).some((savedCourse) => savedCourse.id === courseId);
  const announcementList = ((announcements as Announcement[]) ?? MOCK_ANNOUNCEMENTS)
    .filter((a) => activeFilter === "all" || a.announcementType === activeFilter);
  const gradient = courseData ? getThumbnailGradient(courseData.courseCode) : "from-primary to-teal";

  return (
    <AppLayout activeTab="courses">
      {/* Hero — course info at top with image */}
      <div className={`relative h-52 bg-gradient-to-br ${gradient} flex items-end`}>
        {courseData?.thumbnailUrl && (
          <img
            src={courseData.thumbnailUrl}
            alt={courseData.courseName}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate("/courses")}
          className="absolute top-4 left-4 w-9 h-9 bg-charcoal/30 backdrop-blur-sm rounded-full flex items-center justify-center text-primary-foreground"
          aria-label="Back to courses"
          title="Back to courses"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Chat icon */}
        <button
          onClick={() => navigate("/class-chat")}
          className="absolute top-4 right-14 w-9 h-9 bg-charcoal/30 backdrop-blur-sm rounded-full flex items-center justify-center text-primary-foreground"
          aria-label="Open class chat"
          title="Open class chat"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* Class rep badge */}
        {courseData?.membershipRole === "class_rep" && (
          <button
            onClick={() => navigate(`/courses/${courseId}/rep`)}
            className="absolute top-4 right-4 flex items-center gap-1.5 bg-orange text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full"
          >
            <Shield className="w-3 h-3" />
            Rep
            <ChevronRight className="w-3 h-3" />
          </button>
        )}

        {/* Course info */}
        <div className="relative z-10 p-4 w-full">
          {loadingCourse && !courseData ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 bg-primary-foreground/20" />
              <Skeleton className="h-7 w-48 bg-primary-foreground/20" />
            </div>
          ) : (
            <>
              <p className="text-primary-foreground font-bold text-xl leading-tight">{courseData?.courseCode}</p>
              <p className="text-primary-foreground/80 text-sm mt-0.5">{courseData?.courseName}</p>
              {courseData?.description && (
                <p className="text-primary-foreground/60 text-xs mt-1 line-clamp-2">{courseData.description}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Course meta */}
      <div className="bg-card border-b border-border px-4 py-3">
        {loadingCourse && !courseData ? (
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {courseData?.lecturer && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {courseData.lecturer}
                </div>
              )}
              {courseData?.room && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {courseData.room}
                </div>
              )}
              {courseData?.classSize && (
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {courseData.classSize} students
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (courseData?.membershipRole) {
                    unenrollMutation.mutate({ courseId });
                  } else {
                    enrollMutation.mutate({ courseId });
                  }
                }}
                disabled={enrollMutation.isPending || unenrollMutation.isPending}
                className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
              >
                {courseData?.membershipRole ? "Drop Course" : "Enroll in Course"}
              </button>
              <button
                onClick={() => {
                  if (isSaved) {
                    unsaveMutation.mutate({ courseId });
                  } else {
                    saveMutation.mutate({ courseId });
                  }
                }}
                disabled={saveMutation.isPending || unsaveMutation.isPending}
                className="px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold disabled:opacity-50"
              >
                {isSaved ? "Unsave" : "Save Course"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs — horizontally scrollable */}
      <div className="bg-card border-b border-border px-4 py-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTER_TYPES.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                activeFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}

          {/* New Notification button */}
          <button
            onClick={() => openReportSheet()}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all ml-auto"
          >
            + New Notification
          </button>
        </div>
      </div>

      {/* Quick report buttons */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Quick Report
        </p>
        <div className="flex gap-2">
          {QUICK_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.type}
                onClick={() => openReportSheet(r.type as ReportCategory)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-medium transition-all ${r.color} active:scale-95`}
              >
                <Icon className="w-4 h-4" />
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Community updates feed */}
      <div className="px-4 pt-2 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Community Updates
          </p>
          <span className="text-xs text-muted-foreground">{announcementList.length} updates</span>
        </div>

        {loadingAnnouncements && !announcementList.length ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-border">
                <div className="flex gap-2 mb-2">
                  <Skeleton className="w-7 h-7 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2 w-12" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4 mt-1" />
              </div>
            ))}
          </div>
        ) : announcementList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 bg-teal-light rounded-full flex items-center justify-center mb-3">
              <Megaphone className="w-6 h-6 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">No updates yet</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to report something</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcementList.map((a) => (
              <AnnouncementCard key={a.id} announcement={a} onVote={handleVote} />
            ))}
          </div>
        )}
      </div>

      {/* Report Sheet */}
      {reportSheetOpen && (
        <ReportSheet
          courseId={courseId}
          initialType={reportInitialType}
          onClose={() => setReportSheetOpen(false)}
          onSubmit={handleReportSubmit}
          isPending={submitReport.isPending}
        />
      )}
    </AppLayout>
  );
}
