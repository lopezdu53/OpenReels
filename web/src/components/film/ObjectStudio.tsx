import { useRef, useState, type ReactNode } from "react";
import { Download, ImageIcon, Package, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type LibraryObject, type ProviderOption } from "@/hooks/useApi";
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

const emptyForm = (): Partial<LibraryObject> => ({
  name: "",
  prompt: "",
  notes: "",
  aliases: "",
});

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
  return name.replace(/\s+/g, "-").toLowerCase() || "objeto";
}

interface Props {
  objects: LibraryObject[];
  selectedIds: string[];
  maxSelect?: number;
  imageProviders?: ProviderOption[];
  onToggle: (id: string) => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ObjectStudio({
  objects,
  selectedIds,
  maxSelect = 10,
  imageProviders,
  onToggle,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<Partial<LibraryObject> | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetProvider, setSheetProvider] = useState("vivi");
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [peekId, setPeekId] = useState("");
  const previewId = selectedIds.includes(peekId) ? peekId : (selectedIds[selectedIds.length - 1] ?? "");
  const selected = objects.find((o) => o.id === previewId);
  const providers = imageProviders?.length ? imageProviders : DEFAULT_PROVIDERS;
  const atCap = selectedIds.length >= maxSelect;

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
        type: "object",
        provider: sheetProvider,
        object: {
          name: editing.name,
          prompt: editing.prompt,
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
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
            Objetos ({selectedIds.length}/{maxSelect})
          </p>
          <p className="text-sm font-medium">Elige hasta {maxSelect} props — pueden coincidir en el mismo plano</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { setSheetError(""); setEditing(emptyForm()); }}>
            <Plus className="size-3.5" /> Crear
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
                const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
                await onSave(parsed);
              } catch (err) {
                alert(err instanceof Error ? err.message : "JSON inválido");
              }
            }}
          />
        </div>
      </div>

      {objects.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground">
          Un prompt basta: auto rojo, balón de fútbol, avión, reloj de oro. En el Film puedes marcar hasta {maxSelect}; si la escena los necesita, aparecen todos juntos.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {objects.map((o) => {
            const order = selectedIds.indexOf(o.id);
            const isOn = order >= 0;
            const blocked = !isOn && atCap;
            return (
              <button
                key={o.id}
                type="button"
                disabled={blocked}
                onClick={() => {
                  if (blocked) return;
                  onToggle(o.id);
                  setPeekId(o.id);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs",
                  isOn ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                  blocked ? "cursor-not-allowed opacity-40" : "",
                )}
              >
                {isOn ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {order + 1}
                  </span>
                ) : null}
                {o.referenceImage ? (
                  <img src={`data:image/png;base64,${o.referenceImage}`} alt="" className="h-8 w-14 rounded object-cover" />
                ) : (
                  <Package className="size-4 text-muted-foreground" />
                )}
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="text-[10px] text-muted-foreground">{o.prompt.slice(0, 48)}{o.prompt.length > 48 ? "…" : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedIds.length > 1 && !editing ? (
        <p className="text-[11px] text-muted-foreground">
          Roster: {selectedIds.map((id, i) => {
            const o = objects.find((x) => x.id === id);
            return o ? `${i + 1}. ${o.name}` : null;
          }).filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {selected && !editing ? (
        <div className="rounded-xl border border-border bg-surface-inset p-3 space-y-2 text-xs">
          {selected.referenceImage ? (
            <img
              src={`data:image/png;base64,${selected.referenceImage}`}
              alt={`Ficha de ${selected.name}`}
              className="aspect-video w-full rounded-lg bg-neutral-900 object-contain"
            />
          ) : null}
          <p><span className="text-muted-foreground">Look:</span> {selected.prompt}</p>
          {selected.notes ? <p><span className="text-muted-foreground">Notas:</span> {selected.notes}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setSheetError(""); setEditing(selected); }}>
              <Pencil className="size-3.5" /> Editar
            </Button>
            {selected.referenceImage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadPng(`objeto-${slug(selected.name)}.png`, selected.referenceImage!)}
              >
                <ImageIcon className="size-3.5" /> PNG
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(`objeto-${slug(selected.name)}.json`, {
                  openreels: "object",
                  version: 1,
                  object: selected,
                })
              }
            >
              <Download className="size-3.5" /> JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`¿Eliminar ${selected.name}?`)) void onDelete(selected.id);
              }}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Mustang rojo" />
          </Field>
          <Field label="Alias (mismo objeto)">
            <Input value={editing.aliases ?? ""} onChange={(e) => setEditing({ ...editing, aliases: e.target.value })} placeholder="el auto, el Mustang" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Prompt (con esto basta: forma, color, materiales)">
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                value={editing.prompt ?? ""}
                onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                placeholder="Mustang Fastback 1967 rojo cereza, cromados, llantas de radios, interior de cuero negro…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notas (opcional)">
              <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Sin conductor, sin matrícula moderna…" />
            </Field>
          </div>
          <div className="sm:col-span-2 space-y-2 rounded-xl border border-border bg-surface-inset p-3">
            <p className="text-[11px] text-muted-foreground">
              Genera un tablero 16:9 de un solo objeto: hero, frente, perfil y detalle. Sin caras. VIVI por defecto.
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
                {generating ? "Generando ficha…" : "Generar ficha"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current?.click()}>
                Subir foto
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
                  const referenceImage = await fileToBase64(file);
                  setEditing({ ...editing, referenceImage });
                }}
              />
              {editing.referenceImage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPng(`objeto-${slug(editing.name ?? "objeto")}.png`, editing.referenceImage!)}
                >
                  <ImageIcon className="size-3.5" /> PNG
                </Button>
              ) : null}
            </div>
            {editing.referenceImage ? (
              <img
                src={`data:image/png;base64,${editing.referenceImage}`}
                alt="Ficha de objeto"
                className="aspect-video w-full rounded-lg bg-neutral-900 object-contain"
              />
            ) : null}
            {sheetError ? <p className="text-xs text-destructive">{sheetError}</p> : null}
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy || generating} onClick={() => void commit()}>Guardar</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(null); setSheetError(""); }}>Cancelar</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
