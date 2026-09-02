import {
  BarChart3,
  CalendarDays,
  Check,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TopNichesPanel } from "@/components/analytic/TopNichesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AnalyticsChannel,
  type AnalyticsVideo,
  api,
  type ChannelStrategy,
  type ClonedChannel,
  type ClonedContent,
  type ContentCalendar,
  clonedChannelToStrategy,
  type NicheResearch,
  type PlatformPack,
  type TopNiches,
} from "@/hooks/useApi";
import {
  calendarToCsv,
  clonedChannelToMarkdown,
  clonedContentToMarkdown,
  copyText,
  downloadText,
  researchToMarkdown,
  topNichesToMarkdown,
} from "@/lib/analytics-export";
import { fetchUsdToCopRate } from "@/lib/cop-rate";
import { formatCop, formatUsd } from "@/lib/job-cost-preview";
import { CURATED_TOP_NICHES } from "@/lib/top-niches-seed";
import { cn } from "@/lib/utils";

const NICHE_CHIPS = [
  "finanzas personales",
  "historia de Roma",
  "inteligencia artificial",
  "recetas rápidas",
  "videojuegos indie",
  "belleza skincare",
];

const PLATFORMS: {
  key: keyof Pick<
    ContentCalendar["days"][number]["items"][number],
    "youtube" | "tiktok" | "bilibili" | "facebook"
  >;
  label: string;
}[] = [
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "bilibili", label: "Bilibili" },
  { key: "facebook", label: "Facebook" },
];

function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function foundedLabel(publishedAt?: string): string | null {
  if (!publishedAt) return null;
  const t = new Date(publishedAt);
  if (!Number.isFinite(t.getTime())) return null;
  const stamp = t.toLocaleDateString("es", { month: "short", year: "numeric" });
  return `Fundado ${stamp}`;
}

function Money({ usd, rate }: { usd: number; rate: number | null }) {
  return (
    <div className="text-right">
      <p className="tabular-nums font-medium">{formatUsd(usd)}</p>
      {rate != null ? (
        <p className="text-[10px] tabular-nums text-muted-foreground">{formatCop(usd * rate)}</p>
      ) : null}
    </div>
  );
}

function KeyDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={cn("size-1.5 rounded-full", ok ? "bg-status-success" : "bg-status-warning")}
      />
      {label}
    </span>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
      {msg}
    </div>
  );
}

export function AnalyticsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ youtube: boolean; tavily: boolean; vivi: boolean } | null>(
    null,
  );
  const [copRate, setCopRate] = useState<number | null>(null);
  const [research, setResearch] = useState<NicheResearch | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, AnalyticsVideo[]>>({});
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [angle, setAngle] = useState("");
  const [strategy, setStrategy] = useState<ChannelStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState("");
  const [videosPerDay, setVideosPerDay] = useState(3);
  const [days, setDays] = useState(7);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendar, setCalendar] = useState<ContentCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [tab, setTab] = useState("top");
  const [copied, setCopied] = useState<"md" | "json" | "csv" | null>(null);
  const [polish, setPolish] = useState("");
  const [topNiches, setTopNiches] = useState<TopNiches | null>(CURATED_TOP_NICHES);
  const [topLoading, setTopLoading] = useState(false);
  const [topError, setTopError] = useState("");
  const [clonedChannel, setClonedChannel] = useState<ClonedChannel | null>(null);
  const [cloningChannelId, setCloningChannelId] = useState<string | null>(null);
  const [clonedContent, setClonedContent] = useState<ClonedContent | null>(null);
  const [cloningVideoId, setCloningVideoId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState("");

  useEffect(() => {
    void api
      .analyticsStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    void fetchUsdToCopRate()
      .then(setCopRate)
      .catch(() => setCopRate(null));
    void api
      .analyticsTopNiches({ refresh: false })
      .then(setTopNiches)
      .catch(() => {
        /* keep CURATED_TOP_NICHES */
      });
  }, []);

  const totals = useMemo(() => {
    if (!research) return null;
    const channelViews = research.channels.reduce((s, c) => s + c.views, 0);
    const channelRev = research.channels.reduce((s, c) => s + c.estimatedRevenueUsd, 0);
    const videoViews = research.videos.reduce((s, v) => s + v.views, 0);
    const videoRev = research.videos.reduce((s, v) => s + v.estimatedRevenueUsd, 0);
    return { channelViews, channelRev, videoViews, videoRev };
  }, [research]);

  async function runResearch(q = query) {
    const niche = q.trim();
    if (niche.length < 2) return;
    setQuery(niche);
    setResearchLoading(true);
    setResearchError("");
    setStrategy(null);
    setCalendar(null);
    setExpanded({});
    setClonedChannel(null);
    setClonedContent(null);
    setTab("research");
    try {
      const data = await api.analyticsResearch(niche);
      setResearch(data);
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setResearchLoading(false);
    }
  }

  async function loadChannelVideos(channel: AnalyticsChannel) {
    if (!research) return;
    if (expanded[channel.id]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
      return;
    }
    setExpandingId(channel.id);
    try {
      const { videos } = await api.analyticsChannelVideos(channel.id, research.query);
      setExpanded((prev) => ({ ...prev, [channel.id]: videos }));
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setExpandingId(null);
    }
  }

  async function runStrategy() {
    if (!research) return;
    setStrategyLoading(true);
    setStrategyError("");
    try {
      const { strategy: next } = await api.analyticsStrategy(research, angle);
      setStrategy(next);
      setTab("strategy");
    } catch (err) {
      setStrategyError(err instanceof Error ? err.message : String(err));
    } finally {
      setStrategyLoading(false);
    }
  }

  async function runCalendar() {
    if (!research || !strategy) return;
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const { calendar: next } = await api.analyticsCalendar({
        research,
        strategy,
        videosPerDay,
        days,
        startDate,
      });
      setCalendar(next);
      setTab("calendar");
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalendarLoading(false);
    }
  }

  async function loadTopNiches(refresh: boolean) {
    setTopLoading(true);
    setTopError("");
    try {
      const data = await api.analyticsTopNiches({
        region: "LATAM",
        seed: polish || query,
        refresh,
      });
      setTopNiches(data);
      setTab("top");
    } catch (err) {
      setTopError(err instanceof Error ? err.message : String(err));
      if (!topNiches) setTopNiches(CURATED_TOP_NICHES);
    } finally {
      setTopLoading(false);
    }
  }

  async function runCloneChannel(channel: AnalyticsChannel) {
    setCloningChannelId(channel.id);
    setCloneError("");
    try {
      let videos = expanded[channel.id];
      if (!videos && research) {
        const res = await api.analyticsChannelVideos(channel.id, research.query);
        videos = res.videos;
        setExpanded((prev) => ({ ...prev, [channel.id]: videos ?? [] }));
      }
      const { cloned } = await api.analyticsCloneChannel({
        channel,
        videos,
        niche: research?.query,
        polish: polish || angle,
      });
      setClonedChannel(cloned);
      setStrategy(clonedChannelToStrategy(cloned));
      setTab("clones");
      await api.saveCloneChannel(cloned).catch(() => {});
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloningChannelId(null);
    }
  }

  async function runCloneContent(video: AnalyticsVideo) {
    setCloningVideoId(video.id);
    setCloneError("");
    try {
      const { cloned } = await api.analyticsCloneContent({
        video,
        niche: research?.query,
        polish: polish || angle,
      });
      setClonedContent(cloned);
      setTab("clones");
      await api.saveCloneContent(cloned).catch(() => {});
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloningVideoId(null);
    }
  }

  function slug() {
    return (research?.query ?? "nicho")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]+/gi, "-")
      .slice(0, 40);
  }

  async function handleCopy(kind: "md" | "json" | "csv") {
    if (kind === "csv") {
      if (!calendar) return;
      await copyText(calendarToCsv(calendar));
    } else if (kind === "json") {
      await copyText(
        JSON.stringify(
          { topNiches, research, strategy, calendar, clonedChannel, clonedContent },
          null,
          2,
        ),
      );
    } else {
      const parts = [
        topNiches ? topNichesToMarkdown(topNiches) : "",
        research ? researchToMarkdown(research, strategy, calendar) : "",
        clonedChannel ? clonedChannelToMarkdown(clonedChannel) : "",
        clonedContent ? clonedContentToMarkdown(clonedContent) : "",
      ].filter(Boolean);
      if (parts.length === 0) return;
      await copyText(parts.join("\n\n"));
    }
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }

  function handleDownload(kind: "md" | "json" | "csv") {
    const name = slug();
    if (kind === "csv") {
      if (!calendar) return;
      downloadText(`analytic-${name}-calendario.csv`, calendarToCsv(calendar), "text/csv");
      return;
    }
    if (kind === "json") {
      downloadText(
        `analytic-${name}.json`,
        JSON.stringify(
          { topNiches, research, strategy, calendar, clonedChannel, clonedContent },
          null,
          2,
        ),
        "application/json",
      );
      return;
    }
    const parts = [
      topNiches ? topNichesToMarkdown(topNiches) : "",
      research ? researchToMarkdown(research, strategy, calendar) : "",
      clonedChannel ? clonedChannelToMarkdown(clonedChannel) : "",
      clonedContent ? clonedContentToMarkdown(clonedContent) : "",
    ].filter(Boolean);
    if (parts.length === 0) return;
    downloadText(`analytic-${name}.md`, parts.join("\n\n"), "text/markdown");
  }

  return (
    <div className="py-8 px-4 sm:px-10 max-w-[1100px]">
      <div className="mb-6 flex items-start gap-3">
        <BarChart3 className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analítica</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Busca nichos en YouTube, explora canales, estima vistas y ganancias, y reorganiza todo
            con Vivi para tu propio canal.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <KeyDot ok={Boolean(status?.youtube)} label="YouTube API" />
        <KeyDot ok={Boolean(status?.tavily)} label="Tavily" />
        <KeyDot ok={Boolean(status?.vivi)} label="Vivi LLM" />
        {status && (!status.youtube || !status.vivi) ? (
          <Link to="/settings" className="text-[11px] text-primary hover:underline">
            Configurar claves
          </Link>
        ) : null}
      </div>

      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void runResearch();
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nicho o idea: finanzas para millennials, historia corta, recetas…"
            className="h-10 pl-9"
          />
        </div>
        <Button
          type="submit"
          className="h-10 px-4"
          disabled={researchLoading || query.trim().length < 2}
        >
          {researchLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Buscar nicho
        </Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {NICHE_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void runResearch(chip)}
            className="rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            {chip}
          </button>
        ))}
      </div>

      <label
        htmlFor="analytic-polish"
        className="mb-6 block text-[12px] font-medium text-muted-foreground"
      >
        Cómo pulir clones (opcional)
        <textarea
          id="analytic-polish"
          value={polish}
          onChange={(e) => setPolish(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          placeholder="Ej. voz latina, humor seco, un solo dato por video, no copies el nombre del canal."
        />
      </label>

      {researchError ? (
        <div className="mb-4">
          <ErrorBox msg={researchError} />
        </div>
      ) : null}

      {researchLoading ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Explorando canales, videos y el mercado…
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void handleCopy("md")}>
          {copied === "md" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copiar Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleDownload("md")}>
          <Download className="size-3.5" />
          .md
        </Button>
        <Button size="sm" variant="outline" onClick={() => void handleCopy("json")}>
          {copied === "json" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          JSON
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleDownload("json")}>
          <Download className="size-3.5" />
          .json
        </Button>
        {calendar ? (
          <>
            <Button size="sm" variant="outline" onClick={() => void handleCopy("csv")}>
              {copied === "csv" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              CSV calendario
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDownload("csv")}>
              <Download className="size-3.5" />
              .csv
            </Button>
          </>
        ) : null}
      </div>

      {research && !researchLoading ? (
        <>
          {research.warning ? (
            <p className="mb-4 rounded-[10px] border border-status-warning/30 bg-status-warning/10 px-4 py-2 text-[12px] text-status-warning">
              {research.warning}
            </p>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Canales"
              value={String(research.channels.length)}
              hint={totals ? `${compact(totals.channelViews)} views` : ""}
            />
            <StatCard
              label="Ads canales (est.)"
              value={totals ? formatUsd(totals.channelRev) : "—"}
              hint={
                copRate && totals ? formatCop(totals.channelRev * copRate) : "lifetime · 55% share"
              }
            />
            <StatCard
              label="Videos top"
              value={String(research.videos.length)}
              hint={totals ? `${compact(totals.videoViews)} views` : ""}
            />
            <StatCard
              label="CPM nicho"
              value={`$${research.cpmLongformUsd} / $${research.cpmShortsUsd}`}
              hint="long-form / Shorts por 1k views"
            />
          </div>
        </>
      ) : null}

      {cloneError ? (
        <div className="mb-4">
          <ErrorBox msg={cloneError} />
        </div>
      ) : null}

      <p className="mb-4 text-[11px] text-muted-foreground">
        Las ganancias son estimadas (CPM del nicho × views × 55% del creador). Clonar
        canal/contenido reescribe el formato con Vivi; no copia identidad, thumbnails ni títulos
        literales.
      </p>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="mb-5 w-full max-w-3xl">
          <TabsTrigger value="top" className="flex-1">
            Top 10
          </TabsTrigger>
          <TabsTrigger value="research" className="flex-1">
            Mercado
          </TabsTrigger>
          <TabsTrigger value="strategy" className="flex-1">
            Canal propio
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-1">
            Calendario
          </TabsTrigger>
          <TabsTrigger value="clones" className="flex-1">
            Clones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="top">
          <TopNichesPanel
            list={topNiches}
            loading={topLoading}
            error={topError}
            canVivi={Boolean(status?.vivi)}
            onRefresh={() => void loadTopNiches(true)}
            onPick={(n) => void runResearch(n.query)}
          />
        </TabsContent>

        <TabsContent value="research" className="space-y-8">
          {!research ? (
            <p className="text-sm text-muted-foreground">
              Busca un nicho o elige uno del Top 10 para ver canales, videos y ganancias.
            </p>
          ) : (
            <>
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-primary" />
                  Canales más relevantes
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {research.channels.map((ch) => (
                    <ChannelCard
                      key={ch.id}
                      channel={ch}
                      rate={copRate}
                      videos={expanded[ch.id]}
                      loading={expandingId === ch.id}
                      cloning={cloningChannelId === ch.id}
                      cloningVideoId={cloningVideoId}
                      canClone={Boolean(status?.vivi)}
                      onExpand={() => void loadChannelVideos(ch)}
                      onClone={() => void runCloneChannel(ch)}
                      onCloneVideo={(video) => void runCloneContent(video)}
                    />
                  ))}
                </div>
                {research.channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin canales de YouTube. Añade YOUTUBE_API_KEY o usa Tavily abajo.
                  </p>
                ) : null}
              </section>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Video className="size-4 text-primary" />
                  Contenido con más reproducciones
                </h2>
                <div className="space-y-2">
                  {research.videos.map((v) => (
                    <VideoRow
                      key={v.id}
                      video={v}
                      rate={copRate}
                      cloning={cloningVideoId === v.id}
                      canClone={Boolean(status?.vivi)}
                      onClone={() => void runCloneContent(v)}
                    />
                  ))}
                </div>
              </section>

              {research.ideas.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Ideas del mercado</h2>
                  <ul className="flex flex-wrap gap-1.5">
                    {research.ideas.map((idea) => (
                      <li
                        key={idea}
                        className="rounded-full border border-border bg-surface-inset px-3 py-1 text-[12px]"
                      >
                        {idea}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {research.webHits.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Señales web</h2>
                  <ul className="space-y-2">
                    {research.webHits.map((hit) => (
                      <li
                        key={hit.url}
                        className="rounded-[10px] border border-border bg-card px-4 py-3"
                      >
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {hit.title}
                        </a>
                        <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                          {hit.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="strategy" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <label
              htmlFor="analytic-angle"
              className="text-[12px] font-medium text-muted-foreground"
            >
              Ángulo de tu canal (opcional)
            </label>
            <textarea
              id="analytic-angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Ej. voz latina, 60s, humor seco, sin clonar a nadie — explicar finanzas a quienes odian Excel."
            />
            <Button
              className="mt-3"
              onClick={() => void runStrategy()}
              disabled={strategyLoading || !status?.vivi || !research}
            >
              {strategyLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Reorganizar con Vivi LLM
            </Button>
            {!status?.vivi ? (
              <p className="mt-2 text-[12px] text-status-warning">
                Necesitas{" "}
                <Link to="/settings" className="underline">
                  VIVI_LLM_API_KEY
                </Link>{" "}
                para diseñar el canal.
              </p>
            ) : null}
          </div>
          {strategyError ? <ErrorBox msg={strategyError} /> : null}
          {strategy ? <StrategyView strategy={strategy} /> : null}
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              1 a 10 videos por día, con título, descripción y hashtags para YouTube, TikTok,
              Bilibili y Facebook.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label htmlFor="analytic-vpd" className="text-[12px]">
                Videos / día: <span className="font-semibold tabular-nums">{videosPerDay}</span>
                <input
                  id="analytic-vpd"
                  type="range"
                  min={1}
                  max={10}
                  value={videosPerDay}
                  onChange={(e) => setVideosPerDay(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
              </label>
              <label htmlFor="analytic-days" className="text-[12px]">
                Días (máx. 7)
                <input
                  id="analytic-days"
                  type="number"
                  min={1}
                  max={7}
                  value={days}
                  onChange={(e) => setDays(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
                  className="mt-2 h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none dark:bg-input/30"
                />
              </label>
              <label htmlFor="analytic-start" className="text-[12px]">
                Inicio
                <input
                  id="analytic-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-2 h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none dark:bg-input/30"
                />
              </label>
            </div>
            <Button
              onClick={() => void runCalendar()}
              disabled={!strategy || calendarLoading || !status?.vivi}
            >
              {calendarLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarDays className="size-4" />
              )}
              Generar calendario
            </Button>
            {!strategy ? (
              <p className="text-[12px] text-muted-foreground">
                Primero genera el canal propio en la pestaña anterior.
              </p>
            ) : null}
          </div>
          {calendarError ? <ErrorBox msg={calendarError} /> : null}
          {calendar ? <CalendarView calendar={calendar} /> : null}
        </TabsContent>

        <TabsContent value="clones" className="space-y-6">
          <p className="text-[12px] text-muted-foreground">
            Vivi clona el formato (hooks, pilares, ritmo) y lo pule. No copies thumbnails, cara ni
            el nombre del canal de referencia.
          </p>
          {!clonedChannel && !clonedContent ? (
            <p className="text-sm text-muted-foreground">
              En Mercado, usa <strong>Clonar canal</strong> o <strong>Clonar contenido</strong>. El
              texto de “Cómo pulir clones” guía a la LLM.
            </p>
          ) : null}
          {clonedChannel ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Canal clonado y pulido</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copyText(clonedChannelToMarkdown(clonedChannel)).then(() => {
                      setCopied("md");
                      window.setTimeout(() => setCopied(null), 1400);
                    })
                  }
                >
                  {copied === "md" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  Copiar
                </Button>
              </div>
              <p className="rounded-[10px] border border-primary/20 bg-primary/10 px-3 py-2 text-[12px]">
                Referencia: {clonedChannel.sourceChannel}. {clonedChannel.polishNotes}
              </p>
              <StrategyView strategy={clonedChannel} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Primeros videos (propios)</h3>
                <ul className="space-y-2">
                  {clonedChannel.firstVideos.map((idea) => (
                    <li
                      key={idea.title}
                      className="rounded-[10px] border border-border bg-card px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{idea.format}</Badge>
                        <span className="font-medium">{idea.title}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">{idea.hook}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {clonedContent ? <ClonedContentView cloned={clonedContent} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClonedContentView({ cloned }: { cloned: ClonedContent }) {
  const [copied, setCopied] = useState(false);
  async function copyAll() {
    await copyText(clonedContentToMarkdown(cloned));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Contenido clonado y pulido</h2>
        <Button size="sm" variant="outline" onClick={() => void copyAll()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copiar
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Referencia: {cloned.sourceTitle}
        {cloned.sourceChannel ? ` — ${cloned.sourceChannel}` : ""}. {cloned.polishNotes}
      </p>
      <InfoBlock title="Hook" body={cloned.hook} />
      <InfoBlock title="Script / locución" body={cloned.script} />
      <InfoBlock title="Visuales" body={cloned.visualNotes} />
      <div className="grid gap-2 md:grid-cols-2">
        {PLATFORMS.map((p) => (
          <PlatformCard key={p.key} label={p.label} pack={cloned[p.key]} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ChannelCard({
  channel,
  rate,
  videos,
  loading,
  cloning,
  cloningVideoId,
  canClone,
  onExpand,
  onClone,
  onCloneVideo,
}: {
  channel: AnalyticsChannel;
  rate: number | null;
  videos?: AnalyticsVideo[];
  loading: boolean;
  cloning: boolean;
  cloningVideoId: string | null;
  canClone: boolean;
  onExpand: () => void;
  onClone: () => void;
  onCloneVideo: (video: AnalyticsVideo) => void;
}) {
  const founded = foundedLabel(channel.publishedAt);
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex gap-3">
        {channel.thumbnail ? (
          <img src={channel.thumbnail} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-full bg-surface-inset">
            <Users className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-medium hover:text-primary"
              >
                <span className="truncate">{channel.title}</span>
                <ExternalLink className="size-3 shrink-0 opacity-50" />
              </a>
              <p className="text-[11px] text-muted-foreground">
                {channel.handle ? `${channel.handle} · ` : ""}
                {compact(channel.subscribers)} subs · {compact(channel.videoCount)} videos
              </p>
            </div>
            <Money usd={channel.estimatedRevenueUsd} rate={rate} />
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
            {channel.description}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {compact(channel.views)} views lifetime
          </p>
          {(founded || channel.cadenceLabel) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              {founded ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {founded}
                </span>
              ) : null}
              {channel.cadenceLabel ? <span>Sube {channel.cadenceLabel}</span> : null}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={onExpand} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          {videos ? "Ocultar videos" : "Analizar contenido"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClone} disabled={cloning || !canClone}>
          {cloning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CopyPlus className="size-3.5" />
          )}
          Clonar canal
        </Button>
      </div>
      {videos ? (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              rate={rate}
              compact
              cloning={cloningVideoId === v.id}
              canClone={canClone}
              onClone={() => onCloneVideo(v)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VideoRow({
  video,
  rate,
  compact: dense,
  cloning,
  canClone,
  onClone,
}: {
  video: AnalyticsVideo;
  rate: number | null;
  compact?: boolean;
  cloning?: boolean;
  canClone?: boolean;
  onClone?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-[10px] border border-border bg-card",
        dense ? "p-2" : "p-3",
      )}
    >
      {video.thumbnail ? (
        <a href={video.url} target="_blank" rel="noreferrer">
          <img
            src={video.thumbnail}
            alt=""
            className={cn("rounded-md object-cover", dense ? "h-12 w-20" : "h-16 w-28")}
          />
        </a>
      ) : null}
      <div className="min-w-0 flex-1">
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "font-medium leading-snug hover:text-primary",
            dense ? "text-[12px] line-clamp-2" : "text-sm line-clamp-2",
          )}
        >
          {video.title}
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {video.shorts ? (
            <Badge variant="secondary">Short</Badge>
          ) : (
            <Badge variant="outline">Long</Badge>
          )}
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" />
            {compact(video.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" />
            {compact(video.likes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" />
            {compact(video.comments)}
          </span>
          {video.channelTitle ? <span className="truncate">{video.channelTitle}</span> : null}
        </div>
        {onClone ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={onClone}
            disabled={cloning || !canClone}
          >
            {cloning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CopyPlus className="size-3.5" />
            )}
            Clonar contenido
          </Button>
        ) : null}
      </div>
      <Money usd={video.estimatedRevenueUsd} rate={rate} />
    </div>
  );
}

function StrategyView({ strategy }: { strategy: ChannelStrategy }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-gradient-to-b from-primary/10 to-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Canal propuesto
        </p>
        <h2 className="mt-1 text-xl font-semibold">{strategy.channelName}</h2>
        <p className="text-sm text-muted-foreground">{strategy.tagline}</p>
        <p className="mt-3 text-sm leading-relaxed">{strategy.positioning}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoBlock title="Audiencia" body={strategy.targetAudience} />
        <InfoBlock title="Tono" body={strategy.voiceTone} />
        <InfoBlock title="Primer mes" body={strategy.firstMonthFocus} />
        <InfoBlock title="Cadencia" body={strategy.postingCadence} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Pilares</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {strategy.contentPillars.map((p) => (
            <div key={p.name} className="rounded-[10px] border border-border bg-card p-3">
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.description}</p>
              <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                {p.exampleTopics.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Diferenciación</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {strategy.differentiation.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Monetización</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoBlock title="YouTube" body={strategy.monetization.youtube} />
          <InfoBlock title="TikTok" body={strategy.monetization.tiktok} />
          <InfoBlock title="Facebook" body={strategy.monetization.facebook} />
          <InfoBlock title="Bilibili" body={strategy.monetization.bilibili} />
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function CalendarView({ calendar }: { calendar: ContentCalendar }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {calendar.channelName} · {calendar.videosPerDay} video
        {calendar.videosPerDay === 1 ? "" : "s"} / día
      </p>
      {calendar.days.map((day) => (
        <section key={day.date} className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold capitalize">
            {day.weekday} · {day.date}
          </h3>
          <div className="space-y-4">
            {day.items.map((item) => (
              <div
                key={`${day.date}-${item.slot}`}
                className="rounded-[10px] border border-border bg-surface-inset p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>{item.slot}</Badge>
                  <span className="font-medium">{item.topic}</span>
                  <Badge variant="outline">{item.pillar}</Badge>
                  <Badge variant="secondary">{item.format}</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {PLATFORMS.map((p) => (
                    <PlatformCard key={p.key} label={p.label} pack={item[p.key]} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PlatformCard({ label, pack }: { label: string; pack: PlatformPack }) {
  const [copied, setCopied] = useState(false);
  async function copyPack() {
    const tags = pack.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    await copyText(`${pack.title}\n\n${pack.description}\n\n${tags}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{label}</p>
        <button
          type="button"
          onClick={() => void copyPack()}
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p className="text-sm font-medium">{pack.title}</p>
      <p className="mt-1 text-[12px] text-muted-foreground whitespace-pre-wrap">
        {pack.description}
      </p>
      <p className="mt-2 text-[11px] text-primary/80">
        {pack.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
      </p>
    </div>
  );
}
