import { useRef, useState } from "react";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuiltinVisualStyle, LibraryVisualStyle } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

interface Props {
  builtins: BuiltinVisualStyle[];
  styles: LibraryVisualStyle[];
  selectedId: string;
  onSelect: (id: string, artStyle: string) => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function VisualStyleStudio({ builtins, styles, selectedId, onSelect, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Partial<LibraryVisualStyle> | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const selected = styles.find((s) => s.id === selectedId);

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
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">Estilo visual</p>
          <p className="text-sm font-medium">Atelier + estilos propios</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ name: "", artStyle: "", lighting: "", palette: "", notes: "" })}>
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
              "rounded-full border px-2.5 py-1 text-[11px]",
              selectedId === s.id ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {selected && !editing ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(selected)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadJson(`estilo-${selected.name.replace(/\s+/g, "-").toLowerCase()}.json`, {
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
          <Input value={editing.palette ?? ""} onChange={(e) => setEditing({ ...editing, palette: e.target.value })} placeholder="Paleta (amber, moss, gold)" />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void commit()}>Guardar</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
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
