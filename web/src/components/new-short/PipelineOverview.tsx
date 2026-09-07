import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineOverviewStep {
  id: string;
  n: number;
  title: string;
  hint: string;
  icon: LucideIcon;
}

interface PipelineOverviewProps {
  steps: PipelineOverviewStep[];
}

export function PipelineOverview({ steps }: PipelineOverviewProps) {
  return (
    <nav aria-label="Etapas del pipeline" className="mb-8 overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-0">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.id} className="flex items-center">
              <a
                href={`#${step.id}`}
                className="group flex min-w-[140px] items-center gap-3 rounded-2xl border border-border/80 bg-card/70 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[1.4px] text-primary">
                    {String(step.n).padStart(2, "0")}
                  </span>
                  <span className="block truncate text-sm font-semibold leading-tight">{step.title}</span>
                  <span className="hidden sm:block truncate text-[10px] text-muted-foreground">{step.hint}</span>
                </span>
              </a>
              {i < steps.length - 1 && (
                <ChevronRight
                  className={cn("mx-1.5 size-4 shrink-0 text-muted-foreground/50")}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
