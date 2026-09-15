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
      <label className="block text-xs text-muted-foreground">
        Visuales
        <select
          className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-foreground"
          value={visualProvider}
          disabled={disabled}
          onChange={(e) => onVisualProvider(e.target.value === "gflow" ? "gflow" : "atlas")}
        >
          {(catalog?.visualProviders ?? FALLBACK).map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {disabled && disabledHint ? (
        <p className="text-[11px] text-muted-foreground">{disabledHint}</p>
      ) : null}
      {!disabled && visualProvider === "gflow" ? (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Imagen
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground"
              value={gflowImageModel}
              onChange={(e) => onGflowImageModel(e.target.value)}
            >
              {(
                catalog?.gflowImageModels ?? [
                  { id: "nano2", label: "Imagen Nano 2" },
                  { id: "image4", label: "Imagen 4" },
                ]
              ).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {showVideo ? (
            <label className="flex items-center gap-2">
              Veo I2V
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground"
                value={gflowVideoModel}
                onChange={(e) => onGflowVideoModel(e.target.value)}
              >
                {(catalog?.gflowVideoModels ?? [{ id: "veo-lite", label: "Veo Lite" }]).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
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
