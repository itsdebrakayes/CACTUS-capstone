import React from "react";
import AppLayout from "@/components/AppLayout";
import { ChevronLeft, Calendar, MapPin, Ticket, Share2, PartyPopper } from "lucide-react";
import { useLocation } from "wouter";

// Event Images
import carnivalImg from "@/assets/image/uwi_carnival.jpg";
import runImg from "@/assets/image/5k_run.jpg";
import homecomingImg from "@/assets/image/home_coming.jpeg";
import sportsDayImg from "@/assets/image/sports_day.jpg";
import freshersImg from "@/assets/image/uwi_freshers.png";

interface CampusEvent {
  id: string;
  name: string;
  tagline: string;
  description: string;
  dateBadge: string;
  image: string;
  category: string;
}

const EVENTS: CampusEvent[] = [
  {
    id: "carnival",
    name: "UWI Carnival",
    tagline: "The ultimate campus experience",
    description: "Experience the rhythm, color, and energy of the biggest campus carnival. Join thousands of students for an unforgettable celebration of culture and community.",
    dateBadge: "This Week",
    image: carnivalImg,
    category: "Social",
  },
  {
    id: "5k",
    name: "UWI 5K",
    tagline: "Get your sweat on",
    description: "Run, walk, or jog for a cause! The annual UWI 5K brings the campus together for health, fitness, and fundraising for student scholarships.",
    dateBadge: "Next Sat",
    image: runImg,
    category: "Sports",
  },
  {
    id: "homecoming",
    name: "Homecoming",
    tagline: "Time to see who is the winning hall",
    description: "The ultimate battle of the halls! Cheer for your residence, participate in traditions, and show your UWI pride during this week-long celebration.",
    dateBadge: "In 2 Weeks",
    image: homecomingImg,
    category: "Tradition",
  },
  {
    id: "sports-day",
    name: "UWI Sports Day",
    tagline: "Dust your shoes and make your move",
    description: "Athleticism meets school spirit. From track events to cheerleading, witness the best athletes on campus compete for the championship trophy.",
    dateBadge: "Next Month",
    image: sportsDayImg,
    category: "Sports",
  },
  {
    id: "freshers",
    name: "UWI Freshers",
    tagline: "Your journey starts here",
    description: "A warm welcome to all new students! Meet your peers, explore campus organizations, and get a head start on your university life at the official welcome social.",
    dateBadge: "Aug 28",
    image: freshersImg,
    category: "Social",
  },
];

export default function CampusEventsPage() {
  const [, navigate] = useLocation();

  return (
    <AppLayout activeTab="profile">
      <div className="min-h-screen bg-slate-50">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 px-5 pt-12 pb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/profile")}
              className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600 active:scale-90 transition-transform"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
                Campus Events
              </h1>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
                Happening at UWI
              </p>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="px-5 pt-8 pb-6">
          <div className="relative rounded-[32px] overflow-hidden bg-slate-900 aspect-[16/9] flex items-center p-8">
            <div className="absolute inset-0 opacity-40 bg-gradient-to-r from-emerald-500 to-blue-500" />
            <div className="relative z-10">
              <span className="bg-white/20 backdrop-blur-md text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3 inline-block">
                Featured Today
              </span>
              <h2 className="text-3xl font-black text-white leading-tight mb-2">
                UWI Carnival <br /> Is Live!
              </h2>
              <button 
                onClick={() => navigate("/map")}
                className="bg-white text-slate-900 text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xl shadow-black/20"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                Find on Map
              </button>
            </div>
            <div className="absolute right-[-20px] bottom-[-20px] opacity-20">
              <PartyPopper className="w-48 h-48 text-white rotate-[-15deg]" />
            </div>
          </div>
        </div>

        {/* Filters/Tabs placeholder */}
        <div className="px-5 mb-8 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {["All", "Social", "Sports", "Tradition", "Academic"].map((tag, i) => (
            <button
              key={tag}
              className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                i === 0 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" 
                  : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Events List */}
        <div className="px-5 space-y-8 pb-24">
          {EVENTS.map((event) => (
            <div 
              key={event.id}
              className="group bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500"
            >
              <div className="relative aspect-video overflow-hidden">
                <img 
                  src={event.image} 
                  alt={event.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-white/90 backdrop-blur-sm text-slate-900 text-[10px] font-black px-3 py-1.5 rounded-xl shadow-lg uppercase tracking-wider">
                    {event.dateBadge}
                  </span>
                </div>
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                      {event.name}
                    </h3>
                    <p className="text-emerald-500 font-bold text-sm mt-0.5">
                      {event.tagline}
                    </p>
                  </div>
                  <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {event.category}
                    </span>
                  </div>
                </div>
                
                <p className="text-slate-500 text-sm leading-relaxed mb-6 line-clamp-2">
                  {event.description}
                </p>
                
                <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                  <button className="flex-1 bg-slate-900 text-white text-xs font-black py-4 rounded-2xl shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-colors active:scale-[0.98]">
                    Remind Me
                  </button>
                  <button className="flex-1 bg-emerald-50 text-emerald-600 text-xs font-black py-4 rounded-2xl hover:bg-emerald-100 transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
                    <Ticket className="w-4 h-4" />
                    Join Event
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
