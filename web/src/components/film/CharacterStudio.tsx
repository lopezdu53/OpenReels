import { useRef, useState, type ReactNode } from "react";
import { Download, Pencil, Plus, Trash2, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryCharacter } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const emptyForm = (): Partial<LibraryCharacter> => ({
  name: "",
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

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

interface Props {
  characters: LibraryCharacter[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function CharacterStudio({ characters, selectedId, onSelect, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Partial<LibraryCharacter> | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const selected = characters.find((c) => c.id === selectedId);

  async function commit() {
    if (!editing) return;
    setBusy(true);
    try {
      await onSave(editing);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">Personaje</p>
          <p className="text-sm font-medium">Misma identidad en todos los films</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(emptyForm())}>
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
          Crea a Rayitas una vez (especie, marcas, foto) y reutilízalo. Así no cambia de tigrillo a tigre de Bengala.
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
                <img src={`data:image/png;base64,${c.referenceImage}`} alt="" className="size-8 rounded object-cover" />
              ) : (
                <UserRound className="size-4 text-muted-foreground" />
              )}
              <span>
                <span className="block font-medium">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{c.species}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && !editing ? (
        <div className="rounded-xl border border-border bg-surface-inset p-3 space-y-2 text-xs">
          <p><span className="text-muted-foreground">Apariencia:</span> {selected.appearance}</p>
          {selected.mustAvoid ? <p><span className="text-muted-foreground">Evitar:</span> {selected.mustAvoid}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(selected)}>
              <Pencil className="size-3.5" /> Editar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(`personaje-${selected.name.replace(/\s+/g, "-").toLowerCase()}.json`, {
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
          <Field label="Nombre">
            <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Rayitas" />
          </Field>
          <Field label="Especie / raza (bloqueada)">
            <Input value={editing.species ?? ""} onChange={(e) => setEditing({ ...editing, species: e.target.value })} placeholder="tigrillo ocelote cachorro, no tigre de Bengala" />
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
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current?.click()}>
              Foto de referencia
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
              <img src={`data:image/png;base64,${editing.referenceImage}`} alt="" className="h-10 w-10 rounded object-cover" />
            ) : null}
            <Button type="button" size="sm" disabled={busy} onClick={() => void commit()}>Guardar</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
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
