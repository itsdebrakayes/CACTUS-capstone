import { AlertTriangle, ChevronRight, X } from "lucide-react";

export interface HazardReportOption {
  type: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
}

interface MapHazardReportSheetProps {
  open: boolean;
  title: string;
  subtitle: string;
  helperText?: string;
  options: HazardReportOption[];
  onClose: () => void;
  onSelect: (option: HazardReportOption) => void;
}

export default function MapHazardReportSheet({
  open,
  title,
  subtitle,
  helperText,
  options,
  onClose,
  onSelect,
}: MapHazardReportSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[70vh] rounded-t-3xl border-t border-gray-100 bg-white shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.15)]">
        <div className="px-5 pb-4 pt-3 shrink-0">
          <div className="mb-3 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-gray-200" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
              <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="cactus-scrollbar overflow-y-auto px-4 pb-8">
          {helperText ? (
            <p className="mb-3 text-xs leading-relaxed text-gray-400">
              {helperText}
            </p>
          ) : null}
          <div className="space-y-2">
            {options.map((option) => (
              <button
                key={option.type}
                onClick={() => onSelect(option)}
                className="w-full rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  backgroundColor: option.bg,
                  borderColor: option.border,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${option.color}20` }}
                  >
                    <AlertTriangle
                      className="h-4 w-4"
                      style={{ color: option.color }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-bold"
                      style={{ color: option.color }}
                    >
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {option.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
