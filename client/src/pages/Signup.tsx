import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Leaf, Eye, EyeOff, ArrowRight, ArrowLeft } from "lucide-react";

export default function Signup() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (data) => {
      // Navigate to email verification page with the email pre-filled
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
    },
    onError: (err) => {
      toast.error(err.message || "Signup failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    signupMutation.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0d2040] to-[#0a1628] flex flex-col items-center justify-center px-4 py-8">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#00c853] flex items-center justify-center shadow-lg shadow-[#00c853]/30">
          <Leaf className="w-7 h-7 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">CACTUS</h1>
          <p className="text-[#8899aa] text-xs mt-0.5">UWI Mona Campus Companion</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#0f1e35] border border-[#1e3050] rounded-2xl p-6 shadow-2xl">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-[#8899aa] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to login
        </button>

        <h2 className="text-xl font-semibold text-white mb-1">Create account</h2>
        <p className="text-[#8899aa] text-sm mb-5">Join the CACTUS community</p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[#aabbcc] text-sm">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] h-10"
              autoComplete="name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[#aabbcc] text-sm">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@mona.uwi.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] h-10"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#aabbcc] text-sm">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] h-10 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#445566] hover:text-[#8899aa] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-[#aabbcc] text-sm">Confirm password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] h-10"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={signupMutation.isPending}
            className="w-full h-11 bg-[#00c853] hover:bg-[#00b84a] text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-[#00c853]/20 mt-2"
          >
            {signupMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Create Account <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-[#1e3050] text-center">
          <p className="text-[#8899aa] text-sm">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-[#00c853] hover:text-[#00e060] font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>

      <p className="mt-5 text-[#445566] text-xs text-center">
        University of the West Indies, Mona Campus
      </p>
    </div>
  );
}
