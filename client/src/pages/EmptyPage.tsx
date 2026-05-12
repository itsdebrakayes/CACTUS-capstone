import AppLayout from "@/components/AppLayout";
import { MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function EmptyPage() {
  const [, navigate] = useLocation();

  return (
    <AppLayout activeTab="dashboard">
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">
            Chat
          </h1>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-32 px-10 text-center">
        <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
          <MessageSquare className="w-10 h-10 text-gray-300" />
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">Coming Soon</h3>
        <p className="text-sm font-medium text-gray-400 leading-relaxed">
          The global community chat is currently under maintenance. Please use the course-specific chat for real-time updates.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="mt-8 px-8 py-3 bg-gray-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl active:scale-95 transition-all"
        >
          Back to Dashboard
        </button>
      </div>
    </AppLayout>
  );
}
