// @ts-nocheck
import { useLocation } from "wouter";
import { LayoutDashboard, CalendarDays, Map, User, BookOpen, ShieldAlert, Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/_core/hooks/useAuth";

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab?: "dashboard" | "schedule" | "map" | "courses" | "profile" | "safety";
  noScroll?: boolean;
  /** Hides the chrome entirely (used for full-bleed pages like Map desktop) */
  bare?: boolean;
}

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "schedule",  label: "Schedule",  icon: CalendarDays,    href: "/schedule"  },
  { id: "map",       label: "Map",       icon: Map,             href: "/map"       },
  { id: "courses",   label: "Courses",   icon: BookOpen,        href: "/courses"   },
  { id: "safety",    label: "Safety",    icon: ShieldAlert,     href: "/safety"    },
  { id: "profile",   label: "Profile",   icon: User,            href: "/profile"   },
] as const;

const mobileTabs = tabs.filter(t => t.id !== "safety");

function DesktopSidebar({ activeTab }: { activeTab?: string }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const initial = (user?.name || "S").charAt(0).toUpperCase();

  return (
    <aside className="w-[88px] xl:w-[240px] h-screen sticky top-0 shrink-0 px-3 py-6 flex flex-col gap-2 border-r border-white/40 bg-white/40 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2 mb-4">
        <div className="w-10 h-10 rounded-2xl cactus-honey-grad flex items-center justify-center shadow-lg shadow-amber-500/30 text-white font-black">
          C
        </div>
        <div className="hidden xl:block">
          <p className="font-black text-[hsl(var(--cactus-ink))] tracking-tight leading-none">CACTUS</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Campus OS</p>
        </div>
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => navigate(t.href)}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-2xl transition-all group",
                active
                  ? "bg-[hsl(var(--cactus-ink))] text-white shadow-lg shadow-slate-900/20"
                  : "text-slate-600 hover:bg-white/70"
              )}
            >
              <Icon className={cn("w-5 h-5 shrink-0", active && "text-amber-300")} strokeWidth={active ? 2.4 : 1.8} />
              <span className="hidden xl:inline text-sm font-semibold">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        onClick={() => navigate("/profile")}
        className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-white/70 transition-colors"
      >
        <div className="w-10 h-10 rounded-2xl cactus-ink-grad flex items-center justify-center text-white font-bold shrink-0">
          {initial}
        </div>
        <div className="hidden xl:block min-w-0 text-left">
          <p className="text-sm font-semibold text-[hsl(var(--cactus-ink))] truncate">{user?.name || "Student"}</p>
          <p className="text-[11px] text-slate-500 truncate">{user?.email || "UWI Mona"}</p>
        </div>
      </button>
    </aside>
  );
}

export default function AppLayout({ children, activeTab, noScroll, bare }: AppLayoutProps) {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();

  if (bare) return <>{children}</>;

  if (!isMobile) {
    return (
      <div className="cactus-bg min-h-screen flex">
        <DesktopSidebar activeTab={activeTab} />
        <main className={cn("flex-1 min-w-0", noScroll ? "h-screen overflow-hidden" : "min-h-screen")}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen cactus-bg overflow-hidden">
      <div className={noScroll ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-[88px]"}>
        {children}
      </div>
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-white/60 z-50"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)", boxShadow: "0 -8px 24px -12px hsl(var(--cactus-ink) / 0.18)" }}
      >
        <div className="max-w-lg mx-auto flex items-stretch justify-around h-[64px] px-2">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.href)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 min-w-0 px-1 py-1.5 rounded-2xl transition-all duration-200",
                  isActive ? "text-[hsl(var(--cactus-ink))]" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-all",
                  isActive && "bg-[hsl(var(--cactus-honey)/0.22)]"
                )}>
                  <Icon className={cn("w-5 h-5 transition-all", isActive && "text-[hsl(var(--cactus-honey-2))]")} strokeWidth={isActive ? 2.4 : 1.8} />
                </div>
                <span className={cn(
                  "text-[10px] font-semibold leading-none truncate max-w-full",
                  isActive ? "text-[hsl(var(--cactus-ink))]" : "text-slate-400"
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

export function DesktopTopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between px-8 pt-8 pb-4">
      <div>
        <h1 className="text-2xl font-black text-[hsl(var(--cactus-ink))] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search…"
            className="w-72 pl-9 pr-4 py-2.5 rounded-2xl bg-white/70 backdrop-blur border border-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/60"
          />
        </div>
        <button className="w-11 h-11 rounded-2xl bg-white/70 backdrop-blur border border-white/60 flex items-center justify-center text-slate-600 hover:bg-white">
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
