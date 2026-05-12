/**
 * FindWayPage — redirects to the Map page with the navigation panel open.
 * "Find My Way" is a function of the map, not a separate page.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

// ─── Component ────────────────────────────────────────────────────────────────

export default function FindWayPage() {
  const [, navigate] = useLocation();

  // effects (all unchanged)
  useEffect(() => {
    navigate("/map", { replace: true });
  }, [navigate]);

  return null;
}
