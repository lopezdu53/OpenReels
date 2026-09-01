/**
 * Tarifas Vivi (https://api.viviai.cc/pricing, GET /api/pricing).
 * Recarga Alipay: 20 CNY = $2.98 USD. El ⚡ del dashboard es yuan.
 *
 * Grupos: claude特价 ratio 1 · nanobanana 0.9 · grok分组 1
 * Token-based: Input¥ = model_ratio × group_ratio × 2
 *               Output¥ = Input¥ × completion_ratio
 * Per-request:  ¥ = model_price × group_ratio
 */
export const VIVI_PRICING_URL = "https://api.viviai.cc/pricing";

export const VIVI_TOPUP_CNY = 20;
export const VIVI_TOPUP_USD = 2.98;
export const USD_PER_CNY = VIVI_TOPUP_USD / VIVI_TOPUP_CNY;

/** claude-sonnet-4-6 en grupo claude特价: ratio 1.5 × 2 = ¥3 / ¥15 por 1M. */
export const VIVI_LLM_CNY = { inputPer1M: 3, outputPer1M: 15 };

/** gemini-3.1-flash-image-preview: listado ¥0.15; nanobanana 0.9x → ¥0.135. */
export const VIVI_IMAGE_LIST_CNY = 0.15;
export const VIVI_NANOBANANA_RATIO = 0.9;
export const VIVI_IMAGE_CNY = {
  perImage: VIVI_IMAGE_LIST_CNY * VIVI_NANOBANANA_RATIO,
};

/** grok-video-3: ¥0.30 por clip (no por segundo). */
export const VIVI_VIDEO_CNY = { perClip: 0.3 };
export const VIVI_VIDEO_CLIP_SECONDS = 6;

export function yuanToUsd(cny: number): number {
  return cny * USD_PER_CNY;
}

export function formatViviRateNote(): string {
  return `Vivi: ${VIVI_TOPUP_CNY} ¥ = $${VIVI_TOPUP_USD.toFixed(2)} USD`;
}
