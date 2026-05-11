// @ts-nocheck
import { useIsMobile } from "@/hooks/useIsMobile";
import ScheduleMobile from "./SchedulePage.mobile";
import ScheduleDesktop from "./SchedulePage.desktop";

export default function SchedulePage() {
  const isMobile = useIsMobile();
  return isMobile ? <ScheduleMobile /> : <ScheduleDesktop />;
}
