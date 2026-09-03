import { useRef, useState, type ReactNode } from "react";
import { Download, ImageIcon, Pencil, Plus, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type CharacterKind, type LibraryCharacter, type ProviderOption } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const KIND_OPTIONS: { key: CharacterKind; label: string }[] = [
  { key: "human", label: "Humano" },
  { key: "animal", label: "Animal" },
  { key: "fictional", label: "Ficticio" },
];

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { key: "vivi", label: "VIVI" },
  { key: "gemini", label: "Google Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok Imagine" },
  { key: "runpod", label: "RunPod (público)" },
  { key: "fal", label: "fal.ai" },
  { key: "alicloud", label: "Alibaba Cloud" },
];

const emptyForm = (): Partial<LibraryCharacter> => ({
  name: "",
  kind: "animal",
  species: "",
  age: "",
  sex: "",
  appearance: "",
  personality: "",
  wardrobe: "",
  mustKeep: "",
  mustAvoid: "",
  notes: "",
});

function kindLabel(kind?: string) {
  return KIND_OPTIONS.find((k) => k.key === kind)?.label ?? "Ficticio";
}

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
  return name.replace(/\s+/g, "-").toLowerCase() || "personaje";
}

interface Props {
  characters: LibraryCharacter[];
  selectedId: string;
  imageProviders?: ProviderOption[];
  onSelect: (id: string) => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function CharacterStudio({
  characters,
  selectedId,
  imageProviders,
  onSelect,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<Partial<LibraryCharacter> | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [sheetProvider, setSheetProvider] = useState("vivi");
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const selected = characters.find((c) => c.id === selectedId);
  const providers = imageProviders?.length ? imageProviders : DEFAULT_PROVIDERS;
  const kind = editing?.kind ?? "animal";

  async function commit() {
    if (!editing) return;
    setBusy(true);
    setSheetError("");
    try {
      await onSave({ ...editing, kind: editing.kind ?? "animal" });
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
        type: "character",
        provider: sheetProvider,
        character: {
          name: editing.name,
          kind: editing.kind ?? "animal",
          species: editing.species,
          age: editing.age,
          sex: editing.sex,
          appearance: editing.appearance,
          personality: editing.personality,
          wardrobe: editing.wardrobe,
          mustKeep: editing.mustKeep,
          mustAvoid: editing.mustAvoid,
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
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">Personaje</p>
          <p className="text-sm font-medium">Ficha 16:9 — frente, retrato, perfil y espalda</p>
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

      {characters.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground">
          Humano, animal o ficticio. Genera una ficha de concepto (como un model sheet) y reutilízala para que no cambie de especie ni de cara.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id === selectedId ? "" : c.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs",
                c.id === selectedId ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
              )}
            >
              {c.referenceImage ? (
                <img src={`data:image/png;base64,${c.referenceImage}`} alt="" className="h-8 w-14 rounded object-cover" />
              ) : (
                <UserRound className="size-4 text-muted-foreground" />
              )}
              <span>
                <span className="block font-medium">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{kindLabel(c.kind)} · {c.species}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && !editing ? (
        <div className="rounded-xl border border-border bg-surface-inset p-3 space-y-2 text-xs">
          {selected.referenceImage ? (
            <img
              src={`data:image/png;base64,${selected.referenceImage}`}
              alt={`Ficha de ${selected.name}`}
              className="aspect-video w-full rounded-lg bg-neutral-900 object-contain"
            />
          ) : null}
          <p><span className="text-muted-foreground">Tipo:</span> {kindLabel(selected.kind)}</p>
          <p><span className="text-muted-foreground">Apariencia:</span> {selected.appearance}</p>
          {selected.mustAvoid ? <p><span className="text-muted-foreground">Evitar:</span> {selected.mustAvoid}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setSheetError(""); setEditing(selected); }}>
              <Pencil className="size-3.5" /> Editar
            </Button>
            {selected.referenceImage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadPng(`ficha-${slug(selected.name)}.png`, selected.referenceImage!)}
              >
                <ImageIcon className="size-3.5" /> PNG
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(`personaje-${slug(selected.name)}.json`, {
                  openreels: "character",
                  version: 1,
                  character: selected,
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
                if (confirm(`¿Eliminar a ${selected.name}?`)) void onDelete(selected.id);
              }}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-1.5">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setEditing({ ...editing, kind: opt.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px]",
                  kind === opt.key ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Field label="Nombre">
            <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={kind === "human" ? "Ana" : kind === "animal" ? "Rayitas" : "Nyx"} />
          </Field>
          <Field label={kind === "human" ? "Tipo / etnia (opcional)" : kind === "animal" ? "Especie / raza (bloqueada)" : "Especie inventada"}>
            <Input
              value={editing.species ?? ""}
              onChange={(e) => setEditing({ ...editing, species: e.target.value })}
              placeholder={kind === "human" ? "humano" : kind === "animal" ? "tigrillo ocelote cachorro" : "elfa de bosque"}
            />
          </Field>
          <Field label="Edad visual">
            <Input value={editing.age ?? ""} onChange={(e) => setEditing({ ...editing, age: e.target.value })} />
          </Field>
          <Field label="Sexo">
            <Input value={editing.sex ?? ""} onChange={(e) => setEditing({ ...editing, sex: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Apariencia (marcas, color, cara)">
              <textarea className="min-h-[72px] w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm" value={editing.appearance ?? ""} onChange={(e) => setEditing({ ...editing, appearance: e.target.value })} />
            </Field>
          </div>
          <Field label="Debe mantener">
            <Input value={editing.mustKeep ?? ""} onChange={(e) => setEditing({ ...editing, mustKeep: e.target.value })} />
          </Field>
          <Field label="Debe evitar (otras razas)">
            <Input value={editing.mustAvoid ?? ""} onChange={(e) => setEditing({ ...editing, mustAvoid: e.target.value })} placeholder="tigre de Bengala, gato doméstico, niño humano" />
          </Field>
          <Field label="Personalidad">
            <Input value={editing.personality ?? ""} onChange={(e) => setEditing({ ...editing, personality: e.target.value })} />
          </Field>
          <Field label="Vestuario / accesorios">
            <Input value={editing.wardrobe ?? ""} onChange={(e) => setEditing({ ...editing, wardrobe: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2 space-y-2 rounded-xl border border-border bg-surface-inset p-3">
            <p className="text-[11px] text-muted-foreground">
              Genera un model sheet 16:9: cuerpo de frente a la izquierda, retrato arriba a la derecha, perfil y espalda abajo. VIVI por defecto.
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
                  onClick={() => downloadPng(`ficha-${slug(editing.name ?? "personaje")}.png`, editing.referenceImage!)}
                >
                  <ImageIcon className="size-3.5" /> PNG
                </Button>
              ) : null}
            </div>
            {editing.referenceImage ? (
              <img
                src={`data:image/png;base64,${editing.referenceImage}`}
                alt="Ficha de concepto"
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
