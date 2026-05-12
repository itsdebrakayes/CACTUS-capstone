import type { WalkGroupRecord } from "@/lib/supabaseWalkGroups";
import { Clock3, Loader2, MapPin, Users, X } from "lucide-react";

interface WalkGroupPreviewCardProps {
  group: WalkGroupRecord;
  isJoining: boolean;
  hasOtherActiveGroup: boolean;
  onClose: () => void;
  onJoin: () => void;
  onOpen: () => void;
}

function formatLeavingTime(value?: string) {
  if (!value) return "Not set";
  const leavingAt = new Date(value);
  if (Number.isNaN(leavingAt.getTime())) return "Not set";
  return leavingAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function WalkGroupPreviewCard({
  group,
  isJoining,
  hasOtherActiveGroup,
  onClose,
  onJoin,
  onOpen,
}: WalkGroupPreviewCardProps) {
  const primaryActionLabel = group.isCurrentUserMember
    ? "Open Walk Group"
    : hasOtherActiveGroup
      ? "Already in a Group"
      : "Join Walk Group";

  return (
    <div className="pointer-events-auto mx-auto max-w-md bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Walk Group</p>
          <h3 className="mt-1 text-lg font-bold text-foreground">{group.destinationName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Meet at {group.meetingPointName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary px-3 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Meeting
            </p>
            <p className="text-xs font-semibold text-foreground truncate">{group.meetingPointName}</p>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              Leaving
            </p>
            <p className="text-xs font-semibold text-foreground">{formatLeavingTime(group.leavingAt)}</p>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3 w-3" />
              Members
            </p>
            <p className="text-xs font-semibold text-foreground">{group.memberCount} joined</p>
          </div>
        </div>
        {group.note && (
          <div className="rounded-xl bg-teal-light border border-primary/20 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Note</p>
            <p className="mt-1 text-xs text-foreground">{group.note}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors"
        >
          Close
        </button>
        <button
          type="button"
          onClick={group.isCurrentUserMember ? onOpen : onJoin}
          disabled={isJoining || (!group.isCurrentUserMember && hasOtherActiveGroup)}
          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isJoining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            primaryActionLabel
          )}
        </button>
      </div>
    </div>
  );
}
