export type StudioRole = "admin" | "user";

/** Routes a created (non-admin) user can open. Superadmin keeps the full studio. */
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
