import { AudioLines, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DarkSelect } from "@/components/DarkSelect";
import { Button } from "@/components/ui/button";
import { api, type NaraCatalog, type NaraJobMeta, type NaraTtsProviderCatalog } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

function voicesFor(p: NaraTtsProviderCatalog, modelId: string) {
  const fromModel = p.models.find((m) => m.id === modelId)?.voices;
  if (fromModel?.length) return fromModel;
  if (p.key === "cloudflare-tts") {
    const en = modelId.includes("-en") || modelId.includes("aura-1") || modelId.includes("melotts");
    return p.voices.filter((v) => (en ? v.language === "en" : v.language === "es"));
  }
  return p.voices;
}

export function NaraPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<NaraCatalog | null>(null);
  const [jobs, setJobs] = useState<NaraJobMeta[]>([]);
  const [idea, setIdea] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [language, setLanguage] = useState("es");
  const [tone, setTone] = useState("neutral");
  const [ttsProvider, setTtsProvider] = useState("kokoro");
  const [ttsModel, setTtsModel] = useState("");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [stability, setStability] = useState(0.5);
  const [style, setStyle] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.naraCatalog().then((c) => {
      setCatalog(c);
      setTtsProvider(c.defaultProvider);
      const p = c.providers.find((x) => x.key === c.defaultProvider);
      if (p) {
        setTtsModel(p.defaultModel ?? "");
        setVoice(p.defaultVoice ?? "");
        setSpeed(p.defaultSpeed ?? 1);
      }
    }).catch(() => {});
    api.listNaraJobs().then((r) => setJobs(r.jobs)).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, NaraTtsProviderCatalog[]>();
    for (const p of catalog?.providers ?? []) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return [...map.entries()];
  }, [catalog]);

  const provider = catalog?.providers.find((p) => p.key === ttsProvider);

  function applyProvider(key: string) {
    setTtsProvider(key);
    const p = catalog?.providers.find((x) => x.key === key);
    if (!p) return;
    setTtsModel(p.defaultModel ?? "");
    setVoice(p.defaultVoice ?? "");
    setSpeed(p.defaultSpeed ?? 1);
  }

  const voiceOpts = provider ? voicesFor(provider, ttsModel) : [];

  async function create() {
    setError("");
    setBusy(true);
    try {
      const res = await api.createNaraJob({
        idea,
        durationSec,
        language,
        tone,
        ttsProvider,
        ttsModel: ttsModel || undefined,
        voice: voice || undefined,
        speed: provider?.controls.speed ? speed : undefined,
        stability: provider?.controls.stability ? stability : undefined,
        style: provider?.controls.stability ? style : undefined,
        instructions: instructions.trim() || undefined,
      });
      navigate(`/nara/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = catalog?.ready?.[ttsProvider] !== false;
  const words = Math.round((durationSec * (catalog?.wordsPerMinute ?? 150)) / 60);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Nara · solo voz
          </p>
          <h1 className="flex items-center gap-2 text-3xl sm:text-5xl font-bold uppercase tracking-tight">
            <AudioLines className="size-8 text-primary" />
            Nuevo Nara
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            De una idea: guion hablado para copiar y audio MP3. Sin video. Todos los TTS, voces,
            idioma, tono y velocidad.
          </p>
        </div>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <label className="mb-1.5 block text-[12px] text-muted-foreground">Idea</label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[14px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={4}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Ej. Por qué el café de la tarde te quita el sueño"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Duración (~{words} palabras)</label>
              <DarkSelect
                value={String(durationSec)}
                onValueChange={(v) => setDurationSec(Number(v))}
                options={(catalog?.durations ?? [15, 30, 45, 60, 90, 120]).map((d) => ({
                  value: String(d),
                  label: `${d}s`,
                }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Idioma del guion</label>
              <DarkSelect
                value={language}
                onValueChange={setLanguage}
                options={(catalog?.languages ?? [{ id: "es", label: "Español" }]).map((l) => ({
                  value: l.id,
                  label: l.label,
                }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-muted-foreground">Tono</label>
              <DarkSelect
                value={tone}
                onValueChange={setTone}
                options={(catalog?.tones ?? []).map((t) => ({
                  value: t.id,
                  label: t.label,
                  hint: t.hint,
                }))}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] text-muted-foreground">Motor TTS</label>
            <div className="space-y-3">
              {grouped.map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((p) => {
                      const on = p.key === ttsProvider;
                      const ok = catalog?.ready?.[p.key] !== false;
                      return (
                        <button
                          type="button"
                          key={p.key}
                          onClick={() => applyProvider(p.key)}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted/50",
                            !ok && !on && "opacity-50",
                          )}
                        >
                          <span className="font-medium">{p.label}</span>
                          {!ok && <span className="ml-2 text-[10px] opacity-80">sin key</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {provider && (
              <p className="mt-2 text-[12px] text-muted-foreground">{provider.hint}</p>
            )}
          </div>

          {provider && (
            <div className="grid gap-3 sm:grid-cols-2">
              {provider.controls.models && provider.models.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">Modelo</label>
                  <DarkSelect
                    value={ttsModel || provider.models[0]!.id}
                    onValueChange={(v) => {
                      setTtsModel(v);
                      const next = voicesFor({ ...provider, models: provider.models }, v);
                      if (next.length && !next.some((x) => x.id === voice)) {
                        setVoice(next[0]!.id);
                      }
                    }}
                    options={provider.models.map((m) => ({
                      value: m.id,
                      label: m.usdPer1kChars != null ? `${m.label} · $${m.usdPer1kChars}/1K` : m.label,
                      hint: m.note,
                    }))}
                    className="w-full"
                  />
                </div>
              )}
              {provider.controls.voices && (
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">Voz</label>
                  {provider.controls.customVoice ? (
                    <div className="space-y-2">
                      <DarkSelect
                        value={voiceOpts.some((v) => v.id === voice) ? voice : voiceOpts[0]?.id ?? ""}
                        onValueChange={setVoice}
                        options={voiceOpts.map((v) => ({
                          value: v.id,
                          label: v.label,
                        }))}
                        className="w-full"
                      />
                      <input
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
                        placeholder="O pega un voice ID"
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                      />
                    </div>
                  ) : (
                    <DarkSelect
                      value={voice || voiceOpts[0]?.id || ""}
                      onValueChange={setVoice}
                      options={voiceOpts.map((v) => ({
                        value: v.id,
                        label: v.gender ? `${v.label}` : v.label,
                      }))}
                      className="w-full"
                    />
                  )}
                </div>
              )}
              {provider.controls.speed && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">
                    Velocidad: {speed.toFixed(2)}x
                  </label>
                  <input
                    type="range"
                    min={provider.speedMin ?? 0.5}
                    max={provider.speedMax ?? 2}
                    step={0.05}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}
              {provider.controls.stability && (
                <>
                  <div>
                    <label className="mb-1.5 block text-[12px] text-muted-foreground">
                      Estabilidad: {stability.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={stability}
                      onChange={(e) => setStability(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] text-muted-foreground">
                      Estilo: {style.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={style}
                      onChange={(e) => setStyle(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div>
              <label className="mb-1.5 block text-[12px] text-muted-foreground">
                Instrucciones extra (opcional)
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Ej. voz íntima, como un podcast de madrugada"
              />
            </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!ready && (
            <p className="text-sm text-amber-500">
              Este motor no tiene API key en el servidor. Elige Kokoro o configura la key.
            </p>
          )}

          <Button className="h-11" onClick={() => void create()} disabled={busy || idea.trim().length < 4}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generar guion y TTS
          </Button>
        </section>

        {jobs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Audios Nara</h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/40"
                    onClick={() => navigate(`/nara/${j.id}`)}
                  >
                    <span className="truncate font-medium">{j.title || j.idea}</span>
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
