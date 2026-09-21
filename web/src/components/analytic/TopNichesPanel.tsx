import { Loader2, Search, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TopNiche, TopNiches } from "@/hooks/useApi";
import { formatUsd } from "@/lib/job-cost-preview";
import { cn } from "@/lib/utils";

function Demand({ level }: { level: "alta" | "media" | "baja" }) {
  return (
    <Badge variant={level === "alta" ? "default" : "outline"} className="capitalize">
      {level}
    </Badge>
  );
}

export function TopNichesPanel({
  list,
  loading,
  error,
  onRefresh,
  onPick,
  canVivi,
}: {
  list: TopNiches | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onPick: (niche: TopNiche) => void;
  canVivi: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-primary" />
            Top 10 nichos
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Ranking para Shorts en LATAM. Elige uno para investigar canales y ganancias. Vivi puede
            reordenar el listado con señales de 2026.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading || !canVivi}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Pulir ranking con Vivi
        </Button>
      </div>
      {!canVivi ? (
        <p className="text-[12px] text-status-warning">
          Sin Vivi LLM se muestra el ranking curado. Añade VIVI_LLM_API_KEY para actualizarlo.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      {list?.warning ? (
        <p className="rounded-[10px] border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-[12px] text-status-warning">
          {list.warning}
        </p>
      ) : null}
      {loading && !list ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Cargando ranking…
        </div>
      ) : null}
      <ol className="space-y-2">
        {(list?.niches ?? []).map((n) => (
          <li key={`${n.rank}-${n.query}`}>
            <button
              type="button"
              onClick={() => onPick(n)}
              className={cn(
                "w-full rounded-xl border border-border bg-card p-3.5 text-left hover:border-primary/40",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
                  {n.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{n.name}</p>
                    <Demand level={n.demand} />
                    <span className="text-[11px] text-muted-foreground">
                      competencia {n.competition}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{n.why}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    CPM {formatUsd(n.cpmLongformUsd)} long · {formatUsd(n.cpmShortsUsd)} Shorts ·{" "}
                    {n.formats.join(" / ")}
                  </p>
                  <p className="mt-1 text-[11px] text-primary/80">{n.exampleTopics.join(" · ")}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary">
                  <Search className="size-3.5" />
                  Investigar
                </span>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
