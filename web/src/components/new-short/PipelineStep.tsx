import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStepProps {
  step: number;
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: ReactNode;
  last?: boolean;
}

export function PipelineStep({
  step,
  id,
  title,
  subtitle,
  icon: Icon,
  children,
  last,
}: PipelineStepProps) {
  return (
    <section id={id} className="relative grid grid-cols-[auto_1fr] gap-x-4 scroll-mt-8">
      <div className="flex flex-col items-center">
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/35 text-primary shadow-glow-sm shadow-primary/20">
          <Icon className="size-5" />
          <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {step}
          </span>
        </div>
        {!last && (
          <div className="mt-2 w-px flex-1 min-h-[24px] bg-gradient-to-b from-primary/50 via-primary/15 to-border" />
        )}
      </div>
      <div className={cn("min-w-0 pb-10", last && "pb-0")}>
        <div className="mb-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[1.8px] text-primary">
              Paso {String(step).padStart(2, "0")}
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-border/90 bg-gradient-to-b from-card to-card/60 p-4 sm:p-5 shadow-sm ring-1 ring-white/4">
          {children}
        </div>
      </div>
    </section>
  );
}
