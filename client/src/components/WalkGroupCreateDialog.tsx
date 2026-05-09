import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock3, Crosshair, Loader2, MapPin, Users } from "lucide-react";

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
      <DialogContent className="max-w-lg rounded-3xl border border-gray-100 bg-white p-0 shadow-2xl">
        {mode === "warning" ? (
          <>
            <DialogHeader className="px-6 pt-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8faf0] text-[#00c853]">
                <Users className="h-6 w-6" />
              </div>
              <DialogTitle className="text-left text-2xl font-bold text-gray-900">
                Start a Walk Group
              </DialogTitle>
              <DialogDescription className="text-left text-sm leading-6 text-gray-500">
                Start your walk group at least 20 minutes before class time so
                others have enough time to join and meet up.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-gray-100 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-[#00c853] hover:bg-[#00b84a]"
                onClick={onContinue}
              >
                Start Walk Group
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6">
              <DialogTitle className="text-left text-2xl font-bold text-gray-900">
                Create Walk Group
              </DialogTitle>
              <DialogDescription className="text-left text-sm text-gray-500">
                Set the destination, meeting point, and departure time.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 pb-6">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">
                  Where is the group going?
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {destinationName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Using your selected Find My Way destination
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Where should people meet?
                </label>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#00c853] shadow-sm">
                      <Crosshair className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedMeetingPoint
                          ? selectedMeetingPoint.name
                          : "No meeting point selected yet"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedMeetingPoint && meetingLat != null && meetingLng != null
                          ? `Lat ${meetingLat.toFixed(6)}, Lng ${meetingLng.toFixed(6)}`
                          : "Tap the map to place the meeting marker. The coordinates will be saved to Supabase."}
                      </p>
                      {isPickingMeetingPoint ? (
                        <p className="mt-2 text-xs font-semibold text-[#00a844]">
                          Picking mode is active. Tap anywhere on the map behind
                          this dialog.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full rounded-xl border-[#00c853]/20 text-[#00a844] hover:bg-[#e8faf0]"
                    onClick={onPickMeetingPoint}
                    disabled={isSubmitting}
                  >
                    <Crosshair className="mr-2 h-4 w-4" />
                    {selectedMeetingPoint ? "Change on Map" : "Pick on Map"}
                  </Button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
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
                        className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                          isSelected
                            ? "border-[#00c853] bg-[#00c853] text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
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

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Optional note
                </label>
                <textarea
                  value={note}
                  onChange={(event) => onNoteChange(event.currentTarget.value)}
                  rows={3}
                  placeholder="Meet beside the benches."
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#00c853] focus:ring-2 focus:ring-[#00c853]/10"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-gray-100 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-[#00c853] hover:bg-[#00b84a]"
                onClick={onCreate}
                disabled={isSubmitting || !selectedMeetingPoint}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Walk Group"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
