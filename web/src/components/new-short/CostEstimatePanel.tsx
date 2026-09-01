import { DollarSign } from "lucide-react";
import { formatCop, formatUsd, type JobCostPreview } from "@/lib/job-cost-preview";
import { formatViviRateNote } from "@/lib/vivi-prices";

interface CostEstimatePanelProps {
  preview: JobCostPreview;
  usdToCop: number;
  rateNote: string;
  dryRun?: boolean;
  usesVivi?: boolean;
}

export function CostEstimatePanel({ preview, usdToCop, rateNote, dryRun, usesVivi }: CostEstimatePanelProps) {
  const cop = preview.totalUsd * usdToCop;
  const maxLine = Math.max(...preview.lines.map((l) => l.usd), 0.001);

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 via-card to-card p-5 shadow-glow-sm shadow-primary/20">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <DollarSign className="size-4" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
            Resumen de precio
          </p>
          <p className="text-[11px] text-muted-foreground">Según APIs y tipos visuales</p>
        </div>
      </div>

      {dryRun ? (
        <p className="mb-4 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          Dry run: no se generan medios ni render. Costo real ≈ $0.
        </p>
      ) : null}

      {usesVivi && !dryRun ? (
        <p className="mb-4 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] text-muted-foreground">
          {formatViviRateNote()}. LLM ¥3/¥15 por 1M tokens; imagen ¥0.15/call.
        </p>
      ) : null}

      <div className="mb-4 flex items-end gap-3 flex-wrap">
        <div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{formatUsd(preview.totalUsd)}</p>
          <p className="text-[11px] text-muted-foreground">USD estimado</p>
        </div>
        <div className="mb-1 h-8 w-px bg-border" />
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-status-success">
            {formatCop(cop)}
          </p>
          <p className="text-[11px] text-muted-foreground">COP · {rateNote}</p>
        </div>
      </div>

      <ul className="space-y-3">
        {preview.lines.map((line) => (
          <li key={line.id}>
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{line.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{line.detail}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums font-medium">{formatUsd(line.usd)}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {formatCop(line.usd * usdToCop)}
                </p>
              </div>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.max(2, (line.usd / maxLine) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
        ~{preview.sceneCount} escenas · {preview.aiImages} imágenes IA
        {preview.aiVideos > 0 ? ` · ${preview.aiVideos} videos IA` : ""}.
        El director puede usar stock o text cards y bajar el costo real. Tarifas editables en Settings / API Lab.
      </p>
    </div>
  );
}
