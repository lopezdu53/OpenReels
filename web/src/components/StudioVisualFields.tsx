import { DarkSelect } from "@/components/DarkSelect";
import { cn } from "@/lib/utils";

type Catalog = {
  visualProviders?: { key: string; label: string }[];
  gflowImageModels?: { id: string; label: string }[];
  gflowVideoModels?: { id: string; label: string }[];
  atlasReady?: boolean;
  gflowBridge?: boolean;
  doctor?: { ok: boolean; detail: string };
} | null;

const FALLBACK = [
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Imagen · Flow)" },
];

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
  } = props;

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
              options={(
                catalog?.gflowImageModels ?? [
                  { id: "nano2", label: "Imagen Nano 2" },
                  { id: "image4", label: "Imagen 4" },
                ]
              ).map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
          {showVideo ? (
            <div className="flex items-center gap-2">
              Veo I2V
              <DarkSelect
                aria-label="Modelo Veo gflow"
                value={gflowVideoModel}
                onValueChange={onGflowVideoModel}
                options={(catalog?.gflowVideoModels ?? [{ id: "veo-lite", label: "Veo Lite" }]).map(
                  (m) => ({ value: m.id, label: m.label }),
                )}
              />
            </div>
          ) : null}
          <p className={cn("w-full text-[11px]")}>
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
