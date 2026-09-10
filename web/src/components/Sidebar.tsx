import {
  BarChart3,
  BookOpen,
  DollarSign,
  Film,
  FlaskConical,
  Newspaper,
  PersonStanding,
  Workflow,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  PlusCircle,
  Settings,
  Shield,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { StatsResponse } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

const NAV_ITEMS: {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  admin?: boolean;
  children?: { path: string; label: string }[];
}[] = [
    { path: "/dashboard", label: "Panel", icon: LayoutDashboard },
    {
      path: "/analytic",
      label: "Analítica",
      icon: BarChart3,
      children: [{ path: "/analytic/cronograma", label: "Cronograma" }],
    },
    { path: "/learning", label: "Aprendizaje", icon: BookOpen },
    { path: "/", label: "Nuevo Short", icon: PlusCircle },
    { path: "/film", label: "Nuevo Film", icon: Film },
    { path: "/flow", label: "Nuevo Flow", icon: Workflow },
    { path: "/vox", label: "Nuevo Vox", icon: Newspaper },
    { path: "/stickman", label: "Nuevo Stickman", icon: PersonStanding },
    { path: "/gallery", label: "Galería", icon: LayoutGrid },
    { path: "/lab", label: "API Lab", icon: FlaskConical },
    { path: "/settings", label: "Ajustes", icon: Settings },
    { path: "/admin", label: "Admin", icon: Shield, admin: true },
  ];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  stats: StatsResponse | null;
}

export function Sidebar({ collapsed, onToggle, stats }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/film") return location.pathname === "/film";
    if (path === "/flow") return location.pathname === "/flow";
    if (path === "/vox") return location.pathname === "/vox" || location.pathname.startsWith("/vox/");
    if (path === "/stickman") return location.pathname === "/stickman" || location.pathname.startsWith("/stickman/");
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
        {NAV_ITEMS.filter((item) => !item.admin || user?.role === "admin").map((item) => {
          const childActive = item.children?.some((c) => location.pathname.startsWith(c.path));
          const active = item.path === "/analytic" ? location.pathname === "/analytic" : isActive(item.path);
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
                <item.icon className="size-5 shrink-0" />
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
