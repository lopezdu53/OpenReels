import { DarkSelect } from "@/components/DarkSelect";
import { cn } from "@/lib/utils";

type FlowImage = { id: string; label: string; note?: string; credits?: number };
type FlowVideo = {
  id: string;
  label: string;
  note?: string;
  durations?: number[];
  creditPerSecond?: number;
};

export type StudioVisualKey = "atlas" | "gflow" | "toby" | "cloudflare";

type Catalog = {
  visualProviders?: { key: string; label: string }[];
  gflowImageModels?: FlowImage[];
  gflowVideoModels?: FlowVideo[];
  tobyImageModels?: FlowImage[];
  tobyVideoModels?: FlowVideo[];
  atlasReady?: boolean;
  gflowBridge?: boolean;
  tobyReady?: boolean;
  doctor?: { ok: boolean; detail: string };
} | null;

const FALLBACK = [
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Nano Banana · Flow)" },
];

function planTakes(supported: number[], wanted: number): number[] {
  const clean = [...new Set(supported.filter((d) => d > 0))].sort((a, b) => a - b);
  const target = Math.max(1, Math.round(wanted));
  if (!clean.length) return [target];
  const max = clean.at(-1) ?? 8;
  if (target <= max) {
    if (clean.includes(target)) return [target];
    return [clean.find((d) => d >= target) ?? max];
  }
  const takes: number[] = [];
  let remaining = target;
  while (remaining > 0) {
    if (remaining <= max) {
      takes.push(clean.find((d) => d >= remaining) ?? max);
      break;
    }
    takes.push(max);
    remaining -= max;
  }
  return takes;
}

function videoCredits(model: FlowVideo | undefined, durationSec: number): number {
  if (!model?.creditPerSecond) return 0;
  return planTakes(model.durations ?? [8], durationSec).reduce(
    (sum, clip) => sum + Math.round((model.creditPerSecond ?? 0) * clip),
    0,
  );
}

export function StudioVisualFields(props: {
  catalog: Catalog;
  visualProvider: StudioVisualKey;
  onVisualProvider: (value: StudioVisualKey) => void;
  gflowImageModel: string;
  onGflowImageModel: (value: string) => void;
  gflowVideoModel: string;
  onGflowVideoModel: (value: string) => void;
  showVideo?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  gflowHint: string;
  tobyHint?: string;
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
    tobyHint,
    durationSec,
  } = props;

  const allowToby = (catalog?.visualProviders ?? []).some((p) => p.key === "toby");
  const usingToby = visualProvider === "toby";
  const usingFlow = visualProvider === "gflow" || usingToby;
  const images = usingToby
    ? (catalog?.tobyImageModels ?? [
        { id: "nano-pro", label: "Toby_nano-pro", credits: 0 },
        { id: "nano2", label: "Toby_nano2.1", credits: 0 },
        { id: "nano-lite", label: "Toby_nano-lite", credits: 0 },
      ])
    : (catalog?.gflowImageModels ?? [
        { id: "nano-pro", label: "Nano Banana Pro", credits: 0 },
        { id: "nano2", label: "Nano Banana 2.1", credits: 0 },
        { id: "nano-lite", label: "Nano Banana 2 Lite", credits: 0 },
      ]);
  const videos = usingToby
    ? (catalog?.tobyVideoModels ?? [
        { id: "omni-flash", label: "Toby_omni-flash", durations: [4, 6, 8], creditPerSecond: 2 },
      ])
    : (catalog?.gflowVideoModels ?? [
        { id: "omni-flash", label: "Omni 1.1 Flash", durations: [4, 6, 8], creditPerSecond: 2 },
      ]);
  const video = videos.find((m) => m.id === gflowVideoModel) ?? videos[0];
  const supported = video?.durations ?? [8];
  const takes =
    durationSec != null
      ? planTakes(supported, durationSec)
      : [supported.includes(8) ? 8 : (supported.at(-1) ?? 8)];
  const clipCredits = takes.reduce(
    (sum, clip) => sum + Math.round((video?.creditPerSecond ?? 0) * clip),
    0,
  );

  return (
    <div className="space-y-2">
      <div className="block text-xs text-muted-foreground">
        Visuales
        <DarkSelect
          aria-label="Visuales"
          className="mt-1 h-10 w-full min-w-full"
          value={visualProvider}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "toby" && allowToby) onVisualProvider("toby");
            else if (value === "gflow") onVisualProvider("gflow");
            else if (value === "cloudflare") onVisualProvider("cloudflare");
            else onVisualProvider("atlas");
          }}
          options={(catalog?.visualProviders ?? FALLBACK).map((p) => ({
            value: p.key,
            label: p.label,
          }))}
        />
      </div>
      {disabled && disabledHint ? (
        <p className="text-[11px] text-muted-foreground">{disabledHint}</p>
      ) : null}
      {!disabled && usingFlow ? (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            Imagen
            <DarkSelect
              aria-label={usingToby ? "Modelo Imagen Toby" : "Modelo Imagen gflow"}
              value={gflowImageModel}
              onValueChange={onGflowImageModel}
              options={images.map((m) => ({
                value: m.id,
                label: m.label,
                hint: `${m.note ?? (usingToby ? "Toby Flow" : "Flow")} · 0 créditos`,
              }))}
            />
          </div>
          {showVideo ? (
            <div className="flex items-center gap-2">
              Video
              <DarkSelect
                aria-label={usingToby ? "Modelo video Toby" : "Modelo video gflow"}
                value={gflowVideoModel}
                onValueChange={onGflowVideoModel}
                options={videos.map((m) => {
                  const jobDur = durationSec ?? m.durations?.at(-1) ?? 8;
                  return {
                    value: m.id,
                    label: m.label,
                    hint: `${m.durations?.join("/") ?? "8"}s · ${planTakes(m.durations ?? [8], jobDur).length} toma(s) · ~${videoCredits(m, jobDur)} cr 720p×1`,
                  };
                })}
              />
            </div>
          ) : null}
          <p className={cn("w-full text-[11px]")}>
            Imagen 0 créditos.{" "}
            {showVideo
              ? `Video ${video?.label ?? ""} ${takes.join("+")}s (${takes.length} toma${takes.length === 1 ? "" : "s"} encadenada${takes.length === 1 ? "" : "s"}) ≈ ${clipCredits} créditos Flow (720p ×1). `
              : ""}
            {usingToby
              ? (tobyHint ??
                "Toby Flow MCP: Chrome + extensión + Auto Download. Créditos de tu cuenta Flow, no de Toby.")
              : gflowHint}
            {usingToby
              ? catalog?.tobyReady === false
                ? " Falta TOBY_MCP_TOKEN en video / video-worker."
                : ""
              : catalog?.gflowBridge === false
                ? " El puente no está configurado en este entorno."
                : catalog?.doctor && !catalog.doctor.ok
                  ? ` Puente: ${catalog.doctor.detail}`
                  : ""}
          </p>
        </div>
      ) : !disabled && visualProvider === "cloudflare" ? (
        <p className="text-[11px] text-muted-foreground">
          Cloudflare FLUX T2I (~$0.00085/img). Workers AI no tiene I2V: anima con Atlas, gflow, fal o Grok.
        </p>
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
