import { Check, Loader2, PlugZap, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BilibiliIcon,
  FacebookIcon,
  TiktokIcon,
  XIcon,
  YoutubeIcon,
} from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SocialPlatformId, type SocialPublic } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const ICONS: Record<SocialPlatformId, typeof YoutubeIcon> = {
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  facebook: FacebookIcon,
  x: XIcon,
  bilibili: BilibiliIcon,
};

const COLORS: Record<SocialPlatformId, string> = {
  youtube: "#FF0000",
  tiktok: "#25F4EE",
  facebook: "#1877F2",
  x: "#E7E9EA",
  bilibili: "#00A1D6",
};

const LABELS: Record<SocialPlatformId, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  bilibili: "Bilibili",
};

export function SocialNetworkGrid({
  platforms,
  onChange,
}: {
  platforms: SocialPublic[];
  onChange: (next: SocialPublic[]) => void;
}) {
  const [open, setOpen] = useState<SocialPlatformId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sessdata, setSessdata] = useState("");
  const [biliJct, setBiliJct] = useState("");

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as { type?: string; ok?: boolean; error?: string };
      if (data?.type !== "openreels-oauth") return;
      void api
        .social()
        .then((d) => onChange(d.platforms))
        .catch(() => {});
      if (!data.ok && data.error) setError(data.error);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onChange]);

  async function connect(platform: SocialPlatformId) {
    setBusy(platform);
    setError("");
    try {
      const { url } = await api.socialConnect(platform);
      window.open(url, "or-oauth", "width=520,height=720");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveBili() {
    setBusy("bilibili");
    setError("");
    try {
      const { platforms: next } = await api.socialBilibili({ sessdata, biliJct });
      onChange(next);
      setSessdata("");
      setBiliJct("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuto(p: SocialPublic) {
    setBusy(p.platform);
    try {
      const { platforms: next } = await api.socialPatch(p.platform, !p.autoPublish);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(platform: SocialPlatformId) {
    setBusy(platform);
    try {
      const { platforms: next } = await api.socialDisconnect(platform);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Redes · toca una ficha</h2>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Conecta YouTube, TikTok, Facebook, X y Bilibili. Si auto-publicar está on, cada Short
        terminado se sube solo y la racha del día suma 1 por red.
      </p>
      {error ? (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {platforms.map((p) => {
          const Icon = ICONS[p.platform];
          const active = open === p.platform;
          return (
            <button
              key={p.platform}
              type="button"
              onClick={() => setOpen(active ? null : p.platform)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-card hover:border-primary/40",
                p.publishedToday && "ring-1 ring-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: COLORS[p.platform] }}>
                  <Icon size={22} />
                </span>
                {p.publishedToday ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <Check className="size-3" /> Hoy
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {p.connected ? "lista" : "off"}
                  </span>
                )}
              </div>
              <p className="mt-2 text-lg font-bold">{LABELS[p.platform]}</p>
              <p className="text-[11px] text-muted-foreground">
                {p.connected ? (p.handle ?? "Conectada") : "Toca para conectar"}
              </p>
              {p.autoPublish && p.connected ? (
                <p className="mt-1 text-[10px] text-primary">Auto-publicar</p>
              ) : null}
            </button>
          );
        })}
      </div>

      {platforms.map((p) => {
        if (open !== p.platform) return null;
        return (
          <div
            key={`panel-${p.platform}`}
            className="mt-3 rounded-xl border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold">{LABELS[p.platform]}</p>
            {p.lastError ? (
              <p className="mt-1 text-[12px] text-destructive">{p.lastError}</p>
            ) : null}
            {p.lastUrl ? (
              <a
                href={p.lastUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-[12px] text-primary hover:underline"
              >
                Último post →
              </a>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.platform === "bilibili" && !p.connected ? (
                <div className="w-full max-w-md space-y-2">
                  <Input
                    placeholder="SESSDATA"
                    value={sessdata}
                    onChange={(e) => setSessdata(e.target.value)}
                  />
                  <Input
                    placeholder="bili_jct"
                    value={biliJct}
                    onChange={(e) => setBiliJct(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={() => void saveBili()}
                    disabled={busy === "bilibili"}
                  >
                    {busy === "bilibili" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PlugZap className="size-4" />
                    )}
                    Guardar cookie
                  </Button>
                </div>
              ) : null}
              {p.platform !== "bilibili" && !p.connected ? (
                <Button
                  type="button"
                  onClick={() => void connect(p.platform)}
                  disabled={busy === p.platform || !p.oauthReady}
                >
                  {busy === p.platform ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  Conectar
                </Button>
              ) : null}
              {!p.oauthReady && p.platform !== "bilibili" ? (
                <p className="text-[11px] text-muted-foreground">
                  Faltan claves OAuth en EasyPanel (servicio video) para esta red.
                </p>
              ) : null}
              {p.connected ? (
                <>
                  <Button type="button" variant="outline" onClick={() => void toggleAuto(p)}>
                    Auto-publicar: {p.autoPublish ? "sí" : "no"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void disconnect(p.platform)}>
                    <Unplug className="size-4" />
                    Desconectar
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
