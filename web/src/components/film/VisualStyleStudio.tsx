import { useRef, useState } from "react";
import { Download, ImageIcon, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type BuiltinVisualStyle, type LibraryVisualStyle, type ProviderOption } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { key: "vivi", label: "VIVI" },
  { key: "gemini", label: "Google Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok Imagine" },
  { key: "runpod", label: "RunPod (público)" },
  { key: "fal", label: "fal.ai" },
  { key: "alicloud", label: "Alibaba Cloud" },
];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPng(filename: string, base64: string) {
  const raw = base64.includes(",") ? base64.split(",")[1]! : base64;
  const a = document.createElement("a");
  a.href = `data:image/png;base64,${raw}`;
  a.download = filename;
  a.click();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1]! : s);
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

function slug(name: string) {
  return name.replace(/\s+/g, "-").toLowerCase() || "estilo";
}

interface Props {
  builtins: BuiltinVisualStyle[];
  styles: LibraryVisualStyle[];
  selectedId: string;
  imageProviders?: ProviderOption[];
  onSelect: (id: string, artStyle: string) => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function VisualStyleStudio({
  builtins,
  styles,
  selectedId,
  imageProviders,
  onSelect,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<Partial<LibraryVisualStyle> | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetProvider, setSheetProvider] = useState("vivi");
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const selected = styles.find((s) => s.id === selectedId);
  const providers = imageProviders?.length ? imageProviders : DEFAULT_PROVIDERS;

  async function commit() {
    if (!editing) return;
    setBusy(true);
    setSheetError("");
    try {
      await onSave(editing);
      setEditing(null);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateSheet() {
    if (!editing) return;
    setGenerating(true);
    setSheetError("");
    try {
      const { imageBase64 } = await api.generateLibrarySheet({
        type: "style",
        provider: sheetProvider,
        style: {
          name: editing.name,
          artStyle: editing.artStyle,
          lighting: editing.lighting,
          palette: editing.palette,
          notes: editing.notes,
        },
      });
      setEditing({ ...editing, referenceImage: imageBase64 });
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">Estilo visual</p>
          <p className="text-sm font-medium">Entorno gráfico — tablero 16:9 (luz, lugar, textura)</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSheetError("");
              setEditing({ name: "", artStyle: "", lighting: "", palette: "", notes: "" });
            }}
          >
            <Plus className="size-3.5" /> Crear estilo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="size-3.5" /> Cargar JSON
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                await onSave(JSON.parse(await file.text()) as Record<string, unknown>);
              } catch (err) {
                alert(err instanceof Error ? err.message : "JSON inválido");
              }
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {builtins.map((s) => (
          <button
            key={`b-${s.id}`}
            type="button"
            onClick={() => onSelect(`atelier:${s.id}`, s.artStyle)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              selectedId === `atelier:${s.id}` ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
        {styles.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id, s.artStyle)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
              selectedId === s.id ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.referenceImage ? (
              <img src={`data:image/png;base64,${s.referenceImage}`} alt="" className="size-4 rounded-sm object-cover" />
            ) : null}
            {s.name}
          </button>
        ))}
      </div>

      {selected && !editing ? (
        <div className="space-y-2">
          {selected.referenceImage ? (
            <img
              src={`data:image/png;base64,${selected.referenceImage}`}
              alt={`Tablero de ${selected.name}`}
              className="aspect-video w-full rounded-lg bg-neutral-900 object-contain"
            />
          ) : null}
          <p className="text-xs text-muted-foreground">{selected.artStyle}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setSheetError(""); setEditing(selected); }}>
              <Pencil className="size-3.5" /> Editar
            </Button>
            {selected.referenceImage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadPng(`estilo-${slug(selected.name)}.png`, selected.referenceImage!)}
              >
                <ImageIcon className="size-3.5" /> PNG
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(`estilo-${slug(selected.name)}.json`, {
                  openreels: "visual-style",
                  version: 1,
                  style: selected,
                })
              }
            >
              <Download className="size-3.5" /> JSON
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { if (confirm(`¿Eliminar ${selected.name}?`)) void onDelete(selected.id); }}>
              <Trash2 className="size-3.5" /> Eliminar
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-2">
          <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nombre del estilo" />
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            value={editing.artStyle ?? ""}
            onChange={(e) => setEditing({ ...editing, artStyle: e.target.value })}
            placeholder="Filmic jungle, golden hour, 35mm, soft haze, storybook lighting…"
          />
          <Input value={editing.lighting ?? ""} onChange={(e) => setEditing({ ...editing, lighting: e.target.value })} placeholder="Luz (golden hour, niebla suave)" />
          <Input value={editing.palette ?? ""} onChange={(e) => setEditing({ ...editing, palette: e.target.value })} placeholder="Paleta (amber, moss, gold)" />
          <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notas de entorno (selva, interior, ciudad)" />
          <div className="space-y-2 rounded-xl border border-border bg-surface-inset p-3">
            <p className="text-[11px] text-muted-foreground">
              Genera un tablero de entorno: plano general, estudio de luz, lugar típico y texturas. Sin caras únicas. VIVI por defecto.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[160px] space-y-1">
                <span className="text-[11px] text-muted-foreground">Generador de imagen</span>
                <Select value={sheetProvider} onValueChange={(v) => v && setSheetProvider(v)}>
                  <SelectTrigger className="h-9 w-full rounded-lg">
                    <SelectValue>{providers.find((p) => p.key === sheetProvider)?.label ?? sheetProvider}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button type="button" size="sm" disabled={generating || busy} onClick={() => void generateSheet()}>
                <Sparkles className="size-3.5" />
                {generating ? "Generando tablero…" : "Generar entorno"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current?.click()}>
                Subir imagen
              </Button>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setEditing({ ...editing, referenceImage: await fileToBase64(file) });
                }}
              />
              {editing.referenceImage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPng(`estilo-${slug(editing.name ?? "estilo")}.png`, editing.referenceImage!)}
                >
                  <ImageIcon className="size-3.5" /> PNG
                </Button>
              ) : null}
            </div>
            {editing.referenceImage ? (
              <img
                src={`data:image/png;base64,${editing.referenceImage}`}
                alt="Tablero de estilo"
                className="aspect-video w-full rounded-lg bg-neutral-900 object-contain"
              />
            ) : null}
            {sheetError ? <p className="text-xs text-destructive">{sheetError}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || generating} onClick={() => void commit()}>Guardar</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(null); setSheetError(""); }}>Cancelar</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
