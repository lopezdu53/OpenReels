import { BarChart3, BookOpen, Film, LayoutDashboard, LayoutGrid, PlusCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { StatsResponse } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { path: "/analytic", label: "Analítica", icon: BarChart3 },
  { path: "/", label: "Short", icon: PlusCircle },
  { path: "/film", label: "Film", icon: Film },
  { path: "/gallery", label: "Galería", icon: LayoutGrid },
  { path: "/learning", label: "Aprender", icon: BookOpen },
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
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t border-border bg-sidebar/95 backdrop-blur-md">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 relative",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
            {(item.path === "/" || item.path === "/film") && stats && stats.activeJobs > 0 && (
              <span className="absolute top-0.5 right-0 size-2 rounded-full bg-status-info animate-pulse" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
