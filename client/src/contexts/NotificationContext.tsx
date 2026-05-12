import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import NotificationBanner from "@/components/NotificationBanner";

export type BannerNotification = {
  id: string;
  title: string;
  message: string;
  course_id?: number | string;
  report_id?: string;
};

interface NotificationContextValue {
  showNotification: (notification: BannerNotification) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [activeNotification, setActiveNotification] = useState<BannerNotification | null>(null);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (loading || !user) return;

    const setupSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userUuid = session?.user.id;
      if (!userUuid || !mounted) return;

      channel = supabase
        .channel(`global-notifications-${userUuid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userUuid}`,
          },
          (payload) => {
            const newNotification = payload.new as BannerNotification;
            setActiveNotification(newNotification);
          }
        )
        .subscribe((status) => {
          console.log("Global notification subscription status:", status);
        });
    };

    void setupSubscription();

    return () => {
      mounted = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [loading, user?.id]);

  const showNotification = (notification: BannerNotification) => {
    setActiveNotification(notification);
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      <NotificationBanner notification={activeNotification} onDismiss={() => setActiveNotification(null)} />
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}
