import { Loader2, PersonStanding, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DarkSelect } from "@/components/DarkSelect";
import { StudioVisualFields } from "@/components/StudioVisualFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type StickmanJobMeta } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const FALLBACK_LOOKS = [
  { id: "classic", label: "Clásico" },
  { id: "chalk", label: "Tiza" },
  { id: "neon", label: "Neón" },
  { id: "marker", label: "Rotulador" },
  { id: "doodle", label: "Garabato" },
];

const FALLBACK_VOICES = [
  { id: "eve", label: "Eve", note: "enérgica" },
  { id: "ara", label: "Ara", note: "cálida" },
  { id: "leo", label: "Leo", note: "clara" },
  { id: "rex", label: "Rex", note: "segura" },
  { id: "sal", label: "Sal", note: "suave" },
];

const FALLBACK_ARCS = [
  {
    id: "joke_punchline",
    label: "Chiste → punchline",
    when: "humor rápido",
    hint: "Abre con un gancho y cierra con el chiste. Para temas cortos, memes o un solo gag.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "explicar un proceso",
    hint: "Explica un proceso paso a paso: qué es, cómo va y el resultado.",
  },
  {
    id: "vs_debate",
    label: "Cara a cara",
    when: "dos palitos discuten",
    hint: "Dos palitos se contradicen (mejor con elenco Dos palitos): uno dice A, el otro B.",
  },
  {
    id: "listicle",
    label: "Lista",
    when: "N puntos",
    hint: "Promete N puntos y los recorre uno a uno (tips, ranking, errores).",
  },
  {
    id: "origin",
    label: "Origen",
    when: "de dónde sale algo",
    hint: "Cuenta de dónde nace algo: el antes, el salto y cómo quedó hoy.",
  },
  {
    id: "warning",
    label: "Advertencia",
    when: "un error común",
    hint: "Señala un error común, por qué duele y cómo no caer.",
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

export function StickmanPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof api.stickmanCatalog>> | null>(
    null,
  );
  const [jobs, setJobs] = useState<StickmanJobMeta[]>([]);
  const [topic, setTopic] = useState("");
  const [durationSec, setDurationSec] = useState(15);
  const [aspect, setAspect] = useState("9:16");
  const [language, setLanguage] = useState("es");
  const [look, setLook] = useState("classic");
  const [castMode, setCastMode] = useState("solo");
  const [arc, setArc] = useState("joke_punchline");
  const [voiceId, setVoiceId] = useState("eve");
  const [llmModel, setLlmModel] = useState("google/gemini-2.5-flash");
  const [captions, setCaptions] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [visualProvider, setVisualProvider] = useState<"atlas" | "gflow">("gflow");
  const [gflowImageModel, setGflowImageModel] = useState("nano-pro");
  const [gflowVideoModel, setGflowVideoModel] = useState("omni-flash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .stickmanCatalog()
      .then(setCatalog)
      .catch(() => {});
    api
      .listStickmanJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => {});
  }, []);

  async function create() {
    setError("");
    setBusy(true);
    try {
      const res = await api.createStickmanJob({
        topic,
        durationSec,
        aspect,
        language,
        look,
        castMode,
        arc,
        voiceId,
        captions,
        animate,
        visualProvider,
        gflowImageModel: visualProvider === "gflow" ? gflowImageModel : undefined,
        gflowVideoModel: visualProvider === "gflow" ? gflowVideoModel : undefined,
        gflowVideoMode: visualProvider === "gflow" ? "i2v" : undefined,
        llmModel,
      });
      navigate(`/stickman/${res.id}`);
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
            Stickman Studio
          </p>
          <h1 className="flex items-center gap-2 text-3xl sm:text-5xl font-bold uppercase tracking-tight">
            <PersonStanding className="size-8 text-primary" />
            Nuevo Stickman
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Videos de palitos 2D. Historia: director de stickman (no OpenReels). Visuales baratos:
            gflow Nano Banana (0 créditos) + Omni 1.1 Flash (hasta 10s, un plano). Atlas sigue
            disponible. Voz: Atlas del entorno.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ej. por qué el wifi de la oficina miente"
            className="h-11"
          />

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Look de palito</p>
            <div className="flex flex-wrap gap-1.5">
              {(catalog?.looks ?? FALLBACK_LOOKS).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLook(item.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    look === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              catalog?.casts ?? [
                { id: "solo", label: "Un palito" },
                { id: "duo", label: "Dos palitos" },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCastMode(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  castMode === item.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              Duración
              <DarkSelect
                aria-label="Duración"
                value={String(durationSec)}
                onValueChange={(value) => setDurationSec(Number(value))}
                options={(catalog?.durations ?? [10, 15, 30, 60, 90]).map((d) => ({
                  value: String(d),
                  label: `${d}s`,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              Aspecto
              <DarkSelect
                aria-label="Aspecto"
                value={aspect}
                onValueChange={setAspect}
                options={(catalog?.aspects ?? ["9:16", "16:9", "1:1"]).map((a) => ({
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
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              Voz
              <DarkSelect
                aria-label="Voz"
                value={voiceId}
                onValueChange={setVoiceId}
                options={(catalog?.voices ?? FALLBACK_VOICES).map((v) => ({
                  value: v.id,
                  label: `${v.label} · ${v.note}`,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              LLM historia
              <DarkSelect
                aria-label="LLM de la historia"
                className="min-w-[14rem]"
                value={llmModel}
                onValueChange={setLlmModel}
                options={(
                  catalog?.llms ?? [
                    {
                      id: "google/gemini-2.5-flash",
                      label: "Gemini 2.5 Flash",
                      note: "mejor para historia de palitos",
                    },
                  ]
                ).map((llm) => ({
                  value: llm.id,
                  label: llm.label,
                  hint: llm.note,
                }))}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={captions}
                onChange={(e) => setCaptions(e.target.checked)}
              />
              Subtítulos
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={animate}
                onChange={(e) => setAnimate(e.target.checked)}
              />
              Plano continuo I2V (sin cortes)
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
                options={withArcHints(catalog?.arcs, FALLBACK_ARCS).map((item) => ({
                  value: item.id,
                  label: item.label,
                  hint: item.hint,
                }))}
              />
            </div>
            <p className="max-w-2xl text-[12px] leading-snug text-muted-foreground">
              {withArcHints(catalog?.arcs, FALLBACK_ARCS).find((item) => item.id === arc)?.hint ??
                "El arco marca cómo se ordena el guion: gancho, desarrollo y cierre."}
            </p>
          </div>

          <StudioVisualFields
            catalog={catalog}
            visualProvider={visualProvider}
            onVisualProvider={setVisualProvider}
            gflowImageModel={gflowImageModel}
            onGflowImageModel={setGflowImageModel}
            gflowVideoModel={gflowVideoModel}
            onGflowVideoModel={setGflowVideoModel}
            showVideo={animate}
            durationSec={durationSec}
            gflowHint="Un plano I2V (sin cortes) por el Puente Windows. Omni hasta 10s; Veo 8s. Voz: Atlas."
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="h-11"
            onClick={() => void create()}
            disabled={busy || topic.trim().length < 4}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Borrador del guion
          </Button>
        </section>

        {jobs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Trabajos Stickman</h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/40"
                    onClick={() => navigate(`/stickman/${j.id}`)}
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
