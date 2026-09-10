import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, PersonStanding } from "lucide-react";
import { api, type StickmanJobDetail } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";

const STAGES = [
  { id: "script", label: "Guion" },
  { id: "tts", label: "Voz" },
  { id: "visuals", label: "Palitos" },
  { id: "motion", label: "Motion" },
  { id: "assemble", label: "Ensamble" },
  { id: "done", label: "Listo" },
];

export function StickmanJobPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<StickmanJobDetail | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!id) return;
    const j = await api.getStickmanJob(id);
    setJob(j);
    if (j.script && !scriptText) setScriptText(JSON.stringify(j.script, null, 2));
  }

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
      await api.produceStickmanJob(id);
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
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/stickman")}>
          <ArrowLeft className="size-3.5" /> Nuevo Stickman
        </button>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Stickman · {job.status}</p>
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
          <video className="w-full rounded-2xl border border-border bg-black" controls src={`/api/v1/stickman/jobs/${job.id}/artifacts/final.mp4`} />
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
