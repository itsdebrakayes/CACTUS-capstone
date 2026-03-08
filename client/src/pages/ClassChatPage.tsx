import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Mock enrolled courses ────────────────────────────────────────────────────
const MOCK_COURSES = [
  { id: 1, code: "PSYC1001", name: "Introduction to Psychology", room: "SLT 2", professor: "Dr. Williams" },
  { id: 2, code: "STAT2202", name: "Advanced Statistics", room: "Lab 4", professor: "Prof. Miller" },
  { id: 3, code: "COMP3161", name: "Database Management", room: "FST 1", professor: "Dr. Brown" },
  { id: 4, code: "MATH2401", name: "Calculus II", room: "FST 3", professor: "Dr. Clarke" },
];

// ─── Mock claims ──────────────────────────────────────────────────────────────
const MOCK_CLAIMS = [
  {
    id: 1,
    courseId: 1,
    claimType: "cancelled" as const,
    message: "Lecturer sent email — class is cancelled today",
    confirmCount: 8,
    denyCount: 1,
    status: "confirmed" as const,
    createdAt: new Date(Date.now() - 1000 * 60 * 20),
    userVote: null as "confirm" | "deny" | null,
  },
  {
    id: 2,
    courseId: 2,
    claimType: "room_change" as const,
    message: "Stats moved to Room 205 due to maintenance",
    confirmCount: 5,
    denyCount: 2,
    status: "active" as const,
    createdAt: new Date(Date.now() - 1000 * 60 * 45),
    userVote: "confirm" as "confirm" | "deny" | null,
  },
  {
    id: 3,
    courseId: 3,
    claimType: "late" as const,
    message: "Dr. Brown running 15 mins late",
    confirmCount: 3,
    denyCount: 0,
    status: "active" as const,
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
    userVote: null as "confirm" | "deny" | null,
  },
];

type ClaimType = "cancelled" | "room_change" | "time_change" | "late" | "other";

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  cancelled: "Cancelled",
  room_change: "Room Change",
  time_change: "Time Change",
  late: "Running Late",
  other: "Other",
};

const CLAIM_TYPE_COLORS: Record<ClaimType, { color: string; bg: string; icon: typeof XCircle }> = {
  cancelled: { color: "#e53935", bg: "#ffebee", icon: XCircle },
  room_change: { color: "#e65100", bg: "#fff3e0", icon: AlertTriangle },
  time_change: { color: "#1565c0", bg: "#e3f0ff", icon: Clock },
  late: { color: "#7b1fa2", bg: "#f3e5f5", icon: Clock },
  other: { color: "#455a64", bg: "#eceff1", icon: MessageSquare },
};

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Claim Card ───────────────────────────────────────────────────────────────
function ClaimCard({
  claim,
  courseName,
  onVote,
}: {
  claim: (typeof MOCK_CLAIMS)[0];
  courseName: string;
  onVote: (claimId: number, vote: "confirm" | "deny") => void;
}) {
  const typeConfig = CLAIM_TYPE_COLORS[claim.claimType];
  const Icon = typeConfig.icon;
  const total = claim.confirmCount + claim.denyCount;
  const confirmPct = total > 0 ? Math.round((claim.confirmCount / total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      {/* Header */}
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
              style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}
            >
              {CLAIM_TYPE_LABELS[claim.claimType]}
            </span>
            <span className="text-[10px] text-gray-400">{courseName}</span>
          </div>
          <p className="text-sm text-gray-800 leading-snug">{claim.message}</p>
          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(claim.createdAt)}</p>
        </div>
      </div>

      {/* Confidence bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>{claim.confirmCount} confirmed</span>
            <span>{confirmPct}% confidence</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${confirmPct}%`,
                backgroundColor: confirmPct >= 60 ? "#00c853" : confirmPct >= 40 ? "#e65100" : "#e53935",
              }}
            />
          </div>
        </div>
      )}

      {/* Vote buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onVote(claim.id, "confirm")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            claim.userVote === "confirm"
              ? "bg-[#00c853] text-white"
              : "bg-[#f5f7fa] text-gray-600 hover:bg-[#e8faf0] hover:text-[#00c853]"
          )}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          Confirm ({claim.confirmCount})
        </button>
        <button
          onClick={() => onVote(claim.id, "deny")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
            claim.userVote === "deny"
              ? "bg-[#e53935] text-white"
              : "bg-[#f5f7fa] text-gray-600 hover:bg-[#ffebee] hover:text-[#e53935]"
          )}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          Deny ({claim.denyCount})
        </button>
      </div>
    </div>
  );
}

// ─── New Claim Form ───────────────────────────────────────────────────────────
function NewClaimForm({
  courseId,
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">New Class Update</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {(Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map((type) => {
          const config = CLAIM_TYPE_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => setClaimType(type)}
              className={cn(
                "py-2 px-3 rounded-xl text-xs font-medium transition-all text-left",
                claimType === type
                  ? "text-white"
                  : "bg-[#f5f7fa] text-gray-600"
              )}
              style={claimType === type ? { backgroundColor: config.color } : undefined}
            >
              {CLAIM_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Describe the update (e.g. 'Lecturer confirmed class is cancelled via email')"
        className="w-full p-3 bg-[#f5f7fa] rounded-xl text-sm text-gray-700 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#00c853]/30 mb-3"
        rows={3}
        maxLength={500}
      />

      <button
        onClick={() => {
          if (!message.trim()) { toast.error("Please describe the update"); return; }
          onSubmit(claimType, message.trim());
        }}
        className="w-full py-2.5 bg-[#00c853] text-white text-sm font-semibold rounded-xl hover:bg-[#00b84a] transition-colors"
      >
        Post Update
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClassChatPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [claims, setClaims] = useState(MOCK_CLAIMS);

  const createClaimMutation = trpc.classes.createClaim.useMutation({
    onSuccess: () => {
      toast.success("Update posted!");
      setShowNewClaim(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const voteClaimMutation = trpc.classes.voteClaim.useMutation({
    onError: (err) => toast.error(err.message),
  });

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const handleVote = (claimId: number, vote: "confirm" | "deny") => {
    // Optimistic update
    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== claimId) return c;
        const wasConfirm = c.userVote === "confirm";
        const wasDeny = c.userVote === "deny";
        const newVote = c.userVote === vote ? null : vote;
        return {
          ...c,
          userVote: newVote,
          confirmCount: c.confirmCount
            + (vote === "confirm" && !wasConfirm ? 1 : 0)
            - (vote === "confirm" && wasConfirm ? 1 : 0)
            - (vote === "deny" && wasConfirm ? 1 : 0),
          denyCount: c.denyCount
            + (vote === "deny" && !wasDeny ? 1 : 0)
            - (vote === "deny" && wasDeny ? 1 : 0)
            - (vote === "confirm" && wasDeny ? 1 : 0),
        };
      })
    );
    // Real API call
    voteClaimMutation.mutate({ claimId, vote });
  };

  const handleNewClaim = (type: ClaimType, message: string) => {
    if (!selectedCourse) return;
    createClaimMutation.mutate({
      courseId: selectedCourse,
      claimType: type,
      message,
    });
  };

  const selectedCourseData = MOCK_COURSES.find((c) => c.id === selectedCourse);
  const courseClaims = claims.filter((c) => c.courseId === selectedCourse);

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {selectedCourse && (
            <button
              onClick={() => { setSelectedCourse(null); setShowNewClaim(false); }}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <h1 className="text-lg font-bold text-gray-900 flex-1">
            {selectedCourseData ? selectedCourseData.name : "Class Chat"}
          </h1>
          {selectedCourse && (
            <button
              onClick={() => setShowNewClaim(!showNewClaim)}
              className="w-8 h-8 rounded-full bg-[#00c853] flex items-center justify-center shadow-sm"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
        {selectedCourseData && (
          <p className="text-xs text-gray-500 mt-0.5 ml-11">
            {selectedCourseData.code} · {selectedCourseData.room}
          </p>
        )}
      </div>

      <div className="px-4 py-3">
        {!selectedCourse ? (
          /* Course list */
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-3">
              Select a course to view and post class updates
            </p>
            {MOCK_COURSES.map((course) => {
              const courseClaims = claims.filter((c) => c.courseId === course.id);
              const activeClaims = courseClaims.filter((c) => c.status === "active");
              return (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourse(course.id)}
                  className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#e8faf0] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-[#00c853]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{course.name}</p>
                    <p className="text-xs text-gray-500">{course.code} · {course.professor}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeClaims.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#e53935] text-white text-[10px] font-bold flex items-center justify-center">
                        {activeClaims.length}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Claims for selected course */
          <div>
            {showNewClaim && (
              <NewClaimForm
                courseId={selectedCourse}
                onClose={() => setShowNewClaim(false)}
                onSubmit={handleNewClaim}
              />
            )}

            {courseClaims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#f5f7fa] flex items-center justify-center mb-3">
                  <CheckCircle className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">No updates yet</p>
                <p className="text-xs text-gray-400 mb-4">Be the first to post a class update</p>
                <button
                  onClick={() => setShowNewClaim(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#00c853] text-white text-sm font-semibold rounded-xl"
                >
                  <Plus className="w-4 h-4" />
                  Post Update
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {courseClaims.map((claim) => {
                  const course = MOCK_COURSES.find((c) => c.id === claim.courseId);
                  return (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      courseName={course?.code || ""}
                      onVote={handleVote}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
