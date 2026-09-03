import type { LucideIcon } from "lucide-react";
import { Clapperboard, ImageIcon, Layers, Type, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES: {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  expensive?: boolean;
}[] = [
  { key: "ai_image", label: "Imagen IA", hint: "Generada por API", icon: ImageIcon },
  { key: "stock_image", label: "Stock foto", hint: "Pexels / Pixabay", icon: Layers },
  { key: "stock_video", label: "Stock video", hint: "Clip real", icon: Clapperboard },
  { key: "text_card", label: "Tarjeta de texto", hint: "Tipografía", icon: Type },
  { key: "ai_video", label: "Video IA", hint: "~$0.30 / escena", icon: Video, expensive: true },
];

interface VisualTypeGridProps {
  selected: string[];
  stockAvailable: boolean;
  onToggle: (key: string, nextChecked: boolean) => void;
  atelierMode: boolean;
  onAtelier: (on: boolean) => void;
  hideAtelier?: boolean;
}

export function VisualTypeGrid({
  selected,
  stockAvailable,
  onToggle,
  atelierMode,
  onAtelier,
  hideAtelier,
}: VisualTypeGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {TYPES.map(({ key, label, hint, icon: Icon, expensive }) => {
        const checked = selected.includes(key);
        const stockDisabled = !stockAvailable && (key === "stock_image" || key === "stock_video");
        return (
          <button
            key={key}
            type="button"
            disabled={stockDisabled}
            onClick={() => {
              if (stockDisabled) return;
              onToggle(key, !checked);
            }}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all",
              stockDisabled && "opacity-40 cursor-not-allowed",
              checked
                ? expensive
                  ? "border-status-warning/50 bg-status-warning/10 ring-1 ring-status-warning/30"
                  : "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                : "border-border bg-white/[0.02] hover:border-muted-foreground/40",
            )}
          >
            <Icon className={cn("size-4", checked ? (expensive ? "text-status-warning" : "text-primary") : "text-muted-foreground")} />
            <span className="text-xs font-semibold leading-tight">{label}</span>
            <span className="text-[10px] text-muted-foreground">{stockDisabled ? "Sin API de stock" : hint}</span>
            {checked && (
              <span className="absolute top-2 right-2 text-[10px] font-bold text-primary">✓</span>
            )}
          </button>
        );
      })}
      {!hideAtelier ? (
      <button
        type="button"
        onClick={() => onAtelier(!atelierMode)}
        className={cn(
          "relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all",
          atelierMode
            ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30"
            : "border-border bg-white/[0.02] hover:border-muted-foreground/40",
        )}
      >
        <Layers className={cn("size-4", atelierMode ? "text-violet-400" : "text-muted-foreground")} />
        <span className="text-xs font-semibold leading-tight">Atelier</span>
        <span className="text-[10px] text-muted-foreground">Identidad gráfica (activo por defecto)</span>
        {atelierMode && <span className="absolute top-2 right-2 text-[10px] font-bold text-violet-400">✓</span>}
      </button>
      ) : null}
    </div>
  );
}
