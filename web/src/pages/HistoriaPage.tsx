import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DarkSelect } from "@/components/DarkSelect";
import { CharacterStudio } from "@/components/film/CharacterStudio";
import { LocationStudio } from "@/components/film/LocationStudio";
import { ObjectStudio } from "@/components/film/ObjectStudio";
import { StudioVisualFields } from "@/components/StudioVisualFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type LibraryCharacter,
  type LibraryLocation,
  type LibraryObject,
  type ProviderOption,
  type StickmanJobMeta,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const CASTING_PROVIDERS: ProviderOption[] = [
  { key: "gflow", label: "gflow (Nano Banana)" },
  { key: "vivi", label: "VIVI" },
  { key: "gemini", label: "Google Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok Imagine" },
  { key: "runpod", label: "RunPod (público)" },
  { key: "fal", label: "fal.ai" },
  { key: "alicloud", label: "Alibaba Cloud" },
];

const FALLBACK_VOICES = [
  { id: "eve", label: "Eve", note: "enérgica" },
  { id: "ara", label: "Ara", note: "cálida" },
  { id: "leo", label: "Leo", note: "clara" },
  { id: "rex", label: "Rex", note: "segura" },
  { id: "sal", label: "Sal", note: "suave" },
  { id: "Kore", label: "Kore", note: "firme" },
  { id: "Aoede", label: "Aoede", note: "ligera" },
  { id: "Puck", label: "Puck", note: "alegre" },
];

const FALLBACK_ARCS = [
  {
    id: "joke_punchline",
    label: "Chiste → punchline",
    when: "humor rápido",
    hint: "Abre con un gancho y cierra con el chiste.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "explicar un proceso",
    hint: "Explica un proceso paso a paso.",
  },
  {
    id: "vs_debate",
    label: "Cara a cara",
    when: "dos personajes discuten",
    hint: "Dos personajes del Casting se contradicen.",
  },
  {
    id: "listicle",
    label: "Lista",
    when: "N puntos",
    hint: "Promete N puntos y los recorre uno a uno.",
  },
  {
    id: "origin",
    label: "Origen",
    when: "de dónde sale algo",
    hint: "Cuenta de dónde nace algo.",
  },
  {
    id: "warning",
    label: "Advertencia",
    when: "un error común",
    hint: "Señala un error común y cómo no caer.",
  },
];

function formatDuration(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  return `${sec}s`;
}

function hookAvailable(sec: number): boolean {
  return sec === 300 || sec === 480 || sec === 900;
}

function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}>
      {label}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        disabled={disabled}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="w-24 accent-primary"
      />
      <span className="w-8 tabular-nums">{Math.round(value * 100)}%</span>
    </label>
  );
}

function formatWhen(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
}

function producedLabel(job: StickmanJobMeta): string {
  const start = Date.parse(job.createdAt);
  const end = job.completedAt ? Date.parse(job.completedAt) : Number.NaN;
  const when = formatWhen(job.completedAt ?? job.createdAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return when;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${when} · ${sec}s`;
  const min = Math.round(sec / 60);
  return `${when} · ${min} min`;
}

function jobChips(job: StickmanJobMeta): string[] {
  const c = job.config ?? {};
  const chips = [
    c.durationSec ? formatDuration(c.durationSec) : "",
    c.aspect,
    (c.castRoster?.length ?? c.characterIds?.length)
      ? `${c.castRoster?.length ?? c.characterIds?.length} pers.`
      : "",
    c.muteCharacter ? "Mudo + SFX" : "Con voz",
    c.contentHook ? "Gancho 10s" : "",
    c.captions ? "Subtítulos" : "Sin subtítulos",
    c.animate ? "I2V" : "Stills",
    c.voiceId,
    c.visualProvider,
  ];
  return chips.filter((x): x is string => Boolean(x));
}

function withArcHints(
  arcs: { id: string; label: string; when: string; hint?: string }[] | undefined,
  fallback: { id: string; label: string; when: string; hint: string }[],
) {
  return (arcs?.length ? arcs : fallback).map((item) => ({
    ...item,
    hint: item.hint ?? fallback.find((row) => row.id === item.id)?.hint ?? item.when,
  }));
}

export function HistoriaPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof api.historiaCatalog>> | null>(
    null,
  );
  const [jobs, setJobs] = useState<StickmanJobMeta[]>([]);
  const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
  const [objects, setObjects] = useState<LibraryObject[]>([]);
  const [locations, setLocations] = useState<LibraryLocation[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [durationSec, setDurationSec] = useState(10);
  const [aspect, setAspect] = useState("9:16");
  const [language, setLanguage] = useState("es");
  const [arc, setArc] = useState("joke_punchline");
  const [voiceId, setVoiceId] = useState("eve");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [llmModel, setLlmModel] = useState("google/gemini-2.5-flash");
  const [captions, setCaptions] = useState(false);
  const [muteCharacter, setMuteCharacter] = useState(true);
  const [contentHook, setContentHook] = useState(false);
  const [videoVolume, setVideoVolume] = useState(0.5);
  const [ttsVolume, setTtsVolume] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [visualProvider, setVisualProvider] = useState<"atlas" | "gflow">("gflow");
  const [gflowImageModel, setGflowImageModel] = useState("nano-pro");
  const [gflowVideoModel, setGflowVideoModel] = useState("omni-flash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .historiaCatalog()
      .then(setCatalog)
      .catch(() => {});
    api
      .listHistoriaJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => {});
    Promise.all([api.listCharacters(), api.listObjects(), api.listLocations()])
      .then(([c, o, l]) => {
        setCharacters(c.characters);
        setObjects(o.objects);
        setLocations(l.locations);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hookAvailable(durationSec) && contentHook) setContentHook(false);
  }, [durationSec, contentHook]);

  async function create() {
    setError("");
    if (characterIds.length < 1) {
      setError("Elige al menos un personaje del Casting");
      return;
    }
    setBusy(true);
    try {
      const res = await api.createHistoriaJob({
        topic,
        durationSec,
        aspect,
        language,
        characterIds,
        objectIds,
        locationIds,
        arc,
        voiceId,
        voiceSpeed,
        captions,
        animate,
        muteCharacter,
        contentHook: hookAvailable(durationSec) ? contentHook : false,
        videoVolume,
        ttsVolume,
        visualProvider,
        gflowImageModel: visualProvider === "gflow" ? gflowImageModel : undefined,
        gflowVideoModel: visualProvider === "gflow" ? gflowVideoModel : undefined,
        gflowVideoMode: visualProvider === "gflow" ? "i2v" : undefined,
        llmModel,
      });
      navigate(`/historia/${res.id}`);
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
            Historia Studio
          </p>
          <h1 className="flex items-center gap-2 text-3xl sm:text-5xl font-bold uppercase tracking-tight">
            <Clapperboard className="size-8 text-primary" />
            Nueva Historia
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Clon de Stickman, pero el elenco son los personajes, objetos y entornos del{" "}
            <Link to="/casting" className="text-primary hover:underline">
              Casting
            </Link>
            . Mismas duraciones, voz, volúmenes y plano continuo I2V.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ej. Rayitas descubre que el wifi de la oficina miente"
            className="h-11"
          />

          <CharacterStudio
            characters={characters}
            selectedIds={characterIds}
            maxSelect={3}
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setCharacterIds((prev) => {
                if (prev.includes(id)) return prev.filter((x) => x !== id);
                if (prev.length >= 3) return prev;
                return [...prev, id];
              });
            }}
            onSave={async (body) => {
              const { character } = body.id
                ? await api.updateCharacter(String(body.id), body)
                : await api.saveCharacter(body);
              setCharacters((prev) => {
                const rest = prev.filter((c) => c.id !== character.id);
                return [character, ...rest];
              });
              setCharacterIds((prev) => {
                if (prev.includes(character.id)) return prev;
                if (prev.length >= 3) return prev;
                return [...prev, character.id];
              });
            }}
            onDelete={async (id) => {
              await api.deleteCharacter(id);
              setCharacters((prev) => prev.filter((c) => c.id !== id));
              setCharacterIds((prev) => prev.filter((x) => x !== id));
            }}
          />

          <ObjectStudio
            objects={objects}
            selectedIds={objectIds}
            maxSelect={10}
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setObjectIds((prev) => {
                if (prev.includes(id)) return prev.filter((x) => x !== id);
                if (prev.length >= 10) return prev;
                return [...prev, id];
              });
            }}
            onSave={async (body) => {
              const { object } = body.id
                ? await api.updateObject(String(body.id), body)
                : await api.saveObject(body);
              setObjects((prev) => {
                const rest = prev.filter((o) => o.id !== object.id);
                return [object, ...rest];
              });
              setObjectIds((prev) => {
                if (prev.includes(object.id)) return prev;
                if (prev.length >= 10) return prev;
                return [...prev, object.id];
              });
            }}
            onDelete={async (id) => {
              await api.deleteObject(id);
              setObjects((prev) => prev.filter((o) => o.id !== id));
              setObjectIds((prev) => prev.filter((x) => x !== id));
            }}
          />

          <LocationStudio
            locations={locations}
            selectedIds={locationIds}
            maxSelect={3}
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setLocationIds((prev) => {
                if (prev.includes(id)) return prev.filter((x) => x !== id);
                if (prev.length >= 3) return prev;
                return [...prev, id];
              });
            }}
            onSave={async (body) => {
              const { location } = body.id
                ? await api.updateLocation(String(body.id), body)
                : await api.saveLocation(body);
              setLocations((prev) => {
                const rest = prev.filter((l) => l.id !== location.id);
                return [location, ...rest];
              });
              setLocationIds((prev) => {
                if (prev.includes(location.id)) return prev;
                if (prev.length >= 3) return prev;
                return [...prev, location.id];
              });
            }}
            onDelete={async (id) => {
              await api.deleteLocation(id);
              setLocations((prev) => prev.filter((l) => l.id !== id));
              setLocationIds((prev) => prev.filter((x) => x !== id));
            }}
          />

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              Duración
              <DarkSelect
                aria-label="Duración"
                value={String(durationSec)}
                onValueChange={(value) => setDurationSec(Number(value))}
                options={(catalog?.durations ?? [10, 20, 30, 60, 120, 300, 480, 900]).map((d) => ({
                  value: String(d),
                  label: formatDuration(d),
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
              Voz Atlas
              <DarkSelect
                aria-label="Voz"
                value={voiceId}
                onValueChange={(value) => {
                  setVoiceId(value);
                  setMuteCharacter(false);
                }}
                options={(catalog?.voices ?? FALLBACK_VOICES).map((v) => ({
                  value: v.id,
                  label: `${v.label} · ${v.note}`,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              Velocidad
              <DarkSelect
                aria-label="Velocidad de narración"
                value={String(voiceSpeed)}
                onValueChange={(value) => setVoiceSpeed(Number(value))}
                options={[0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((n) => ({
                  value: String(n),
                  label: n === 1 ? "1× normal" : n < 1 ? `${n}× lenta` : `${n}× rápida`,
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
                      note: "mejor para historia",
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
                checked={muteCharacter}
                onChange={(e) => setMuteCharacter(e.target.checked)}
              />
              Sin voz narrativa (solo SFX de Flow)
            </label>
            {muteCharacter ? (
              <p className="text-[11px] text-amber-400">
                El video no llevará narración Atlas. Elige una voz para activarla.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                TTS Atlas Cloud (xAI, Gemini Flash o MiniMax según la voz).
              </p>
            )}
            <label
              className={`flex items-center gap-2 ${hookAvailable(durationSec) ? "" : "opacity-40"}`}
            >
              <input
                type="checkbox"
                checked={contentHook}
                disabled={!hookAvailable(durationSec)}
                onChange={(e) => setContentHook(e.target.checked)}
              />
              Gancho 10s (5 / 8 / 15 min)
            </label>
            <VolumeSlider label="Volumen video" value={videoVolume} onChange={setVideoVolume} />
            <VolumeSlider
              label="Volumen TTS"
              value={ttsVolume}
              onChange={setTtsVolume}
              disabled={muteCharacter}
            />
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
              Plano continuo I2V (tomas encadenadas, sin freeze)
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
            gflowHint="Omni 10s. El primer still usa la ficha gflow del Casting. Audio Flow agachado + TTS Atlas."
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="h-11"
            onClick={() => void create()}
            disabled={busy || topic.trim().length < 4 || characterIds.length < 1}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Borrador del guion
          </Button>
        </section>

        {jobs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Trabajos Historia</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((j) => {
                const preview = j.previewRel
                  ? `/api/v1/stickman/jobs/${j.id}/artifacts/${j.previewRel}`
                  : undefined;
                const usd = j.cost?.usd;
                const tokens = j.cost?.tokens;
                return (
                  <button
                    key={j.id}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-border bg-card text-left hover:bg-muted/40"
                    onClick={() => navigate(`/historia/${j.id}`)}
                  >
                    <div
                      className={`bg-black ${
                        j.config?.aspect === "16:9"
                          ? "aspect-video"
                          : j.config?.aspect === "1:1"
                            ? "aspect-square"
                            : "aspect-[9/16]"
                      }`}
                    >
                      {preview ? (
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                          {j.status}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-medium">{j.topic}</p>
                      <div className="flex flex-wrap gap-1">
                        {jobChips(j).map((chip) => (
                          <span
                            key={chip}
                            className={cn(
                              "rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground",
                            )}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{producedLabel(j)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {tokens != null ? `${tokens.toLocaleString("es")} tokens` : "— tokens"}
                        {" · "}
                        {usd != null ? `$${usd.toFixed(3)}` : "$—"}
                        {j.cost?.credits ? ` · ${j.cost.credits} cr Flow` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
