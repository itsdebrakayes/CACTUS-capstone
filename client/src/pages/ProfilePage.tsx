import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import {
  User,
  Star,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  BookOpen,
  MapPin,
  Award,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const trustQuery = trpc.walking.getTrustScore.useQuery(undefined, { enabled: !!user });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  if (!loading && !user) {
    navigate("/login");
    return null;
  }

  const displayName = user?.name || "Student";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const trustScore = trustQuery.data?.score ?? 0;
  const trustPercent = Math.round(trustScore * 100);
  const ratingCount = trustQuery.data?.ratingCount ?? 0;
  const avgStars = trustQuery.data?.averageStars ?? 0;

  const menuSections = [
    {
      title: "Academic",
      items: [
        { icon: BookOpen, label: "My Courses", onClick: () => navigate("/schedule") },
        { icon: MapPin, label: "Campus Map", onClick: () => navigate("/map") },
      ],
    },
    {
      title: "Safety",
      items: [
        { icon: Shield, label: "My Check-Ins", onClick: () => navigate("/check-in") },
        { icon: Award, label: "Walking History", onClick: () => navigate("/walking") },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          icon: Bell,
          label: "Notifications",
          onClick: () => toast.info("Notification settings coming soon"),
        },
        {
          icon: HelpCircle,
          label: "Help & Support",
          onClick: () => toast.info("Help centre coming soon"),
        },
      ],
    },
  ];

  return (
    <AppLayout activeTab="profile">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">Profile</h1>
      </div>

      {/* Avatar + name */}
      <div className="bg-white px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00c853] to-[#00b84a] flex items-center justify-center text-white text-xl font-bold shadow-md shadow-[#00c853]/20">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{displayName}</h2>
            <p className="text-sm text-gray-500 truncate">{user?.email || "UWI Mona Student"}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full bg-[#00c853]" />
              <span className="text-xs text-[#00c853] font-medium">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Score Card */}
      <div className="mx-4 mt-4 mb-3 bg-gradient-to-br from-[#0f1e35] to-[#1a2f50] rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-[#8899aa] uppercase tracking-wide font-medium">Trust Score</p>
            <p className="text-3xl font-bold text-white mt-0.5">{trustPercent}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#00c853]/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#00c853]" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[#00c853] rounded-full transition-all duration-500"
            style={{ width: `${trustPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#8899aa]">
          <span>{ratingCount} ratings</span>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span>{avgStars > 0 ? avgStars.toFixed(1) : "—"} avg</span>
          </div>
        </div>
      </div>

      {/* Menu sections */}
      <div className="px-4 space-y-3 mb-4">
        {menuSections.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-1">
              {section.title}
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#f0faf5] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[#00c853]" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800 text-left">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-red-50 hover:border-red-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-[#ffebee] flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-[#e53935]" />
          </div>
          <span className="flex-1 text-sm font-medium text-[#e53935] text-left">
            {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-xs text-gray-300 pb-4">
        CACTUS v1.0 · UWI Mona Campus
      </p>
    </AppLayout>
  );
}
