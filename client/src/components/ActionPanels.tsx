import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, BookOpen, CheckCircle2, ThumbsUp, ThumbsDown, Clock } from "lucide-react";
import { toast } from "sonner";

interface ActionPanelsProps {
  userLat: number;
  userLng: number;
  destLat?: number | null;
  destLng?: number | null;
  onRequestDestSelect?: () => void;
  onCheckinCreated?: (checkinId: number) => void;
}

type ClaimType = "cancelled" | "room_change" | "time_change" | "late" | "other";
type ReportType = "light_out" | "broken_path" | "flooding" | "obstruction" | "suspicious";

/**
 * Combined panel for Class Claims, Caution Reports, and Check-Ins
 */
export function ActionPanels({ userLat, userLng, destLat, destLng, onRequestDestSelect, onCheckinCreated }: ActionPanelsProps) {
  const [activeTab, setActiveTab] = useState<"claim" | "report" | "checkin">("claim");

  // ============================================================================
  // CLASS CLAIMS
  // ============================================================================
  const [claimType, setClaimType] = useState<ClaimType>("cancelled");
  const [claimMessage, setClaimMessage] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseIdForList, setCourseIdForList] = useState<number | null>(null);

  const { data: claims, refetch: refetchClaims } = trpc.classes.getClaimsByCourse.useQuery(
    { courseId: courseIdForList! },
    { enabled: courseIdForList != null }
  );

  const createClaimMutation = trpc.classes.createClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim created!");
      setClaimMessage("");
      if (courseIdForList) refetchClaims();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const voteClaimMutation = trpc.classes.voteClaim.useMutation({
    onSuccess: () => {
      toast.success("Vote recorded!");
      if (courseIdForList) refetchClaims();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleCreateClaim = async () => {
    if (!courseId || !claimMessage) { toast.error("Please fill in all fields"); return; }
    await createClaimMutation.mutateAsync({ courseId: parseInt(courseId), claimType, message: claimMessage });
  };

  const handleLoadClaims = () => {
    if (!courseId) { toast.error("Enter a course ID first"); return; }
    setCourseIdForList(parseInt(courseId));
  };

  // ============================================================================
  // CAUTION REPORTS
  // ============================================================================
  const [reportType, setReportType] = useState<ReportType>("light_out");
  const [severity, setSeverity] = useState<number>(2);
  const [reportMessage, setReportMessage] = useState("");

  const { data: reports, refetch: refetchReports } = trpc.reports.getReports.useQuery({});

  const createReportMutation = trpc.reports.createReport.useMutation({
    onSuccess: () => {
      toast.success("Hazard reported!");
      setReportMessage("");
      refetchReports();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const voteReportMutation = trpc.reports.voteReport.useMutation({
    onSuccess: () => {
      toast.success("Vote recorded!");
      refetchReports();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleCreateReport = async () => {
    if (!reportMessage) { toast.error("Please describe the hazard"); return; }
    await createReportMutation.mutateAsync({
      reportType,
      severity,
      lat: userLat,
      lng: userLng,
      description: reportMessage,
    });
  };

  // ============================================================================
  // CHECK-INS
  // ============================================================================
  const [etaMinutes, setEtaMinutes] = useState(30);
  const [graceMinutes, setGraceMinutes] = useState(5);
  const [emergencyContact, setEmergencyContact] = useState("");

  const { data: activeCheckins, refetch: refetchCheckins } = trpc.checkins.getActiveCheckins.useQuery();

  const createCheckinMutation = trpc.checkins.createCheckin.useMutation({
    onSuccess: (data) => {
      toast.success("Check-in started! We'll alert you if you don't arrive.");
      refetchCheckins();
      onCheckinCreated?.(data.checkinId);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const completeCheckinMutation = trpc.checkins.completeCheckin.useMutation({
    onSuccess: () => {
      toast.success("Check-in completed!");
      refetchCheckins();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleCreateCheckin = async () => {
    if (destLat == null || destLng == null) {
      toast.error("Please select a destination on the map first");
      onRequestDestSelect?.();
      return;
    }
    const etaAt = new Date(Date.now() + etaMinutes * 60 * 1000);
    await createCheckinMutation.mutateAsync({
      destLat,
      destLng,
      etaAt,
      graceMinutes,
      emergencyContact: emergencyContact || undefined,
    });
  };

  const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
    cancelled: "Cancelled",
    room_change: "Room Change",
    time_change: "Time Change",
    late: "Lecturer Late",
    other: "Other",
  };

  const REPORT_TYPE_LABELS: Record<ReportType, string> = {
    light_out: "Light Out",
    broken_path: "Broken Path",
    flooding: "Flooding",
    obstruction: "Obstruction",
    suspicious: "Suspicious Activity",
  };

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    active: "bg-blue-100 text-blue-800",
    expired: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-3">
      {/* Tab buttons */}
      <div className="flex gap-1.5">
        <Button
          variant={activeTab === "claim" ? "default" : "outline"}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setActiveTab("claim")}
        >
          <BookOpen className="w-3 h-3 mr-1" />
          Claims
        </Button>
        <Button
          variant={activeTab === "report" ? "default" : "outline"}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setActiveTab("report")}
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          Reports
        </Button>
        <Button
          variant={activeTab === "checkin" ? "default" : "outline"}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setActiveTab("checkin")}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Check-In
        </Button>
      </div>

      {/* ===================== CLASS CLAIMS ===================== */}
      {activeTab === "claim" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Report Class Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  placeholder="Course ID"
                  className="text-xs"
                />
                <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={handleLoadClaims}>
                  Load
                </Button>
              </div>
              <Select value={claimType} onValueChange={(v) => setClaimType(v as ClaimType)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CLAIM_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                placeholder="Describe the class update..."
                className="text-xs"
                rows={2}
              />
              <Button
                className="w-full text-xs"
                onClick={handleCreateClaim}
                disabled={createClaimMutation.isPending}
              >
                {createClaimMutation.isPending ? "Submitting..." : "Submit Claim"}
              </Button>
            </CardContent>
          </Card>

          {/* Claims list */}
          {claims && claims.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground px-1">
                {claims.length} claim{claims.length !== 1 ? "s" : ""} for course {courseIdForList}
              </p>
              {claims.map((claim) => (
                <Card key={claim.id} className="text-xs">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {CLAIM_TYPE_LABELS[claim.claimType as ClaimType] || claim.claimType}
                          </Badge>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[claim.status] || "bg-gray-100 text-gray-600"}`}>
                            {claim.status}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground line-clamp-2">{claim.message}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => voteClaimMutation.mutate({ claimId: claim.id, vote: "confirm" })}
                        disabled={voteClaimMutation.isPending}
                      >
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        {(claim as any).confirmCount ?? 0}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => voteClaimMutation.mutate({ claimId: claim.id, vote: "deny" })}
                        disabled={voteClaimMutation.isPending}
                      >
                        <ThumbsDown className="w-3 h-3 mr-1" />
                        {(claim as any).denyCount ?? 0}
                      </Button>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(claim.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {claims && claims.length === 0 && courseIdForList && (
            <p className="text-xs text-muted-foreground text-center py-4">No claims for this course yet.</p>
          )}
        </div>
      )}

      {/* ===================== CAUTION REPORTS ===================== */}
      {activeTab === "report" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Report Hazard at Your Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium shrink-0">Severity:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                        severity === s
                          ? "text-white shadow-sm scale-110"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      style={severity === s ? {
                        background: ["#fbbf24","#f97316","#ef4444","#dc2626","#7f1d1d"][s-1]
                      } : undefined}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={reportMessage}
                onChange={(e) => setReportMessage(e.target.value)}
                placeholder="Describe the hazard..."
                className="text-xs"
                rows={2}
              />
              <Button
                className="w-full text-xs"
                onClick={handleCreateReport}
                disabled={createReportMutation.isPending}
              >
                {createReportMutation.isPending ? "Reporting..." : "Report Hazard"}
              </Button>
            </CardContent>
          </Card>

          {/* Reports list */}
          {reports && reports.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground px-1">
                {reports.length} active report{reports.length !== 1 ? "s" : ""}
              </p>
              {reports.map((report) => (
                <Card key={report.id} className="text-xs">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white"
                            style={{ background: ["#fbbf24","#f97316","#ef4444","#dc2626","#7f1d1d"][(report.severity || 1) - 1] }}
                          >
                            S{report.severity}
                          </span>
                          <span className="font-medium">{REPORT_TYPE_LABELS[report.reportType as ReportType] || report.reportType}</span>
                        </div>
                        {report.description && (
                          <p className="mt-1 text-muted-foreground line-clamp-2">{report.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px]">{report.ttlMinutes}m</span>
                      </div>
                    </div>
                    {/* TTL bar */}
                    <div className="w-full bg-muted rounded-full h-1">
                      <div
                        className="h-1 rounded-full ttl-bar"
                        style={{
                          width: `${Math.min(100, ((report.ttlMinutes || 0) / 120) * 100)}%`,
                          background: ["#fbbf24","#f97316","#ef4444","#dc2626","#7f1d1d"][(report.severity || 1) - 1],
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => voteReportMutation.mutate({ reportId: report.id, vote: "still_there" })}
                        disabled={voteReportMutation.isPending}
                      >
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        {(report as any).stillThereCount ?? 0} Still there
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => voteReportMutation.mutate({ reportId: report.id, vote: "not_there" })}
                        disabled={voteReportMutation.isPending}
                      >
                        <ThumbsDown className="w-3 h-3 mr-1" />
                        {(report as any).notThereCount ?? 0} Gone
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {reports && reports.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No active hazard reports nearby.</p>
          )}
        </div>
      )}

      {/* ===================== CHECK-IN ===================== */}
      {activeTab === "checkin" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Start Safety Check-In</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Destination selector */}
              <div>
                <label className="text-xs font-medium">Destination</label>
                {destLat != null && destLng != null ? (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-purple-50 border border-purple-200 rounded px-2 py-1.5 text-xs text-purple-800">
                      📍 {destLat.toFixed(4)}, {destLng.toFixed(4)}
                    </div>
                    <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={onRequestDestSelect}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="mt-1 w-full text-xs border-dashed"
                    onClick={onRequestDestSelect}
                  >
                    📍 Click to select on map
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">ETA (minutes)</label>
                  <Input
                    type="number"
                    value={etaMinutes}
                    onChange={(e) => setEtaMinutes(parseInt(e.target.value) || 30)}
                    className="mt-1 text-xs"
                    min="1"
                    max="480"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Grace (minutes)</label>
                  <Input
                    type="number"
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(parseInt(e.target.value) || 5)}
                    className="mt-1 text-xs"
                    min="1"
                    max="60"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium">Emergency Contact (optional)</label>
                <Input
                  type="tel"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="+1 (876) 555-0100"
                  className="mt-1 text-xs"
                />
              </div>

              <Button
                className="w-full text-xs"
                onClick={handleCreateCheckin}
                disabled={createCheckinMutation.isPending}
              >
                {createCheckinMutation.isPending ? "Starting..." : "Start Check-In"}
              </Button>
            </CardContent>
          </Card>

          {/* Active check-ins */}
          {activeCheckins && activeCheckins.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground px-1">Active Check-Ins</p>
              {activeCheckins.map((ci) => (
                <Card key={ci.id} className="border-blue-200 bg-blue-50/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">Check-In #{ci.id}</p>
                        <p className="text-[10px] text-muted-foreground">
                          ETA: {new Date(ci.etaAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {ci.emergencyContact && ` · 📞 ${ci.emergencyContact}`}
                        </p>
                      </div>
                      <Badge className="text-[10px] bg-blue-600">Active</Badge>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => completeCheckinMutation.mutate({ checkinId: ci.id })}
                      disabled={completeCheckinMutation.isPending}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      I've Arrived — Complete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
