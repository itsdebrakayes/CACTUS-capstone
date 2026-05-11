import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  MapPlaceFilterKey,
  MapPlaceFilterOption,
} from "@/lib/campusPlaces";

interface MapFilterSheetProps {
  open: boolean;
  options: MapPlaceFilterOption[];
  selectedFilters: MapPlaceFilterKey[];
  onOpen: () => void;
  onClose: () => void;
  onToggleFilter: (filterKey: MapPlaceFilterKey) => void;
}

const DISMISS_DRAG_THRESHOLD_PX = 120;

export default function MapFilterSheet({
  open,
  options,
  selectedFilters,
  onOpen,
  onClose,
  onToggleFilter,
}: MapFilterSheetProps) {
  const dragStartYRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const selectedCount = selectedFilters.length;
  const allSelected = selectedCount === options.length;

  useEffect(() => {
    if (!open) {
      dragOffsetRef.current = 0;
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextOffset = Math.max(0, event.clientY - dragStartYRef.current);
      dragOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);
    };

    const handlePointerUp = () => {
      const shouldDismiss =
        dragOffsetRef.current >= DISMISS_DRAG_THRESHOLD_PX;
      setIsDragging(false);
      dragOffsetRef.current = 0;
      setDragOffset(0);
      if (shouldDismiss) {
        onClose();
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, onClose, open]);

  const handleSheetPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    dragStartYRef.current = event.clientY - dragOffsetRef.current;
    setIsDragging(true);
  };

  return (
    <>
      <div className="absolute right-4 top-4 z-[48]">
        <button
          type="button"
          onClick={open ? onClose : onOpen}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_14px_32px_rgba(15,23,42,0.18)] backdrop-blur-md transition-all active:scale-95 ${
            open
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-white/70 bg-white/92 text-slate-900"
          }`}
          aria-label={open ? "Close map filters" : "Open map filters"}
          aria-pressed={open}
        >
          <HamburgerMenuGlyph className="h-6 w-6" />
          {!allSelected ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-slate-900 px-1.5 text-[10px] font-extrabold text-white shadow-sm">
              {selectedCount}
            </span>
          ) : null}
        </button>
      </div>

      <div
        className={`absolute inset-0 z-[70] transition-opacity duration-300 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/32 backdrop-blur-[1.5px]"
          aria-label="Dismiss map filters"
        />

        <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3">
          <div
            className="w-full max-w-2xl overflow-hidden rounded-t-[30px] rounded-b-[26px] border border-white/70 bg-white shadow-[0_-18px_60px_rgba(15,23,42,0.24)]"
            style={{
              transform: open
                ? `translateY(${dragOffset}px)`
                : "translateY(calc(100% + 24px))",
              transition: isDragging
                ? "none"
                : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              className="cursor-grab touch-none px-6 pb-3 pt-3 active:cursor-grabbing"
              onPointerDown={handleSheetPointerDown}
            >
              <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 pb-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-400">
                    Map Filter
                  </p>
                  <h3 className="mt-1 text-[2rem] font-bold tracking-tight text-slate-950">
                    Map Filter
                  </h3>
                  <p className="mt-1.5 text-sm font-medium text-slate-500">
                    {allSelected
                      ? "All place categories are visible on the map."
                      : `${selectedCount} of ${options.length} categories visible.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                  aria-label="Close map filters"
                >
                  <span className="text-2xl leading-none">&times;</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 pb-2 sm:grid-cols-4">
                {options.map(option => {
                  const Icon = option.icon;
                  const isSelected = selectedFilters.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onToggleFilter(option.key)}
                      aria-pressed={isSelected}
                      className={`rounded-[26px] border px-3 py-4 text-center transition-all active:scale-[0.98] ${
                        isSelected
                          ? "border-transparent shadow-[0_14px_30px_rgba(15,23,42,0.14)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      style={{
                        backgroundColor: isSelected
                          ? `${option.color}14`
                          : "#ffffff",
                        boxShadow: isSelected
                          ? `0 0 0 1.5px ${option.color}, 0 14px 30px rgba(15, 23, 42, 0.12)`
                          : undefined,
                      }}
                    >
                      <div
                        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isSelected
                            ? `${option.color}20`
                            : "#f8fafc",
                          color: option.color,
                        }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <span
                        className={`mt-3 block text-sm font-bold tracking-tight ${
                          isSelected ? "text-slate-950" : "text-slate-700"
                        }`}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HamburgerMenuGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 7.25H20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4 12H20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4 16.75H20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
