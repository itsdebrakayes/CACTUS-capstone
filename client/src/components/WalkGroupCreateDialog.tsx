import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock3, Crosshair, Loader2, Users } from "lucide-react";

interface MeetingPointSelection {
  name: string;
  coordinates: [number, number];
}

interface WalkGroupCreateDialogProps {
  open: boolean;
  mode: "warning" | "form";
  destinationName: string;
  selectedMeetingPoint: MeetingPointSelection | null;
  isPickingMeetingPoint: boolean;
  leavingOffsetMin: number;
  note: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onPickMeetingPoint: () => void;
  onLeavingOffsetChange: (value: number) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onContinue: () => void;
  onCreate: () => void;
}

const LEAVING_OPTIONS = [
  { value: 0, label: "Now" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
];

export default function WalkGroupCreateDialog({
  open,
  mode,
  destinationName,
  selectedMeetingPoint,
  isPickingMeetingPoint,
  leavingOffsetMin,
  note,
  isSubmitting,
  onOpenChange,
  onPickMeetingPoint,
  onLeavingOffsetChange,
  onNoteChange,
  onCancel,
  onContinue,
  onCreate,
}: WalkGroupCreateDialogProps) {
  const meetingLat = selectedMeetingPoint?.coordinates[1];
  const meetingLng = selectedMeetingPoint?.coordinates[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border border-border bg-card p-0 shadow-xl">
        {mode === "warning" ? (
          <>
            <DialogHeader className="px-6 pt-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-light">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-left text-xl font-bold text-foreground">
                Start a Walk Group
              </DialogTitle>
              <DialogDescription className="text-left text-sm leading-6 text-muted-foreground">
                Start your walk group at least 20 minutes before class time so
                others have enough time to join and meet up.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-border px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Start Walk Group
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6">
              <DialogTitle className="text-left text-xl font-bold text-foreground">
                Create Walk Group
              </DialogTitle>
              <DialogDescription className="text-left text-sm text-muted-foreground">
                Heading to{" "}
                <span className="font-semibold text-primary">{destinationName}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 py-4">
              {/* Meeting point */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  Where should people meet?
                </label>
                <div className="rounded-xl border border-border bg-secondary p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-light">
                      <Crosshair className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {selectedMeetingPoint ? selectedMeetingPoint.name : "No meeting point selected yet"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedMeetingPoint && meetingLat != null && meetingLng != null
                          ? `Lat ${meetingLat.toFixed(6)}, Lng ${meetingLng.toFixed(6)}`
                          : "Tap the map to place the meeting marker."}
                      </p>
                      {isPickingMeetingPoint && (
                        <p className="mt-2 text-xs font-semibold text-primary">
                          Picking mode is active. Tap anywhere on the map.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onPickMeetingPoint}
                    disabled={isSubmitting}
                    className="mt-3 w-full py-2 rounded-xl border border-primary/30 text-primary text-sm font-semibold hover:bg-teal-light transition-colors flex items-center justify-center gap-2"
                  >
                    <Crosshair className="h-4 w-4" />
                    {selectedMeetingPoint ? "Change on Map" : "Pick on Map"}
                  </button>
                </div>
              </div>

              {/* Leaving time */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  When are you leaving?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {LEAVING_OPTIONS.map((option) => {
                    const isSelected = option.value === leavingOffsetMin;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onLeavingOffsetChange(option.value)}
                        className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary text-foreground hover:bg-secondary/80"
                        }`}
                      >
                        <div className="mb-1 flex justify-center">
                          <Clock3 className="h-4 w-4" />
                        </div>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  Optional note
                </label>
                <textarea
                  value={note}
                  onChange={(event) => onNoteChange(event.currentTarget.value)}
                  rows={3}
                  placeholder="Meet beside the benches."
                  className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCreate}
                disabled={isSubmitting || !selectedMeetingPoint}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Walk Group"
                )}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
