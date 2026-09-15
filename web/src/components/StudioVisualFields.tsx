import { DarkSelect } from "@/components/DarkSelect";
import { cn } from "@/lib/utils";

type GflowImage = { id: string; label: string; note?: string; credits?: number };
type GflowVideo = {
  id: string;
  label: string;
  note?: string;
  durations?: number[];
  creditPerSecond?: number;
};

type Catalog = {
  visualProviders?: { key: string; label: string }[];
  gflowImageModels?: GflowImage[];
  gflowVideoModels?: GflowVideo[];
  atlasReady?: boolean;
  gflowBridge?: boolean;
  doctor?: { ok: boolean; detail: string };
} | null;

const FALLBACK = [
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Nano Banana · Flow)" },
];

function videoCredits(model: GflowVideo | undefined, durationSec: number): number {
  if (!model?.creditPerSecond) return 0;
  const durs = model.durations ?? [8];
  const clip = durs.includes(durationSec)
    ? durationSec
    : (durs.find((d) => d >= durationSec) ?? durs[durs.length - 1] ?? 8);
  return Math.round(model.creditPerSecond * clip);
}

export function StudioVisualFields(props: {
  catalog: Catalog;
  visualProvider: "atlas" | "gflow";
  onVisualProvider: (value: "atlas" | "gflow") => void;
  gflowImageModel: string;
  onGflowImageModel: (value: string) => void;
  gflowVideoModel: string;
  onGflowVideoModel: (value: string) => void;
  showVideo?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  gflowHint: string;
  durationSec?: number;
}) {
  const {
    catalog,
    visualProvider,
    onVisualProvider,
    gflowImageModel,
    onGflowImageModel,
    gflowVideoModel,
    onGflowVideoModel,
    showVideo = true,
    disabled,
    disabledHint,
    gflowHint,
    durationSec = 15,
  } = props;

  const images = catalog?.gflowImageModels ?? [
    { id: "nano-pro", label: "Nano Banana Pro", credits: 0 },
    { id: "nano2", label: "Nano Banana 2", credits: 0 },
    { id: "nano-lite", label: "Nano Banana 2 Lite", credits: 0 },
  ];
  const videos = catalog?.gflowVideoModels ?? [
    { id: "omni-flash", label: "Omni 1.1 Flash", durations: [4, 6, 8, 10], creditPerSecond: 2 },
  ];
  const video = videos.find((m) => m.id === gflowVideoModel) ?? videos[0];
  const clipCredits = videoCredits(video, durationSec);
  const clipSeconds = video?.durations?.includes(durationSec)
    ? durationSec
    : (video?.durations?.find((d) => d >= durationSec) ?? video?.durations?.at(-1) ?? 8);

  return (
    <div className="space-y-2">
      <div className="block text-xs text-muted-foreground">
        Visuales
        <DarkSelect
          aria-label="Visuales"
          className="mt-1 h-10 w-full min-w-full"
          value={visualProvider}
          disabled={disabled}
          onValueChange={(value) => onVisualProvider(value === "gflow" ? "gflow" : "atlas")}
          options={(catalog?.visualProviders ?? FALLBACK).map((p) => ({
            value: p.key,
            label: p.label,
          }))}
        />
      </div>
      {disabled && disabledHint ? (
        <p className="text-[11px] text-muted-foreground">{disabledHint}</p>
      ) : null}
      {!disabled && visualProvider === "gflow" ? (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            Imagen
            <DarkSelect
              aria-label="Modelo Imagen gflow"
              value={gflowImageModel}
              onValueChange={onGflowImageModel}
              options={images.map((m) => ({
                value: m.id,
                label: m.label,
                hint: `${m.note ?? "Flow"} · 0 créditos`,
              }))}
            />
          </div>
          {showVideo ? (
            <div className="flex items-center gap-2">
              Video
              <DarkSelect
                aria-label="Modelo video gflow"
                value={gflowVideoModel}
                onValueChange={onGflowVideoModel}
                options={videos.map((m) => ({
                  value: m.id,
                  label: m.label,
                  hint: `${m.durations?.join("/") ?? "8"}s · ~${videoCredits(m, durationSec)} cr 720p×1`,
                }))}
              />
            </div>
          ) : null}
          <p className={cn("w-full text-[11px]")}>
            Imagen 0 créditos.{" "}
            {showVideo
              ? `Video ${video?.label ?? ""} ${clipSeconds}s ≈ ${clipCredits} créditos Flow (720p ×1). `
              : ""}
            {gflowHint}
            {catalog?.gflowBridge === false
              ? " El puente no está configurado en este entorno."
              : catalog?.doctor && !catalog.doctor.ok
                ? ` Puente: ${catalog.doctor.detail}`
                : ""}
          </p>
        </div>
      ) : !disabled ? (
        <p className="text-[11px] text-muted-foreground">
          Atlas Cloud usa <span className="font-medium text-foreground">ATLASCLOUD_API_KEY</span>{" "}
          del servidor
          {catalog?.atlasReady === false
            ? " — no está configurada en video / video-worker."
            : " — no hace falta pegarla."}
        </p>
      ) : null}
    </div>
  );
}
