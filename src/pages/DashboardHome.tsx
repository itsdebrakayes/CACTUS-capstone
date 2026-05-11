// @ts-nocheck
import { useIsMobile } from "@/hooks/useIsMobile";
import DashboardMobile from "./DashboardHome.mobile";
import DashboardDesktop from "./DashboardHome.desktop";

export default function DashboardHome() {
  const isMobile = useIsMobile();
  return isMobile ? <DashboardMobile /> : <DashboardDesktop />;
}
