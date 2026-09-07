const STOCK_TYPES = new Set(["stock_image", "stock_video"]);

export interface ResolveAllowedVisualTypesOpts {
  requested?: string[];
  videoEnabled: boolean;
  stockEnabled: boolean;
  /** Film (YouTube horizontal) never uses title cards. */
  forbidTextCard?: boolean;
}

/**
 * Constrain the director's visual-type palette to providers that actually exist.
 *
 * - `ai_video` is dropped when no video providers are configured.
 * - `stock_image` / `stock_video` are dropped when Pexels/Pixabay keys are missing,
 *   so the director cannot request scenes that would render as blank frames.
 * - `text_card` is dropped when `forbidTextCard` (Nuevo Film).
 * - Returns `undefined` when the caller didn't restrict types and stock is available,
 *   so the director keeps its built-in default mix.
 */
export function resolveAllowedVisualTypes(
  opts: ResolveAllowedVisualTypesOpts,
): string[] | undefined {
  const filterUnavailable = (types: string[]): string[] =>
    types.filter((t) => {
      if (t === "ai_video" && !opts.videoEnabled) return false;
      if (STOCK_TYPES.has(t) && !opts.stockEnabled) return false;
      if (t === "text_card" && opts.forbidTextCard) return false;
      return true;
    });

  const fallback = (): string[] => {
    const types = opts.videoEnabled ? ["ai_image", "text_card", "ai_video"] : ["ai_image", "text_card"];
    const next = filterUnavailable(types);
    return next.length ? next : ["ai_image"];
  };

  if (opts.requested && opts.requested.length > 0) {
    const filtered = filterUnavailable(opts.requested);
    return filtered.length > 0 ? filtered : fallback();
  }

  if (!opts.stockEnabled) return fallback();

  if (opts.forbidTextCard) {
    return filterUnavailable([
      "ai_image",
      "stock_image",
      "stock_video",
      "text_card",
      ...(opts.videoEnabled ? ["ai_video"] : []),
    ]);
  }

  return undefined;
}
