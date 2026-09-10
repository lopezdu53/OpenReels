import { Clapperboard, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewAiSceneKinds } from "@/lib/video-scene-modes";

interface SceneMixPreviewProps {
  sceneCount: number;
  mode?: string;
  hasVideo: boolean;
  hero?: boolean;
}

export function SceneMixPreview({ sceneCount, mode, hasVideo, hero }: SceneMixPreviewProps) {
  const kinds = previewAiSceneKinds(sceneCount, hero ? "force_all" : mode, hasVideo);
  const videos = kinds.filter((k) => k === "video").length;
  const stills = kinds.length - videos;
  const shown = kinds.slice(0, 24);
  const extra = kinds.length - shown.length;

  return (
    <div className="rounded-xl border border-border/80 bg-surface-inset/60 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Mezcla de escenas
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          ~{sceneCount} planos · {videos} I2V · {stills} foto
        </p>
      </div>
      {hero && hasVideo ? (
        <p className="text-[11px] text-muted-foreground">
          Modo héroe: cada escena genera un still nuevo y luego I2V. No se recicla el mismo fotograma.
        </p>
      ) : null}
      {!hasVideo ? (
        <p className="text-[11px] text-muted-foreground">
          Sin video IA: todas las escenas quedan en imagen fija.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {shown.map((kind, i) => (
          <span
            key={i}
            title={`Escena ${i + 1}: ${kind === "video" ? "I2V" : "imagen"}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              kind === "video"
                ? "bg-status-warning/15 text-status-warning"
                : "bg-muted text-muted-foreground",
            )}
          >
            {kind === "video" ? <Clapperboard className="size-2.5" /> : <ImageIcon className="size-2.5" />}
            {i + 1}
          </span>
        ))}
        {extra > 0 ? (
          <span className="rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground">+{extra}</span>
        ) : null}
      </div>
    </div>
  );
}
