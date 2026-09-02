import {
  Check,
  Clapperboard,
  CopyPlus,
  Flame,
  LayoutDashboard,
  Loader2,
  Plus,
  Target,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SocialNetworkGrid } from "@/components/SocialNetworkGrid";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, type DashboardData, type SocialPublic } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [social, setSocial] = useState<SocialPublic[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void api
      .dashboard()
      .then((next) => {
        setData(next);
        setSocial(next.social ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  async function load() {
    try {
      const next = await api.dashboard();
      setData(next);
      setSocial(next.social ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function bumpGoal(next: number) {
    await api.setDailyGoal(next);
    await refresh();
    await load();
  }

  async function checkin() {
    setChecking(true);
    try {
      await api.checkin();
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function publishLatest() {
    const id = data?.recentJobs[0]?.id;
    if (!id) return;
    setPublishing(true);
    try {
      await api.publishJob(id);
      await load();
    } finally {
      setPublishing(false);
    }
  }

  if (!data && !error) {
    return (
      <div className="flex items-center gap-2 px-10 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando tu canal…
      </div>
    );
  }

  if (error) {
    return <p className="px-10 py-8 text-sm text-destructive">{error}</p>;
  }

  if (!data) return null;

  const { today, dailyGoal, week, streak, totals, countdown } = data;
  const clonedChannels = data.clonedChannels ?? [];
  const recentJobs = data.recentJobs ?? [];

  return (
    <div className="py-8 px-4 sm:px-10 max-w-[1100px] space-y-6">
      <div className="flex items-start gap-3">
        <LayoutDashboard className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="text-[13px] text-muted-foreground">
            Hola {user?.name}. Método {dailyGoal} publicaciones/día: cada red social cuenta cuando
            el Short se sube solo.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/15 via-card to-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <p className="text-sm font-semibold">
              Hoy · {today.progress}/{dailyGoal}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Flame className="size-3.5 text-status-warning" />
            Racha {streak} día{streak === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: dailyGoal }, (_, n) => ({
            id: `video-${n + 1}`,
            filled: n < today.progress,
            n: n + 1,
          })).map((slot) => (
            <div
              key={slot.id}
              className={cn(
                "flex size-12 items-center justify-center rounded-xl border text-sm font-semibold",
                slot.filled
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-inset text-muted-foreground",
              )}
            >
              {slot.filled ? <Check className="size-5" /> : slot.n}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Shorts generados hoy: {today.generated}. Publicados en redes: {today.posted}. La racha
          sube sola al publicar (YouTube, TikTok, Facebook, X, Bilibili).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void checkin()} disabled={checking || today.progress >= dailyGoal}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Marqué a mano
          </Button>
          <Button
            variant="outline"
            onClick={() => void publishLatest()}
            disabled={publishing || recentJobs.length === 0}
          >
            {publishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Video className="size-4" />
            )}
            Publicar último Short
          </Button>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            <Plus className="size-4" />
            Crear Short
          </Link>
          <label
            htmlFor="dash-goal"
            className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground"
          >
            Meta/día
            <select
              id="dash-goal"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-foreground"
              value={dailyGoal}
              onChange={(e) => void bumpGoal(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <SocialNetworkGrid
        platforms={
          social.length
            ? social
            : (["youtube", "tiktok", "facebook", "x", "bilibili"] as const).map((platform) => ({
                platform,
                connected: false,
                autoPublish: false,
                publishedToday: false,
                oauthReady: false,
              }))
        }
        onChange={(next) => {
          setSocial(next);
          void load();
        }}
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Esta semana</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => (
            <div
              key={d.date}
              className={cn(
                "rounded-lg border px-1.5 py-2 text-center",
                d.hit ? "border-primary/40 bg-primary/10" : "border-border bg-card",
              )}
            >
              <p className="text-[10px] uppercase text-muted-foreground">
                {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es", { weekday: "short" })}
              </p>
              <p className="text-sm font-semibold tabular-nums">{d.posted}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Videos generados" value={String(totals.videos)} icon={Video} />
        <Stat label="Canales clonados" value={String(totals.clones)} icon={CopyPlus} />
        <Stat label="Scripts pulidos" value={String(totals.scripts)} icon={Clapperboard} />
      </div>

      {!countdown.expired ? (
        <Link
          to="/learning"
          className="block rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm"
        >
          Faltan <strong>{countdown.days} días</strong> para el YPP del 1 feb 2027. En Aprendizaje ves
          cómo se paga YouTube y qué cambia.
        </Link>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Tus canales clonados</h2>
        {clonedChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            En Analítica clona un canal y se guarda aquí, solo para tu cuenta.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {clonedChannels.map((ch) => (
              <li
                key={ch.channelName + ch.tagline}
                className="rounded-xl border border-border bg-card p-3"
              >
                <p className="font-medium">{ch.channelName}</p>
                <p className="text-[12px] text-muted-foreground">{ch.tagline}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Ref. {ch.sourceChannel}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Videos generados</h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando renders un Short, aparece en tu galería.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentJobs.map((j) => (
              <li key={j.id}>
                <Link
                  to={`/jobs/${j.id}`}
                  className="flex items-center justify-between rounded-[10px] border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
                >
                  <span className="truncate">{j.topic}</span>
                  <span className="text-[11px] text-muted-foreground">{j.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Video }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-3.5 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
