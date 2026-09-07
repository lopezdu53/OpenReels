import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderOptions } from "@/hooks/useApi";

const DEFAULT_LLM = "deepseek-ai/deepseek-v4-flash";
const DEFAULT_IMAGE = "google/nano-banana-2-lite/text-to-image";
const DEFAULT_VIDEO = "bytedance/seedance-2.0-mini/image-to-video";
const DEFAULT_LIP = "veed/lipsync";
const DEFAULT_TTS_MODEL = "xai/tts-v1";
const DEFAULT_TTS_VOICE = "eve";

type FieldProps = { label: string; children: ReactNode };

function Field({ label, children, className }: FieldProps & { className?: string }) {
  return (
    <label className={className ?? "block"}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PriceRow({ name, price }: { name: string; price: string }) {
  return (
    <span className="flex w-full min-w-[18rem] items-center justify-between gap-4">
      <span className="truncate">{name}</span>
      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{price}</span>
    </span>
  );
}

export interface AtlasModelValues {
  llmModel: string;
  ttsModel?: string;
  ttsVoice: string;
  imageModel: string;
  videoModel: string;
  lipSyncModel: string;
}

interface AtlasModelFieldsProps {
  providers: ProviderOptions | null;
  fieldClass: string;
  showLlm?: boolean;
  showTts?: boolean;
  showImage?: boolean;
  showVideo?: boolean;
  showLipSync?: boolean;
  values: AtlasModelValues;
  onChange: (patch: Partial<AtlasModelValues>) => void;
}

export function AtlasModelFields({
  providers,
  fieldClass,
  showLlm,
  showTts,
  showImage,
  showVideo,
  showLipSync,
  values,
  onChange,
}: AtlasModelFieldsProps) {
  const llm = [...(providers?.atlasLlmModels ?? [])].sort(
    (a, b) => a.inputPer1M + a.outputPer1M - (b.inputPer1M + b.outputPer1M),
  );
  const images = [...(providers?.atlasImageModels ?? [])].sort((a, b) => a.usd - b.usd);
  const videos = [...(providers?.atlasVideoModels ?? [])].sort((a, b) => a.usd - b.usd);
  const lips = [...(providers?.atlasLipSyncModels ?? [])].sort((a, b) => a.usd - b.usd);
  const ttsModels = [...(providers?.atlasTtsModels ?? [{ id: DEFAULT_TTS_MODEL, label: "xAI TTS v1", usdPer1kChars: 0.015, priceLabel: "$0.015 / 1K chars" }])];
  const voices = providers?.atlasTtsVoices ?? [
    { id: "eve", label: "Eve — Energetic (F)" },
    { id: "ara", label: "Ara — Warm (F)" },
    { id: "leo", label: "Leo — Authoritative (M)" },
    { id: "rex", label: "Rex — Confident (M)" },
    { id: "sal", label: "Sal — Smooth (M)" },
  ];

  if (!showLlm && !showTts && !showImage && !showVideo && !showLipSync) return null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">ATLAS · modelos</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showLlm && (
          <Field label="LLM">
            <Select value={values.llmModel || DEFAULT_LLM} onValueChange={(v) => v && onChange({ llmModel: v })}>
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {llm.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow name={m.label} price={m.priceLabel ?? `$${m.inputPer1M} / $${m.outputPer1M} por 1M`} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {showTts && (
          <>
            <Field label="TTS">
              <Select value={values.ttsModel || DEFAULT_TTS_MODEL} onValueChange={(v) => v && onChange({ ttsModel: v })}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ttsModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <PriceRow name={m.label} price={m.priceLabel ?? `$${m.usdPer1kChars} / 1K chars`} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Voz TTS">
              <Select value={values.ttsVoice || DEFAULT_TTS_VOICE} onValueChange={(v) => v && onChange({ ttsVoice: v })}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
        {showImage && (
          <Field label="Imagen">
            <Select value={values.imageModel || DEFAULT_IMAGE} onValueChange={(v) => v && onChange({ imageModel: v })}>
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {images.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow name={m.label} price={m.priceLabel ?? `$${m.usd} / imagen`} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {showVideo && (
          <Field label="I2V">
            <Select value={values.videoModel || DEFAULT_VIDEO} onValueChange={(v) => v && onChange({ videoModel: v })}>
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {videos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow name={m.label} price={m.priceLabel ?? `$${m.usd} / s`} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {showLipSync && (
          <Field label="Lip-sync">
            <Select value={values.lipSyncModel || DEFAULT_LIP} onValueChange={(v) => v && onChange({ lipSyncModel: v })}>
              <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <PriceRow name="Sin lip-sync" price="$0" />
                </SelectItem>
                {lips.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <PriceRow name={m.label} price={m.priceLabel ?? `$${m.usd} / s`} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}
