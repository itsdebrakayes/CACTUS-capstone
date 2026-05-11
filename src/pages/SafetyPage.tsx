// @ts-nocheck
import { useIsMobile } from "@/hooks/useIsMobile";
import SafetyMobile from "./SafetyPage.mobile";
import SafetyDesktop from "./SafetyPage.desktop";

export default function SafetyPage() {
  const isMobile = useIsMobile();
  return isMobile ? <SafetyMobile /> : <SafetyDesktop />;
}
