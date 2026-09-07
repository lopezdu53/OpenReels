import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, PersonStanding, Sparkles } from "lucide-react";
import { api, type StickmanJobMeta } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ATLAS_KEY = "openreels_atlascloud_api_key";

export function StickmanPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof api.stickmanCatalog>> | null>(null);
  const [jobs, setJobs] = useState<StickmanJobMeta[]>([]);
  const [topic, setTopic] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [aspect, setAspect] = useState("9:16");
  const [language, setLanguage] = useState("es");
  const [look, setLook] = useState("classic");
  const [castMode, setCastMode] = useState("solo");
  const [arc, setArc] = useState("joke_punchline");
  const [voiceId, setVoiceId] = useState("eve");
  const [captions, setCaptions] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [atlasKey, setAtlasKey] = useState(() => localStorage.getItem(ATLAS_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.stickmanCatalog().then(setCatalog).catch(() => {});
    api.listStickmanJobs().then((r) => setJobs(r.jobs)).catch(() => {});
  }, []);

  async function create() {
    setError("");
    setBusy(true);
    try {
      if (atlasKey) localStorage.setItem(ATLAS_KEY, atlasKey);
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
        atlasKey: atlasKey || undefined,
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[2px] text-primary">Stickman Studio</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <PersonStanding className="size-7 text-primary" />
            Nuevo Stickman
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Videos de palitos 2D. Pipeline propio: guion + biblia de personaje → voz → stills
            de línea → hold/zoom (o I2V opcional) → ffmpeg. No usa el héroe de Short/Film ni el
            collage de Vox.
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
              {(catalog?.looks ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLook(item.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    look === item.id ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(catalog?.casts ?? [{ id: "solo", label: "Un palito" }, { id: "duo", label: "Dos palitos" }]).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCastMode(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  castMode === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              Duración
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
                {(catalog?.durations ?? [15, 30, 60, 90]).map((d) => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Aspecto
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {(catalog?.aspects ?? ["9:16", "16:9", "1:1"]).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Idioma
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="es">Español</option>
                <option value="en">English</option>
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
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              Subtítulos
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
              Animar con I2V (opcional)
            </label>
          </div>

          <label className="block text-xs text-muted-foreground">
            Atlas Cloud API key
            <Input
              type="password"
              value={atlasKey}
              onChange={(e) => setAtlasKey(e.target.value)}
              placeholder="apikey-… o déjala en Ajustes / .env"
              className="mt-1 h-10"
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="h-11" onClick={() => void create()} disabled={busy || topic.trim().length < 4}>
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
                  <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/40" onClick={() => navigate(`/stickman/${j.id}`)}>
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
