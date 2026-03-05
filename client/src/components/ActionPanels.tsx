import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, BookOpen, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ActionPanelsProps {
  userLat: number;
  userLng: number;
}

/**
 * Combined panel for Class Claims, Caution Reports, and Check-Ins
 */
export function ActionPanels({ userLat, userLng }: ActionPanelsProps) {
  const [activeTab, setActiveTab] = useState<"claim" | "report" | "checkin">("claim");

  // ============================================================================
  // CLASS CLAIMS
  // ============================================================================

  const [claimType, setClaimType] = useState("cancellation");
  const [claimMessage, setClaimMessage] = useState("");
  const [courseId, setCourseId] = useState("");

  const createClaimMutation = trpc.claims.createClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim created!");
      setClaimMessage("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateClaim = async () => {
    if (!courseId || !claimMessage) {
      toast.error("Please fill in all fields");
      return;
    }
    await createClaimMutation.mutateAsync({
      courseId: parseInt(courseId),
      claimType,
      message: claimMessage,
    });
  };

  // ============================================================================
  // CAUTION REPORTS
  // ============================================================================

  const [reportType, setReportType] = useState("pothole");
  const [severity, setSeverity] = useState("2");
  const [reportMessage, setReportMessage] = useState("");

  const createReportMutation = trpc.reports.createReport.useMutation({
    onSuccess: () => {
      toast.success("Report created!");
      setReportMessage("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateReport = async () => {
    if (!reportMessage) {
      toast.error("Please describe the hazard");
      return;
    }
    await createReportMutation.mutateAsync({
      reportType,
      severity: parseInt(severity),
      lat: userLat.toString(),
      lng: userLng.toString(),
      description: reportMessage,
    });
  };

  // ============================================================================
  // CHECK-INS
  // ============================================================================

  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [etaMinutes, setEtaMinutes] = useState("30");
  const [graceMinutes, setGraceMinutes] = useState("5");
  const [emergencyContact, setEmergencyContact] = useState("");

  const createCheckinMutation = trpc.checkins.createCheckin.useMutation({
    onSuccess: () => {
      toast.success("Check-in started!");
      setDestLat("");
      setDestLng("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateCheckin = async () => {
    if (!destLat || !destLng || !etaMinutes) {
      toast.error("Please fill in destination and ETA");
      return;
    }
    await createCheckinMutation.mutateAsync({
      destLat,
      destLng,
      etaMinutes: parseInt(etaMinutes),
      graceMinutes: parseInt(graceMinutes),
      emergencyContact: emergencyContact || undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Tab buttons */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "claim" ? "default" : "outline"}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setActiveTab("claim")}
        >
          <BookOpen className="w-3 h-3 mr-1" />
          Claim
        </Button>
        <Button
          variant={activeTab === "report" ? "default" : "outline"}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => setActiveTab("report")}
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          Report
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

      {/* Class Claims Tab */}
      {activeTab === "claim" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Report Class Update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium">Course ID</label>
              <Input
                type="number"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                placeholder="Enter course ID"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Claim Type</label>
              <Select value={claimType} onValueChange={setClaimType}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cancellation">Cancellation</SelectItem>
                  <SelectItem value="room_change">Room Change</SelectItem>
                  <SelectItem value="time_change">Time Change</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Details</label>
              <Textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                placeholder="Describe the class update..."
                className="mt-1 text-xs"
                rows={3}
              />
            </div>
            <Button
              className="w-full text-xs"
              onClick={handleCreateClaim}
              disabled={createClaimMutation.isPending}
            >
              {createClaimMutation.isPending ? "Creating..." : "Create Claim"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Caution Reports Tab */}
      {activeTab === "report" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Report Hazard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium">Hazard Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pothole">Pothole</SelectItem>
                  <SelectItem value="broken_light">Broken Light</SelectItem>
                  <SelectItem value="suspicious_person">Suspicious Person</SelectItem>
                  <SelectItem value="accident">Accident</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Severity (1-5)</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Low</SelectItem>
                  <SelectItem value="2">Moderate</SelectItem>
                  <SelectItem value="3">Medium</SelectItem>
                  <SelectItem value="4">High</SelectItem>
                  <SelectItem value="5">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Description</label>
              <Textarea
                value={reportMessage}
                onChange={(e) => setReportMessage(e.target.value)}
                placeholder="Describe the hazard..."
                className="mt-1 text-xs"
                rows={3}
              />
            </div>
            <Button
              className="w-full text-xs"
              onClick={handleCreateReport}
              disabled={createReportMutation.isPending}
            >
              {createReportMutation.isPending ? "Reporting..." : "Report Hazard"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Check-In Tab */}
      {activeTab === "checkin" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Start Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Dest Lat</label>
                <Input
                  type="number"
                  value={destLat}
                  onChange={(e) => setDestLat(e.target.value)}
                  placeholder="Latitude"
                  className="mt-1 text-xs"
                  step="0.0001"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Dest Lng</label>
                <Input
                  type="number"
                  value={destLng}
                  onChange={(e) => setDestLng(e.target.value)}
                  placeholder="Longitude"
                  className="mt-1 text-xs"
                  step="0.0001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">ETA (minutes)</label>
                <Input
                  type="number"
                  value={etaMinutes}
                  onChange={(e) => setEtaMinutes(e.target.value)}
                  placeholder="30"
                  className="mt-1 text-xs"
                  min="1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Grace (minutes)</label>
                <Input
                  type="number"
                  value={graceMinutes}
                  onChange={(e) => setGraceMinutes(e.target.value)}
                  placeholder="5"
                  className="mt-1 text-xs"
                  min="0"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Emergency Contact (optional)</label>
              <Input
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="+1 (555) 123-4567"
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
      )}
    </div>
  );
}
