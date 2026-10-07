import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderOptions } from "@/hooks/useApi";

const DEFAULT_LLM = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const DEFAULT_IMAGE = "@cf/black-forest-labs/flux-1-schnell";
const DEFAULT_TTS = "@cf/deepgram/aura-2-es";
const DEFAULT_TTS_VOICE = "aquila";

type FieldProps = { label: string; children: ReactNode };

function Field({ label, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PriceRow({ name, price, hint }: { name: string; price: string; hint?: string }) {
  return (
    <span className="flex w-full min-w-[18rem] items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {hint ? <span className="block truncate text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{price}</span>
    </span>
  );
}

export interface CloudflareModelValues {
  llmModel: string;
  ttsModel?: string;
  ttsVoice: string;
  imageModel: string;
}

interface CloudflareModelFieldsProps {
  providers: ProviderOptions | null;
  fieldClass: string;
  showLlm?: boolean;
  showTts?: boolean;
  showImage?: boolean;
  showVideo?: boolean;
  title?: string;
  values: CloudflareModelValues;
  onChange: (patch: Partial<CloudflareModelValues>) => void;
}

export function CloudflareModelFields({
  providers,
  fieldClass,
  showLlm,
  showTts,
  showImage,
  showVideo,
  title,
  values,
  onChange,
}: CloudflareModelFieldsProps) {
  const llm = [...(providers?.cloudflareLlmModels ?? [])];
  const images = [...(providers?.cloudflareImageModels ?? [])];
  const ttsModels = [...(providers?.cloudflareTtsModels ?? [])];
  const ttsModel = values.ttsModel || DEFAULT_TTS;
  const speakers =
    ttsModel.includes("-en")
      ? (providers?.cloudflareTtsSpeakersEn ?? [])
      : (providers?.cloudflareTtsSpeakersEs ?? []);

  if (!showLlm && !showTts && !showImage && !showVideo) return null;

  const heading =
    title ??
    (showTts && !showLlm && !showImage && !showVideo
      ? "Cloudflare · voz Aura"
      : "Cloudflare Workers AI");

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">{heading}</p>
      <p className="text-[11px] text-muted-foreground">
        10k neurons/día gratis, luego $0.011 / 1k neurons. Precios listados (oct 2026).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showLlm && (
          <Field label="LLM">
            <Select
              value={values.llmModel || DEFAULT_LLM}
              onValueChange={(v) => v && onChange({ llmModel: v })}
            >
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {llm.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow
                      name={m.label}
                      price={m.priceLabel ?? `$${m.inputPer1M} / $${m.outputPer1M} por 1M`}
                      hint={m.note}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {showTts && (
          <>
            <Field label="TTS">
              <Select
                value={ttsModel}
                onValueChange={(v) => {
                  if (!v) return;
                  const nextEn = v.includes("-en");
                  const list = nextEn
                    ? (providers?.cloudflareTtsSpeakersEn ?? [])
                    : (providers?.cloudflareTtsSpeakersEs ?? []);
                  const keep = list.some((s) => s.id === values.ttsVoice);
                  onChange({
                    ttsModel: v,
                    ...(!keep && list[0] ? { ttsVoice: list[0].id } : {}),
                  });
                }}
              >
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ttsModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <PriceRow
                        name={m.label}
                        price={m.priceLabel ?? `$${m.usdPer1kChars} / 1K chars`}
                        hint={m.note}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Speaker">
              <Select
                value={values.ttsVoice || DEFAULT_TTS_VOICE}
                onValueChange={(v) => v && onChange({ ttsVoice: v })}
              >
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {speakers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                      {v.gender ? ` (${v.gender === "female" ? "F" : "M"})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
        {showImage && (
          <Field label="Imagen T2I">
            <Select
              value={values.imageModel || DEFAULT_IMAGE}
              onValueChange={(v) => v && onChange({ imageModel: v })}
            >
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {images.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow
                      name={m.label}
                      price={m.priceLabel ?? `$${m.usdPerImage} / imagen`}
                      hint={m.note}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      {showVideo ? (
        <p className="text-[11px] text-amber-200/90">
          Workers AI no tiene T2V ni I2V en el catálogo. Usa Flux aquí y Atlas, gflow, fal o Grok para el clip.
        </p>
      ) : null}
    </div>
  );
}
