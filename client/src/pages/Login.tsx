import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Leaf, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Welcome back!");
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0d2040] to-[#0a1628] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-[#00c853] flex items-center justify-center shadow-lg shadow-[#00c853]/30">
          <Leaf className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">CACTUS</h1>
          <p className="text-[#8899aa] text-sm mt-1">UWI Mona Campus Companion</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#0f1e35] border border-[#1e3050] rounded-2xl p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
        <p className="text-[#8899aa] text-sm mb-6">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[#aabbcc] text-sm">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@mona.uwi.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] focus:ring-[#00c853]/20 h-11"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#aabbcc] text-sm">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#0a1628] border-[#1e3050] text-white placeholder:text-[#445566] focus:border-[#00c853] focus:ring-[#00c853]/20 h-11 pr-10"
                autoComplete="current-password"
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

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-11 bg-[#00c853] hover:bg-[#00b84a] text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-[#00c853]/20"
          >
            {loginMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Sign In <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#1e3050] text-center">
          <p className="text-[#8899aa] text-sm">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-[#00c853] hover:text-[#00e060] font-medium transition-colors"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>

      <p className="mt-6 text-[#445566] text-xs text-center">
        University of the West Indies, Mona Campus
      </p>
    </div>
  );
}
