import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Newspaper } from "lucide-react";
import { api, type VoxJobDetail } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VoxJobPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<VoxJobDetail | null>(null);
  const [beatsText, setBeatsText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!id) return;
    const j = await api.getVoxJob(id);
    setJob(j);
    if (j.beats && !beatsText) setBeatsText(JSON.stringify(j.beats, null, 2));
  }

  useEffect(() => {
    if (!id) return;
    setBeatsText("");
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const es = new EventSource(`/api/v1/vox/jobs/${id}/events`, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as VoxJobDetail;
        setJob((prev) => ({ ...prev, ...data }));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveBeats() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const parsed = JSON.parse(beatsText);
      await api.saveVoxBeats(id, parsed);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      if (beatsText) await api.saveVoxBeats(id, JSON.parse(beatsText));
      await api.approveVoxBeats(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function retryBakeoff() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api.retryVoxBakeoff(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pick(theme: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api.pickVoxStyle(id, theme);
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

  const bakeoff = job.bakeoff ?? [];
  const queuedBakeoff = job.status === "baking" && /en cola/i.test(job.detail);
  const workerDown = job.queue ? !job.queue.workerLive : false;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/vox")}>
          <ArrowLeft className="size-3.5" /> Nuevo Vox
        </button>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[2px] text-primary">Vox · {job.status}</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Newspaper className="size-6 text-primary" />
            {job.topic}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.detail}</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {job.status === "awaiting_beats" && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Puerta 1 — aprueba el beat map</h2>
            <textarea
              className="min-h-[320px] w-full rounded-xl border border-input bg-transparent p-3 font-mono text-xs"
              value={beatsText}
              onChange={(e) => setBeatsText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveBeats()} disabled={busy}>
                Guardar edits
              </Button>
              <Button onClick={() => void approve()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Aprobar y hacer bake-off
              </Button>
            </div>
          </section>
        )}

        {(job.status === "awaiting_style" || bakeoff.length > 0) && job.status !== "awaiting_beats" && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Puerta 2 — elige el look</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {bakeoff.map((file) => {
                const theme = file.replace(/\.(jpg|jpeg|png|webp)$/i, "");
                const selected = job.selectedTheme === theme;
                return (
                  <button
                    key={file}
                    type="button"
                    disabled={busy || job.status !== "awaiting_style"}
                    onClick={() => void pick(theme)}
                    className={cn("overflow-hidden rounded-xl border", selected ? "border-primary ring-2 ring-primary/40" : "border-border")}
                  >
                    <img src={`/api/v1/vox/jobs/${job.id}/artifacts/style-bakeoff/${file}`} alt={theme} className="aspect-[16/9] w-full object-cover" />
                    <span className="block px-2 py-1.5 text-[11px]">{theme}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {["producing", "baking", "drafting"].includes(job.status) && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {job.stage}: {job.detail}
            </p>
            {queuedBakeoff && (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
                <p>
                  {workerDown
                    ? "El worker de Vox no está conectado. Reimplementa el servicio video-worker en EasyPanel (misma rama y mismas variables que video)."
                    : "El bake-off está en Redis. Si no avanza en un minuto, el API y el worker no están viendo el mismo disco de jobs."}
                </p>
                <Button variant="outline" onClick={() => void retryBakeoff()} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Reintentar bake-off
                </Button>
              </div>
            )}
          </div>
        )}

        {job.status === "completed" && (
          <video className="w-full rounded-2xl border border-border bg-black" controls src={`/api/v1/vox/jobs/${job.id}/artifacts/final.mp4`} />
        )}

        {job.status === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{job.error || job.detail}</p>
            <Button variant="outline" onClick={() => void retryBakeoff()} disabled={busy}>
              Reintentar bake-off
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
