import { useLocation } from "wouter";
import { LayoutDashboard, CalendarDays, Map, User, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab?: "dashboard" | "schedule" | "map" | "courses" | "profile";
  /** When true the content area does not scroll — used for the full-screen map */
  noScroll?: boolean;
}

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "schedule",  label: "Schedule",  icon: CalendarDays,    href: "/schedule"  },
  { id: "map",       label: "Map",       icon: Map,             href: "/map"       },
  { id: "courses",   label: "Courses",   icon: BookOpen,        href: "/courses"   },
  { id: "profile",   label: "Profile",   icon: User,            href: "/profile"   },
] as const;

export default function AppLayout({ children, activeTab, noScroll }: AppLayoutProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col h-screen bg-[#f5f7fa] overflow-hidden">
      {/* Main content area */}
      <div className={noScroll ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-20"}>
        {children}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.href)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-200",
                  isActive ? "text-[#00c853]" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <Icon
                  className={cn("w-5 h-5 transition-all", isActive && "scale-110")}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span className={cn(
                  "text-[9px] font-medium uppercase tracking-wider",
                  isActive ? "text-[#00c853]" : "text-gray-400"
                )}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
