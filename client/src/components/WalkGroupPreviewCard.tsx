import { Button } from "@/components/ui/button";
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
  if (!value) {
    return "Leaving time not set";
  }

  const leavingAt = new Date(value);
  if (Number.isNaN(leavingAt.getTime())) {
    return "Leaving time not set";
  }

  return leavingAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
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
    <div className="pointer-events-auto mx-auto max-w-md rounded-3xl border border-gray-100 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#00c853]">
            Walk Group
          </p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">
            {group.destinationName}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Meet at {group.meetingPointName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-gray-50 px-3 py-3">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <MapPin className="h-3.5 w-3.5" />
              Meeting
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {group.meetingPointName}
            </p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-3 py-3">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <Clock3 className="h-3.5 w-3.5" />
              Leaving
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {formatLeavingTime(group.leavingAt)}
            </p>
          </div>
          <div className="rounded-2xl bg-gray-50 px-3 py-3">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <Users className="h-3.5 w-3.5" />
              Members
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {group.memberCount} joined
            </p>
          </div>
        </div>

        {group.note ? (
          <div className="rounded-2xl border border-[#e8faf0] bg-[#f5fff8] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#00a844]">
              Note
            </p>
            <p className="mt-1 text-sm text-gray-700">{group.note}</p>
          </div>
        ) : null}
      </div>

      <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={onClose}
        >
          Close
        </Button>
        <Button
          type="button"
          className="flex-1 rounded-xl bg-[#00c853] hover:bg-[#00b84a]"
          onClick={group.isCurrentUserMember ? onOpen : onJoin}
          disabled={isJoining || (!group.isCurrentUserMember && hasOtherActiveGroup)}
        >
          {isJoining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            primaryActionLabel
          )}
        </Button>
      </div>
    </div>
  );
}
