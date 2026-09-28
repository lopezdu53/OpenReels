import {
  BarChart3,
  BookOpen,
  DollarSign,
  Film,
  FlaskConical,
  Newspaper,
  PersonStanding,
  Users,
  Workflow,
  Clapperboard,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  PlusCircle,
  Settings,
  Shield,
  Tv,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { StatsResponse } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

const ICONS = {
  panel: LayoutDashboard,
  analytic: BarChart3,
  canal: Tv,
  learning: BookOpen,
  short: PlusCircle,
  film: Film,
  flow: Workflow,
  vox: Newspaper,
  stickman: PersonStanding,
  casting: Users,
  historia: Clapperboard,
  gallery: LayoutGrid,
  lab: FlaskConical,
  settings: Settings,
  admin: Shield,
} as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  stats: StatsResponse | null;
}

export function Sidebar({ collapsed, onToggle, stats }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const items = visibleNav(user?.role);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/film") return location.pathname === "/film";
    if (path === "/flow") return location.pathname === "/flow";
    if (path === "/vox") return location.pathname === "/vox" || location.pathname.startsWith("/vox/");
    if (path === "/stickman")
      return location.pathname === "/stickman" || location.pathname.startsWith("/stickman/");
    if (path === "/casting") return location.pathname === "/casting";
    if (path === "/historia")
      return location.pathname === "/historia" || location.pathname.startsWith("/historia/");
    if (path === "/analytic") return location.pathname === "/analytic";
    if (path === "/canal") return location.pathname === "/canal" || location.pathname.startsWith("/canal/");
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col bg-sidebar border-r border-border transition-[width] duration-200",
        collapsed ? "w-16" : "w-[240px]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 pt-8 pb-0 transition-[padding] duration-200",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <BrandMark className="text-foreground" size={collapsed ? 22 : 26} />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-foreground">OpenReels</span>
        )}
      </div>

      <nav className={cn("mt-8 flex flex-col gap-1", collapsed ? "px-2" : "px-5")}>
        {items.map((item) => {
          const childActive = item.children?.some((c) => location.pathname.startsWith(c.path));
          const active = isActive(item.path);
          const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
          return (
            <div key={item.path}>
              <Link
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-2xl text-sm font-medium transition-colors relative",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3.5 py-2.5",
                  active
                    ? "bg-primary text-primary-foreground"
                    : childActive
                      ? "bg-sidebar-accent text-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && item.label}
                {(item.path === "/" || item.path === "/film") && stats && stats.activeJobs > 0 && (
                  <span
                    className={cn(
                      "size-2 rounded-full animate-pulse",
                      active ? "bg-primary-foreground" : "bg-primary",
                      collapsed ? "absolute top-1.5 right-1.5" : "ml-auto",
                    )}
                  />
                )}
              </Link>
              {!collapsed &&
                item.children?.map((child) => {
                  const on = location.pathname.startsWith(child.path);
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      className={cn(
                        "mt-1 ml-8 flex items-center rounded-xl px-3 py-1.5 text-[13px] font-medium",
                        on
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="flex-1" />

      {!collapsed && stats && stats.totalJobs > 0 && (
        <div className="mx-5 mb-4 rounded-2xl hf-l-border bg-surface-inset px-3.5 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Film className="size-3.5" />
            <span>
              {stats.completedJobs} video{stats.completedJobs !== 1 ? "s" : ""} creado
              {stats.completedJobs !== 1 ? "s" : ""}
            </span>
          </div>
          {stats.totalCost > 0 && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <DollarSign className="size-3.5" />
              <span>${stats.totalCost.toFixed(2)} gasto total</span>
            </div>
          )}
        </div>
      )}

      <div className={cn("border-t border-border py-3", collapsed ? "px-2" : "px-5")}>
        {!collapsed && user ? (
          <p className="mb-2 truncate text-[11px] text-muted-foreground" title={user.email}>
            {user.name}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void logout()}
          title="Salir"
          className={cn(
            "flex w-full items-center rounded-2xl text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            collapsed ? "justify-center py-2" : "gap-2 px-2 py-1.5",
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex items-center justify-center border-t border-border py-3 text-muted-foreground hover:text-foreground transition-colors",
          collapsed ? "px-0" : "px-5",
        )}
      >
        {collapsed ? (
          <PanelLeft className="size-4" />
        ) : (
          <div className="flex w-full items-center gap-2">
            <PanelLeftClose className="size-4" />
            <span className="text-xs">Contraer</span>
          </div>
        )}
      </button>
    </aside>
  );
}
