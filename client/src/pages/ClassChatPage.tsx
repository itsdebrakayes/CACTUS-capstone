import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import AppLayout from "@/components/AppLayout";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Plus,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  BookOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ClaimType = "cancelled" | "room_change" | "time_change" | "late" | "other";

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  cancelled: "Cancelled",
  room_change: "Room Change",
  time_change: "Time Change",
  late: "Running Late",
  other: "Other",
};

const CLAIM_TYPE_COLORS: Record<ClaimType, { color: string; bg: string; icon: typeof XCircle }> = {
  cancelled: { color: "hsl(18 100% 50%)", bg: "hsl(18 100% 95%)", icon: XCircle },
  room_change: { color: "hsl(185 100% 23%)", bg: "hsl(185 40% 92%)", icon: AlertTriangle },
  time_change: { color: "hsl(185 60% 40%)", bg: "hsl(185 40% 92%)", icon: Clock },
  late: { color: "hsl(18 100% 50%)", bg: "hsl(18 100% 95%)", icon: Clock },
  other: { color: "hsl(0 0% 40%)", bg: "hsl(47 19% 90%)", icon: MessageSquare },
};

const FILTER_TYPES = [
  { key: "all", label: "All" },
  { key: "cancelled", label: "Cancelled" },
  { key: "room_change", label: "Room" },
  { key: "late", label: "Late" },
  { key: "other", label: "Other" },
];

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function ClaimCard({
  claim,
  courseName,
  onVote,
}: {
  claim: {
    id: number;
    claimType: string;
    message: string;
    confirmCount: number;
    denyCount: number;
    status: string;
    createdAt: Date | string;
    userVote?: number | null;
  };
  courseName: string;
  onVote: (claimId: number, vote: "confirm" | "deny") => void;
}) {
  const claimTypeKey = (claim.claimType as ClaimType) in CLAIM_TYPE_COLORS
    ? (claim.claimType as ClaimType)
    : "other";
  const typeConfig = CLAIM_TYPE_COLORS[claimTypeKey];
  const Icon = typeConfig.icon;
  const total = claim.confirmCount + claim.denyCount;
  const confirmPct = total > 0 ? Math.round((claim.confirmCount / total) * 100) : 0;
  const userVoteDir = claim.userVote != null ? (claim.userVote > 0 ? "confirm" : "deny") : null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: typeConfig.bg }}
        >
          <Icon className="w-4 h-4" style={{ color: typeConfig.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                color: typeConfig.color,
                backgroundColor: typeConfig.bg,
              }}
            >
              {CLAIM_TYPE_LABELS[claimTypeKey]}
            </span>
            <span className="text-[10px] text-muted-foreground">{courseName}</span>
          </div>
          <p className="text-sm text-foreground leading-snug">{claim.message}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(claim.createdAt)}</p>
        </div>
      </div>
      {total > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{claim.confirmCount} approved</span>
            <span>{confirmPct}% confidence</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${confirmPct}%`,
                backgroundColor:
                  confirmPct >= 60 ? "hsl(185 100% 23%)" : confirmPct >= 40 ? "hsl(18 100% 50%)" : "hsl(0 60% 50%)",
              }}
            />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onVote(claim.id, "confirm")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            userVoteDir === "confirm"
              ? "bg-primary text-primary-foreground"
              : "bg-teal-light text-primary hover:bg-primary/20"
          )}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          Approve ({claim.confirmCount})
        </button>
        <button
          onClick={() => onVote(claim.id, "deny")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            userVoteDir === "deny"
              ? "bg-destructive text-primary-foreground"
              : "bg-orange-light text-destructive hover:bg-destructive/20"
          )}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          Disapprove ({claim.denyCount})
        </button>
      </div>
    </div>
  );
}

function NewClaimForm({
  courseId: _courseId,
  onClose,
  onSubmit,
}: {
  courseId: number;
  onClose: () => void;
  onSubmit: (type: ClaimType, message: string) => void;
}) {
  const [claimType, setClaimType] = useState<ClaimType>("cancelled");
  const [message, setMessage] = useState("");
  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">New Class Update</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map(type => {
          const config = CLAIM_TYPE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => setClaimType(type)}
              className={cn(
                "py-2 px-3 rounded-xl text-xs font-medium transition-all text-left",
                claimType === type ? "text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}
              style={
                claimType === type
                  ? { backgroundColor: config.color }
                  : undefined
              }
            >
              {CLAIM_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Describe the update..."
        className="w-full p-3 bg-secondary rounded-xl text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        rows={3}
        maxLength={500}
      />
      <button
        onClick={() => {
          if (!message.trim()) {
            toast.error("Please describe the update");
            return;
          }
          onSubmit(claimType, message.trim());
        }}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
      >
        Post Update
      </button>
    </div>
  );
}

export default function ClassChatPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user, loading } = useAuth();
  const queryParams = useMemo(() => {
    return new URLSearchParams(search);
  }, [search]);
  const requestedCourseId = useMemo(() => {
    const value = Number(queryParams.get("courseId"));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [queryParams]);
  const cachedCourses = getCachedSupabaseCourses();
  const [courses, setCourses] = useState<ChatCourse[]>(() => {
    const mappedCourses = mapSupabaseCourses(cachedCourses);
    if (mappedCourses.length > 0) {
      return mappedCourses;
    }
    return requestedCourseId == null ? MOCK_COURSES : [];
  });
  const [selectedCourse, setSelectedCourse] = useState<number | null>(
    requestedCourseId
  );
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const utils = trpc.useUtils();

  const { data: myCourses, isLoading: coursesLoading } = trpc.courses.getMyCourses.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: rawClaims, isLoading: claimsLoading } = trpc.classes.getClaimsByCourse.useQuery(
    { courseId: selectedCourse! },
    { enabled: !!selectedCourse }
  );

  const createClaimMutation = trpc.classes.createClaim.useMutation({
    onSuccess: () => {
      toast.success("Update posted!");
      setShowNewClaim(false);
      if (selectedCourse) void utils.classes.getClaimsByCourse.invalidate({ courseId: selectedCourse });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const voteClaimMutation = trpc.classes.voteClaim.useMutation({
    onSuccess: () => {
      if (selectedCourse) void utils.classes.getClaimsByCourse.invalidate({ courseId: selectedCourse });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!loading && !user) { navigate("/login"); return null; }

  const handleVote = (claimId: number, vote: "confirm" | "deny") => {
    voteClaimMutation.mutate({ claimId, vote });
  };

  const handleNewClaim = (type: ClaimType, message: string) => {
    if (!selectedCourse) return;
    createClaimMutation.mutate({ courseId: selectedCourse, claimType: type, message });
  };

  const selectedCourseData = myCourses?.find((c) => c.id === selectedCourse);
  const courseClaims = (rawClaims ?? []).filter(
    (c) => activeFilter === "all" || c.claimType === activeFilter
  );

  return (
    <AppLayout activeTab="courses">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        {selectedCourse ? (
          <button
            onClick={() => { setSelectedCourse(null); setShowNewClaim(false); setActiveFilter("all"); }}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        ) : (
          <div className="w-8 h-8 rounded-full bg-teal-light flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">
            {selectedCourseData ? selectedCourseData.courseName : "Class Updates"}
          </h1>
        </div>
        {selectedCourse && (
          <button
            onClick={() => setShowNewClaim(!showNewClaim)}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
          >
            <Plus className="w-4 h-4 text-primary-foreground" />
          </button>
        )}
      </div>
      {selectedCourseData && (
        <p className="text-xs text-muted-foreground px-4 py-1 bg-card border-b border-border">
          {selectedCourseData.courseCode} &middot; {selectedCourseData.room ?? "\u2014"}
        </p>
      )}
      {selectedCourse && (
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
          </div>
        </div>
      )}
      <div className="px-4 py-3">
        {!selectedCourse ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">Select a course to view and post class updates</p>
            {coursesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (myCourses ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                  <BookOpen className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No courses yet</p>
                <p className="text-xs text-muted-foreground">Enrol in courses to see class updates</p>
              </div>
            ) : (
              (myCourses ?? []).map((course) => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourse(course.id)}
                  className="w-full bg-card rounded-xl border border-border p-4 flex items-center gap-3 hover:border-primary/30 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-light flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{course.courseName}</p>
                    <p className="text-xs text-muted-foreground">{course.courseCode} &middot; {course.lecturer ?? "\u2014"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        ) : (
          <div>
            {showNewClaim && (
              <NewClaimForm
                courseId={selectedCourse}
                onClose={() => setShowNewClaim(false)}
                onSubmit={handleNewClaim}
              />
            )}
            {claimsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : courseClaims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                  <CheckCircle className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No updates yet</p>
                <p className="text-xs text-muted-foreground mb-4">Be the first to post a class update</p>
                <button
                  onClick={() => setShowNewClaim(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl"
                >
                  <Plus className="w-4 h-4" />
                  Post Update
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {courseClaims.map((claim) => (
                  <ClaimCard
                    key={claim.id}
                    claim={{
                      id: claim.id,
                      claimType: claim.claimType ?? "other",
                      message: claim.message,
                      confirmCount: claim.confirmCount,
                      denyCount: claim.denyCount,
                      status: claim.status ?? "active",
                      createdAt: claim.createdAt,
                      userVote: claim.userVote,
                    }}
                    courseName={selectedCourseData?.courseCode ?? ""}
                    onVote={handleVote}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
