import type { AuthUser } from "@/hooks/useApi";

export type StudioRole = "admin" | "user";

export const CREATOR_PATH_PREFIXES = [
  "/dashboard",
  "/analytic",
  "/learning",
  "/casting",
  "/historia",
  "/lab",
  "/canal",
] as const;

export function canAccessPath(role: StudioRole | undefined, pathname: string): boolean {
  if (role === "admin") return true;
  const path = pathname.split("?")[0] ?? pathname;
  if (path.startsWith("/analytic/cronograma")) return true;
  if (path.startsWith("/jobs/")) return true;
  return CREATOR_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export type NavChild = { path: string; label: string };

export type NavItem = {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  studioOnly?: boolean;
  children?: NavChild[];
};

export const STUDIO_NAV: NavItem[] = [
  { path: "/dashboard", label: "Panel", icon: "panel" },
  { path: "/analytic", label: "Analítica", icon: "analytic" },
  { path: "/canal", label: "Mi Canal", icon: "canal" },
  { path: "/learning", label: "Aprendizaje", icon: "learning" },
  { path: "/", label: "Nuevo Short", icon: "short", studioOnly: true },
  { path: "/film", label: "Nuevo Film", icon: "film", studioOnly: true },
  { path: "/flow", label: "Nuevo Flow", icon: "flow", studioOnly: true },
  { path: "/vox", label: "Nuevo Vox", icon: "vox", studioOnly: true },
  { path: "/stickman", label: "Nuevo Stickman", icon: "stickman", studioOnly: true },
  {
    path: "/casting",
    label: "Casting",
    icon: "casting",
    children: [
      { path: "/casting/personajes", label: "Personajes" },
      { path: "/casting/objetos", label: "Objetos" },
      { path: "/casting/entornos", label: "Entornos" },
    ],
  },
  { path: "/historia", label: "Nueva Historia", icon: "historia" },
  { path: "/gallery", label: "Galería", icon: "gallery", studioOnly: true },
  { path: "/lab", label: "API Lab", icon: "lab" },
  { path: "/settings", label: "Ajustes", icon: "settings", studioOnly: true },
  { path: "/admin", label: "Admin", icon: "admin", adminOnly: true },
];

export function visibleNav(role: StudioRole | undefined): NavItem[] {
  const admin = role === "admin";
  return STUDIO_NAV.filter((item) => {
    if (item.adminOnly) return admin;
    if (item.studioOnly) return admin;
    return true;
  });
}

export function navRole(user: AuthUser | null | undefined): StudioRole | undefined {
  return user?.role;
}
