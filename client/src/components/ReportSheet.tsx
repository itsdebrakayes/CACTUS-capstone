/**
 * ReportSheet — slide-up bottom sheet for submitting a course update report.
 *
 * Props:
 *   courseId     – the course being reported on
 *   initialType  – pre-select a category (e.g. from a quick-report button)
 *   onClose      – called when the sheet should be dismissed
 *   onSubmit     – called with { type, title, comment } after successful submit
 */

import { useState, useEffect } from "react";
import { X, Clock, AlertCircle, MapPin, Calendar, BookOpen, MessageSquare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReportCategory =
  | "lecturer_late"
  | "cancelled"
  | "room_changed"
  | "rescheduled"
  | "materials_uploaded"
  | "general";

interface ReportSheetProps {
  courseId: number;
  initialType?: ReportCategory;
  onClose: () => void;
  /** Called when the user confirms; parent is responsible for the tRPC call */
  onSubmit: (data: { type: ReportCategory; title: string; comment: string }) => void;
  isPending?: boolean;
}

const CATEGORIES: {
  type: ReportCategory;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    type: "lecturer_late",
    label: "Lecturer Late",
    description: "Lecturer hasn't arrived yet",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    type: "cancelled",
    label: "Cancelled",
    description: "Class won't be happening",
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  {
    type: "room_changed",
    label: "Room Changed",
    description: "Class moved to another room",
    icon: MapPin,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    type: "rescheduled",
    label: "Rescheduled",
    description: "Class moved to a different time",
    icon: Calendar,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
  {
    type: "materials_uploaded",
    label: "Materials Posted",
    description: "New notes or slides available",
    icon: BookOpen,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  {
    type: "general",
    label: "General Update",
    description: "Other class information",
    icon: MessageSquare,
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
  },
];

const DEFAULT_TITLES: Record<ReportCategory, string> = {
  lecturer_late: "Lecturer is late",
  cancelled: "Class has been cancelled",
  room_changed: "Class room has changed",
  rescheduled: "Class has been rescheduled",
  materials_uploaded: "New materials posted",
  general: "Class update",
};

export default function ReportSheet({
  initialType,
  onClose,
  onSubmit,
  isPending = false,
}: ReportSheetProps) {
  const [selectedType, setSelectedType] = useState<ReportCategory | null>(initialType ?? null);
  const [comment, setComment] = useState("");
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  const handleSubmit = () => {
    if (!selectedType) return;
    onSubmit({
      type: selectedType,
      title: DEFAULT_TITLES[selectedType],
      comment: comment.trim(),
    });
  };

  const selected = CATEGORIES.find((c) => c.type === selectedType);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-250",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-250 ease-out",
          visible ? "translate-y-0" : "translate-y-full"
        )}
        style={{ maxHeight: "85vh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Submit Report</h2>
            <p className="text-xs text-gray-500 mt-0.5">Let your classmates know what's happening</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Category grid */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              What's happening?
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedType === cat.type;
                return (
                  <button
                    key={cat.type}
                    onClick={() => setSelectedType(cat.type)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-2xl border-2 text-left transition-all duration-150",
                      isSelected
                        ? `${cat.bg} ${cat.border} shadow-sm`
                        : "bg-white border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        isSelected ? cat.bg : "bg-gray-50"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isSelected ? cat.color : "text-gray-400")} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold leading-tight", isSelected ? cat.color : "text-gray-700")}>
                        {cat.label}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{cat.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment field — shown once a category is selected */}
          {selectedType && (
            <div
              className={cn(
                "transition-all duration-200",
                selectedType ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              )}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Add a comment <span className="font-normal normal-case text-gray-400">(optional)</span>
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  selectedType === "room_changed"
                    ? "e.g. Moved to FST 1, Room 204"
                    : selectedType === "lecturer_late"
                    ? "e.g. About 15 minutes late, no message sent"
                    : selectedType === "cancelled"
                    ? "e.g. Lecturer sent an email this morning"
                    : "Add any extra details here..."
                }
                maxLength={280}
                rows={3}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white resize-none transition-colors"
              />
              <p className="text-[11px] text-gray-400 text-right mt-1">{comment.length}/280</p>
            </div>
          )}

          {/* Selected summary pill */}
          {selected && (
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border", selected.bg, selected.border)}>
              <selected.icon className={cn("w-3.5 h-3.5 shrink-0", selected.color)} />
              <span className={cn("text-xs font-semibold", selected.color)}>
                Reporting: {selected.label}
              </span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedType || isPending}
            className="w-full h-12 rounded-2xl bg-[#00c853] hover:bg-[#00b84a] text-white font-semibold text-sm shadow-lg shadow-[#00c853]/20 disabled:opacity-50"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Submit Report <ChevronRight className="w-4 h-4" />
              </span>
            )}
          </Button>

          <p className="text-[11px] text-gray-400 text-center pb-2">
            Reports are reviewed by class representatives before being broadcast.
          </p>
        </div>
      </div>
    </>
  );
}
