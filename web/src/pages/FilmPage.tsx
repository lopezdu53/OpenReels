import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type BuiltinVisualStyle,
  type DirectorScoreScene,
  type JobSummary,
  type LibraryCharacter,
  type LibraryVisualStyle,
  type ProviderOptions,
} from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getSceneAssetUrl } from "@/lib/scene-assets";
import { KokoroVoiceMixer } from "@/components/new-short/KokoroVoiceMixer";
import { VisualTypeGrid } from "@/components/new-short/VisualTypeGrid";
import { CostEstimatePanel } from "@/components/new-short/CostEstimatePanel";
import { CharacterStudio } from "@/components/film/CharacterStudio";
import { VisualStyleStudio } from "@/components/film/VisualStyleStudio";
import { estimateJobCost } from "@/lib/job-cost-preview";
import { fetchUsdToCopRate } from "@/lib/cop-rate";
import { loadPrices } from "@/pages/LabPage";
import {
  Clapperboard,
  Film,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";

const FIELD = "h-9 w-full rounded-lg";

const YT_URL =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|youtube\.com\/shorts\/[\w-]+)/gi;

function parseYoutubeUrls(text: string): string[] {
  const found = text.match(YT_URL) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const id = raw.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? raw;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(raw);
  }
  return out.slice(0, 10);
}

const FALLBACK = {
  llm: [
    { key: "anthropic", label: "Anthropic (Claude)" },
    { key: "openai", label: "OpenAI (GPT)" },
    { key: "gemini", label: "Google Gemini" },
    { key: "openrouter", label: "OpenRouter" },
    { key: "grok", label: "Grok (xAI)" },
    { key: "vivi", label: "VIVI (Claude)" },
    { key: "alicloud", label: "Alibaba Cloud" },
  ],
  tts: [
    { key: "elevenlabs", label: "ElevenLabs" },
    { key: "kokoro", label: "Kokoro (Local)" },
    { key: "gemini-tts", label: "Gemini TTS" },
    { key: "openai-tts", label: "OpenAI TTS" },
    { key: "grok-tts", label: "Grok TTS" },
    { key: "inworld", label: "Inworld" },
  ],
  image: [
    { key: "vivi", label: "VIVI" },
    { key: "gemini", label: "Google Gemini" },
    { key: "openai", label: "OpenAI" },
    { key: "grok", label: "Grok Imagine" },
    { key: "runpod", label: "RunPod (público)" },
    { key: "fal", label: "fal.ai" },
    { key: "alicloud", label: "Alibaba Cloud" },
  ],
  video: [
    { key: "gemini", label: "Veo (Gemini)" },
    { key: "fal", label: "fal.ai (Kling)" },
    { key: "grok", label: "Grok Imagine Video" },
    { key: "vivi", label: "VIVI (Grok Video)" },
    { key: "runpod", label: "RunPod (público)" },
  ],
  search: [{ key: "tavily", label: "Tavily" }],
};

const FALLBACK_KOKORO = [
  { id: "ef_dora", label: "Dora — Español (F)", language: "es" },
  { id: "em_alex", label: "Alex — Español (M)", language: "es" },
  { id: "em_santa", label: "Santa — Español (M)", language: "es" },
];

const FILM_STAGES: { key: string; label: string }[] = [
  { key: "tts", label: "Narración" },
  { key: "research", label: "Verificación" },
  { key: "director", label: "Escenas" },
  { key: "visuals", label: "Imágenes" },
  { key: "assembly", label: "Montaje" },
  { key: "critic", label: "Calidad" },
];

type ScriptSlot = { id: string; title: string; body: string };

function newSlot(): ScriptSlot {
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title: "", body: "" };
}

function labelOf(list: { key: string; label: string }[], key: string) {
  return list.find((p) => p.key === key)?.label ?? key;
}

function isFilmJob(job: JobSummary) {
  return job.platform === "youtube_horizontal" || job.config?.platform === "youtube_horizontal";
}

export function FilmPage() {
  const [idea, setIdea] = useState("");
  const [youtubeDraft, setYoutubeDraft] = useState("");
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([]);
  const [scripts, setScripts] = useState<ScriptSlot[]>([newSlot()]);
  const [jobScripts, setJobScripts] = useState<Record<string, string>>({});
  const [durationMinutes, setDurationMinutes] = useState(8);
  const [llmProvider, setLlmProvider] = useState("vivi");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [searchProvider, setSearchProvider] = useState("");
  const [ttsProvider, setTtsProvider] = useState("elevenlabs");
  const [inworldVoice, setInworldVoice] = useState("Pedro");
  const [geminiTtsVoice, setGeminiTtsVoice] = useState("Kore");
  const [grokTtsVoice, setGrokTtsVoice] = useState("eve");
  const [grokTtsSpeed, setGrokTtsSpeed] = useState(1);
  const [kokoroVoice, setKokoroVoice] = useState("ef_dora");
  const [kokoroSpeed, setKokoroSpeed] = useState(1);
  const [imageProvider, setImageProvider] = useState("gemini");
  const [videoProvider, setVideoProvider] = useState("");
  const [videoSceneMode, setVideoSceneMode] = useState("all");
  const [musicProvider, setMusicProvider] = useState("bundled");
  const [runpodImageModel, setRunpodImageModel] = useState("p-image-t2i");
  const [runpodVideoModel, setRunpodVideoModel] = useState("p-video");
  const [runpodImageSteps, setRunpodImageSteps] = useState(4);
  const [runpodImageGuidance, setRunpodImageGuidance] = useState(1);
  const [runpodVideoResolution, setRunpodVideoResolution] = useState("720p");
  const [runpodImageEndpointId, setRunpodImageEndpointId] = useState("");
  const [runpodVideoEndpointId, setRunpodVideoEndpointId] = useState("");
  const [noSubtitles, setNoSubtitles] = useState(false);
  const [allowedVisualTypes, setAllowedVisualTypes] = useState(["ai_image", "stock_image", "text_card"]);
  const [stockAvailable, setStockAvailable] = useState(true);
  const [artStyleOverride, setArtStyleOverride] = useState("");
  const [styleId, setStyleId] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
  const [userStyles, setUserStyles] = useState<LibraryVisualStyle[]>([]);
  const [builtinStyles, setBuiltinStyles] = useState<BuiltinVisualStyle[]>([]);
  const [providers, setProviders] = useState<ProviderOptions | null>(null);
  const [usdToCop, setUsdToCop] = useState(4100);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [producing, setProducing] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<JobSummary[]>([]);

  useEffect(() => {
    api.listProviders().then(setProviders).catch(() => {});
    api.getHealth().then((h) => {
      const hasStock = Boolean(h.keys?.PEXELS_API_KEY || h.keys?.PIXABAY_API_KEY);
      setStockAvailable(hasStock);
      if (!hasStock) {
        setAllowedVisualTypes((prev) => prev.filter((t) => t !== "stock_image" && t !== "stock_video"));
      }
    }).catch(() => {});
    fetchUsdToCopRate().then(setUsdToCop).catch(() => {});
    api.listCharacters().then((r) => setCharacters(r.characters)).catch(() => {});
    api.listVisualStyles().then((r) => {
      setBuiltinStyles(r.builtins ?? []);
      setUserStyles(r.styles ?? []);
    }).catch(() => {});
    api.listJobs(20, 0).then(({ jobs: listed }) => {
      const films = listed.filter(isFilmJob);
      if (!films.length) return;
      setJobs((prev) => {
        const ids = new Set(prev.map((j) => j.id));
        const extra = films.filter((j) => !ids.has(j.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
    }).catch(() => {});
  }, []);

  const refreshJobs = useCallback(async (ids: string[]) => {
    const next = await Promise.all(ids.map((id) => api.getJob(id).catch(() => null)));
    setJobs(next.filter((j): j is JobSummary => Boolean(j)));
  }, []);

  useEffect(() => {
    const ids = jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id);
    if (ids.length === 0) return;
    const t = window.setInterval(() => void refreshJobs(jobs.map((j) => j.id)), 3000);
    return () => window.clearInterval(t);
  }, [jobs, refreshJobs]);

  const llmList = providers?.llm?.length ? providers.llm : FALLBACK.llm;
  const ttsList = providers?.tts?.length ? providers.tts : FALLBACK.tts;
  const imageList = providers?.image?.length ? providers.image : FALLBACK.image;
  const videoList = providers?.video?.length ? providers.video : FALLBACK.video;
  const searchList = providers?.search?.length ? providers.search : FALLBACK.search;
  const kokoroVoices = providers?.kokoroVoices?.length ? providers.kokoroVoices : FALLBACK_KOKORO;

  const prices = useMemo(() => loadPrices(), [llmProvider, ttsProvider, imageProvider, videoProvider]);
  const costPreview = useMemo(
    () =>
      estimateJobCost(
        {
          llm: llmProvider,
          tts: ttsProvider,
          image: imageProvider,
          video: videoProvider || undefined,
          music: musicProvider,
          pacing: "cinematic",
          platform: "youtube_horizontal",
          targetDurationMinutes: durationMinutes,
          allowedVisualTypes,
          videoSceneMode: allowedVisualTypes.includes("ai_video") ? videoSceneMode : undefined,
        },
        prices,
      ),
    [llmProvider, ttsProvider, imageProvider, videoProvider, musicProvider, durationMinutes, allowedVisualTypes, videoSceneMode, prices],
  );

  const readyScripts = scripts.filter((s) => s.body.trim().length >= 20);
  const activeCount = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const doneCount = jobs.filter((j) => j.status === "completed").length;

  function addYoutubeLinks() {
    const found = parseYoutubeUrls(youtubeDraft);
    if (!found.length) {
      setError("Pega al menos un link de YouTube válido (youtube.com o youtu.be).");
      return;
    }
    setError("");
    setYoutubeUrls((prev) => [...new Set([...prev, ...found])].slice(0, 10));
    setYoutubeDraft("");
  }

  function providersPayload() {
    return {
      llm: llmProvider,
      tts: ttsProvider,
      image: imageProvider,
      music: musicProvider,
      ...(videoProvider ? { video: videoProvider } : {}),
      ...(llmModel ? { llmModel } : {}),
      ...(llmBaseUrl ? { llmBaseUrl } : {}),
      ...(searchProvider ? { searchProvider } : {}),
      ...(ttsProvider === "inworld" ? { inworldVoice } : {}),
      ...(ttsProvider === "gemini-tts" ? { geminiTtsVoice } : {}),
      ...(ttsProvider === "grok-tts" ? { grokTtsVoice, grokTtsSpeed } : {}),
      ...(ttsProvider === "kokoro" ? { kokoroVoice, kokoroSpeed } : {}),
      ...(imageProvider === "runpod"
        ? {
            runpodImageModel,
            runpodImageSteps,
            runpodImageGuidance,
            ...(runpodImageModel === "custom" && runpodImageEndpointId ? { runpodImageEndpointId } : {}),
          }
        : {}),
      ...(videoProvider === "runpod"
        ? {
            runpodVideoModel,
            runpodVideoResolution,
            ...(runpodVideoModel === "custom" && runpodVideoEndpointId ? { runpodVideoEndpointId } : {}),
          }
        : {}),
    };
  }

  async function generateScript() {
    if (idea.trim().length < 4 || scriptLoading) return;
    setScriptLoading(true);
    setError("");
    try {
      const { script } = await api.generateFilmScript({
        idea: idea.trim(),
        durationMinutes,
        llm: llmProvider,
        llmModel: llmModel || undefined,
        youtubeUrls,
        youtubeText: youtubeDraft,
      });
      setScripts((prev) => {
        const empty = prev.find((s) => !s.body.trim());
        const row: ScriptSlot = {
          id: empty?.id ?? newSlot().id,
          title: script.title,
          body: [script.hook, script.script].filter(Boolean).join("\n\n"),
        };
        if (empty) return prev.map((s) => (s.id === empty.id ? row : s));
        return [...prev, row];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptLoading(false);
    }
  }

  async function produce() {
    if (readyScripts.length === 0 || producing) return;
    setProducing(true);
    setError("");
    const created: JobSummary[] = [];
    const scriptsById: Record<string, string> = {};
    try {
      for (const slot of readyScripts) {
        const title = (slot.title.trim() || slot.body.trim().split("\n")[0] || "Film YouTube").slice(0, 200);
        const character = characters.find((c) => c.id === characterId);
        const style = userStyles.find((s) => s.id === styleId);
        const characterLock = character
          ? [
              `Name: ${character.name}`,
              character.aliases ? `Aliases (same individual): ${character.aliases}` : "",
              character.kind ? `Kind: ${character.kind}` : "",
              `Species/race (LOCKED): ${character.species}`,
              character.age ? `Age: ${character.age}` : "",
              `Appearance: ${character.appearance}`,
              character.mustKeep ? `MUST keep: ${character.mustKeep}` : "",
              character.mustAvoid ? `MUST avoid: ${character.mustAvoid}` : "",
            ].filter(Boolean).join(". ")
          : "";
        const characterReferenceImage = character?.referenceImage;
        const styleReferenceImage = style?.referenceImage;
        const direction = [
          "## Guion (locución — honrar estas líneas; no reescribir el texto hablado)",
          slot.body.trim(),
          characterLock ? `\n## Personaje (identidad bloqueada)\n${characterLock}` : "",
          youtubeUrls.length
            ? `\n## Referencias YouTube (formato, no identidad)\n${youtubeUrls.map((u) => `- ${u}`).join("\n")}`
            : "",
          "\n## Formato\nVideo horizontal 16:9 para YouTube (1920x1080). No es un Short vertical.",
        ].join("\n");
        if (new TextEncoder().encode(direction).length > 65536) {
          throw new Error(`El guion de “${title}” supera 64KB. Acórtalo.`);
        }
        const res = await api.createJob({
          topic: title,
          platform: "youtube_horizontal",
          pacing: "cinematic",
          targetDurationMinutes: durationMinutes,
          direction,
          noSubtitles,
          allowedVisualTypes,
          atelierMode: true,
          ...(artStyleOverride ? { artStyleOverride } : {}),
          ...(characterLock ? { characterLock } : {}),
          ...(characterReferenceImage ? { characterReferenceImage } : {}),
          ...(styleReferenceImage ? { styleReferenceImage } : {}),
          ...(allowedVisualTypes.includes("ai_video") && videoSceneMode !== "all" ? { videoSceneMode } : {}),
          providers: providersPayload(),
        });
        created.push({
          id: res.id,
          topic: title,
          status: "queued",
          platform: "youtube_horizontal",
        });
        scriptsById[res.id] = slot.body.trim();
      }
      setJobScripts((prev) => ({ ...prev, ...scriptsById }));
      setJobs((prev) => [...created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (created.length) {
        setJobScripts((prev) => ({ ...prev, ...scriptsById }));
        setJobs((prev) => [...created, ...prev]);
      }
    } finally {
      setProducing(false);
    }
  }

  async function stopAll() {
    await Promise.all(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => api.cancelJob(j.id).catch(() => {})));
    await refreshJobs(jobs.map((j) => j.id));
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[2px] text-primary">YouTube 16:9</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Film className="size-7 text-primary" />
            Nuevo Film
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Videos horizontales para YouTube. Genera el guion desde una idea, pega varios guiones y
            lanza el lote. Configura LLM, TTS, imagen y video igual que en Nuevo Short.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="film-idea">
            Idea → guion
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="film-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Ej. qué harías con un millón de dólares, explicado en 8 minutos"
              className="h-11 flex-1"
            />
            <Button className="h-11 px-4" onClick={() => void generateScript()} disabled={scriptLoading || idea.trim().length < 4}>
              {scriptLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generar guion
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Duración
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {[2, 3, 5, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] text-muted-foreground">~{durationMinutes * 150} palabras · 1920×1080</span>
          </div>
        </section>

        <section className="space-y-3">
          {scripts.map((slot, i) => (
            <div key={slot.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={slot.title}
                  onChange={(e) =>
                    setScripts((prev) => prev.map((s) => (s.id === slot.id ? { ...s, title: e.target.value } : s)))
                  }
                  placeholder={`Título del video ${i + 1}`}
                  className="h-9 max-w-md"
                />
                {scripts.length > 1 ? (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                    onClick={() => setScripts((prev) => prev.filter((s) => s.id !== slot.id))}
                    title="Quitar guion"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <textarea
                className="min-h-[140px] w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary/40"
                placeholder={`Pega aquí el guion del video ${i + 1}…`}
                value={slot.body}
                onChange={(e) =>
                  setScripts((prev) => prev.map((s) => (s.id === slot.id ? { ...s, body: e.target.value } : s)))
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setScripts((prev) => [...prev, newSlot()])}>
              <Plus className="size-4" />
              Añadir otro guion
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" htmlFor="film-yt">
            <Link2 className="size-3.5" /> O pega links de YouTube para replicar el formato
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="film-yt"
              value={youtubeDraft}
              onChange={(e) => setYoutubeDraft(e.target.value)}
              placeholder="O pega links de YouTube para replicar (uno o varios)…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addYoutubeLinks();
                }
              }}
            />
            <Button type="button" variant="outline" className="shrink-0" onClick={addYoutubeLinks}>
              <Plus className="size-4" />
              Añadir link(s)
            </Button>
          </div>
          {youtubeUrls.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {youtubeUrls.map((url) => (
                <li
                  key={url}
                  className="flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-inset px-2 py-0.5 text-[11px]"
                >
                  <span className="truncate">{url}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setYoutubeUrls((prev) => prev.filter((u) => u !== url))}
                    aria-label="Quitar link"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <CharacterStudio
          characters={characters}
          selectedId={characterId}
          imageProviders={providers?.image ?? FALLBACK.image}
          onSelect={setCharacterId}
          onSave={async (body) => {
            const { character } = body.id
              ? await api.updateCharacter(String(body.id), body)
              : await api.saveCharacter(body);
            setCharacters((prev) => {
              const rest = prev.filter((c) => c.id !== character.id);
              return [character, ...rest];
            });
            setCharacterId(character.id);
          }}
          onDelete={async (id) => {
            await api.deleteCharacter(id);
            setCharacters((prev) => prev.filter((c) => c.id !== id));
            if (characterId === id) setCharacterId("");
          }}
        />
        <p className="text-xs text-muted-foreground">
          Si el personaje tiene ficha 16:9, cada still usa esa ficha como ancla de identidad (cara, marcas, especie). No se copia el collage de paneles: se pinta un plano nuevo.
        </p>

        <VisualStyleStudio
          builtins={builtinStyles.length ? builtinStyles : (providers?.atelierStyles ?? [])}
          styles={userStyles}
          selectedId={styleId}
          imageProviders={providers?.image ?? FALLBACK.image}
          onSelect={(id, artStyle) => {
            setStyleId(id);
            setArtStyleOverride(artStyle);
          }}
          onSave={async (body) => {
            const { style } = body.id
              ? await api.updateVisualStyle(String(body.id), body)
              : await api.saveVisualStyle(body);
            setUserStyles((prev) => {
              const rest = prev.filter((s) => s.id !== style.id);
              return [style, ...rest];
            });
            setStyleId(style.id);
            setArtStyleOverride(style.artStyle);
          }}
          onDelete={async (id) => {
            await api.deleteVisualStyle(id);
            setUserStyles((prev) => prev.filter((s) => s.id !== id));
            if (styleId === id) {
              setStyleId("");
              setArtStyleOverride("");
            }
          }}
        />

        <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">Configuración</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="LLM">
                <Select value={llmProvider} onValueChange={(v) => v && setLlmProvider(v)}>
                  <SelectTrigger className={FIELD}><SelectValue>{labelOf(llmList, llmProvider)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {llmList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Búsqueda web">
                <Select value={searchProvider} onValueChange={(v) => setSearchProvider(v ?? "")}>
                  <SelectTrigger className={FIELD}><SelectValue placeholder="Auto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Auto</SelectItem>
                    {searchList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="TTS">
                <Select value={ttsProvider} onValueChange={(v) => v && setTtsProvider(v)}>
                  <SelectTrigger className={FIELD}><SelectValue>{labelOf(ttsList, ttsProvider)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {ttsList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Imagen">
                <Select value={imageProvider} onValueChange={(v) => v && setImageProvider(v)}>
                  <SelectTrigger className={FIELD}><SelectValue>{labelOf(imageList, imageProvider)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {imageList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Video IA">
                <Select value={videoProvider} onValueChange={(v) => setVideoProvider(v ?? "")}>
                  <SelectTrigger className={FIELD}><SelectValue placeholder="Sin video IA" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin video IA</SelectItem>
                    {videoList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Música">
                <Select value={musicProvider} onValueChange={(v) => v && setMusicProvider(v)}>
                  <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bundled">Bundled (gratis)</SelectItem>
                    <SelectItem value="lyria">Lyria 3 Pro ($0.08)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {(llmProvider === "openrouter" || llmProvider === "grok" || llmProvider === "openai-compatible") && (
              <Field label="Model ID">
                <Input className={FIELD} value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder={llmProvider === "grok" ? "grok-4" : "model-id"} />
              </Field>
            )}
            {llmProvider === "openai-compatible" ? (
              <Field label="Base URL">
                <Input className={FIELD} value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
              </Field>
            ) : null}
            {ttsProvider === "inworld" && providers?.inworldVoices ? (
              <Field label="Voz Inworld">
                <Select value={inworldVoice} onValueChange={(v) => v && setInworldVoice(v)}>
                  <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.inworldVoices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {ttsProvider === "gemini-tts" && providers?.geminiTtsVoices ? (
              <Field label="Voz Gemini">
                <Select value={geminiTtsVoice} onValueChange={(v) => v && setGeminiTtsVoice(v)}>
                  <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.geminiTtsVoices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {ttsProvider === "grok-tts" && providers?.grokTtsVoices ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Voz Grok">
                  <Select value={grokTtsVoice} onValueChange={(v) => v && setGrokTtsVoice(v)}>
                    <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providers.grokTtsVoices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={`Velocidad ${grokTtsSpeed.toFixed(1)}x`}>
                  <input type="range" min="0.7" max="1.5" step="0.1" value={grokTtsSpeed}
                    onChange={(e) => setGrokTtsSpeed(Number(e.target.value))} className="mt-2 w-full accent-primary" />
                </Field>
              </div>
            ) : null}
            {ttsProvider === "kokoro" ? (
              <KokoroVoiceMixer
                voices={kokoroVoices}
                value={kokoroVoice}
                onChange={setKokoroVoice}
                speed={kokoroSpeed}
                onSpeedChange={setKokoroSpeed}
              />
            ) : null}
            {allowedVisualTypes.includes("ai_video") ? (
              <Field label="Escenas de video">
                <Select value={videoSceneMode} onValueChange={(v) => v && setVideoSceneMode(v)}>
                  <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las escenas AI</SelectItem>
                    <SelectItem value="first">Solo 1ª escena AI</SelectItem>
                    <SelectItem value="first3">Primeras 3</SelectItem>
                    <SelectItem value="first_every2">1ª + cada 2</SelectItem>
                    <SelectItem value="force_first">Forzar escena #1</SelectItem>
                    <SelectItem value="force_first3">Forzar #1–#3</SelectItem>
                    <SelectItem value="force_first_every2">Forzar #1, #3, #5…</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {(imageProvider === "runpod" || videoProvider === "runpod") ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold">Opciones RunPod</p>
                {imageProvider === "runpod" ? (
                  <Field label="Modelo de imagen">
                    <Select value={runpodImageModel} onValueChange={(v) => {
                      if (!v) return;
                      setRunpodImageModel(v);
                      const spec = providers?.runpodImageModels?.find((m) => m.id === v);
                      if (spec?.defaultSteps) setRunpodImageSteps(spec.defaultSteps);
                      if (spec?.defaultGuidance != null) setRunpodImageGuidance(spec.defaultGuidance);
                    }}>
                      <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(providers?.runpodImageModels ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}{m.costHint ? ` · ${m.costHint}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                {imageProvider === "runpod" && runpodImageModel === "custom" ? (
                  <Input className={cn(FIELD, "font-mono text-xs")} placeholder="Endpoint ID imagen"
                    value={runpodImageEndpointId} onChange={(e) => setRunpodImageEndpointId(e.target.value)} />
                ) : null}
                {videoProvider === "runpod" ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Modelo I2V">
                      <Select value={runpodVideoModel} onValueChange={(v) => {
                        if (!v) return;
                        setRunpodVideoModel(v);
                        const spec = providers?.runpodVideoModels?.find((m) => m.id === v);
                        if (spec?.resolutions[0]) setRunpodVideoResolution(spec.resolutions[0]);
                      }}>
                        <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(providers?.runpodVideoModels ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.label}{m.costHint ? ` · ${m.costHint}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {runpodVideoModel === "custom" ? (
                      <Input className={cn(FIELD, "font-mono text-xs")} placeholder="Endpoint ID video"
                        value={runpodVideoEndpointId} onChange={(e) => setRunpodVideoEndpointId(e.target.value)} />
                    ) : (
                      <Field label="Resolución">
                        <Select value={runpodVideoResolution} onValueChange={(v) => v && setRunpodVideoResolution(v)}>
                          <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(providers?.runpodVideoModels?.find((m) => m.id === runpodVideoModel)?.resolutions ?? ["720p"]).map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-xs font-medium">Subtítulos</span>
              <Switch checked={!noSubtitles} onCheckedChange={(v) => setNoSubtitles(!v)} size="sm" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Tipos visuales</p>
              <VisualTypeGrid
                selected={allowedVisualTypes}
                stockAvailable={stockAvailable}
                onToggle={(key, on) => {
                  setAllowedVisualTypes((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
                  if (key === "ai_video" && !on) {
                    setVideoProvider("");
                    setVideoSceneMode("all");
                  }
                }}
                atelierMode
                onAtelier={() => {}}
                hideAtelier
              />
            </div>
          </div>
          <CostEstimatePanel
            preview={costPreview}
            usdToCop={usdToCop}
            rateNote="estimado / film"
            usesVivi={llmProvider === "vivi" || imageProvider === "vivi" || videoProvider === "vivi"}
          />
        </section>

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="space-y-2">
          <Button
            className="h-12 w-full text-base"
            onClick={() => void produce()}
            disabled={producing || readyScripts.length === 0}
          >
            {producing ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
            {producing ? "Produciendo…" : `Producir ${readyScripts.length || ""} film${readyScripts.length === 1 ? "" : "s"} 16:9`}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {activeCount === 0
              ? "Capacidad completa: nadie más está produciendo ahora"
              : `${activeCount} film(s) en producción ahora.`}
          </p>
        </div>

        {jobs.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {jobs.length} video(s) · {doneCount} listo(s)
              </p>
              {activeCount > 0 ? (
                <Button variant="outline" size="sm" onClick={() => void stopAll()}>
                  <Square className="size-3.5" />
                  Detener todo
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {jobs.map((job) => (
                <FilmJobCard key={job.id} job={job} script={jobScripts[job.id]} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function FilmJobCard({ job, script }: { job: JobSummary; script?: string }) {
  const [showScript, setShowScript] = useState(false);
  const running = job.status === "queued" || job.status === "running";
  const failed = job.status === "failed";
  const videoUrl = job.videoPath ? `/api/v1/jobs/${job.id}/artifacts/${job.videoPath}` : null;
  const spoken =
    script
    ?? job.score?.scenes?.map((s) => s.script_line).filter(Boolean).join("\n")
    ?? "";
  const scenes = job.score?.scenes ?? [];
  const visualsStatus = job.stages?.visuals?.status ?? "pending";
  const visualsRunning = visualsStatus === "running";
  const visualsDone = visualsStatus === "done";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{job.topic}</p>
          <p className="font-mono text-[10px] text-muted-foreground">V-{job.id.slice(0, 6).toUpperCase()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {spoken ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowScript((v) => !v)}
            >
              <FileText className="size-3" />
              Guion
            </button>
          ) : null}
          <Link to={`/jobs/${job.id}`} className="text-[11px] text-primary hover:underline">
            Abrir
          </Link>
        </div>
      </div>
      {showScript && spoken ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-inset p-2 text-[11px] text-muted-foreground">
          {spoken}
        </pre>
      ) : null}
      {videoUrl ? (
        <video src={videoUrl} controls className="aspect-video w-full rounded-lg bg-black object-contain" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-inset">
          {running ? <Loader2 className="size-6 animate-spin text-primary" /> : <ImageIcon className="size-6 text-muted-foreground" />}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {FILM_STAGES.map((st) => {
          const status = job.stages?.[st.key]?.status ?? "pending";
          return (
            <span
              key={st.key}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                status === "done" && "bg-emerald-500/15 text-emerald-400",
                status === "running" && "bg-primary/20 text-primary",
                status === "error" && "bg-destructive/15 text-destructive",
                (status === "pending" || status === "skipped") && "bg-muted text-muted-foreground",
              )}
            >
              {status === "done" ? "✔ " : status === "running" ? "· " : ""}
              {st.label}
            </span>
          );
        })}
      </div>
      {scenes.length > 0 ? (
        <Filmstrip
          jobId={job.id}
          runDir={job.runDir}
          scenes={scenes}
          visualsRunning={visualsRunning}
          visualsDone={visualsDone}
          detail={job.stages?.visuals?.detail}
        />
      ) : visualsRunning && job.stages?.visuals?.detail ? (
        <p className="text-[11px] text-muted-foreground">{job.stages.visuals.detail}</p>
      ) : null}
      {failed ? <p className="text-[11px] text-destructive">{job.error ?? "Falló"}</p> : null}
    </div>
  );
}

function Filmstrip({
  jobId,
  runDir,
  scenes,
  visualsRunning,
  visualsDone,
  detail,
}: {
  jobId: string;
  runDir?: string;
  scenes: DirectorScoreScene[];
  visualsRunning: boolean;
  visualsDone: boolean;
  detail?: string;
}) {
  const doneHint = detail?.match(/(\d+)\s*\/\s*(\d+)/);
  const doneCount = doneHint ? Number(doneHint[1]) : visualsDone ? scenes.length : 0;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        {visualsRunning ? `${Math.min(doneCount, scenes.length)}/${scenes.length} imágenes…` : `${scenes.length} escenas`}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {scenes.map((scene, i) => {
          const url = runDir ? getSceneAssetUrl(jobId, runDir, scene, i) : null;
          const ready = Boolean(url) && (visualsDone || i < doneCount);
          return (
            <div
              key={i}
              className="relative h-14 w-[72px] shrink-0 overflow-hidden rounded-md border border-border bg-surface-inset"
            >
              {ready && url ? (
                scene.visual_type === "ai_video" || scene.visual_type === "stock_video" ? (
                  <video src={url} muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <img src={url} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                  {visualsRunning && i === doneCount ? (
                    <span className="animate-pulse text-primary">+ generando…</span>
                  ) : (
                    i + 1
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
