import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Shield,
  Megaphone,
  Clock,
  AlertCircle,
  MapPin,
  Calendar,
  BookMarked,
  MessageSquare,
  CheckCheck,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnouncementType =
  | "cancelled"
  | "room_changed"
  | "lecturer_late"
  | "rescheduled"
  | "materials_uploaded"
  | "general";

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PENDING: PendingAnnouncement[] = [
  { id: 201, courseId: 1, authorId: 3, announcementType: "cancelled", title: "Morning lecture cancelled", body: "Lecturer sent email about family emergency", isOfficial: false, status: "pending", upvotes: 14, downvotes: 2, createdAt: new Date(Date.now() - 300000) },
  { id: 202, courseId: 1, authorId: 7, announcementType: "materials_uploaded", title: "Week 8 slides on OurVLE", body: null, isOfficial: false, status: "pending", upvotes: 6, downvotes: 0, createdAt: new Date(Date.now() - 3600000) },
];

// ─── Announcement type options ────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES: {
  type: AnnouncementType;
  label: string;
  icon: React.ElementType;
  color: string;
  bgClass: string;
  defaultTitle: string;
}[] = [
  {
    type: "cancelled",
    label: "Class Cancelled",
    icon: AlertCircle,
    color: "text-destructive",
    bgClass: "bg-orange-light border-destructive/20",
    defaultTitle: "Today's class has been cancelled",
  },
  {
    type: "lecturer_late",
    label: "Lecturer Late",
    icon: Clock,
    color: "text-orange",
    bgClass: "bg-orange-light border-orange/20",
    defaultTitle: "Lecturer will be late today",
  },
  {
    type: "room_changed",
    label: "Room Changed",
    icon: MapPin,
    color: "text-primary",
    bgClass: "bg-teal-light border-primary/20",
    defaultTitle: "Class location has changed",
  },
  {
    type: "rescheduled",
    label: "Rescheduled",
    icon: Calendar,
    color: "text-teal-mid",
    bgClass: "bg-teal-light border-teal-mid/20",
    defaultTitle: "Class has been rescheduled",
  },
  {
    type: "materials_uploaded",
    label: "Materials",
    icon: BookMarked,
    color: "text-primary",
    bgClass: "bg-teal-light border-primary/20",
    defaultTitle: "New course materials are available",
  },
  {
    type: "general",
    label: "General",
    icon: MessageSquare,
    color: "text-muted-foreground",
    bgClass: "bg-secondary border-border",
    defaultTitle: "",
  },
];

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({
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
  const [expanded, setExpanded] = useState(false);

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
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-start gap-3 text-left">
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5",
              typeColors[announcement.announcementType] ?? typeColors.general
            )}
          >
            {typeLabels[announcement.announcementType] ?? announcement.announcementType}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">{announcement.title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(announcement.createdAt)}</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {announcement.body && (
            <p className="text-xs text-muted-foreground">{announcement.body}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>👍 {announcement.upvotes}</span>
            <span>👎 {announcement.downvotes}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Approve & Broadcast
            </button>
            <button
              onClick={onReject}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-secondary text-muted-foreground rounded-xl text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseReportingPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/courses/:id/reporting");
  const courseId = params?.id ? parseInt((params as any).id) : 0;

  const [selectedType, setSelectedType] = useState<AnnouncementType | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const {
    data: pendingAnnouncements,
    isLoading: loadingPending,
    refetch: refetchPending,
  } = trpc.courses.getPendingAnnouncements.useQuery(
    { courseId },
    { enabled: courseId > 0 }
  );

  const postMutation = trpc.courses.postAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement posted!", {
        description: "Your official update has been broadcast to all students.",
      });
      setSelectedType(null);
      setTitle("");
      setBody("");
      refetchPending();
    },
    onError: (err) => {
      toast.error("Failed to post", { description: err.message });
    },
  });

  const reviewMutation = trpc.courses.reviewAnnouncement.useMutation({
    onSuccess: (_, variables) => {
      const action = variables.status === "approved" ? "approved" : "rejected";
      toast.success(`Submission ${action}`);
      refetchPending();
    },
    onError: (err) => {
      toast.error("Error", { description: err.message });
    },
  });

  const handleSelectType = (type: AnnouncementType) => {
    const opt = ANNOUNCEMENT_TYPES.find((t) => t.type === type);
    setSelectedType(type);
    if (opt?.defaultTitle) setTitle(opt.defaultTitle);
  };

  const handlePost = () => {
    if (!selectedType || !title.trim()) {
      toast.error("Please select a type and enter a title");
      return;
    }
    postMutation.mutate({
      courseId,
      announcementType: selectedType,
      title: title.trim(),
      body: body.trim() || undefined,
      isOfficial: true,
    });
  };

  const pending = ((pendingAnnouncements as PendingAnnouncement[]) ?? []).length > 0
    ? (pendingAnnouncements as PendingAnnouncement[])
    : MOCK_PENDING;

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-12 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(courseId > 0 ? `/courses/${courseId}/rep` : "/courses")}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <h1 className="text-lg font-bold text-foreground">Course Reporting</h1>
            </div>
            <p className="text-xs text-muted-foreground">Post official updates & manage submissions</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Post official update */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Post Official Update
            </p>
          </div>

          {/* Type grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {ANNOUNCEMENT_TYPES.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedType === opt.type;
              return (
                <button
                  key={opt.type}
                  onClick={() => handleSelectType(opt.type)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-xs font-medium transition-all",
                    isSelected
                      ? `${opt.bgClass} ring-2 ring-offset-1 ring-primary/20 ${opt.color}`
                      : "bg-card border-border text-muted-foreground hover:border-primary/20"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isSelected ? opt.color : "text-muted-foreground")} />
                  <span className="text-center leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Compose form */}
          {selectedType && (
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <Input
                placeholder="Announcement title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-secondary border-border rounded-xl text-sm"
              />
              <textarea
                placeholder="Additional details (optional)..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              />
              <button
                onClick={handlePost}
                disabled={postMutation.isPending || !title.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {postMutation.isPending ? "Posting..." : "Broadcast to All Students"}
              </button>
            </div>
          )}
        </div>

        {/* Student submissions */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Student Submissions
            </p>
            <span className="text-xs text-muted-foreground">{pending.length} pending</span>
          </div>

          {loadingPending && !pendingAnnouncements ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="bg-card rounded-2xl p-6 text-center border border-border">
              <CheckCheck className="w-8 h-8 text-primary/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No pending submissions</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Student reports will appear here for review.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((ann) => (
                <SubmissionCard
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
      </div>
    </AppLayout>
  );
}
