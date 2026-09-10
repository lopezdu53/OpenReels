import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock,
  Copy,
  ImageIcon,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  Tv,
} from "lucide-react";
import { AnalyticsSubnav } from "@/components/analytic/AnalyticsSubnav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  type CronogramaChannel,
  type CronogramaItem,
  type CronogramaNiche,
  type CronogramaPlan,
  type CronogramaStatus,
} from "@/hooks/useApi";
import { formatUsd } from "@/lib/job-cost-preview";
import { cn } from "@/lib/utils";

const STORE_KEY = "openreels-cronograma-v1";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`;
  return String(n);
}

function Demand({ level }: { level: "alta" | "media" | "baja" }) {
  return (
    <Badge variant={level === "alta" ? "default" : "outline"} className="capitalize">
      {level}
    </Badge>
  );
}

export function CronogramaPage() {
  const [status, setStatus] = useState<CronogramaStatus | null>(null);
  const [niches, setNiches] = useState<CronogramaNiche[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("todos");
  const [picked, setPicked] = useState<CronogramaNiche | null>(null);
  const [llm, setLlm] = useState("vivi");
  const [image, setImage] = useState("vivi");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [angle, setAngle] = useState("");
  const [channel, setChannel] = useState<CronogramaChannel | null>(null);
  const [plan, setPlan] = useState<CronogramaPlan | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("canal");
  const [avatar, setAvatar] = useState<string>("");
  const [banner, setBanner] = useState<string>("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string>("");

  useEffect(() => {
    void api.cronogramaStatus().then((s) => {
      setStatus(s);
      const ready = s.llms.find((l) => l.ready)?.key;
      if (ready) setLlm(ready);
      const img = s.images.find((i) => i.ready)?.key;
      if (img) setImage(img);
    }).catch(() => {});
    void api.cronogramaNiches().then((r) => {
      setNiches(r.niches);
      setCategories(r.categories);
    }).catch(() => {});
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { plan?: CronogramaPlan; avatar?: string; banner?: string; thumbs?: Record<string, string> };
        if (saved.plan) {
          setPlan(saved.plan);
          setChannel(saved.plan.channel);
          setPicked(saved.plan.niche);
          setTab("videos");
        }
        if (saved.avatar) setAvatar(saved.avatar);
        if (saved.banner) setBanner(saved.banner);
        if (saved.thumbs) setThumbs(saved.thumbs);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!plan) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ plan, avatar, banner, thumbs }));
  }, [plan, avatar, banner, thumbs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return niches.filter((n) => {
      if (cat !== "todos" && n.category !== cat) return false;
      if (!needle) return true;
      return `${n.name} ${n.query} ${n.why}`.toLowerCase().includes(needle);
    });
  }, [niches, q, cat]);

  async function makeChannel() {
    if (!picked) return;
    setError("");
    setBusy("channel");
    try {
      const res = await api.cronogramaChannel({ nicheQuery: picked.query, llm, angle });
      setChannel(res.channel);
      setPicked(res.niche);
      setTab("canal");
      if (!res.usedLlm) setError("Sin LLM listo: armé el canal con la plantilla del nicho. Elige un modelo con clave.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function makePlan() {
    if (!picked) return;
    setError("");
    setBusy("plan");
    try {
      const res = await api.cronogramaPlan({
        nicheQuery: picked.query,
        llm,
        angle,
        startDate,
        days: 30,
        videosPerDay,
        timezone,
        channel: channel ?? undefined,
      });
      setPlan(res.plan);
      setChannel(res.plan.channel);
      setTab("mes");
      if (!res.plan.usedLlm) setError("El mes se armó con plantilla. Conecta Vivi u otro LLM para ideas nuevas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function makeImage(kind: "avatar" | "banner" | "thumbnail", prompt: string, key?: string) {
    setError("");
    setBusy(kind + (key ?? ""));
    try {
      const res = await api.cronogramaImage({ prompt, provider: image, kind });
      const src = `data:image/png;base64,${res.imageBase64}`;
      if (kind === "avatar") setAvatar(src);
      else if (kind === "banner") setBanner(src);
      else if (key) setThumbs((prev) => ({ ...prev, [key]: src }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const items = plan?.days.flatMap((d) => d.items.map((item) => ({ ...item, date: d.date, weekday: d.weekday }))) ?? [];

  return (
    <div className="px-4 py-8 sm:px-10 max-w-[1280px]">
      <AnalyticsSubnav />
      <div className="mb-6 flex items-start gap-3">
        <CalendarDays className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Cronograma</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Elige uno de los 100 nichos, arma un canal con cara de YouTube y un mes de publicaciones:
            título, descripción, tags, hora y predicción. Vivi y el resto de LLMs escriben; Vivi imagen
            (u otro) pinta avatar, banner y miniaturas.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-4">
        <Field label="LLM">
          <select className={selectClass} value={llm} onChange={(e) => setLlm(e.target.value)}>
            {(status?.llms ?? [{ key: "vivi", label: "Vivi", ready: false }]).map((row) => (
              <option key={row.key} value={row.key}>
                {row.label}
                {row.ready ? "" : " · sin clave"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Imagen (miniaturas)">
          <select className={selectClass} value={image} onChange={(e) => setImage(e.target.value)}>
            {(status?.images ?? [{ key: "vivi", label: "Vivi imagen", ready: false }]).map((row) => (
              <option key={row.key} value={row.key}>
                {row.label}
                {row.ready ? "" : " · sin clave"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Zona horaria">
          <select className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {(status?.timezones ?? [{ id: timezone, label: timezone }]).map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shorts / día">
          <select
            className={selectClass}
            value={videosPerDay}
            onChange={(e) => setVideosPerDay(Number(e.target.value))}
          >
            <option value={1}>1 al día · 30 / mes</option>
            <option value={2}>2 al día · 60 / mes</option>
            <option value={3}>3 al día · 90 / mes</option>
          </select>
        </Field>
      </div>

      {error ? (
        <p className="mb-4 rounded-[10px] border border-status-warning/30 bg-status-warning/10 px-4 py-2 text-[12px] text-status-warning">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nicho…" className="h-10 pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={cat === "todos"} onClick={() => setCat("todos")}>
              Todos
            </Chip>
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                {c}
              </Chip>
            ))}
          </div>
          <ol className="max-h-[70vh] space-y-1.5 overflow-auto pr-1">
            {filtered.map((n) => (
              <li key={n.rank}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(n);
                    setChannel(null);
                    setPlan(null);
                  }}
                  className={cn(
                    "w-full rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                    picked?.query === n.query
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-primary">#{n.rank}</span>
                    <Demand level={n.demand} />
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug">{n.name}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{n.why}</p>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="min-w-0 space-y-5">
          {!picked ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
              Elige un nicho de la izquierda. Luego creamos el canal y el mes entero.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Nicho #{picked.rank}</p>
                  <h2 className="text-xl font-semibold">{picked.name}</h2>
                  <p className="text-[13px] text-muted-foreground">{picked.why}</p>
                </div>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 w-40" />
                <Button onClick={() => void makeChannel()} disabled={busy === "channel"}>
                  {busy === "channel" ? <Loader2 className="size-4 animate-spin" /> : <Tv className="size-4" />}
                  Crear canal
                </Button>
                <Button onClick={() => void makePlan()} disabled={busy === "plan"} variant={channel ? "default" : "outline"}>
                  {busy === "plan" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Mes de 30 días
                </Button>
              </div>
              <Input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="Ángulo opcional: voz latina, humor seco, solo datos…"
                className="h-10"
              />
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>Demanda <Demand level={picked.demand} /></span>
                <span>Competencia <Demand level={picked.competition} /></span>
                <span>CPM Shorts ${picked.cpmShortsUsd}</span>
                <span>{picked.youtubeCategory}</span>
              </div>

              {channel ? (
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="canal">Canal</TabsTrigger>
                    <TabsTrigger value="acerca">Acerca de</TabsTrigger>
                    <TabsTrigger value="videos">Videos</TabsTrigger>
                    <TabsTrigger value="mes">Calendario</TabsTrigger>
                    <TabsTrigger value="prediccion">Predicción</TabsTrigger>
                  </TabsList>
                  <TabsContent value="canal">
                    <ChannelChrome
                      channel={channel}
                      avatar={avatar}
                      banner={banner}
                      forecast={plan?.forecast}
                      onAvatar={() => void makeImage("avatar", channel.avatarPrompt)}
                      onBanner={() => void makeImage("banner", channel.bannerPrompt)}
                      busy={busy}
                    />
                  </TabsContent>
                  <TabsContent value="acerca">
                    <AboutChannel channel={channel} />
                  </TabsContent>
                  <TabsContent value="videos">
                    <VideoGrid
                      items={items}
                      thumbs={thumbs}
                      openKey={openKey}
                      busy={busy}
                      onOpen={setOpenKey}
                      onThumb={(item, date) =>
                        void makeImage("thumbnail", item.thumbnailPrompt, `${date}-${item.slot}`)
                      }
                    />
                  </TabsContent>
                  <TabsContent value="mes">
                    <MonthBoard plan={plan} thumbs={thumbs} />
                  </TabsContent>
                  <TabsContent value="prediccion">
                    <ForecastPanel plan={plan} niche={picked} timezone={timezone} />
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground">Pulsa Crear canal para ver la portada, el handle y la bio.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px]",
        active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ChannelChrome({
  channel,
  avatar,
  banner,
  forecast,
  onAvatar,
  onBanner,
  busy,
}: {
  channel: CronogramaChannel;
  avatar: string;
  banner: string;
  forecast?: CronogramaPlan["forecast"];
  onAvatar: () => void;
  onBanner: () => void;
  busy: string;
}) {
  const subs = forecast?.month1.base.subscribers ?? 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative aspect-[16/5] bg-[#111]">
        {banner ? (
          <img src={banner} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-[12px] text-muted-foreground">
            Banner 16:9 · {channel.bannerPrompt.slice(0, 80)}…
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="absolute right-3 top-3 bg-black/60"
          onClick={onBanner}
          disabled={busy.startsWith("banner")}
        >
          {busy.startsWith("banner") ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          Banner
        </Button>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
        <button type="button" onClick={onAvatar} className="-mt-10 size-24 shrink-0 overflow-hidden rounded-full border-4 border-black bg-card">
          {avatar ? (
            <img src={avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">Avatar</span>
          )}
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{channel.name}</h2>
          <p className="text-sm text-muted-foreground">
            {channel.handle} · {compact(subs)} suscriptores previstos (mes 1, base) · {channel.country}
          </p>
          <p className="mt-1 text-sm">{channel.tagline}</p>
        </div>
        <Button size="sm" disabled>
          Suscribirse
        </Button>
      </div>
    </div>
  );
}

function AboutChannel({ channel }: { channel: CronogramaChannel }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Descripción</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{channel.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info title="Audiencia" body={channel.targetAudience} />
        <Info title="Tono" body={channel.voiceTone} />
        <Info title="Idioma / categoría" body={`${channel.defaultLanguage} · ${channel.youtubeCategory}`} />
        <Info
          title="Subida por defecto"
          body={`${channel.uploadDefaults.visibility} · comentarios ${channel.uploadDefaults.allowComments ? "sí" : "no"} · kids ${channel.uploadDefaults.madeForKids ? "sí" : "no"} · ${channel.uploadDefaults.license}`}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Palabras clave</h3>
        <p className="text-[13px] text-muted-foreground">{channel.keywords.join(" · ")}</p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Pilares</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {channel.contentPillars.map((p) => (
            <div key={p.name} className="rounded-[10px] border border-border bg-card p-3">
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Enlaces</h3>
        <ul className="space-y-1 text-sm">
          {channel.links.map((l) => (
            <li key={l.url}>
              <a className="text-primary hover:underline" href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <Info title="Enfoque mes 1" body={channel.firstMonthFocus} />
    </div>
  );
}

function VideoGrid({
  items,
  thumbs,
  openKey,
  busy,
  onOpen,
  onThumb,
}: {
  items: Array<CronogramaItem & { date: string; weekday: string }>;
  thumbs: Record<string, string>;
  openKey: string;
  busy: string;
  onOpen: (key: string) => void;
  onThumb: (item: CronogramaItem, date: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Genera el mes para ver la grilla tipo YouTube.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const key = `${item.date}-${item.slot}`;
        const open = openKey === key;
        return (
          <article key={key} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" className="block w-full" onClick={() => onOpen(open ? "" : key)}>
              <div className="relative aspect-video bg-[#111]">
                {thumbs[key] ? (
                  <img src={thumbs[key]} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center px-4 text-center text-[13px] font-black uppercase tracking-tight text-primary">
                    {item.thumbnailText}
                  </div>
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 text-[10px] font-semibold">
                  {item.format === "short" ? "SHORT" : "12:00"}
                </span>
              </div>
            </button>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {compact(item.predictedViews.base)} vistas prev. · {item.weekday} {item.time}
              </p>
              {open ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-[12px]">
                  <p className="text-muted-foreground">{item.hook}</p>
                  <p className="whitespace-pre-wrap text-foreground/90">{item.description}</p>
                  <p className="text-primary/80">{item.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
                  <p className="text-muted-foreground">Tags: {item.tags.join(", ")}</p>
                  <p className="text-muted-foreground">Categoría: {item.category} · {item.pillar}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onThumb(item, item.date)} disabled={busy === `thumbnail${key}`}>
                      {busy === `thumbnail${key}` ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                      Miniatura
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `${item.title}\n\n${item.description}\n\n${item.hashtags.join(" ")}`,
                        )
                      }
                    >
                      <Copy className="size-3.5" />
                      Copiar ficha
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MonthBoard({ plan, thumbs }: { plan: CronogramaPlan | null; thumbs: Record<string, string> }) {
  if (!plan) return <p className="text-sm text-muted-foreground">Aún no hay mes generado.</p>;
  return (
    <div className="space-y-3">
      {plan.days.map((day) => (
        <div key={day.date} className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold capitalize">
              {day.weekday} · {day.date}
            </p>
            <span className="text-[11px] text-muted-foreground">
              <Clock className="mr-1 inline size-3" />
              {day.items[0]?.time}
            </span>
          </div>
          {day.items.map((item) => (
            <div key={`${day.date}-${item.slot}`} className="flex gap-3 py-2">
              <div className="size-16 shrink-0 overflow-hidden rounded-md bg-[#111]">
                {thumbs[`${day.date}-${item.slot}`] ? (
                  <img src={thumbs[`${day.date}-${item.slot}`]} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center px-1 text-center text-[8px] font-bold text-primary">
                    {item.thumbnailText}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.time} · {compact(item.predictedViews.base)} vistas base
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ForecastPanel({
  plan,
  niche,
  timezone,
}: {
  plan: CronogramaPlan | null;
  niche: CronogramaNiche;
  timezone: string;
}) {
  const f = plan?.forecast;
  return (
    <div className="space-y-5">
      {!f ? (
        <p className="text-sm text-muted-foreground">Genera el mes para ver números del canal.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Band title="Conservador · 30d" band={f.month1.conservative} />
            <Band title="Base · 30d" band={f.month1.base} highlight />
            <Band title="Optimista · 30d" band={f.month1.optimistic} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Band title="Conservador · 90d" band={f.day90.conservative} />
            <Band title="Base · 90d" band={f.day90.base} highlight />
            <Band title="Optimista · 90d" band={f.day90.optimistic} />
          </div>
          <p className="rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-[13px]">{f.yppHint}</p>
          <ul className="list-disc space-y-1 pl-5 text-[12px] text-muted-foreground">
            {f.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4 text-primary" />
          Horas de publicación ({timezone})
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {(plan?.hours ?? []).map((row) => (
            <div key={row.weekday} className="rounded-[10px] border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold capitalize">{row.weekday}</p>
              <div className="space-y-1.5">
                {row.slots.map((s) => (
                  <div key={`${row.weekday}-${s.hour}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-10 font-mono text-primary">
                      {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-muted-foreground">{s.label}</span>
                    <span className="tabular-nums">{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[10px] border border-border bg-card p-4 text-[12px] text-muted-foreground">
        <TrendingUp className="mb-1 size-4 text-primary" />
        Nicho {niche.name}: demanda {niche.demand}, competencia {niche.competition}. El score 96 (20:00 entre semana)
        es el hueco más fuerte de Shorts en español LATAM. Publica 10–20 min antes del prime para que el
        algoritmo empiece a probar.
      </div>
    </div>
  );
}

function Band({
  title,
  band,
  highlight,
}: {
  title: string;
  band: { views: number; subscribers: number; revenueUsd: number };
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-4", highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{compact(band.views)}</p>
      <p className="text-[11px] text-muted-foreground">vistas</p>
      <p className="mt-2 text-sm">{compact(band.subscribers)} subs · {formatUsd(band.revenueUsd)} ads</p>
    </div>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
