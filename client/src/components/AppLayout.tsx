import { useLocation } from "wouter";
import { LayoutDashboard, Map, BookOpen, CalendarDays, ShieldAlert, User, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab?: "dashboard" | "map" | "courses" | "schedule" | "safety" | "profile";
  noScroll?: boolean;
}

const tabs = [
  { id: "dashboard", label: "Home",     icon: LayoutDashboard, href: "/dashboard" },
  { id: "map",       label: "Map",      icon: Map,             href: "/map"       },
  { id: "courses",   label: "Courses",  icon: BookOpen,        href: "/courses"   },
  { id: "schedule",  label: "Calendar", icon: CalendarDays,    href: "/schedule"  },
  { id: "safety",    label: "Safety",   icon: ShieldAlert,     href: "/safety"    },
  { id: "profile",   label: "Profile",  icon: User,            href: "/profile"   },
] as const;

export default function AppLayout({ children, activeTab, noScroll }: AppLayoutProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar — Deep Teal */}
      <aside className="hidden lg:flex flex-col w-56 bg-sidebar text-sidebar-foreground shrink-0">
        <div className="px-5 pt-6 pb-8">
          <div className="flex items-center gap-2">
            <Compass className="w-7 h-7 text-white" />
            <span className="text-lg font-bold text-white tracking-tight">CACTUS</span>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isSafety = tab.id === "safety";
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10",
                  isSafety && !isActive && "text-red-300/70 hover:text-red-200"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-xs text-white/30">
          © 2026 Cactus
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className={cn(
          noScroll ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-20 lg:pb-4"
        )}>
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
          <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isSafety = tab.id === "safety";
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.href)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-200",
                    isActive && !isSafety && "text-primary",
                    isActive && isSafety && "text-destructive",
                    !isActive && !isSafety && "text-muted-foreground hover:text-foreground",
                    !isActive && isSafety && "text-destructive/60 hover:text-destructive"
                  )}
                >
                  <Icon
                    className={cn("w-5 h-5 transition-all", isActive && "scale-110")}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  <span className={cn(
                    "text-[9px] font-semibold uppercase tracking-wider",
                    isActive && !isSafety && "text-primary",
                    isActive && isSafety && "text-destructive",
                    !isActive && !isSafety && "text-muted-foreground",
                    !isActive && isSafety && "text-destructive/60"
                  )}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
