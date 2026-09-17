import { ArrowLeft, Check, Loader2, PersonStanding } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CompletedJobMedia } from "@/components/JobShareBar";
import { mediaAspect } from "@/components/JobVideo";
import { Button } from "@/components/ui/button";
import { api, type StickmanJobDetail } from "@/hooks/useApi";

const STAGES = [
  { id: "script", label: "Guion" },
  { id: "tts", label: "Voz" },
  { id: "visuals", label: "Palitos" },
  { id: "motion", label: "Motion" },
  { id: "assemble", label: "Ensamble" },
  { id: "youtube", label: "Portada" },
  { id: "done", label: "Listo" },
];

function stillPoster(jobId: string, stills?: string[]): string | undefined {
  const first = stills?.[0];
  return first ? `/api/v1/stickman/jobs/${jobId}/artifacts/stills/${first}` : undefined;
}

function VoiceSpeedField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Velocidad de narración
      <select
        className="rounded-md border border-input bg-transparent px-2 py-1 text-foreground"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Velocidad de narración"
      >
        {[0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((n) => (
          <option key={n} value={n}>
            {n === 1 ? "1× normal" : n < 1 ? `${n}× lenta` : `${n}× rápida`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StickmanJobPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<StickmanJobDetail | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(1);

  async function refresh() {
    if (!id) return;
    const j = await api.getStickmanJob(id);
    setJob(j);
    if (typeof j.config?.voiceSpeed === "number") setVoiceSpeed(j.config.voiceSpeed);
    if (j.script && !scriptText) setScriptText(JSON.stringify(j.script, null, 2));
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once per job id
  useEffect(() => {
    if (!id) return;
    setScriptText("");
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const es = new EventSource(`/api/v1/stickman/jobs/${id}/events`, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as StickmanJobDetail;
        setJob((prev) => ({ ...prev, ...data }));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveScript() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const parsed = JSON.parse(scriptText);
      await api.saveStickmanScript(id, parsed);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function produce() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      if (job?.status === "awaiting_script" && scriptText) {
        await api.saveStickmanScript(id, JSON.parse(scriptText));
      }
      await api.produceStickmanJob(id, { voiceSpeed });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <div className="px-6 py-10 text-sm text-muted-foreground">
        {error || <Loader2 className="size-5 animate-spin" />}
      </div>
    );
  }

  const queued = job.status === "producing" && /en cola/i.test(job.detail);
  const workerDown = job.queue ? !job.queue.workerLive : false;
  const stageIndex = STAGES.findIndex((s) => s.id === job.stage);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/stickman")}
        >
          <ArrowLeft className="size-3.5" /> Nuevo Stickman
        </button>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Stickman · {job.status}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <PersonStanding className="size-6 text-primary" />
            {job.topic}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.detail}</p>
        </div>

        <ol className="flex flex-wrap gap-2 text-[11px]">
          {STAGES.map((stage, i) => (
            <li
              key={stage.id}
              className={
                i < stageIndex || job.status === "completed"
                  ? "rounded-full bg-primary/15 px-2.5 py-1 text-primary"
                  : i === stageIndex
                    ? "rounded-full border border-primary px-2.5 py-1 text-primary"
                    : "rounded-full border border-border px-2.5 py-1 text-muted-foreground"
              }
            >
              {stage.label}
            </li>
          ))}
        </ol>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {job.status === "awaiting_script" && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Aprueba el guion de palitos</h2>
            <textarea
              className="min-h-[320px] w-full rounded-xl border border-input bg-transparent p-3 font-mono text-xs"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
            />
            <VoiceSpeedField value={voiceSpeed} onChange={setVoiceSpeed} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveScript()} disabled={busy}>
                Guardar edits
              </Button>
              <Button onClick={() => void produce()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Producir palitos
              </Button>
            </div>
          </section>
        )}

        {job.status === "producing" && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {job.stage}: {job.detail}
            </p>
            {queued && (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
                <p>
                  {workerDown
                    ? "El worker de Stickman no está conectado. Reimplementa video-worker en EasyPanel (misma rama y mismas variables que video)."
                    : "Si no avanza: en video-worker quita cualquier volumen extra montado en /app/jobs/stickman. Deja solo jobs_data → /app/jobs."}
                </p>
              </div>
            )}
          </div>
        )}

        {(job.stills?.length ?? 0) > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Stills</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {job.stills!.map((file) => (
                <img
                  key={file}
                  src={`/api/v1/stickman/jobs/${job.id}/artifacts/stills/${file}`}
                  alt={file}
                  className="aspect-[9/16] w-full rounded-xl border border-border object-cover bg-white"
                />
              ))}
            </div>
          </section>
        )}

        {job.status === "completed" && (
          <CompletedJobMedia
            jobId={job.id}
            src={`/api/v1/stickman/jobs/${job.id}/artifacts/final.mp4`}
            poster={
              job.youtubePack?.thumbnailRel
                ? `/api/v1/stickman/jobs/${job.id}/artifacts/${job.youtubePack.thumbnailRel}`
                : stillPoster(job.id, job.stills)
            }
            aspect={mediaAspect(job.script, job.config?.aspect ?? "9:16")}
          />
        )}

        {job.status === "completed" && job.youtubePack && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">YouTube · portada y SEO</h2>
            {job.youtubePack.thumbnailRel ? (
              <img
                src={`/api/v1/stickman/jobs/${job.id}/artifacts/${job.youtubePack.thumbnailRel}`}
                alt="Portada YouTube"
                className="aspect-video w-full max-w-xl rounded-xl border border-border object-cover"
              />
            ) : null}
            <p className="text-sm font-semibold">{job.youtubePack.title}</p>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {job.youtubePack.description}
            </p>
            <p className="text-xs text-primary">{job.youtubePack.hashtags.join(" ")}</p>
            <p className="text-[11px] text-muted-foreground">SEO: {job.youtubePack.seo}</p>
          </section>
        )}

        {job.status === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{job.error || job.detail}</p>
            <Button variant="outline" onClick={() => void produce()} disabled={busy}>
              Reintentar producción
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
