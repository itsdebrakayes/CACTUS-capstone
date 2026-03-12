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
    onSuccess: () => {
      toast.success("Account created! Please verify your email.");
      navigate("/verify-email");
    },
    onError: (err: any) => {
      toast.error(err.message || "Signup failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    signupMutation.mutate({ name, email, password });
  };

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
          onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to login
        </button>

        <h2 className="text-xl font-semibold text-white mb-1">Create account</h2>
        <p className="text-white/50 text-sm mb-5">Join the CACTUS community</p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-white/70 text-sm">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary h-10"
              autoComplete="name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/70 text-sm">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@mona.uwi.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary h-10"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-white/70 text-sm">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary h-10 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-white/70 text-sm">Confirm password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-primary h-10"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={signupMutation.isPending}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-200 mt-2"
          >
            <span className="flex items-center gap-2">
              {signupMutation.isPending ? "Creating…" : "Create Account"} <ArrowRight className="w-4 h-4" />
            </span>
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-white/10 text-center">
          <p className="text-white/50 text-sm">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>

      <p className="mt-5 text-white/25 text-xs text-center">
        University of the West Indies, Mona Campus
      </p>
    </div>
  );
}
