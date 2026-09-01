import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Archetype, api, type Platform, type ProviderOptions } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Clapperboard,
  ImageIcon,
  Lightbulb,
  Mic2,
  Music,
  PenLine,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { ArchetypeCard } from "@/components/ArchetypeCard";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PipelineStep } from "@/components/new-short/PipelineStep";
import { PipelineOverview } from "@/components/new-short/PipelineOverview";
import { CostEstimatePanel } from "@/components/new-short/CostEstimatePanel";
import { KokoroVoiceMixer } from "@/components/new-short/KokoroVoiceMixer";
import { VisualTypeGrid } from "@/components/new-short/VisualTypeGrid";
import { estimateJobCost } from "@/lib/job-cost-preview";
import { fetchUsdToCopRate } from "@/lib/cop-rate";
import { loadPrices } from "@/pages/LabPage";

const TOPIC_CATEGORIES: Record<string, string[]> = {
  History: [
    "How coffee changed history",
    "Ancient Rome's greatest inventions",
    "The fall of the Berlin Wall",
    "5 forgotten civilizations",
  ],
  Science: [
    "Black holes explained",
    "Why do we dream?",
    "CRISPR gene editing in 2026",
    "The science of time perception",
  ],
  Culture: [
    "How anime conquered the world",
    "The psychology of music",
    "Street food capitals of the world",
    "Why we love horror movies",
  ],
  Technology: [
    "Top 5 AI advancements in 2026",
    "How quantum computing works",
    "The future of space tourism",
    "Inside a data center",
  ],
};

const CATEGORY_KEYS = Object.keys(TOPIC_CATEGORIES);

const DISPLAY_NAMES: Record<string, string> = {
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram",
  reel_extend: "Reel Extend",
  youtube_horizontal: "YouTube (Horizontal)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  "openai-compatible": "Custom (OpenAI-compatible)",
  alicloud: "Alibaba Cloud",
  grok: "Grok (xAI)",
  vivi: "VIVI",
  elevenlabs: "ElevenLabs",
  inworld: "Inworld",
  kokoro: "Kokoro (Local)",
  "gemini-tts": "Gemini TTS",
  "openai-tts": "OpenAI TTS",
  "grok-tts": "Grok TTS",
  bundled: "Bundled (Free)",
  lyria: "Lyria 3 Pro",
  fal: "fal.ai (Kling)",
  runpod: "RunPod (público)",
};

function displayName(key: string): string {
  return DISPLAY_NAMES[key] ?? key;
}

function providerLabel(list: { key: string; label: string }[] | undefined, key: string): string {
  return list?.find((p) => p.key === key)?.label ?? displayName(key);
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
    { key: "gemini", label: "Google Gemini" },
    { key: "openai", label: "OpenAI" },
    { key: "grok", label: "Grok Imagine" },
    { key: "vivi", label: "VIVI (Gemini Image)" },
    { key: "runpod", label: "RunPod (público)" },
  ],
  video: [
    { key: "gemini", label: "Veo (Gemini)" },
    { key: "fal", label: "fal.ai (Kling)" },
    { key: "grok", label: "Grok Imagine Video" },
    { key: "vivi", label: "VIVI (Grok Video)" },
    { key: "runpod", label: "RunPod (público)" },
  ],
  search: [
    { key: "tavily", label: "Tavily" },
  ],
};

const FALLBACK_KOKORO_VOICES = [
  { id: "ef_dora", label: "Dora — Español (F)", language: "es" },
  { id: "em_alex", label: "Alex — Español (M)", language: "es" },
  { id: "em_santa", label: "Santa — Español (M)", language: "es" },
  { id: "af_heart", label: "Heart — English US (F)", language: "en-us" },
  { id: "af_bella", label: "Bella — English US (F)", language: "en-us" },
  { id: "am_michael", label: "Michael — English US (M)", language: "en-us" },
  { id: "bf_emma", label: "Emma — English UK (F)", language: "en-gb" },
  { id: "bm_george", label: "George — English UK (M)", language: "en-gb" },
];

const LONG_FORM_PLATFORMS = new Set(["reel_extend", "youtube_horizontal"]);

export function HomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [archetype, setArchetype] = useState("");
  const [styleReferenceMode, setStyleReferenceMode] = useState(false);
  const [styleReferenceImage, setStyleReferenceImage] = useState<string | undefined>(undefined);
  const styleImageInputRef = useRef<HTMLInputElement | null>(null);
  const [artStyleOverride, setArtStyleOverride] = useState<string>("");
  const [atelierMode, setAtelierMode] = useState(false);
  const [platform, setPlatform] = useState("youtube");
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [searchProvider, setSearchProvider] = useState("");
  const [ttsProvider, setTtsProvider] = useState("elevenlabs");
  const [inworldVoice, setInworldVoice] = useState("Pedro");
  const [geminiTtsVoice, setGeminiTtsVoice] = useState("Kore");
  const [grokTtsVoice, setGrokTtsVoice] = useState("eve");
  const [grokTtsSpeed, setGrokTtsSpeed] = useState(1.0);
  const [grokTtsModel] = useState("");
  const [kokoroVoice, setKokoroVoice] = useState("ef_dora");
  const [kokoroSpeed, setKokoroSpeed] = useState(1.0);
  const [imageProvider, setImageProvider] = useState("gemini");
  const [musicProvider, setMusicProvider] = useState("bundled");
  const [videoProvider, setVideoProvider] = useState("");
  const [runpodImageModel, setRunpodImageModel] = useState("black-forest-labs-flux-1-schnell");
  const [runpodVideoModel, setRunpodVideoModel] = useState("p-video");
  const [runpodImageSteps, setRunpodImageSteps] = useState(4);
  const [runpodImageGuidance, setRunpodImageGuidance] = useState(1);
  const [runpodVideoResolution, setRunpodVideoResolution] = useState("720p");
  const [runpodImageEndpointId, setRunpodImageEndpointId] = useState("");
  const [runpodVideoEndpointId, setRunpodVideoEndpointId] = useState("");
  const [videoSceneMode, setVideoSceneMode] = useState("all");
  const [pacing, setPacing] = useState("");
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(5);
  const [dryRun, setDryRun] = useState(false);
  const [noSubtitles, setNoSubtitles] = useState(false);
  const [directionText, setDirectionText] = useState("");
  const [scoreJson, setScoreJson] = useState<Record<string, unknown> | null>(null);
  const [scoreFileName, setScoreFileName] = useState("");
  const [allowedVisualTypes, setAllowedVisualTypes] = useState<string[]>([
    "ai_image",
    "stock_image",
    "stock_video",
    "text_card",
  ]);
  const [stockAvailable, setStockAvailable] = useState(true);

  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [providers, setProviders] = useState<ProviderOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usdToCop, setUsdToCop] = useState(4100);
  const [rateLive, setRateLive] = useState(false);

  const [activeCategory, setActiveCategory] = useState(CATEGORY_KEYS[0]!);
  const [shuffledTopics, setShuffledTopics] = useState<string[]>([]);

  useEffect(() => {
    api.listArchetypes().then(setArchetypes).catch(() => {});
    api.listPlatforms().then(setPlatforms).catch(() => {});
    api.listProviders().then(setProviders).catch(() => {});
    api.getHealth().then((h) => {
      const hasStock = Boolean(h.keys?.PEXELS_API_KEY || h.keys?.PIXABAY_API_KEY);
      setStockAvailable(hasStock);
      if (!hasStock) {
        setAllowedVisualTypes((prev) =>
          prev.filter((t) => t !== "stock_image" && t !== "stock_video"),
        );
      }
    }).catch(() => {});
    fetchUsdToCopRate().then((rate) => {
      setUsdToCop(rate);
      setRateLive(rate !== 4100);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setShuffledTopics(TOPIC_CATEGORIES[activeCategory] ?? []);
  }, [activeCategory]);

  const prices = useMemo(() => loadPrices(), [ttsProvider, llmProvider, imageProvider, videoProvider, musicProvider]);
  const costPreview = useMemo(
    () =>
      estimateJobCost(
        {
          llm: llmProvider,
          tts: ttsProvider,
          image: imageProvider,
          video: videoProvider || undefined,
          music: musicProvider,
          pacing,
          platform,
          targetDurationMinutes,
          allowedVisualTypes,
          videoSceneMode,
          dryRun,
        },
        prices,
      ),
    [
      llmProvider, ttsProvider, imageProvider, videoProvider, musicProvider,
      pacing, platform, targetDurationMinutes, allowedVisualTypes, videoSceneMode, dryRun, prices,
    ],
  );

  const handleShuffle = () => {
    setShuffledTopics((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || loading) return;
    if (styleReferenceMode && !styleReferenceImage) {
      setError("Sube una imagen de referencia o cambia el Style Override.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await api.createJob({
        topic: topic.trim(),
        archetype: archetype || undefined,
        pacing: pacing || undefined,
        platform,
        dryRun,
        ...(noSubtitles ? { noSubtitles: true } : {}),
        ...(LONG_FORM_PLATFORMS.has(platform) ? { targetDurationMinutes } : {}),
        ...(directionText.trim() ? { direction: directionText.trim() } : {}),
        ...(scoreJson ? { score: scoreJson } : {}),
        allowedVisualTypes: allowedVisualTypes.length > 0 ? allowedVisualTypes : undefined,
        ...(allowedVisualTypes.includes("ai_video") && videoSceneMode !== "all" ? { videoSceneMode } : {}),
        ...(styleReferenceMode && styleReferenceImage ? { styleReferenceImage } : {}),
        ...(atelierMode ? { atelierMode: true } : {}),
        ...(artStyleOverride ? { artStyleOverride } : {}),
        providers: {
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
          ...(ttsProvider === "grok-tts" ? { grokTtsVoice, grokTtsSpeed, grokTtsModel } : {}),
          ...(ttsProvider === "kokoro" ? { kokoroVoice, kokoroSpeed } : {}),
          ...(imageProvider === "runpod"
            ? {
                runpodImageModel,
                runpodImageSteps,
                runpodImageGuidance,
                ...(runpodImageModel === "custom" && runpodImageEndpointId
                  ? { runpodImageEndpointId }
                  : {}),
              }
            : {}),
          ...(videoProvider === "runpod"
            ? {
                runpodVideoModel,
                runpodVideoResolution,
                ...(runpodVideoModel === "custom" && runpodVideoEndpointId
                  ? { runpodVideoEndpointId }
                  : {}),
              }
            : {}),
        },
      });
      navigate(`/jobs/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
      setLoading(false);
    }
  };

  const hasTopic = topic.trim().length > 0;
  const field = "h-9 w-full rounded-lg";
  const llmList = providers?.llm?.length ? providers.llm : FALLBACK.llm;
  const ttsList = providers?.tts?.length ? providers.tts : FALLBACK.tts;
  const imageList = providers?.image?.length ? providers.image : FALLBACK.image;
  const videoList = providers?.video?.length ? providers.video : FALLBACK.video;
  const searchList = providers?.search?.length ? providers.search : FALLBACK.search;
  const kokoroVoices = providers?.kokoroVoices?.length ? providers.kokoroVoices : FALLBACK_KOKORO_VOICES;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-primary mb-2">Pipeline OpenReels</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            ¿Qué historia contamos?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Cinco etapas, cada una con sus APIs. El precio a la derecha se actualiza en USD y pesos colombianos.
          </p>
        </div>

        <PipelineOverview
          steps={[
            { id: "step-historia", n: 1, title: "Historia", hint: "Tema y formato", icon: Sparkles },
            { id: "step-guion", n: 2, title: "Guion", hint: "LLM e investigación", icon: PenLine },
            { id: "step-voz", n: 3, title: "Voz", hint: "TTS y subtítulos", icon: Mic2 },
            { id: "step-visuales", n: 4, title: "Visuales", hint: "Imagen y estilo", icon: ImageIcon },
            { id: "step-musica", n: 5, title: "Música", hint: "Banda y extras", icon: Music },
          ]}
        />

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
          <div>
            <PipelineStep id="step-historia" step={1} icon={Sparkles} title="Historia" subtitle="Tema, formato y ritmo">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
                placeholder="La historia del Coliseo romano, black holes explained..."
                className="w-full bg-transparent text-[15px] text-foreground placeholder:text-text-faint focus:outline-none mb-4"
              />
              <div className="flex flex-wrap gap-3">
                <Select value={platform} onValueChange={(v) => v && setPlatform(v)}>
                  <SelectTrigger className={cn(field, "w-auto min-w-[160px]")}><SelectValue>{displayName(platform)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.name} value={p.name}>{displayName(p.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {LONG_FORM_PLATFORMS.has(platform) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 h-9 text-xs">
                    <span className="text-muted-foreground">Duración</span>
                    <input type="range" min={2} max={20} step={1} value={targetDurationMinutes}
                      onChange={(e) => setTargetDurationMinutes(Number(e.target.value))} className="w-24 accent-primary" />
                    <span className="font-semibold">{targetDurationMinutes} min</span>
                  </div>
                ) : (
                  <Select value={pacing} onValueChange={(v) => setPacing(v ?? "")}>
                    <SelectTrigger className={cn(field, "w-auto min-w-[140px]")}><SelectValue placeholder="Ritmo auto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Ritmo auto</SelectItem>
                      <SelectItem value="fast">Fast · más escenas</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="cinematic">Cinematic</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  {CATEGORY_KEYS.map((cat) => (
                    <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                      className={cn("rounded-full px-3 py-1 text-[11px] font-medium",
                        activeCategory === cat ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {cat}
                    </button>
                  ))}
                  <button type="button" onClick={handleShuffle} className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Shuffle className="size-3" /> Shuffle
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shuffledTopics.map((s) => (
                    <button key={s} type="button" onClick={() => setTopic(s)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] text-text-subtle hover:bg-accent hover:text-accent-foreground">
                      <Lightbulb className="size-3 text-primary" />{s}
                    </button>
                  ))}
                </div>
              </div>
            </PipelineStep>

            <PipelineStep id="step-guion" step={2} icon={PenLine} title="Guion e investigación" subtitle="LLM, búsqueda y dirección creativa">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="LLM">
                  <Select value={llmProvider} onValueChange={(v) => v && setLlmProvider(v)}>
                    <SelectTrigger className={field}><SelectValue>{providerLabel(llmList, llmProvider)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {llmList.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Búsqueda web">
                  <Select value={searchProvider} onValueChange={(v) => setSearchProvider(v ?? "")}>
                    <SelectTrigger className={field}><SelectValue placeholder="Auto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto</SelectItem>
                      {searchList.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {(llmProvider === "openrouter" || llmProvider === "openai-compatible" || llmProvider === "grok") && (
                  <Field label="Model ID">
                    <Input className={field} value={llmModel} onChange={(e) => setLlmModel(e.target.value)}
                      placeholder={llmProvider === "grok" ? "grok-4" : "model-id"} />
                  </Field>
                )}
                {llmProvider === "openai-compatible" && (
                  <Field label="Base URL">
                    <Input className={field} value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
                  </Field>
                )}
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Dirección creativa</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary/40 min-h-[72px]"
                  placeholder="Estilo visual, tono del guion, ideas de escena, música..."
                  value={directionText}
                  onChange={(e) => {
                    if (new TextEncoder().encode(e.target.value).length <= 10240) setDirectionText(e.target.value);
                  }}
                />
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Replay desde score.json</label>
                <Input type="file" accept=".json" className="h-9 rounded-lg text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:text-primary"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) { setScoreJson(null); setScoreFileName(""); return; }
                    try {
                      setScoreJson(JSON.parse(await file.text()));
                      setScoreFileName(file.name);
                    } catch {
                      setError("JSON inválido en el score");
                      setScoreJson(null); setScoreFileName("");
                    }
                  }} />
                {scoreFileName && <p className="mt-1 text-[11px] text-muted-foreground">{scoreFileName}</p>}
              </div>
            </PipelineStep>

            <PipelineStep id="step-voz" step={3} icon={Mic2} title="Voz" subtitle="TTS, mezcla Kokoro y subtítulos">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Proveedor TTS">
                  <Select value={ttsProvider} onValueChange={(v) => v && setTtsProvider(v)}>
                    <SelectTrigger className={field}><SelectValue>{displayName(ttsProvider)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {ttsList.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {ttsProvider === "inworld" && providers?.inworldVoices && (
                  <Field label="Voz Inworld">
                    <Select value={inworldVoice} onValueChange={(v) => v && setInworldVoice(v)}>
                      <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.inworldVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {ttsProvider === "gemini-tts" && providers?.geminiTtsVoices && (
                  <Field label="Voz Gemini">
                    <Select value={geminiTtsVoice} onValueChange={(v) => v && setGeminiTtsVoice(v)}>
                      <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.geminiTtsVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {ttsProvider === "grok-tts" && providers?.grokTtsVoices && (
                  <>
                    <Field label="Voz Grok">
                      <Select value={grokTtsVoice} onValueChange={(v) => v && setGrokTtsVoice(v)}>
                        <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {providers.grokTtsVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={`Velocidad ${grokTtsSpeed.toFixed(1)}x`}>
                      <input type="range" min="0.7" max="1.5" step="0.1" value={grokTtsSpeed}
                        onChange={(e) => setGrokTtsSpeed(Number(e.target.value))} className="w-full accent-primary mt-2" />
                    </Field>
                  </>
                )}
              </div>
              {ttsProvider === "kokoro" && (
                <div className="mt-4">
                  <KokoroVoiceMixer
                    voices={kokoroVoices}
                    value={kokoroVoice}
                    onChange={setKokoroVoice}
                    speed={kokoroSpeed}
                    onSpeedChange={setKokoroSpeed}
                  />
                </div>
              )}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-xs font-medium">Subtítulos</span>
                <Switch checked={!noSubtitles} onCheckedChange={(v) => setNoSubtitles(!v)} size="sm" />
              </div>
            </PipelineStep>

            <PipelineStep id="step-visuales" step={4} icon={ImageIcon} title="Visuales" subtitle="Imagen, video, tipos de escena y estilo">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Imagen">
                  <Select value={imageProvider} onValueChange={(v) => v && setImageProvider(v)}>
                    <SelectTrigger className={field}><SelectValue>{providerLabel(imageList, imageProvider)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {imageList.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {allowedVisualTypes.includes("ai_video") && (
                  <Field label="Video IA">
                    <Select value={videoProvider} onValueChange={(v) => setVideoProvider(v ?? "")}>
                      <SelectTrigger className={field}><SelectValue placeholder="Auto" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Auto</SelectItem>
                        {videoList.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {allowedVisualTypes.includes("ai_video") && (
                  <Field label="Escenas de video">
                    <Select value={videoSceneMode} onValueChange={(v) => setVideoSceneMode(v ?? "all")}>
                      <SelectTrigger className={field}><SelectValue /></SelectTrigger>
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
                )}
              </div>

              {(imageProvider === "runpod" || videoProvider === "runpod") && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="text-xs font-semibold">Opciones RunPod</p>
                  {imageProvider === "runpod" && (
                    <Field label="Modelo de imagen">
                      <Select value={runpodImageModel} onValueChange={(v) => {
                        if (!v) return;
                        setRunpodImageModel(v);
                        const spec = providers?.runpodImageModels?.find((m) => m.id === v);
                        if (spec?.defaultSteps) setRunpodImageSteps(spec.defaultSteps);
                        if (spec?.defaultGuidance != null) setRunpodImageGuidance(spec.defaultGuidance);
                      }}>
                        <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(providers?.runpodImageModels ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.label}{m.costHint ? ` · ${m.costHint}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  {imageProvider === "runpod" && runpodImageModel === "custom" && (
                    <Input className={cn(field, "font-mono text-xs")} placeholder="Endpoint ID imagen"
                      value={runpodImageEndpointId} onChange={(e) => setRunpodImageEndpointId(e.target.value)} />
                  )}
                  {imageProvider === "runpod" && runpodImageModel !== "custom" && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {typeof providers?.runpodImageModels?.find((m) => m.id === runpodImageModel)?.maxSteps === "number" && (
                        <Field label={`Pasos: ${runpodImageSteps}`}>
                          <input type="range" min={1}
                            max={providers?.runpodImageModels?.find((m) => m.id === runpodImageModel)?.maxSteps ?? 28}
                            value={runpodImageSteps} onChange={(e) => setRunpodImageSteps(Number(e.target.value))}
                            className="w-full accent-primary mt-2" />
                        </Field>
                      )}
                      {providers?.runpodImageModels?.find((m) => m.id === runpodImageModel)?.defaultGuidance != null && (
                        <Field label={`Guidance: ${runpodImageGuidance}`}>
                          <input type="range" min={0} max={10} step={0.5}
                            value={runpodImageGuidance} onChange={(e) => setRunpodImageGuidance(Number(e.target.value))}
                            className="w-full accent-primary mt-2" />
                        </Field>
                      )}
                    </div>
                  )}
                  {videoProvider === "runpod" && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Modelo I2V">
                        <Select value={runpodVideoModel} onValueChange={(v) => {
                          if (!v) return;
                          setRunpodVideoModel(v);
                          const spec = providers?.runpodVideoModels?.find((m) => m.id === v);
                          if (spec?.resolutions[0]) setRunpodVideoResolution(spec.resolutions[0]);
                        }}>
                          <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(providers?.runpodVideoModels ?? []).map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.label}{m.costHint ? ` · ${m.costHint}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {runpodVideoModel === "custom" ? (
                        <Input className={cn(field, "font-mono text-xs")} placeholder="Endpoint ID video"
                          value={runpodVideoEndpointId} onChange={(e) => setRunpodVideoEndpointId(e.target.value)} />
                      ) : (
                        <Field label="Resolución">
                          <Select value={runpodVideoResolution} onValueChange={(v) => v && setRunpodVideoResolution(v)}>
                            <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(providers?.runpodVideoModels?.find((m) => m.id === runpodVideoModel)?.resolutions ?? ["720p"]).map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Tipos visuales</label>
                <VisualTypeGrid
                  selected={allowedVisualTypes}
                  stockAvailable={stockAvailable}
                  atelierMode={atelierMode}
                  onAtelier={setAtelierMode}
                  onToggle={(key, nextChecked) => {
                    setAllowedVisualTypes((prev) =>
                      nextChecked ? [...prev, key] : prev.filter((t) => t !== key),
                    );
                    if (key === "ai_video" && !nextChecked) {
                      setVideoProvider("");
                      setVideoSceneMode("all");
                    }
                  }}
                />
                {allowedVisualTypes.includes("ai_video") && (
                  <p className="mt-2 text-[11px] text-status-warning">
                    Video IA es caro (~$0.30/escena) y lento. El resumen de precio a la derecha lo incluye.
                  </p>
                )}
                {atelierMode && (
                  <p className="mt-2 text-[11px] text-violet-300/90">
                    Atelier: la escena 1 se usa como referencia para mantener personaje y estilo en todo el video.
                  </p>
                )}
              </div>

              <div className="mt-4">
                <Field label="Style Override">
                  <Select
                    value={
                      styleReferenceMode ? "__image__"
                      : artStyleOverride ? (`atelier:${providers?.atelierStyles?.find((s) => s.artStyle === artStyleOverride)?.id ?? ""}`)
                      : archetype
                    }
                    onValueChange={(v) => {
                      if (!v) {
                        setStyleReferenceMode(false);
                        setStyleReferenceImage(undefined);
                        setArtStyleOverride("");
                        setArchetype("");
                        return;
                      }
                      if (v === "__image__") {
                        setStyleReferenceMode(true);
                        setArchetype("");
                        setArtStyleOverride("");
                      } else if (v.startsWith("atelier:")) {
                        const styleId = v.slice("atelier:".length);
                        const found = providers?.atelierStyles?.find((s) => s.id === styleId);
                        setStyleReferenceMode(false);
                        setStyleReferenceImage(undefined);
                        setArchetype("");
                        setArtStyleOverride(found?.artStyle ?? "");
                      } else {
                        setStyleReferenceMode(false);
                        setStyleReferenceImage(undefined);
                        setArtStyleOverride("");
                        setArchetype(v);
                      }
                    }}
                  >
                    <SelectTrigger className={field}><SelectValue placeholder="Auto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto Style</SelectItem>
                      <SelectItem value="__image__">Personalizado (imagen)</SelectItem>
                      {archetypes.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Archetypes</SelectLabel>
                          {archetypes.map((a) => (
                            <SelectItem key={a.name} value={a.name}>
                              {a.label ?? a.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {providers?.atelierStyles && providers.atelierStyles.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Atelier Styles</SelectLabel>
                          {providers.atelierStyles.map((s) => (
                            <SelectItem key={s.id} value={`atelier:${s.id}`}>{s.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {archetypes.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[1.5px] text-muted-foreground">Estilo visual</h3>
                  <ScrollArea className="w-full">
                    <div className="flex gap-3 pb-3">
                      <ArchetypeCard archetype={null} selected={archetype === "" && !styleReferenceMode && !artStyleOverride} onClick={() => {
                        setArchetype(""); setStyleReferenceMode(false); setArtStyleOverride("");
                      }} />
                      {archetypes.map((a) => (
                        <ArchetypeCard key={a.name} archetype={a} selected={archetype === a.name} onClick={() => {
                          setArchetype(a.name); setStyleReferenceMode(false); setArtStyleOverride("");
                        }} />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <button type="button" onClick={() => { setStyleReferenceMode(true); setArchetype(""); setArtStyleOverride(""); }}
                      className={cn("rounded-full border px-3 py-1 text-xs", styleReferenceMode ? "border-primary text-primary" : "border-border text-text-subtle")}>
                      Imagen de referencia
                    </button>
                    {styleReferenceMode && (
                      <>
                        <input ref={styleImageInputRef} type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => setStyleReferenceImage((reader.result as string).split(",")[1]);
                            reader.readAsDataURL(file);
                          }} />
                        <button type="button" onClick={() => styleImageInputRef.current?.click()}
                          className="h-8 rounded-lg border border-border px-3 text-xs">
                          {styleReferenceImage ? "Cambiar imagen" : "Subir imagen"}
                        </button>
                        {styleReferenceImage && (
                          <img src={`data:image/png;base64,${styleReferenceImage}`} alt="" className="h-8 w-8 rounded object-cover" />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </PipelineStep>

            <PipelineStep id="step-musica" step={5} icon={Music} title="Música y extras" subtitle="Banda y opciones de corrida" last>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Música">
                  <Select value={musicProvider} onValueChange={(v) => v && setMusicProvider(v)}>
                    <SelectTrigger className={field}><SelectValue>{displayName(musicProvider)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bundled">Bundled (gratis)</SelectItem>
                      <SelectItem value="lyria">Lyria 3 Pro ($0.08)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 h-9 mt-6">
                  <span className="text-xs font-medium">Dry run (sin render)</span>
                  <Switch checked={dryRun} onCheckedChange={setDryRun} size="sm" />
                </div>
              </div>
            </PipelineStep>

            {error && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
            )}
          </div>

          <aside className="lg:sticky lg:top-8 space-y-4">
            <CostEstimatePanel
              preview={costPreview}
              usdToCop={usdToCop}
              dryRun={dryRun}
              usesVivi={llmProvider === "vivi" || imageProvider === "vivi" || videoProvider === "vivi"}
              rateNote={rateLive ? `${usdToCop.toFixed(0)} COP/USD` : `~${usdToCop.toFixed(0)} COP/USD`}
            />
            <Button type="submit" disabled={!hasTopic || loading}
              className="w-full gap-2 rounded-xl py-6 text-sm font-semibold">
              {loading ? "Generando…" : LONG_FORM_PLATFORMS.has(platform) ? `Generar video ${targetDurationMinutes} min` : "Generar Short"}
              {!loading && <ArrowRight className="size-4" />}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              <Clapperboard className="inline size-3 mr-1" />
              {hasTopic ? "Listo para lanzar el pipeline" : "Escribe un tema para habilitar Generate"}
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
