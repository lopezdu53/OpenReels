import { ArrowLeft, Check, Copy, Download, Loader2, AudioLines } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api, type NaraJobDetail } from "@/hooks/useApi";

export function NaraJobPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<NaraJobDetail | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void api
      .getNaraJob(id)
      .then((j) => {
        if (!cancelled) setJob(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const es = new EventSource(`/api/v1/nara/jobs/${id}/events`, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as NaraJobDetail;
        setJob((prev) => ({ ...prev, ...data }));
      } catch {
        /* ignore */
      }
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [id]);

  async function copyScript() {
    if (!job?.script) return;
    await navigator.clipboard.writeText(job.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function cancel() {
    if (!id) return;
    setBusy(true);
    try {
      await api.cancelNaraJob(id);
      const j = await api.getNaraJob(id);
      setJob(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const running = job && ["queued", "writing", "speaking", "encoding"].includes(job.status);
  const mp3Url = job?.hasMp3 && id ? `/api/v1/nara/jobs/${id}/artifacts/voice.mp3` : null;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => navigate("/nara")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Nuevo Nara
        </button>

        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            <AudioLines className="size-3.5" />
            {job?.status ?? "…"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{job?.title || job?.idea || "Nara"}</h1>
          {job?.detail && <p className="mt-1 text-sm text-muted-foreground">{job.detail}</p>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {job?.error && <p className="text-sm text-destructive">{job.error}</p>}

        {running && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            Generando… {job.stage}
          </div>
        )}

        {job?.script && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Guion (el mismo que habla el TTS)</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyScript()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-background p-4 text-[15px] leading-relaxed">
              {job.script}
            </pre>
          </section>
        )}

        {mp3Url && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">Audio MP3</h2>
            <audio controls className="w-full" src={mp3Url} />
            <a
              href={mp3Url}
              download={`${job?.title || "nara"}.mp3`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm hover:bg-muted/40"
            >
              <Download className="size-4" />
              Descargar MP3
            </a>
          </section>
        )}

        {running && (
          <Button variant="outline" disabled={busy} onClick={() => void cancel()}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
