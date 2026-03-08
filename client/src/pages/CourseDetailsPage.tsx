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
} from "lucide-react";
import { toast } from "sonner";

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

// ─── Quick-report button types ────────────────────────────────────────────────

const QUICK_REPORTS = [
  {
    type: "lecturer_late" as const,
    label: "Lecturer Late",
    icon: Clock,
    color: "bg-amber-50 text-amber-600 border-amber-200",
  },
  {
    type: "cancelled" as const,
    label: "Cancelled",
    icon: AlertCircle,
    color: "bg-red-50 text-red-600 border-red-200",
  },
  {
    type: "room_changed" as const,
    label: "Room Changed",
    icon: MapPin,
    color: "bg-blue-50 text-blue-600 border-blue-200",
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
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {announcement.isOfficial ? (
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-gray-500" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-800">
              {announcement.isOfficial ? "Class Rep" : "Student"}
            </p>
            <p className="text-[10px] text-gray-400">{timeAgo(announcement.createdAt)}</p>
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
      <p className="text-sm text-gray-700 leading-relaxed">{announcement.title}</p>
      {announcement.body && (
        <p className="text-xs text-gray-500 mt-1">{announcement.body}</p>
      )}

      {/* Voting */}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={() => onVote(announcement.id, "up")}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600 transition-colors"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>{announcement.upvotes}</span>
        </button>
        <button
          onClick={() => onVote(announcement.id, "down")}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          <span>{announcement.downvotes}</span>
        </button>
        <div className="flex-1" />
        {announcement.status === "pending" && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            Pending review
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Thumbnail gradient ───────────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseDetailsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/courses/:id");
  const courseId = params?.id ? parseInt(params.id) : 0;
  const { data: course, isLoading: loadingCourse } = trpc.courses.getCourseById.useQuery(
    { courseId },
    { enabled: courseId > 0 }
  );

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

  const handleQuickReport = (type: "lecturer_late" | "cancelled" | "room_changed") => {
    const titles: Record<string, string> = {
      lecturer_late: "Lecturer is late",
      cancelled: "Class has been cancelled",
      room_changed: "Class room has changed",
    };
    submitReport.mutate({
      courseId,
      announcementType: type,
      title: titles[type],
    });
  };

  const handleVote = (announcementId: number, direction: "up" | "down") => {
    voteAnnouncement.mutate({ announcementId, direction });
  };

  const courseData = course as CourseDetail | undefined;
  const announcementList = (announcements as Announcement[]) ?? [];
  const gradient = courseData ? getThumbnailGradient(courseData.courseCode) : "from-green-700 to-emerald-500";

  return (
    <AppLayout activeTab="courses">
      {/* Hero */}
      <div className={`relative h-52 bg-gradient-to-br ${gradient} flex items-end`}>
        {courseData?.thumbnailUrl && (
          <img
            src={courseData.thumbnailUrl}
            alt={courseData.courseName}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate("/courses")}
          className="absolute top-4 left-4 w-9 h-9 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Class rep badge */}
        {courseData?.membershipRole === "class_rep" && (
          <button
            onClick={() => navigate(`/courses/${courseId}/rep`)}
            className="absolute top-4 right-4 flex items-center gap-1.5 bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1.5 rounded-full"
          >
            <Shield className="w-3 h-3" />
            Rep Dashboard
            <ChevronRight className="w-3 h-3" />
          </button>
        )}

        {/* Course info */}
        <div className="relative z-10 p-4 w-full">
          {loadingCourse ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 bg-white/20" />
              <Skeleton className="h-7 w-48 bg-white/20" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-green-300 bg-green-900/40 px-2 py-0.5 rounded-full">
                  ACTIVE NOW
                </span>
              </div>
              <p className="text-white font-bold text-xl leading-tight">{courseData?.courseCode}</p>
              <p className="text-white/80 text-sm">{courseData?.courseName}</p>
            </>
          )}
        </div>
      </div>

      {/* Course meta */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        {loadingCourse ? (
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
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
        )}
      </div>

      {/* Quick report buttons */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Quick Report
        </p>
        <div className="flex gap-2">
          {QUICK_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.type}
                onClick={() => handleQuickReport(r.type)}
                disabled={submitReport.isPending}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-medium transition-all ${r.color} disabled:opacity-50`}
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Community Updates
          </p>
          <span className="text-xs text-gray-400">{announcementList.length} updates</span>
        </div>

        {loadingAnnouncements ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-3">
              <Megaphone className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-sm text-gray-500">No updates yet</p>
            <p className="text-xs text-gray-400 mt-1">Be the first to report something</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcementList.map((a) => (
              <AnnouncementCard key={a.id} announcement={a} onVote={handleVote} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
