import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  getCachedSupabaseCourses,
  loadSupabaseCourses,
  type SupabaseCourseRecord,
} from "@/lib/supabaseCourses";
import { loadCampusPlaceData, type PlaceLocation } from "@/lib/campusPlaces";
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
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReporterProfile {
  id: string;
  full_name: string;
  trust_score: number;
  avatar_url?: string;
}

interface ClassReport {
  id: string;
  course_id: number;
  reporter_id: string;
  report_type: "class_cancelled" | "room_changed" | "lecturer_late" | "class_confirmed";
  message: string;
  status: "active" | "verified" | "rejected" | "expired";
  confirmations_count: number;
  denials_count: number;
  created_at: string;
  expires_at: string;
  old_room?: string;
  new_room?: string;
  reporter?: ReporterProfile;
  user_vote?: "confirm" | "deny" | null;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  class_cancelled: "Cancelled",
  room_changed: "Room Change",
  lecturer_late: "Running Late",
  class_confirmed: "Confirmed",
};

const REPORT_TYPE_COLORS: Record<string, { color: string; bg: string; icon: any }> = {
  class_cancelled: { color: "#ef4444", bg: "#fef2f2", icon: XCircle },
  room_changed: { color: "#f59e0b", bg: "#fffbeb", icon: MapPin },
  lecturer_late: { color: "#8b5cf6", bg: "#f5f3ff", icon: Clock },
  class_confirmed: { color: "#10b981", bg: "#ecfdf5", icon: CheckCircle },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// ─── Claim Card ───────────────────────────────────────────────────────────────
function ReportCard({
  report,
  courseCode,
  onVote,
}: {
  report: ClassReport;
  courseCode: string;
  onVote: (reportId: string, vote: "confirm" | "deny") => void;
}) {
  const typeConfig = REPORT_TYPE_COLORS[report.report_type] || REPORT_TYPE_COLORS.class_confirmed;
  const Icon = typeConfig.icon;
  const total = report.confirmations_count + report.denials_count;
  const confidence = total > 0 ? Math.round((report.confirmations_count / total) * 100) : 0;

  return (
    <div 
      id={`report-${report.id}`}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Reporter Info */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700">
          {report.reporter?.full_name?.charAt(0) || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">
            {report.reporter?.full_name || "Anonymous Student"}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-black text-gray-600">{report.reporter?.trust_score ?? 50}</span>
        </div>
      </div>

      {/* Report Body */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: typeConfig.bg }}
        >
          <Icon className="w-4 h-4" style={{ color: typeConfig.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}
            >
              {REPORT_TYPE_LABELS[report.report_type]}
            </span>
            <span className="text-[10px] font-bold text-gray-400">{courseCode}</span>
          </div>
          <p className="text-sm text-gray-800 leading-snug font-medium">
            {report.message}
            {report.report_type === "room_changed" && report.new_room && (
              <span className="block mt-1 text-emerald-600 font-bold">
                → Moved to {report.new_room}
              </span>
            )}
          </p>
          <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1 font-bold uppercase tracking-widest">
            <Clock className="w-3 h-3" />
            {timeAgo(report.created_at)}
          </p>
        </div>
      </div>

      {/* Confidence bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">
            <span>{report.confirmations_count} confirmations</span>
            <span className="text-emerald-500">{confidence}% trust</span>
          </div>
          <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${confidence}%`,
                backgroundColor: confidence >= 70 ? "#10b981" : confidence >= 40 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}

      {/* Vote buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onVote(report.id, "confirm")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all shadow-sm",
            report.user_vote === "confirm"
              ? "bg-emerald-500 text-white shadow-emerald-200"
              : "bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600"
          )}
        >
          <ThumbsUp className="w-4 h-4" />
          Confirm {report.confirmations_count > 0 && `(${report.confirmations_count})`}
        </button>
        <button
          onClick={() => onVote(report.id, "deny")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all shadow-sm",
            report.user_vote === "deny"
              ? "bg-red-500 text-white shadow-red-200"
              : "bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600"
          )}
        >
          <ThumbsDown className="w-4 h-4" />
          Deny {report.denials_count > 0 && `(${report.denials_count})`}
        </button>
      </div>
    </div>
  );
}

// ─── New Report Form ──────────────────────────────────────────────────────────
function NewReportForm({
  course,
  onClose,
  onSubmit,
}: {
  course: SupabaseCourseRecord;
  onClose: () => void;
  onSubmit: (data: { type: string; message: string; newRoom?: string }) => void;
}) {
  const [reportType, setReportType] = useState<string>("class_cancelled");
  const [message, setMessage] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [roomSuggestions, setRoomSuggestions] = useState<PlaceLocation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (reportType === "room_changed" && newRoom.length > 1) {
      loadCampusPlaceData().then(data => {
        const filtered = data.placeData.locations.filter(loc => 
          loc.category === "classroom" && 
          loc.name.toLowerCase().includes(newRoom.toLowerCase())
        ).slice(0, 5);
        setRoomSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      });
    } else {
      setShowSuggestions(false);
    }
  }, [reportType, newRoom]);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-5 mb-6 animate-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-black text-gray-900 tracking-tight">
          Post Class Update
        </h3>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {Object.keys(REPORT_TYPE_LABELS).map(type => {
          const config = REPORT_TYPE_COLORS[type] || REPORT_TYPE_COLORS.class_confirmed;
          const isSelected = reportType === type;
          return (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={cn(
                "py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-left border flex items-center gap-2",
                isSelected 
                  ? "border-emerald-500 shadow-sm" 
                  : "bg-gray-50 border-gray-100 text-gray-500"
              )}
              style={isSelected ? { color: config.color, backgroundColor: config.bg } : undefined}
            >
              <config.icon className="w-3 h-3" />
              {REPORT_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {reportType === "room_changed" && (
        <div className="relative mb-4">
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-100 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <input
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              placeholder="Enter new classroom name..."
              className="bg-transparent text-sm text-gray-800 placeholder:text-gray-400 w-full focus:outline-none"
            />
          </div>
          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-gray-100 shadow-xl z-20 overflow-hidden divide-y divide-gray-50">
              {roomSuggestions.map(room => (
                <button
                  key={room.id}
                  onClick={() => {
                    setNewRoom(room.name);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left p-3 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                >
                  {room.name}
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Add more context (optional)..."
        className="w-full p-4 bg-gray-50 rounded-2xl text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-gray-100 mb-4 h-24"
      />

      <button
        onClick={() => {
          if (reportType === "room_changed" && !newRoom.trim()) {
            toast.error("Please specify the new room");
            return;
          }
          onSubmit({ type: reportType, message: message.trim(), newRoom: newRoom.trim() });
        }}
        className="w-full py-4 bg-emerald-500 text-white text-sm font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
      >
        Post to Class Chat
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClassChatPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user, loading } = useAuth();
  const requestedCourseId = useMemo(() => {
    const params = new URLSearchParams(search);
    const value = params.get("courseId");
    if (!value) return null;
    
    // Support both numeric IDs and string/UUIDs
    const numValue = Number(value);
    return Number.isInteger(numValue) ? numValue : value as any;
  }, [search]);

  const [courses, setCourses] = useState<SupabaseCourseRecord[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(requestedCourseId);
  const [reports, setReports] = useState<ClassReport[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [fetchingReports, setFetchingReports] = useState(false);

  // Scroll to report if ID provided in URL
  useEffect(() => {
    const params = new URLSearchParams(search);
    const reportId = params.get("reportId");
    if (reportId && reports.length > 0) {
      const element = document.getElementById(`report-${reportId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
        setTimeout(() => {
          element.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
        }, 3000);
      }
    }
  }, [reports, search]);

  // Load courses
  useEffect(() => {
    if (loading || !user) return;
    loadSupabaseCourses().then(setCourses);
  }, [loading, user]);

  // Load reports for selected course
  const fetchReports = useCallback(async () => {
    if (!selectedCourse) return;
    setFetchingReports(true);
    try {
      // 1. Fetch class reports directly (no joins)
      const { data: reportsData, error: reportsError } = await supabase
        .from("class_reports")
        .select("*")
        .eq("course_id", selectedCourse)
        .order("created_at", { ascending: false });

      if (reportsError) throw reportsError;
      
      if (!reportsData || reportsData.length === 0) {
        setReports([]);
        return;
      }

      // 2. Extract unique reporter IDs to fetch their info separately
      const reporterIds = Array.from(new Set(reportsData.map(r => r.reporter_id)));
      const reportIds = reportsData.map(r => r.id);

      // 3. Fetch profiles, trust scores, and current user's votes in parallel
      const [profilesRes, trustRes, votesRes] = await Promise.all([
        supabase.from("profiles").select("*").in("id", reporterIds),
        supabase.from("user_trust_profiles").select("user_id, trust_score").in("user_id", reporterIds),
        supabase.from("class_report_votes").select("*").in("report_id", reportIds)
      ]);

      const profilesMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const trustMap = new Map((trustRes.data || []).map(t => [t.user_id, t.trust_score]));
      const allVotes = votesRes.data || [];

      // 4. Format reports by merging the data manually
      const formattedReports = reportsData.map(r => ({
        ...r,
        user_vote: allVotes.find(v => v.report_id === r.id && v.user_id === user?.id)?.vote_type || null,
        reporter: {
          ...(profilesMap.get(r.reporter_id) || {}),
          trust_score: trustMap.get(r.reporter_id) ?? 50
        }
      }));

      setReports(formattedReports);
    } catch (err) {
      console.error("Error fetching reports:", err);
      toast.error("Failed to load class updates");
    } finally {
      setFetchingReports(false);
    }
  }, [selectedCourse, user?.id]);

  useEffect(() => {
    if (!selectedCourse) {
      setReports([]);
      return;
    }

    void fetchReports();

    // Real-time subscription for reports AND votes
    const channel = supabase
      .channel(`class-data-${selectedCourse}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_reports", filter: `course_id=eq.${selectedCourse}` },
        (payload) => {
          console.log("Realtime report change:", payload);
          void fetchReports();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_report_votes" },
        (payload) => {
          console.log("Realtime vote change:", payload);
          void fetchReports();
        }
      )
      .subscribe((status) => {
        console.log(`Supabase subscription status for course ${selectedCourse}:`, status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedCourse, fetchReports]);

  const handleVote = async (reportId: string, voteType: "confirm" | "deny") => {
    if (!user) return;

    try {
      // Get the real Supabase UUID for the voter
      const { data: { session } } = await supabase.auth.getSession();
      const voterUuid = session?.user.id;

      if (!voterUuid) {
        toast.error("You must be logged in to vote");
        return;
      }

      // Check if already voted
      const report = reports.find(r => r.id === reportId);
      if (report?.user_vote === voteType) {
        // Remove vote
        await supabase
          .from("class_report_votes")
          .delete()
          .eq("report_id", reportId)
          .eq("user_id", voterUuid);
      } else {
        // Upsert vote
        await supabase
          .from("class_report_votes")
          .upsert({
            report_id: reportId,
            user_id: voterUuid,
            vote_type: voteType
          }, { onConflict: "report_id,user_id" });
      }
      // Manual refresh for instant feedback
      void fetchReports();
    } catch (err) {
      console.error("Error voting:", err);
      toast.error("Failed to register your vote");
    }
  };

  const handleSubmitReport = async (data: { type: string; message: string; newRoom?: string }) => {
    // Ensure we have a valid integer course ID and a logged in user
    const courseId = selectedCourseData?.id || selectedCourse;
    if (!user || !courseId) {
      toast.error("Please select a course first");
      return;
    }

    try {
      // Ensure the report type matches the database constraint exactly
      let reportType = data.type;
      if (reportType === "confirmed") reportType = "class_confirmed";
      if (reportType === "cancelled") reportType = "class_cancelled";
      if (reportType === "late") reportType = "lecturer_late";

      // Final check against allowed types
      const allowedTypes = ["class_cancelled", "room_changed", "lecturer_late", "class_confirmed"];
      if (!allowedTypes.includes(reportType)) {
        console.error("Invalid report type:", reportType);
        toast.error("Invalid report type selected");
        return;
      }

      // Get the real Supabase UUID for the reporter
      const { data: { session } } = await supabase.auth.getSession();
      const reporterUuid = session?.user.id;

      if (!reporterUuid) {
        toast.error("You must be logged in to post updates");
        return;
      }

      const { error } = await supabase.from("class_reports").insert({
        course_id: courseId,
        reporter_id: reporterUuid,
        report_type: reportType,
        message: data.message || `Class update: ${REPORT_TYPE_LABELS[data.type] || reportType}`,
        old_room: reportType === "room_changed" ? selectedCourseData?.room : null,
        new_room: reportType === "room_changed" ? data.newRoom : null,
      });

      if (error) throw error;

      toast.success("Update posted to the class!");
      setShowNewForm(false);
      void fetchReports();
    } catch (err) {
      console.error("Error submitting report:", err);
      toast.error("Failed to post update");
    }
  };

  const selectedCourseData = courses.find(c => c.id === selectedCourse);

  if (loading) return null;
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="courses">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-5 pt-12 pb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {selectedCourse && (
            <button
              onClick={() => {
                setSelectedCourse(null);
                setShowNewForm(false);
              }}
              className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900 truncate tracking-tight">
              {selectedCourseData ? selectedCourseData.courseName : "Class Chat"}
            </h1>
            {selectedCourseData && (
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.2em] mt-1">
                {selectedCourseData.courseCode} · {selectedCourseData.room || "TBA"}
              </p>
            )}
          </div>
          {selectedCourse && (
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95",
                showNewForm ? "bg-red-500 text-white shadow-red-200" : "bg-emerald-500 text-white shadow-emerald-200"
              )}
            >
              {showNewForm ? <XCircle className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-6">
        {!selectedCourse ? (
          /* Course list */
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Select Course</span>
            </div>
            {courses.map(course => (
              <button
                key={course.id}
                onClick={() => setSelectedCourse(course.id)}
                className="w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-all text-left active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-gray-900 truncate tracking-tight">
                    {course.courseName}
                  </p>
                  <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">
                    {course.courseCode} · {course.lecturer || "TBA"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </button>
            ))}
          </div>
        ) : (
          /* Reports for selected course */
          <div className="max-w-xl mx-auto">
            {showNewForm && selectedCourseData && (
              <NewReportForm
                course={selectedCourseData}
                onClose={() => setShowNewForm(false)}
                onSubmit={handleSubmitReport}
              />
            )}

            {fetchingReports ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-48 bg-gray-50 animate-pulse rounded-3xl" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm px-6">
                <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                  <CheckCircle className="w-10 h-10 text-emerald-300" />
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-2">No updates yet</h3>
                <p className="text-sm font-medium text-gray-400 mb-8 max-w-[240px]">
                  Everything seems to be running smoothly. Be the first to post if anything changes!
                </p>
                <button
                  onClick={() => setShowNewForm(true)}
                  className="flex items-center gap-3 px-8 py-4 bg-emerald-500 text-white text-sm font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Post First Update
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    courseCode={selectedCourseData?.courseCode || ""}
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
