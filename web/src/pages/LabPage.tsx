import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ProviderOptions } from "@/hooks/useApi";
import { Loader2, FlaskConical, Cpu, Mic, Image, Video } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Pricing types & defaults ─────────────────────────────────────────────────

export interface ApiPrices {
  llm: Record<string, { inputPer1M: number; outputPer1M: number }>;
  tts: Record<string, { per1kChars: number }>;
  image: Record<string, { perImage: number }>;
  video: Record<string, { perSecond: number }>;
}

export const DEFAULT_PRICES: ApiPrices = {
  llm: {
    anthropic:  { inputPer1M: 3.0,  outputPer1M: 15.0 },
    openai:     { inputPer1M: 2.5,  outputPer1M: 10.0 },
    gemini:     { inputPer1M: 0.1,  outputPer1M: 0.4  },
    openrouter: { inputPer1M: 2.0,  outputPer1M: 6.0  },
    vivi:       { inputPer1M: 3.0,  outputPer1M: 15.0 },
    alicloud:   { inputPer1M: 0.5,  outputPer1M: 2.0  },
    grok:       { inputPer1M: 3.0,  outputPer1M: 15.0 },
  },
  tts: {
    elevenlabs:  { per1kChars: 0.33  },
    "gemini-tts":{ per1kChars: 0.05  },
    "openai-tts":{ per1kChars: 0.015 },
    "grok-tts":  { per1kChars: 0.015 },
    kokoro:      { per1kChars: 0.0   },
    inworld:     { per1kChars: 0.05  },
  },
  image: {
    gemini:   { perImage: 0.04 },
    openai:   { perImage: 0.08 },
    grok:     { perImage: 0.04 },
    vivi:     { perImage: 0.04 },
    alicloud: { perImage: 0.05 },
    runpod:   { perImage: 0.003 },
  },
  video: {
    gemini: { perSecond: 0.05 },
    grok:   { perSecond: 0.08 },
    vivi:   { perSecond: 0.08 },
    fal:    { perSecond: 0.12 },
    runpod: { perSecond: 0.02 },
  },
};

export const PRICING_KEY = "openreels_api_prices";

export function loadPrices(): ApiPrices {
  try {
    const stored = localStorage.getItem(PRICING_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ApiPrices>;
      return {
        llm:   { ...DEFAULT_PRICES.llm,   ...parsed.llm   },
        tts:   { ...DEFAULT_PRICES.tts,   ...parsed.tts   },
        image: { ...DEFAULT_PRICES.image, ...parsed.image },
        video: { ...DEFAULT_PRICES.video, ...parsed.video },
      };
    }
  } catch {}
  return DEFAULT_PRICES;
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

function llmCost(prices: ApiPrices, provider: string, inputTokens: number, outputTokens: number): number {
  const p = prices.llm[provider] ?? prices.llm["anthropic"];
  return (inputTokens / 1_000_000) * p.inputPer1M + (outputTokens / 1_000_000) * p.outputPer1M;
}

function ttsCost(prices: ApiPrices, provider: string, chars: number): number {
  const p = prices.tts[provider] ?? { per1kChars: 0 };
  return (chars / 1000) * p.per1kChars;
}

function imageCost(prices: ApiPrices, provider: string): number {
  return (prices.image[provider] ?? { perImage: 0 }).perImage;
}

function videoCost(prices: ApiPrices, provider: string, seconds: number): number {
  return (prices.video[provider] ?? { perSecond: 0 }).perSecond * seconds;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ms(n: number) {
  return n >= 60_000 ? `${(n / 60_000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`;
}

function cost$(n: number) {
  if (n === 0) return "$0.000";
  if (n < 0.001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(4)}`;
}

function ResultBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-[10px] border border-border bg-surface-inset p-4 space-y-2">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mt-4 rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
      {msg}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LabPage() {
  const [providers, setProviders] = useState<ProviderOptions | null>(null);
  const [prices, setPrices] = useState<ApiPrices>(DEFAULT_PRICES);

  // LLM
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmModel, setLlmModel] = useState("");
  const [llmPrompt, setLlmPrompt] = useState("Explain quantum entanglement in one paragraph.");
  const [llmResult, setLlmResult] = useState<{ text: string; durationMs: number; tokens: { inputTokens: number; outputTokens: number } } | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");

  // TTS
  const [ttsProvider, setTtsProvider] = useState("elevenlabs");
  const [ttsText, setTtsText] = useState("Welcome to OpenReels, the open source AI video pipeline.");
  const [ttsResult, setTtsResult] = useState<{ audioBase64: string; durationMs: number; charCount: number } | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState("");
  const [ttsVoice, setTtsVoice] = useState("");
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Image
  const [imgProvider, setImgProvider] = useState("gemini");
  const [imgPrompt, setImgPrompt] = useState("A futuristic city at sunset with flying cars and neon lights.");
  const [imgAspect, setImgAspect] = useState("9:16");
  const [imgModel, setImgModel] = useState("black-forest-labs-flux-1-schnell");
  const [imgSteps, setImgSteps] = useState(4);
  const [imgResult, setImgResult] = useState<{ imageBase64: string; durationMs: number } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState("");

  // Video
  const [vidProvider, setVidProvider] = useState("gemini");
  const [vidImage, setVidImage] = useState<string | null>(null);
  const [vidPrompt, setVidPrompt] = useState("Camera slowly zooms in with cinematic motion.");
  const [vidDuration, setVidDuration] = useState(5);
  const [vidAspect, setVidAspect] = useState("9:16");
  const [vidModel, setVidModel] = useState("p-video");
  const [vidResolution, setVidResolution] = useState("720p");
  const [vidResult, setVidResult] = useState<{ videoBase64: string; durationMs: number; videoSeconds: number } | null>(null);
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listProviders().then(setProviders).catch(() => {});
    setPrices(loadPrices());
  }, []);

  // ── LLM test ────────────────────────────────────────────────────────────────
  const runLLM = async () => {
    setLlmLoading(true); setLlmError(""); setLlmResult(null);
    try {
      const r = await api.testLLM({ provider: llmProvider, model: llmModel || undefined, prompt: llmPrompt });
      setLlmResult(r);
    } catch (e) {
      setLlmError(String(e));
    } finally {
      setLlmLoading(false);
    }
  };

  // ── TTS test ────────────────────────────────────────────────────────────────
  const runTTS = async () => {
    setTtsLoading(true); setTtsError(""); setTtsResult(null);
    try {
      const r = await api.testTTS({
        provider: ttsProvider,
        text: ttsText,
        ...(ttsVoice ? { voice: ttsVoice } : {}),
        ...(ttsProvider === "grok-tts" || ttsProvider === "kokoro" ? { speed: ttsSpeed } : {}),
      });
      setTtsResult(r);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
    } catch (e) {
      setTtsError(String(e));
    } finally {
      setTtsLoading(false);
    }
  };

  // ── Image test ──────────────────────────────────────────────────────────────
  const runImage = async () => {
    setImgLoading(true); setImgError(""); setImgResult(null);
    try {
      const r = await api.testImage({
        provider: imgProvider,
        prompt: imgPrompt,
        aspectRatio: imgAspect,
        ...(imgProvider === "runpod" ? { model: imgModel, steps: imgSteps } : {}),
      });
      setImgResult(r);
    } catch (e) {
      setImgError(String(e));
    } finally {
      setImgLoading(false);
    }
  };

  // ── Video test ──────────────────────────────────────────────────────────────
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const b64 = dataUrl.split(",")[1];
      setVidImage(b64 ?? null);
    };
    reader.readAsDataURL(file);
  };

  const runVideo = async () => {
    if (!vidImage) { setVidError("Por favor sube una imagen primero"); return; }
    setVidLoading(true); setVidError(""); setVidResult(null);
    try {
      const r = await api.testVideo({
        provider: vidProvider,
        imageBase64: vidImage,
        prompt: vidPrompt,
        durationSeconds: vidDuration,
        aspectRatio: vidAspect,
        ...(vidProvider === "runpod" ? { model: vidModel, resolution: vidResolution } : {}),
      });
      setVidResult(r);
    } catch (e) {
      setVidError(String(e));
    } finally {
      setVidLoading(false);
    }
  };

  const llmProviders = providers?.llm ?? [{ key: "anthropic", label: "Anthropic" }];
  const ttsProviders = providers?.tts ?? [{ key: "elevenlabs", label: "ElevenLabs" }];
  const imgProviders = providers?.image ?? [{ key: "gemini", label: "Gemini" }];
  const vidProviders = providers?.video?.filter(p => !p.key.startsWith("vidu")) ?? [{ key: "gemini", label: "Gemini" }];

  return (
    <div className="py-8 px-4 sm:px-10 max-w-[720px]">
      <div className="mb-8 flex items-center gap-3">
        <FlaskConical className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Laboratory</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Prueba cada proveedor de forma individual. Los costos usan los precios configurados en Settings.
          </p>
        </div>
      </div>

      <Tabs defaultValue="llm">
        <TabsList className="mb-6 w-full">
          <TabsTrigger value="llm" className="flex-1 flex items-center gap-1.5">
            <Cpu className="size-3.5" />LLM
          </TabsTrigger>
          <TabsTrigger value="tts" className="flex-1 flex items-center gap-1.5">
            <Mic className="size-3.5" />TTS
          </TabsTrigger>
          <TabsTrigger value="image" className="flex-1 flex items-center gap-1.5">
            <Image className="size-3.5" />Imagen
          </TabsTrigger>
          <TabsTrigger value="video" className="flex-1 flex items-center gap-1.5">
            <Video className="size-3.5" />I2V
          </TabsTrigger>
        </TabsList>

        {/* ── LLM ──────────────────────────────────────────────────────────── */}
        <TabsContent value="llm" className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Proveedor</label>
              <Select value={llmProvider} onValueChange={setLlmProvider}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {llmProviders.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Modelo (opcional)</label>
              <Input
                className="h-9 font-mono text-[12px]"
                placeholder="claude-sonnet-4-6"
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Prompt</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={4}
              value={llmPrompt}
              onChange={e => setLlmPrompt(e.target.value)}
            />
          </div>
          <Button onClick={runLLM} disabled={llmLoading || !llmPrompt.trim()} className="w-full">
            {llmLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Generando...</> : "Ejecutar prueba LLM"}
          </Button>
          {llmError && <ErrorBox msg={llmError} />}
          {llmResult && (
            <ResultBox>
              <div className="rounded-[8px] bg-background border border-border p-3 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {llmResult.text}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <Stat label="Tiempo" value={ms(llmResult.durationMs)} />
                <Stat label="Tokens entrada" value={llmResult.tokens.inputTokens.toLocaleString()} />
                <Stat label="Tokens salida" value={llmResult.tokens.outputTokens.toLocaleString()} />
                <Stat
                  label="Costo estimado"
                  value={cost$(llmCost(prices, llmProvider, llmResult.tokens.inputTokens, llmResult.tokens.outputTokens))}
                />
              </div>
            </ResultBox>
          )}
        </TabsContent>

        {/* ── TTS ──────────────────────────────────────────────────────────── */}
        <TabsContent value="tts" className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Proveedor</label>
            <Select value={ttsProvider} onValueChange={(v) => { setTtsProvider(v); setTtsVoice(""); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ttsProviders.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Gemini TTS voice selector */}
          {ttsProvider === "gemini-tts" && providers?.geminiTtsVoices && (
            <div>
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Voz</label>
              <Select value={ttsVoice || "Kore"} onValueChange={setTtsVoice}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Femeninas</SelectLabel>
                    {providers.geminiTtsVoices.filter(v => v.gender === "female").map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Masculinas</SelectLabel>
                    {providers.geminiTtsVoices.filter(v => v.gender === "male").map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Grok TTS voice + speed */}
          {ttsProvider === "grok-tts" && providers?.grokTtsVoices && (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">Voz</label>
                <Select value={ttsVoice || "eve"} onValueChange={setTtsVoice}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Femeninas</SelectLabel>
                      {providers.grokTtsVoices.filter(v => v.gender === "female").map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Masculinas</SelectLabel>
                      {providers.grokTtsVoices.filter(v => v.gender === "male").map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">
                  Velocidad: {ttsSpeed.toFixed(1)}x
                </label>
                <input
                  type="range" min="0.7" max="1.5" step="0.1"
                  value={ttsSpeed}
                  onChange={e => setTtsSpeed(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>0.7x lento</span><span>1.0x normal</span><span>1.5x rápido</span>
                </div>
              </div>
            </>
          )}

          {ttsProvider === "kokoro" && providers?.kokoroVoices && (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">Voz</label>
                <Select value={ttsVoice || "ef_dora"} onValueChange={setTtsVoice}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Español</SelectLabel>
                      {providers.kokoroVoices.filter(v => v.language === "es").map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>English US</SelectLabel>
                      {providers.kokoroVoices.filter(v => v.language === "en-us").map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>English UK</SelectLabel>
                      {providers.kokoroVoices.filter(v => v.language === "en-gb").map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">
                  Velocidad: {ttsSpeed.toFixed(1)}x
                </label>
                <input
                  type="range" min="0.7" max="1.5" step="0.1"
                  value={ttsSpeed}
                  onChange={e => setTtsSpeed(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Texto</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={4}
              value={ttsText}
              onChange={e => setTtsText(e.target.value)}
            />
          </div>
          <Button onClick={runTTS} disabled={ttsLoading || !ttsText.trim()} className="w-full">
            {ttsLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Generando audio...</> : "Generar audio"}
          </Button>
          {ttsError && <ErrorBox msg={ttsError} />}
          {ttsResult && (
            <ResultBox>
              <audio
                ref={audioRef}
                controls
                className="w-full"
                src={`data:audio/mpeg;base64,${ttsResult.audioBase64}`}
              />
              <div className="border-t border-border pt-2 space-y-1">
                <Stat label="Tiempo" value={ms(ttsResult.durationMs)} />
                <Stat label="Caracteres" value={ttsResult.charCount.toLocaleString()} />
                <Stat label="Costo estimado" value={cost$(ttsCost(prices, ttsProvider, ttsResult.charCount))} />
              </div>
            </ResultBox>
          )}
        </TabsContent>

        {/* ── Image ─────────────────────────────────────────────────────────── */}
        <TabsContent value="image" className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Proveedor</label>
              <Select value={imgProvider} onValueChange={setImgProvider}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {imgProviders.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Proporción</label>
              <Select value={imgAspect} onValueChange={setImgAspect}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 Vertical</SelectItem>
                  <SelectItem value="16:9">16:9 Horizontal</SelectItem>
                  <SelectItem value="1:1">1:1 Cuadrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {imgProvider === "runpod" && (
            <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-[11px] text-muted-foreground">Opciones RunPod — endpoints públicos (solo API key)</p>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">Modelo</label>
                <Select
                  value={imgModel}
                  onValueChange={(v) => {
                    setImgModel(v);
                    const spec = providers?.runpodImageModels?.find((m) => m.id === v);
                    if (spec?.defaultSteps) setImgSteps(spec.defaultSteps);
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(providers?.runpodImageModels ?? []).filter((m) => m.id !== "custom").map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}{m.costHint ? ` · ${m.costHint}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {typeof providers?.runpodImageModels?.find((m) => m.id === imgModel)?.maxSteps === "number" && (
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">Pasos: {imgSteps}</label>
                  <input
                    type="range"
                    min={1}
                    max={providers?.runpodImageModels?.find((m) => m.id === imgModel)?.maxSteps ?? 28}
                    step={1}
                    value={imgSteps}
                    onChange={(e) => setImgSteps(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Prompt</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={4}
              value={imgPrompt}
              onChange={e => setImgPrompt(e.target.value)}
            />
          </div>
          <Button onClick={runImage} disabled={imgLoading || !imgPrompt.trim()} className="w-full">
            {imgLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Generando imagen...</> : "Generar imagen"}
          </Button>
          {imgError && <ErrorBox msg={imgError} />}
          {imgResult && (
            <ResultBox>
              <img
                src={`data:image/png;base64,${imgResult.imageBase64}`}
                alt="Generated"
                className={cn(
                  "rounded-[8px] mx-auto",
                  imgAspect === "16:9" ? "w-full" : "h-72 object-cover",
                )}
              />
              <div className="border-t border-border pt-2 space-y-1">
                <Stat label="Tiempo" value={ms(imgResult.durationMs)} />
                <Stat label="Costo estimado" value={cost$(imageCost(prices, imgProvider))} />
              </div>
            </ResultBox>
          )}
        </TabsContent>

        {/* ── Video (I2V) ──────────────────────────────────────────────────── */}
        <TabsContent value="video" className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Proveedor</label>
              <Select value={vidProvider} onValueChange={setVidProvider}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vidProviders.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Proporción</label>
              <Select value={vidAspect} onValueChange={setVidAspect}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 Vertical</SelectItem>
                  <SelectItem value="16:9">16:9 Horizontal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Duración</label>
              <Select value={String(vidDuration)} onValueChange={v => setVidDuration(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(vidProvider === "runpod"
                    ? (providers?.runpodVideoModels?.find((m) => m.id === vidModel)?.durations ?? [5, 8, 10])
                    : [3, 5, 8]
                  ).map(s => <SelectItem key={s} value={String(s)}>{s}s</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {vidProvider === "runpod" && (
            <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-[11px] text-muted-foreground">Opciones RunPod — endpoints públicos (solo API key)</p>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">Modelo I2V</label>
                <Select
                  value={vidModel}
                  onValueChange={(v) => {
                    setVidModel(v);
                    const spec = providers?.runpodVideoModels?.find((m) => m.id === v);
                    if (spec?.resolutions[0]) setVidResolution(spec.resolutions[0]);
                    if (spec?.durations[0]) setVidDuration(spec.durations[0]);
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(providers?.runpodVideoModels ?? []).filter((m) => m.id !== "custom").map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}{m.costHint ? ` · ${m.costHint}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground">Resolución</label>
                <Select value={vidResolution} onValueChange={setVidResolution}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(providers?.runpodVideoModels?.find((m) => m.id === vidModel)?.resolutions ?? ["720p"]).map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Imagen fuente</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "cursor-pointer rounded-[10px] border-2 border-dashed flex items-center justify-center h-28 text-[13px] transition-colors",
                vidImage
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-primary/40 text-muted-foreground",
              )}
            >
              {vidImage ? (
                <div className="flex items-center gap-2">
                  <img
                    src={`data:image/png;base64,${vidImage}`}
                    alt="source"
                    className="h-20 w-20 rounded object-cover"
                  />
                  <span className="text-[12px] text-primary">Imagen cargada — clic para cambiar</span>
                </div>
              ) : (
                <span>Clic para subir imagen fuente</span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Prompt de movimiento</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={vidPrompt}
              onChange={e => setVidPrompt(e.target.value)}
            />
          </div>
          <Button onClick={runVideo} disabled={vidLoading || !vidImage || !vidPrompt.trim()} className="w-full">
            {vidLoading
              ? <><Loader2 className="size-4 mr-2 animate-spin" />Generando video ({vidDuration}s)...</>
              : "Generar video I2V"}
          </Button>
          {vidError && <ErrorBox msg={vidError} />}
          {vidResult && (
            <ResultBox>
              <video
                controls
                autoPlay
                className="w-full rounded-[8px]"
                src={`data:video/mp4;base64,${vidResult.videoBase64}`}
              />
              <div className="border-t border-border pt-2 space-y-1">
                <Stat label="Tiempo total" value={ms(vidResult.durationMs)} />
                <Stat label="Duración video" value={`${vidResult.videoSeconds}s`} />
                <Stat label="Costo estimado" value={cost$(videoCost(prices, vidProvider, vidResult.videoSeconds))} />
              </div>
            </ResultBox>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
