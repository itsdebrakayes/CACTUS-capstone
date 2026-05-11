// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookMarked, Clock, MapPin, MessageSquare, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ReportCategory =
  | "cancelled"
  | "room_changed"
  | "lecturer_late"
  | "rescheduled"
  | "materials_uploaded"
  | "general";

type ReportSheetProps = {
  courseId: number;
  initialType?: ReportCategory;
  onClose: () => void;
  onSubmit: (payload: { type: ReportCategory; title: string; comment: string }) => void;
  isPending?: boolean;
};

const REPORT_OPTIONS: Array<{
  type: ReportCategory;
  label: string;
  description: string;
  defaultTitle: string;
  icon: React.ElementType;
}> = [
  { type: "lecturer_late", label: "Lecturer Late", description: "Class has not started on time", defaultTitle: "Lecturer will be late today", icon: Clock },
  { type: "cancelled", label: "Cancelled", description: "Today's class will not happen", defaultTitle: "Today's class has been cancelled", icon: AlertCircle },
  { type: "room_changed", label: "Room Changed", description: "Class moved to a new location", defaultTitle: "Class location has changed", icon: MapPin },
  { type: "rescheduled", label: "Rescheduled", description: "Class moved to a new date/time", defaultTitle: "Class has been rescheduled", icon: MessageSquare },
  { type: "materials_uploaded", label: "Materials Uploaded", description: "New resources are available", defaultTitle: "New course materials are available", icon: BookMarked },
  { type: "general", label: "General Update", description: "Share another course update", defaultTitle: "Course update", icon: MessageSquare },
];

export default function ReportSheet({ initialType, onClose, onSubmit, isPending }: ReportSheetProps) {
  const [type, setType] = useState<ReportCategory>(initialType ?? "general");
  const selectedOption = useMemo(() => REPORT_OPTIONS.find((option) => option.type === type) ?? REPORT_OPTIONS[5], [type]);
  const [title, setTitle] = useState(selectedOption.defaultTitle);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (initialType) setType(initialType);
  }, [initialType]);

  useEffect(() => {
    setTitle(selectedOption.defaultTitle);
  }, [selectedOption]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({ type, title: title.trim(), comment: comment.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Close report form" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-3xl border border-white/60 bg-white p-5 shadow-2xl md:inset-y-8 md:right-8 md:left-auto md:rounded-3xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-green-600">Course report</p>
            <h2 className="mt-1 text-xl font-black text-gray-950">Submit an update</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {REPORT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = type === option.type;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setType(option.type)}
                className={cn(
                  "rounded-2xl border p-3 text-left transition-all",
                  active ? "border-green-500 bg-green-50 text-green-900" : "border-gray-200 bg-white text-gray-700 hover:border-green-200",
                )}
              >
                <Icon className="mb-2 h-4 w-4" />
                <p className="text-sm font-bold leading-tight">{option.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-gray-500">{option.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Update title" className="h-11" />
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add helpful details for classmates..." className="min-h-28 resize-none" />
        </div>

        <div className="mt-5 flex gap-3">
          <Button type="button" onClick={onClose} className="flex-1 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !title.trim()} className="flex-1 bg-green-600 text-white hover:bg-green-700">
            <Send className="mr-2 h-4 w-4" />
            {isPending ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}