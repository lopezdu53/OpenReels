const STOCK_TYPES = new Set(["stock_image", "stock_video"]);

export interface ResolveAllowedVisualTypesOpts {
  requested?: string[];
  videoEnabled: boolean;
  stockEnabled: boolean;
}

/**
 * Constrain the director's visual-type palette to providers that actually exist.
 *
 * - `ai_video` is dropped when no video providers are configured.
 * - `stock_image` / `stock_video` are dropped when Pexels/Pixabay keys are missing,
 *   so the director cannot request stock scenes that would render as blank frames.
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
      return true;
    });

  if (opts.requested && opts.requested.length > 0) {
    const filtered = filterUnavailable(opts.requested);
    if (filtered.length > 0) return filtered;
    return opts.videoEnabled ? ["ai_image", "text_card", "ai_video"] : ["ai_image", "text_card"];
  }

  if (!opts.stockEnabled) {
    return opts.videoEnabled
      ? ["ai_image", "text_card", "ai_video"]
      : ["ai_image", "text_card"];
  }

  return undefined;
}
