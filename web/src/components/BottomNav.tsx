import { BarChart3, Film, LayoutDashboard, LayoutGrid, Newspaper, PersonStanding, Sparkles, Workflow } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { StatsResponse } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { path: string; label: string; icon: typeof LayoutDashboard; cta?: boolean }[] = [
  { path: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { path: "/analytic", label: "Analítica", icon: BarChart3 },
  { path: "/", label: "Short", icon: Sparkles, cta: true },
  { path: "/film", label: "Film", icon: Film },
  { path: "/flow", label: "Flow", icon: Workflow },
  { path: "/vox", label: "Vox", icon: Newspaper },
  { path: "/stickman", label: "Stickman", icon: PersonStanding },
  { path: "/gallery", label: "Galería", icon: LayoutGrid },
];

interface BottomNavProps {
  stats: StatsResponse | null;
}

export function BottomNav({ stats }: BottomNavProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-white/8 bg-black/80 px-1 backdrop-blur-xl">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        const cta = Boolean(item.cta);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-1.5 py-1",
              cta
                ? "text-primary-foreground"
                : active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {cta ? (
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow-sm shadow-primary/50",
                  active && "ring-2 ring-primary ring-offset-2 ring-offset-black",
                )}
              >
                <item.icon className="size-5" />
              </span>
            ) : (
              <item.icon className="size-5" />
            )}
            <span className={cn("text-[10px] font-medium", cta && "text-primary")}>{item.label}</span>
            {(item.path === "/" || item.path === "/film") && stats && stats.activeJobs > 0 && (
              <span className="absolute top-0.5 right-0 size-2 rounded-full bg-primary animate-pulse" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
