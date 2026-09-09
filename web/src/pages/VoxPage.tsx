import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Newspaper, Sparkles } from "lucide-react";
import { api, type VoxJobMeta } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ATLAS_KEY = "openreels_atlascloud_api_key";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

export function VoxPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof api.voxCatalog>> | null>(null);
  const [jobs, setJobs] = useState<VoxJobMeta[]>([]);
  const [mode, setMode] = useState<"broll" | "aroll" | "croll">("broll");
  const [topic, setTopic] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [aspect, setAspect] = useState("16:9");
  const [language, setLanguage] = useState("es");
  const [arc, setArc] = useState("hook_payoff");
  const [voiceId, setVoiceId] = useState("leo");
  const [themes, setThemes] = useState<string[]>(["american-retro", "swiss-modern", "punk-zine", "newsprint-editorial"]);
  const [realPeople, setRealPeople] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [atlasKey, setAtlasKey] = useState(() => localStorage.getItem(ATLAS_KEY) ?? "");
  const [anchorPhoto, setAnchorPhoto] = useState("");
  const [arollVideo, setArollVideo] = useState("");
  const [crollSubject, setCrollSubject] = useState<"portrait" | "product">("portrait");
  const [subjectWardrobe, setSubjectWardrobe] = useState("");
  const [cloneRef, setCloneRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.voxCatalog().then(setCatalog).catch(() => {});
    api.listVoxJobs().then((r) => setJobs(r.jobs)).catch(() => {});
  }, []);

  function toggleTheme(id: string) {
    setThemes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id].slice(0, 4)));
  }

  async function create() {
    setError("");
    setBusy(true);
    try {
      if (atlasKey) localStorage.setItem(ATLAS_KEY, atlasKey);
      const res = await api.createVoxJob({
        mode,
        topic,
        durationSec,
        aspect,
        language,
        arc,
        voiceId,
        themes,
        realPeople,
        captions,
        atlasKey: atlasKey || undefined,
        anchorPhoto: mode === "croll" ? anchorPhoto || undefined : undefined,
        arollVideo: mode === "aroll" ? arollVideo || undefined : undefined,
        crollSubject,
        subjectWardrobe: subjectWardrobe || undefined,
        cloneRef: cloneRef || undefined,
      });
      navigate(`/vox/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[2px] text-primary">Vox Director</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Newspaper className="size-7 text-primary" />
            Nuevo Vox
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Collage de papel editorial (Atlas Cloud + ffmpeg). Pipeline propio: beat map → bake-off de
            estilo → keyframes → motion → voz/música → ensamble. No usa el pipeline de Short/Film.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["broll", "B-roll · un tema"],
                ["aroll", "A-roll · talking-head"],
                ["croll", "C-roll · una foto"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  mode === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "broll" && (
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ej. una breve historia del café"
              className="h-11"
            />
          )}
          {mode === "aroll" && (
            <label className="block text-xs text-muted-foreground">
              Video talking-head
              <input
                type="file"
                accept="video/*"
                className="mt-1 block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void fileToDataUrl(f).then(setArollVideo);
                }}
              />
            </label>
          )}
          {mode === "croll" && (
            <div className="space-y-2">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Tema alrededor de la foto"
                className="h-11"
              />
              <label className="block text-xs text-muted-foreground">
                Foto ancla (persona o producto)
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void fileToDataUrl(f).then(setAnchorPhoto);
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={crollSubject === "portrait"} onChange={() => setCrollSubject("portrait")} />
                  Retrato
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={crollSubject === "product"} onChange={() => setCrollSubject("product")} />
                  Producto
                </label>
                {crollSubject === "portrait" && (
                  <Input
                    value={subjectWardrobe}
                    onChange={(e) => setSubjectWardrobe(e.target.value)}
                    placeholder="Ropa bloqueada (suéter crema…)"
                    className="h-8 max-w-xs"
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              Duración
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Aspecto
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {(catalog?.aspects ?? ["16:9", "9:16", "1:1"]).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Idioma
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Arco
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={arc} onChange={(e) => setArc(e.target.value)}>
                {(catalog?.arcs ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Voz
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                {(catalog?.voices ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.label} · {v.note}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={realPeople} onChange={(e) => setRealPeople(e.target.checked)} />
              Personas/marcas reales (Kling)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              Subtítulos quemados
            </label>
            <label className="flex items-center gap-2 text-xs">
              Clonar voz (sample)
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void fileToDataUrl(f).then(setCloneRef);
                }}
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Temas del bake-off (máx. 4) — tú eliges a ojo después</p>
            <div className="flex flex-wrap gap-1.5">
              {(catalog?.themes ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTheme(t.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    themes.includes(t.id) ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-xs text-muted-foreground">
            Atlas Cloud API key (solo Vox)
            <Input
              type="password"
              value={atlasKey}
              onChange={(e) => setAtlasKey(e.target.value)}
              placeholder="sk-… o déjala en Ajustes / .env"
              className="mt-1 h-10"
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="h-11" onClick={() => void create()} disabled={busy || (mode === "broll" && topic.trim().length < 4)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Borrador del beat map
          </Button>
        </section>

        {jobs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Trabajos Vox</h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/40" onClick={() => navigate(`/vox/${j.id}`)}>
                    <span className="truncate font-medium">{j.topic}</span>
                    <span className="ml-3 shrink-0 text-[11px] text-muted-foreground">{j.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
