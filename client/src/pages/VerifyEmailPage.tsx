import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Leaf, Mail, ArrowLeft, RotateCcw, CheckCircle2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email] = useState(emailFromQuery);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = { current: [] as (HTMLInputElement | null)[] };

  // Countdown timer for resend button
  const [, setTick] = useState(0);
  if (resendCooldown > 0) {
    setTimeout(() => {
      setResendCooldown((c) => c - 1);
      setTick((t) => t + 1);
    }, 1000);
  }

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setVerified(true);
      toast.success("Email verified! Welcome to CACTUS.");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    },
    onError: (err) => {
      toast.error(err.message || "Verification failed");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    },
  });

  const resendMutation = trpc.auth.sendVerificationCode.useMutation({
    onSuccess: (data) => {
      if (data.alreadyVerified) {
        toast.info("Your email is already verified. Redirecting...");
        setTimeout(() => { window.location.href = "/dashboard"; }, 1000);
        return;
      }
      toast.success("New code sent! Check your inbox.");
      setResendCooldown(60);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to resend code");
    },
  });

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5) {
      const code = [...newDigits.slice(0, 5), digit].join("");
      if (code.length === 6) {
        verifyMutation.mutate({ email, code });
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split("");
      setDigits(newDigits);
      inputRefs.current[5]?.focus();
      verifyMutation.mutate({ email, code: pasted });
    }
  };

  const handleVerify = () => {
    const code = digits.join("");
    if (code.length !== 6) {
      toast.error("Please enter the full 6-digit code");
      return;
    }
    verifyMutation.mutate({ email, code });
  };

  if (verified) {
    return (
      <div className="min-h-screen bg-foreground flex flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" style={{ color: "hsl(185 80% 50%)" }} />
          </div>
          <h2 className="text-2xl font-bold text-white">Email Verified!</h2>
          <p className="text-white/50 text-sm">Redirecting to your dashboard...</p>
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-foreground flex flex-col items-center justify-center px-4 py-8">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
          <Leaf className="w-7 h-7 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">CACTUS</h1>
          <p className="text-white/50 text-xs mt-0.5">UWI Mona Campus Companion</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6">
        <button
          onClick={() => navigate("/signup")}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to signup
        </button>

        {/* Email icon */}
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" style={{ color: "hsl(185 80% 50%)" }} />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-white mb-1 text-center">Check your email</h2>
        <p className="text-white/50 text-sm mb-1 text-center">
          We sent a 6-digit code to
        </p>
        <p className="text-sm font-medium text-center mb-5 truncate" style={{ color: "hsl(185 80% 50%)" }}>
          {email || "your email address"}
        </p>

        {/* 6-digit input */}
        <div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-11 h-12 text-center text-xl font-bold rounded-xl border bg-white/5 text-white transition-all outline-none
                ${digit ? "border-primary" : "border-white/10"}
                focus:border-primary`}
              style={{ borderColor: digit ? "hsl(185 100% 23%)" : undefined }}
              disabled={verifyMutation.isPending}
            />
          ))}
        </div>

        <Button
          onClick={handleVerify}
          disabled={verifyMutation.isPending || digits.join("").length !== 6}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-200 mb-4"
        >
          {verifyMutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying...
            </span>
          ) : (
            "Verify Email"
          )}
        </Button>

        {/* Resend */}
        <div className="text-center">
          <p className="text-white/50 text-sm">Didn't receive the code?</p>
          <button
            onClick={() => resendMutation.mutate({ email })}
            disabled={resendMutation.isPending || resendCooldown > 0}
            className="flex items-center gap-1.5 mx-auto mt-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "hsl(185 80% 50%)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : resendMutation.isPending
              ? "Sending..."
              : "Resend code"}
          </button>
        </div>

        <p className="text-white/25 text-xs text-center mt-4">
          The code expires in 15 minutes.
        </p>
      </div>

      <p className="mt-5 text-white/25 text-xs text-center">
        University of the West Indies, Mona Campus
      </p>
    </div>
  );
}
