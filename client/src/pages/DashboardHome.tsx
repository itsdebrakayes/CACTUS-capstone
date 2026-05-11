import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  AlertTriangle,
  Play,
  MapPin,
  MessageSquare,
  ShieldAlert,
  ChevronRight,
  Bell,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  BookOpen,
  Users,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(name: string) {
  const hour = new Date().getHours();
  const first = name.split(" ")[0];
  if (hour < 12) return `Good Morning`;
  if (hour < 17) return `Good Afternoon`;
  return `Good Evening`;
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_SCHEDULE = [
  {
    id: 1,
    courseCode: "PSYC1001",
    courseName: "Introduction to Psychology",
    room: "SLT 2",
    startTime: new Date(new Date().setHours(9, 0, 0, 0)),
    endTime: new Date(new Date().setHours(10, 0, 0, 0)),
    professor: "Dr. Williams",
    status: "live" as const,
    color: "bg-primary",
  },
  {
    id: 2,
    courseCode: "STAT2202",
    courseName: "Advanced Statistics",
    room: "Lab 4",
    startTime: new Date(new Date().setHours(11, 30, 0, 0)),
    endTime: new Date(new Date().setHours(13, 0, 0, 0)),
    professor: "Prof. Miller",
    status: "upcoming" as const,
    color: "bg-teal-mid",
  },
  {
    id: 3,
    courseCode: "COMP3161",
    courseName: "Database Management",
    room: "FST 1",
    startTime: new Date(new Date().setHours(14, 0, 0, 0)),
    endTime: new Date(new Date().setHours(15, 30, 0, 0)),
    professor: "Dr. Brown",
    status: "upcoming" as const,
    color: "bg-orange",
  },
];

const MOCK_COURSES = [
  { id: 1, code: "PSYC1001", name: "Introduction to Psychology", professor: "Dr. Williams", category: "Psychology", hours: 12, level: "Beginner" },
  { id: 2, code: "STAT2202", name: "Advanced Statistics", professor: "Prof. Miller", category: "Mathematics", hours: 12, level: "Intermediate" },
  { id: 3, code: "COMP3161", name: "Database Management", professor: "Dr. Brown", category: "Computer Science", hours: 12, level: "Advanced" },
];

const MOCK_ALERTS = [
  { id: 1, type: "cancelled" as const, message: "Sociology lecture at 4 PM is CANCELLED", course: "SOCI2001", time: "2 min ago" },
  { id: 2, type: "confirmed" as const, message: "Psych 101 confirmed as scheduled", course: "PSYC1001", time: "1 hr ago" },
];

const MOCK_TASKS = [
  { id: 1, title: "Complete Lab Report", course: "STAT2202", due: "2 days remaining", color: "bg-teal-light" },
  { id: 2, title: "Read Chapter 5", course: "PSYC1001", due: "3 days remaining", color: "bg-orange-light" },
  { id: 3, title: "Database ER Diagram", course: "COMP3161", due: "4 days remaining", color: "bg-teal-light" },
  { id: 4, title: "Statistics Problem Set", course: "STAT2202", due: "6 days remaining", color: "bg-orange-light" },
];

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardHome() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();

  const currentClass = MOCK_SCHEDULE.find((c) => c.status === "live");
  const nextClass = MOCK_SCHEDULE.find((c) => c.status === "upcoming");

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
              <p className="text-sm text-muted-foreground">{getGreeting(displayName)}</p>
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

        {/* Main grid: left + right columns on desktop */}
        <div className="px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT column */}
          <div className="lg:col-span-3 space-y-6">
            {/* Current & Next class cards */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Today's Classes
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Current class */}
                {currentClass && (
                  <button
                    onClick={() => navigate(`/courses/${currentClass.id}`)}
                    className="relative bg-gradient-to-br from-primary to-teal-mid rounded-2xl p-4 text-left overflow-hidden group"
                  >
                    <span className="absolute top-3 right-3 bg-white/20 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" />
                      LIVE
                    </span>
                    <div className="h-20 mb-3" />
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-white/20" />
                      <span className="text-xs text-primary-foreground/70">{currentClass.professor}</span>
                    </div>
                    <p className="font-bold text-primary-foreground text-sm">{currentClass.courseName}</p>
                    <p className="text-xs text-primary-foreground/60 mt-0.5">
                      {currentClass.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {currentClass.room}
                    </p>
                  </button>
                )}

                {/* Next class */}
                {nextClass && (
                  <button
                    onClick={() => navigate(`/courses/${nextClass.id}`)}
                    className="relative bg-gradient-to-br from-teal-mid to-primary/80 rounded-2xl p-4 text-left overflow-hidden group"
                  >
                    <span className="absolute top-3 right-3 bg-white/20 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                      UP NEXT
                    </span>
                    <div className="h-20 mb-3" />
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-white/20" />
                      <span className="text-xs text-primary-foreground/70">{nextClass.professor}</span>
                    </div>
                    <p className="font-bold text-primary-foreground text-sm">{nextClass.courseName}</p>
                    <p className="text-xs text-primary-foreground/60 mt-0.5">
                      {nextClass.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {nextClass.room}
                    </p>
                  </button>
                )}
              </div>
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
                {MOCK_COURSES.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => navigate(`/courses/${course.id}`)}
                    className="w-full bg-card rounded-xl border border-border p-3.5 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{course.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {course.category} · {course.hours} hours · {course.level}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{course.professor}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
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

            {/* Course Tasks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Course Tasks
                </p>
                <button className="text-xs text-primary font-medium">View All</button>
              </div>
              <div className="space-y-2">
                {MOCK_TASKS.map((task) => (
                  <div
                    key={task.id}
                    className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", task.color)}>
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.due}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>

            {/* Recent class updates */}
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
                {MOCK_ALERTS.map((alert) => {
                  const Icon = alert.type === "cancelled" ? XCircle : CheckCircle;
                  const iconClass = alert.type === "cancelled" ? "text-destructive" : "text-primary";
                  const bgClass = alert.type === "cancelled" ? "bg-orange-light" : "bg-teal-light";
                  const badge = alert.type === "cancelled" ? "CANCELLED" : "CONFIRMED";
                  const badgeClass = alert.type === "cancelled" ? "text-destructive bg-orange-light" : "text-primary bg-teal-light";
                  return (
                    <div key={alert.id} className="flex items-center gap-3 p-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bgClass)}>
                        <Icon className={cn("w-4 h-4", iconClass)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate">{alert.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{alert.time}</p>
                      </div>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", badgeClass)}>
                        {badge}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
