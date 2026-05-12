import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface NotificationBannerProps {
  notification: {
    id: string;
    title: string;
    message: string;
    course_id?: number | string;
    report_id?: string;
  } | null;
  onDismiss: () => void;
}

export default function NotificationBanner({ notification, onDismiss }: NotificationBannerProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  const handleBannerClick = async () => {
    if (!notification) return;

    // Mark as read
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id);
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }

    // Navigate
    const params = new URLSearchParams();
    if (notification.course_id) params.set("courseId", notification.course_id.toString());
    if (notification.report_id) params.set("reportId", notification.report_id);
    
    const queryString = params.toString();
    navigate(queryString ? `/class-chat?${queryString}` : "/map");
    
    onDismiss();
  };

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] px-4 py-3"
        >
          <div 
            onClick={handleBannerClick}
            className={cn(
              "max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border-l-4 border-emerald-500 overflow-hidden cursor-pointer",
              "flex items-center gap-4 p-4 active:scale-[0.98] transition-transform"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-emerald-600" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-gray-900 truncate">
                {notification.title}
              </h4>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {notification.message}
              </p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
