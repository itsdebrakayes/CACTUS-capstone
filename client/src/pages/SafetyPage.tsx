import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Phone, Flame, Mic, UserCheck, ShieldAlert, MapPin, Bell } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SafetyPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [isRecording, setIsRecording] = useState(false);

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const handleCall911 = () => { window.location.href = "tel:911"; };
  const handleCallSecurity = () => { window.location.href = "tel:109"; };
  const handleCallFire = () => { toast.info("Calling Fire Services..."); };
  const handleRecord = () => {
    setIsRecording(!isRecording);
    if (!isRecording) toast.success("Recording started", { description: "Audio recording is now active." });
    else toast.info("Recording stopped", { description: "Audio saved locally." });
  };
  const handleEmergencyContact = () => { toast.info("Calling your emergency contact..."); };

  return (
    <AppLayout activeTab="safety">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="px-4 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">UWI Mona Campus</span>
          </div>
          <button className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center relative">
            <Bell className="w-4 h-4 text-destructive" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-primary-foreground text-[9px] font-bold flex items-center justify-center">3</span>
          </button>
        </div>

        {/* Main emergency button */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="relative">
            {/* Outer pulsing rings */}
            <div className="absolute inset-0 -m-8 rounded-full bg-destructive/10 pulse-ring" />
            <div className="absolute inset-0 -m-4 rounded-full bg-destructive/15 pulse-ring" style={{ animationDelay: "0.5s" }} />

            <button
              onClick={handleCall911}
              className="relative w-40 h-40 rounded-full bg-gradient-to-b from-destructive to-destructive/80 flex flex-col items-center justify-center text-primary-foreground active:scale-95 transition-transform z-10"
            >
              <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mb-2">
                <Bell className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xs text-white/60">Tap in case of emergency</span>
            </button>
          </div>

          <button className="mt-4 text-sm font-semibold text-destructive underline underline-offset-2">
            Emergency Link
          </button>
        </div>

        {/* Service buttons — 2x2 grid */}
        <div className="px-6 pb-8">
          <div className="grid grid-cols-2 gap-4">
            {/* Medical/911 */}
            <button
              onClick={handleCall911}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Phone className="w-6 h-6 text-destructive" />
              </div>
              <span className="text-sm font-semibold text-foreground">Medical</span>
            </button>

            {/* Fire */}
            <button
              onClick={handleCallFire}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Flame className="w-6 h-6 text-destructive" />
              </div>
              <span className="text-sm font-semibold text-foreground">Fire Force</span>
            </button>

            {/* Security */}
            <button
              onClick={handleCallSecurity}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Security</span>
            </button>

            {/* Emergency Contact */}
            <button
              onClick={handleEmergencyContact}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
              <span className="text-sm font-semibold text-foreground">Cops</span>
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
