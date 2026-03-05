import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  PersonStanding, AlertTriangle, BookOpen, CheckCircle2,
  Radio, MapPin, Shield, ArrowRight, Loader2
} from "lucide-react";

const FEATURES = [
  {
    icon: PersonStanding,
    color: "oklch(0.55 0.12 185)",
    title: "Walking Body",
    desc: "Find a walking partner nearby. Trust-scored, geohash-matched, real-time.",
  },
  {
    icon: BookOpen,
    color: "oklch(0.55 0.15 250)",
    title: "Class Claims",
    desc: "Report class cancellations, room changes, and late lecturers. Community-verified.",
  },
  {
    icon: AlertTriangle,
    color: "oklch(0.55 0.15 50)",
    title: "Caution Reports",
    desc: "Flag hazards on campus paths. Severity-rated with auto-expiring TTL.",
  },
  {
    icon: CheckCircle2,
    color: "oklch(0.55 0.15 145)",
    title: "Safety Check-In",
    desc: "Set a destination and ETA. We'll alert your emergency contact if you don't arrive.",
  },
  {
    icon: Radio,
    color: "oklch(0.55 0.15 320)",
    title: "Live Feed",
    desc: "Server-sent events stream all campus activity in real-time.",
  },
  {
    icon: MapPin,
    color: "oklch(0.55 0.15 20)",
    title: "Interactive Map",
    desc: "Mapbox-powered campus map with hazard pins, footpaths, and route visualization.",
  },
];

export default function Home() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.97 0.01 245)" }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
            style={{ background: "oklch(0.28 0.08 245)" }}>C</div>
          <div>
            <p className="font-bold text-sm leading-none" style={{ color: "oklch(0.18 0.06 245)" }}>CACTUS</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">UWI Mona Campus</p>
          </div>
        </div>
        <Button
          size="sm"
          className="text-xs"
          style={{ background: "oklch(0.28 0.08 245)" }}
          onClick={() => window.location.href = getLoginUrl()}>
          Sign In
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 border"
            style={{ background: "oklch(0.94 0.04 185)", color: "oklch(0.28 0.12 185)", borderColor: "oklch(0.82 0.08 185)" }}>
            <Shield className="w-3.5 h-3.5" />
            Campus Safety · Social Coordination
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight mb-4"
            style={{ color: "oklch(0.18 0.06 245)" }}>
            Stay safe.<br />
            <span style={{ color: "oklch(0.55 0.12 185)" }}>Stay connected.</span>
          </h1>

          <p className="text-base text-muted-foreground mb-8 leading-relaxed">
            CACTUS is a real-time campus safety and social coordination platform for the
            University of the West Indies, Mona. Walk together, verify class updates,
            report hazards, and check in safely — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="text-sm font-semibold shadow-md"
              style={{ background: "oklch(0.28 0.08 245)" }}
              onClick={() => window.location.href = getLoginUrl()}>
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-sm"
              onClick={() => navigate("/dashboard")}>
              View Dashboard
            </Button>
          </div>
        </div>
      </main>

      {/* Features grid */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6">
            Core Features
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, color, title, desc }) => (
              <div key={title}
                className="bg-white rounded-xl p-4 border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: `${color}22` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <p className="font-semibold text-sm mb-1" style={{ color: "oklch(0.18 0.06 245)" }}>{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white/60 px-6 py-4 text-center text-xs text-muted-foreground">
        CACTUS Proof of Concept · University of the West Indies, Mona · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
