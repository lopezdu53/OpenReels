import { BarChart3, CalendarDays } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const ITEMS = [
  { path: "/analytic", label: "Mercado", icon: BarChart3, exact: true },
  { path: "/analytic/cronograma", label: "Cronograma", icon: CalendarDays, exact: false },
];

export function AnalyticsSubnav() {
  const { pathname } = useLocation();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.path : pathname.startsWith(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
