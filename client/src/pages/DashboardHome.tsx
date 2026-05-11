import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  MapPin,
  MessageSquare,
  ShieldAlert,
  ChevronRight,
  Bell,
  Search,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getSessionStatus(session: { dayOfWeek: string; startTime: string; endTime: string }) {
  const now = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayName = dayNames[now.getDay()];
  if (session.dayOfWeek !== todayName) return "other";
  const [sh, sm] = session.startTime.split(":").map(Number);
  const [eh, em] = session.endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins >= startMins && nowMins < endMins) return "live";
  if (nowMins < startMins) return "upcoming";
  return "done";
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardHome() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();

  const { data: timetable } = trpc.timetable.getMyTimetable.useQuery(undefined, { enabled: !!user });
  const { data: myCourses } = trpc.courses.getMyCourses.useQuery(undefined, { enabled: !!user });

  const todaySessions = (timetable ?? [])
    .map((s) => ({ ...s, status: getSessionStatus(s) }))
    .filter((s) => s.status !== "other" && s.status !== "done")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const currentClass = todaySessions.find((s) => s.status === "live") ?? null;
  const nextClass = todaySessions.find((s) => s.status === "upcoming") ?? null;

  if (loading) {
    return (
      <AppLayout activeTab="dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const displayName = user.name || "Student";

  return (
    <AppLayout activeTab="dashboard">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm text-muted-foreground">{getGreeting()}</p>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Welcome, {displayName.split(" ")[0]}!
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                <Search className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate()}</p>
        </div>

        {/* Search bar */}
        <div className="px-4 lg:px-8 mb-6">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Search className="w-4 h-4 text-primary-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search courses"
              className="w-full pl-14 pr-4 py-3 bg-card border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT column */}
          <div className="lg:col-span-3 space-y-6">
            {/* Today's Classes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Today's Classes
              </p>
              {todaySessions.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-6 text-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No classes scheduled for today</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentClass && (
                    <button
                      onClick={() => navigate(`/courses/${currentClass.courseId}`)}
                      className="relative bg-gradient-to-br from-primary to-teal-mid rounded-2xl p-4 text-left overflow-hidden group"
                    >
                      <span className="absolute top-3 right-3 bg-white/20 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" />
                        LIVE
                      </span>
                      <div className="h-20 mb-3" />
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-white/20" />
                        <span className="text-xs text-primary-foreground/70">{currentClass.lecturer ?? "—"}</span>
                      </div>
                      <p className="font-bold text-primary-foreground text-sm">{currentClass.courseName ?? "—"}</p>
                      <p className="text-xs text-primary-foreground/60 mt-0.5">
                        {currentClass.startTime} · {currentClass.roomCode ?? "—"}
                      </p>
                    </button>
                  )}
                  {nextClass && (
                    <button
                      onClick={() => navigate(`/courses/${nextClass.courseId}`)}
                      className="relative bg-gradient-to-br from-teal-mid to-primary/80 rounded-2xl p-4 text-left overflow-hidden group"
                    >
                      <span className="absolute top-3 right-3 bg-white/20 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                        UP NEXT
                      </span>
                      <div className="h-20 mb-3" />
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-white/20" />
                        <span className="text-xs text-primary-foreground/70">{nextClass.lecturer ?? "—"}</span>
                      </div>
                      <p className="font-bold text-primary-foreground text-sm">{nextClass.courseName ?? "—"}</p>
                      <p className="text-xs text-primary-foreground/60 mt-0.5">
                        {nextClass.startTime} · {nextClass.roomCode ?? "—"}
                      </p>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Your courses */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Your courses
                </p>
                <button onClick={() => navigate("/courses")} className="text-xs text-primary font-medium">
                  View All
                </button>
              </div>
              <div className="space-y-2">
                {(myCourses ?? []).slice(0, 3).map((course) => (
                  <button
                    key={course.id}
                    onClick={() => navigate(`/courses/${course.id}`)}
                    className="w-full bg-card rounded-xl border border-border p-3.5 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{course.courseName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {course.courseCode}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{course.lecturer ?? "—"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
                {(myCourses ?? []).length === 0 && (
                  <div className="bg-card rounded-xl border border-border p-6 text-center">
                    <BookOpen className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No courses enrolled yet</p>
                    <button onClick={() => navigate("/courses")} className="text-xs text-primary font-medium mt-1">Browse Courses</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: MapPin, label: "Find Way", bg: "bg-teal-light", color: "text-primary", onClick: () => navigate("/find-way") },
                { icon: MessageSquare, label: "Class Chat", bg: "bg-teal-light", color: "text-primary", onClick: () => navigate("/class-chat") },
                { icon: ShieldAlert, label: "Emergency", bg: "bg-orange-light", color: "text-destructive", onClick: () => navigate("/safety") },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all active:scale-95"
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", a.bg)}>
                      <Icon className={cn("w-5 h-5", a.color)} />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {a.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Course Tasks — placeholder until task system is built */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Course Tasks
                </p>
                <button className="text-xs text-primary font-medium">View All</button>
              </div>
              <div className="bg-card rounded-xl border border-border p-6 text-center">
                <TrendingUp className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No pending tasks</p>
              </div>
            </div>

            {/* Class Updates */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Class Updates
                </p>
                <button onClick={() => navigate("/class-chat")} className="text-xs text-primary font-medium">
                  See all
                </button>
              </div>
              <div className="bg-card rounded-xl border border-border divide-y divide-border">
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <MessageSquare className="w-6 h-6 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No recent class updates</p>
                  <button onClick={() => navigate("/class-chat")} className="text-xs text-primary font-medium mt-1">
                    Go to Class Chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
