import { useEffect, useState } from "react";
import { DarkSelect } from "@/components/DarkSelect";
import { api, type GflowBridgeChoice } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const BRIDGE_KEY = "openreels_gflow_bridge";

export function loadGflowBridgeId(): string {
  try {
    return localStorage.getItem(BRIDGE_KEY) || "auto";
  } catch {
    return "auto";
  }
}

export function saveGflowBridgeId(id: string): void {
  try {
    localStorage.setItem(BRIDGE_KEY, id);
  } catch {
    /* ignore */
  }
}

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
  gflowBridges?: GflowBridgeChoice[];
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

function videoCredits(model: GflowVideo | undefined, durationSec: number): number {
  if (!model?.creditPerSecond) return 0;
  return planTakes(model.durations ?? [8], durationSec).reduce(
    (sum, clip) => sum + Math.round((model.creditPerSecond ?? 0) * clip),
    0,
  );
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
  gflowBridgeId?: string;
  onGflowBridgeId?: (value: string) => void;
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
    durationSec,
    gflowBridgeId = "auto",
    onGflowBridgeId,
  } = props;
  const [liveBridges, setLiveBridges] = useState<GflowBridgeChoice[]>(catalog?.gflowBridges ?? []);

  useEffect(() => {
    if (visualProvider !== "gflow") return;
    let live = true;
    const load = () => {
      api
        .gflowBridges()
        .then((r) => {
          if (live && r.bridges?.length) setLiveBridges(r.bridges);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [visualProvider]);

  const bridges =
    liveBridges.length > 0
      ? liveBridges
      : (catalog?.gflowBridges ?? [
          {
            id: "auto",
            label: "Automático",
            note: "LAN si responde; si no, cualquier remoto",
            kind: "auto" as const,
            online: true,
          },
        ]);
  const bridgeValue = bridges.some((b) => b.id === gflowBridgeId) ? gflowBridgeId : "auto";

  const images = catalog?.gflowImageModels ?? [
    { id: "nano-pro", label: "Nano Banana Pro", credits: 0 },
    { id: "nano2", label: "Nano Banana 2", credits: 0 },
    { id: "nano-lite", label: "Nano Banana 2 Lite", credits: 0 },
  ];
  const videos = catalog?.gflowVideoModels ?? [
    { id: "omni-flash", label: "Omni 1.1 Flash", durations: [4, 6, 8, 10], creditPerSecond: 2 },
    { id: "veo-lite", label: "Veo 3.1 Lite", durations: [4, 6, 8], creditPerSecond: 5 },
    {
      id: "veo-lite-lp",
      label: "Veo 3.1 Lite (Lower Priority)",
      durations: [4, 6, 8],
      creditPerSecond: 0,
    },
    { id: "veo-fast", label: "Veo 3.1 Fast", durations: [4, 6, 8], creditPerSecond: 10 },
    { id: "veo-quality", label: "Veo 3.1 Quality", durations: [4, 6, 8], creditPerSecond: 20 },
  ];
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
          <div className="flex items-center gap-2">
            Puente
            <DarkSelect
              aria-label="Puente Windows"
              value={bridgeValue}
              onValueChange={(value) => {
                saveGflowBridgeId(value);
                onGflowBridgeId?.(value);
              }}
              options={bridges.map((b) => ({
                value: b.id,
                label: b.online || b.kind === "auto" ? b.label : `${b.label} · offline`,
                hint: b.note,
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
