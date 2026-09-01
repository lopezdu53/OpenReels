import { useCallback, useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Loader2, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type StatsResponse } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { AuthPage } from "@/pages/AuthPage";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

const COLLAPSED_KEY = "openreels_sidebar_collapsed";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function Layout() {
  const { user, ready, logout } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setStats(null);
      return;
    }
    let active = true;
    const load = () => {
      api
        .getStats()
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" />
        Cargando…
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (!isDesktop) {
    return (
      <div className="flex min-h-screen flex-col pb-14">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <div className="flex items-center gap-1">
            <Link
              to="/settings"
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              aria-label="Salir"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <BottomNav stats={stats} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} stats={stats} />

      <main
        className={cn(
          "flex-1 transition-[margin-left] duration-200",
          collapsed ? "ml-16" : "ml-[240px]",
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
