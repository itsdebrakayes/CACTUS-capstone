// @ts-nocheck
import { useIsMobile } from "@/hooks/useIsMobile";
import ProfileMobile from "./ProfilePage.mobile";
import ProfileDesktop from "./ProfilePage.desktop";

export default function ProfilePage() {
  const isMobile = useIsMobile();
  return isMobile ? <ProfileMobile /> : <ProfileDesktop />;
}
