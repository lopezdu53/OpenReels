import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { FacebookIcon, InstagramIcon, TiktokIcon, YoutubeIcon } from "@/components/BrandIcons";
import { JobVideo } from "@/components/JobVideo";
import { Button } from "@/components/ui/button";
import { api, type SocialPlatformId } from "@/hooks/useApi";

const SHARE: { id: SocialPlatformId; label: string; Icon: typeof YoutubeIcon }[] = [
  { id: "youtube", label: "YouTube", Icon: YoutubeIcon },
  { id: "tiktok", label: "TikTok", Icon: TiktokIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "instagram", label: "Instagram", Icon: InstagramIcon },
];

export async function downloadJobVideo(src: string, downloadName: string): Promise<void> {
  const res = await fetch(src, { credentials: "include" });
  if (!res.ok) throw new Error("No se pudo bajar el video");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName.endsWith(".mp4") ? downloadName : `${downloadName}.mp4`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function JobShareBar({
  jobId,
  src,
  downloadName,
}: {
  jobId: string;
  src: string;
  downloadName: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function download() {
    setBusy("download");
    setMsg("");
    try {
      await downloadJobVideo(src, downloadName);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function publish(platform: SocialPlatformId) {
    setBusy(platform);
    setMsg("");
    try {
      const res = await api.publishJob(jobId, [platform]);
      const row = res.results[0];
      if (row?.ok) {
        setMsg(row.url ? `Publicado en ${platform}: ${row.url}` : `Publicado en ${platform}.`);
      } else {
        setMsg(row?.error ?? "No se publicó. Conecta la red en el Panel.");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void download()}
          disabled={Boolean(busy)}
        >
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Descargar video
        </Button>
        {SHARE.map(({ id, label, Icon }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void publish(id)}
            disabled={Boolean(busy)}
          >
            {busy === id ? <Loader2 className="size-4 animate-spin" /> : <Icon size={16} />}
            {label}
          </Button>
        ))}
      </div>
      {msg ? <p className="text-center text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

export function CompletedJobMedia({
  jobId,
  src,
  aspect,
  poster,
}: {
  jobId: string;
  src: string;
  aspect?: string;
  poster?: string;
}) {
  return (
    <div className="space-y-3">
      <JobVideo src={src} aspect={aspect} poster={poster} />
      <JobShareBar jobId={jobId} src={src} downloadName={`${jobId}.mp4`} />
    </div>
  );
}
