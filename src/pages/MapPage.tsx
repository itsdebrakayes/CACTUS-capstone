// @ts-nocheck
import { useIsMobile } from "@/hooks/useIsMobile";
import MapMobile from "./MapPage.mobile";
import MapDesktop from "./MapPage.desktop";

export default function MapPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MapMobile /> : <MapDesktop />;
}
