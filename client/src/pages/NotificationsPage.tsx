import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import AppLayout from "@/components/AppLayout";
import {
  ArrowLeft,
  Bell,
  CheckCircle,
  Clock,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  report_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading || !user) return;

    const fetchNotifications = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userUuid = session?.user.id;
        
        if (!userUuid) return;

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userUuid)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setNotifications(data || []);
      } catch (err) {
        console.error("Error fetching notifications:", err);
      } finally {
        setFetching(false);
      }
    };

    void fetchNotifications();

    // Set up real-time subscription
    const setupSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userUuid = session?.user.id;
      if (!userUuid) return null;

      return supabase
        .channel('notifications-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userUuid}`,
          },
          () => {
            void fetchNotifications();
          }
        )
        .subscribe();
    };

    const subPromise = setupSubscription();

    return () => {
      subPromise.then(channel => {
        if (channel) void supabase.removeChannel(channel);
      });
    };
  }, [loading, user]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    // Mark as read in background
    if (!notification.is_read) {
      void markAsRead(notification.id);
    }
    
    // Navigate using both courseId and reportId if available
    const params = new URLSearchParams();
    if (notification.course_id) params.set("courseId", notification.course_id.toString());
    if (notification.report_id) params.set("reportId", notification.report_id);
    
    const queryString = params.toString();
    navigate(queryString ? `/class-chat?${queryString}` : "/map");
  };

  if (loading) return null;
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <AppLayout activeTab="dashboard">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">
            Notifications
          </h1>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
            <Bell className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </div>

      <div className="p-4">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-700">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1">
              You have no new notifications at the moment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(notification => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "w-full text-left bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3 transition-all active:scale-[0.98]",
                  !notification.is_read ? "shadow-md border-emerald-100" : "opacity-80"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    !notification.is_read ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
                  )}
                >
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className={cn(
                      "text-sm font-bold truncate",
                      !notification.is_read ? "text-gray-900" : "text-gray-600"
                    )}>
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0 ml-2" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <Clock className="w-3 h-3" />
                    {new Date(notification.created_at).toLocaleDateString()} · {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 mt-1" />
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
