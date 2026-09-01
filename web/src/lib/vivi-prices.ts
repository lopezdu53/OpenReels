/** Recarga Vivi (Alipay): 20 CNY = $2.98 USD. El dashboard cobra en ¥ (⚡). */
export const VIVI_TOPUP_CNY = 20;
export const VIVI_TOPUP_USD = 2.98;
export const USD_PER_CNY = VIVI_TOPUP_USD / VIVI_TOPUP_CNY;

/** Claude special: ⚡ 3 / ⚡ 15 por 1M tokens (entrada / salida). */
export const VIVI_LLM_CNY = { inputPer1M: 3, outputPer1M: 15 };

/** gemini-3.1-flash-image-preview: ⚡ 0.15 por imagen (listado). 0.9x nanobanana → 0.135. */
export const VIVI_IMAGE_CNY = { perImage: 0.15 };

export function yuanToUsd(cny: number): number {
  return cny * USD_PER_CNY;
}

export function formatViviRateNote(): string {
  return `Vivi: ${VIVI_TOPUP_CNY} ¥ = $${VIVI_TOPUP_USD.toFixed(2)} USD`;
}
