import AppLayout from "@/components/AppLayout";
import { BookOpen, ChevronLeft, FileText, Users } from "lucide-react";
import { useLocation } from "wouter";

export default function StudyMaterialPage() {
  const [, navigate] = useLocation();

  return (
    <AppLayout activeTab="dashboard">
      <div className="min-h-screen bg-[#f8fafc]">
        {/* Header */}
        <div className="bg-white px-5 pt-12 pb-6 border-b border-gray-100 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate("/dashboard")}
              className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 active:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">
              Study Material
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-12 flex flex-col items-center text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-500">
              <BookOpen className="w-10 h-10" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-[#f8fafc]">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight mb-4">
            Coming Soon
          </h2>
          
          <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm max-w-sm">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-6">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-gray-600 font-medium leading-relaxed">
              Your elected class reps and faculty rep will add study materials including past papers very soon. 
            </p>
            <p className="mt-4 text-emerald-600 font-bold text-sm bg-emerald-50 py-2 px-4 rounded-full inline-block">
              Keep them updated!
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 w-full max-w-sm">
            <div className="bg-white/50 border border-dashed border-gray-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-400">Past Papers</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Pending Upload</p>
              </div>
            </div>
            <div className="bg-white/50 border border-dashed border-gray-200 rounded-2xl p-5 flex items-center gap-4 opacity-60">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-400">Lecture Notes</p>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Pending Upload</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
