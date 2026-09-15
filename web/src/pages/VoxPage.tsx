import { Loader2, Newspaper, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DarkSelect } from "@/components/DarkSelect";
import { StudioVisualFields } from "@/components/StudioVisualFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type VoxJobMeta } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

const FALLBACK_VOX_ARCS = [
  {
    id: "hook_payoff",
    label: "Hook → payoff",
    when: "una idea, el más seguro",
    hint: "Una sola idea: gancho, contexto, cierra con el payoff. El más seguro.",
  },
  {
    id: "timeline",
    label: "Línea de tiempo",
    when: "historia / evolución",
    hint: "Historia o evolución: entonces → hitos → hoy → qué queda.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "proceso o sistema",
    hint: "Explicador: qué es, 2–3 pasos que se ven, el beneficio.",
  },
  {
    id: "pas",
    label: "PAS",
    when: "anuncio con dolor",
    hint: "Anuncio: Problema → Agita → Soluciona. Para dolor y urgencia.",
  },
  {
    id: "bab",
    label: "Before / After / Bridge",
    when: "el después vende",
    hint: "Antes feo → después deseable → el puente (tu producto) que une ambos.",
  },
  {
    id: "aida",
    label: "AIDA",
    when: "anuncio en frío",
    hint: "Anuncio en frío: Atención → Interés → Deseo → Acción.",
  },
  {
    id: "man_in_hole",
    label: "Man in a hole",
    when: "transformación",
    hint: "Caída y subida: estaba bien, cae, escala y termina mejor.",
  },
  {
    id: "myth_buster",
    label: "Myth buster",
    when: "desmentir una creencia",
    hint: "Tira un mito: el hecho, la creencia falsa, qué creer en su lugar.",
  },
  {
    id: "listicle",
    label: "Listicle",
    when: "N formas de…",
    hint: "Lista tipo “N formas de…”: promesa, cada ítem, recap.",
  },
  {
    id: "story_spine",
    label: "Story spine",
    when: "marca / fundador",
    hint: "Cuento de marca: había una vez → hasta que un día → desde entonces.",
  },
  {
    id: "origin",
    label: "Origin",
    when: "por qué existimos",
    hint: "Por qué existimos: el mundo, la chispa, el salto y el hoy.",
  },
  {
    id: "three_act",
    label: "Tres actos",
    when: "narrativa 60s",
    hint: "Narrativa de un minuto: setup → conflicto → resolución.",
  },
];

function withArcHints(
  arcs: { id: string; label: string; when: string; hint?: string }[] | undefined,
  fallback: { id: string; label: string; when: string; hint: string }[],
) {
  return (arcs?.length ? arcs : fallback).map((item) => ({
    ...item,
    hint: item.hint ?? fallback.find((row) => row.id === item.id)?.hint ?? item.when,
  }));
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
  const [themes, setThemes] = useState<string[]>([
    "american-retro",
    "swiss-modern",
    "punk-zine",
    "newsprint-editorial",
  ]);
  const [realPeople, setRealPeople] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [visualProvider, setVisualProvider] = useState<"atlas" | "gflow">("atlas");
  const [gflowImageModel, setGflowImageModel] = useState("nano2");
  const [gflowVideoModel, setGflowVideoModel] = useState("veo-lite");
  const [anchorPhoto, setAnchorPhoto] = useState("");
  const [arollVideo, setArollVideo] = useState("");
  const [crollSubject, setCrollSubject] = useState<"portrait" | "product">("portrait");
  const [subjectWardrobe, setSubjectWardrobe] = useState("");
  const [cloneRef, setCloneRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .voxCatalog()
      .then(setCatalog)
      .catch(() => {});
    api
      .listVoxJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => {});
  }, []);

  function toggleTheme(id: string) {
    setThemes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id].slice(0, 4),
    );
  }

  async function create() {
    setError("");
    setBusy(true);
    try {
      const res = await api.createVoxJob({
        mode,
        topic,
        durationSec,
        aspect,
        language,
        arc,
        voiceId,
        themes,
        realPeople: visualProvider === "atlas" && realPeople,
        captions,
        visualProvider: mode === "aroll" ? "atlas" : visualProvider,
        gflowImageModel: visualProvider === "gflow" ? gflowImageModel : undefined,
        gflowVideoModel: visualProvider === "gflow" ? gflowVideoModel : undefined,
        gflowVideoMode: visualProvider === "gflow" ? "i2v" : undefined,
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
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Vox Director
          </p>
          <h1 className="flex items-center gap-2 text-3xl sm:text-5xl font-bold uppercase tracking-tight">
            <Newspaper className="size-8 text-primary" />
            Nuevo Vox
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Collage de papel editorial. Visuales: Atlas Cloud del servidor o gflow (Imagen + Veo I2V
            por el Puente). Voz y música: Atlas del entorno. No pega la API key aquí.
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
                  mode === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
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
                  <input
                    type="radio"
                    checked={crollSubject === "portrait"}
                    onChange={() => setCrollSubject("portrait")}
                  />
                  Retrato
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={crollSubject === "product"}
                    onChange={() => setCrollSubject("product")}
                  />
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

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              Duración
              <DarkSelect
                aria-label="Duración"
                value={String(durationSec)}
                onValueChange={(value) => setDurationSec(Number(value))}
                options={[
                  { value: "15", label: "15s" },
                  { value: "30", label: "30s" },
                  { value: "60", label: "60s" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              Aspecto
              <DarkSelect
                aria-label="Aspecto"
                value={aspect}
                onValueChange={setAspect}
                options={(catalog?.aspects ?? ["16:9", "9:16", "1:1"]).map((a) => ({
                  value: a,
                  label: a,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              Idioma
              <DarkSelect
                aria-label="Idioma"
                value={language}
                onValueChange={setLanguage}
                options={[
                  { value: "es", label: "Español" },
                  { value: "en", label: "English" },
                  { value: "zh", label: "中文" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              Voz
              <DarkSelect
                aria-label="Voz"
                value={voiceId}
                onValueChange={setVoiceId}
                options={(catalog?.voices ?? []).map((v) => ({
                  value: v.id,
                  label: `${v.label} · ${v.note}`,
                }))}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={visualProvider === "atlas" && realPeople}
                onChange={(e) => setRealPeople(e.target.checked)}
                disabled={visualProvider === "gflow"}
              />
              Personas/marcas reales (Kling · Atlas)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={captions}
                onChange={(e) => setCaptions(e.target.checked)}
              />
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

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Arco narrativo
              <DarkSelect
                aria-label="Arco narrativo"
                className="min-w-[14rem]"
                value={arc}
                onValueChange={setArc}
                options={withArcHints(catalog?.arcs, FALLBACK_VOX_ARCS).map((item) => ({
                  value: item.id,
                  label: item.label,
                  hint: item.hint,
                }))}
              />
            </div>
            <p className="max-w-2xl text-[12px] leading-snug text-muted-foreground">
              {withArcHints(catalog?.arcs, FALLBACK_VOX_ARCS).find((item) => item.id === arc)
                ?.hint ?? "El arco marca cómo se ordena el beat map: gancho, desarrollo y cierre."}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Temas del bake-off (máx. 4) — tú eliges a ojo después
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(catalog?.themes ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTheme(t.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    themes.includes(t.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <StudioVisualFields
            catalog={catalog}
            visualProvider={mode === "aroll" ? "atlas" : visualProvider}
            onVisualProvider={setVisualProvider}
            gflowImageModel={gflowImageModel}
            onGflowImageModel={setGflowImageModel}
            gflowVideoModel={gflowVideoModel}
            onGflowVideoModel={setGflowVideoModel}
            disabled={mode === "aroll"}
            disabledHint="A-roll restylea el talking-head con Atlas (no hay video-edit en gflow)."
            gflowHint="Una escena a la vez por el Puente Windows. Voz: Atlas del servidor."
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="h-11"
            onClick={() => void create()}
            disabled={busy || (mode === "broll" && topic.trim().length < 4)}
          >
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
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/40"
                    onClick={() => navigate(`/vox/${j.id}`)}
                  >
                    <span className="truncate font-medium">{j.topic}</span>
                    <span className="ml-3 shrink-0 text-[11px] text-muted-foreground">
                      {j.status}
                    </span>
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
