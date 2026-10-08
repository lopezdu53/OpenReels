import { DarkSelect } from "@/components/DarkSelect";
import type { NaraTtsProviderCatalog } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

export type HistoriaProviderOpt = {
  key: string;
  label: string;
  category: string;
  models: { id: string; label: string; note?: string }[];
  defaultModel?: string;
};

function ProviderGrid({
  label,
  providers,
  value,
  onChange,
}: {
  label: string;
  providers: HistoriaProviderOpt[];
  value: string;
  onChange: (key: string) => void;
}) {
  const grouped = new Map<string, HistoriaProviderOpt[]>();
  for (const p of providers) {
    const list = grouped.get(p.category) ?? [];
    list.push(p);
    grouped.set(p.category, list);
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      {[...grouped.entries()].map(([cat, list]) => (
        <div key={cat}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cat}</p>
          <div className="flex flex-wrap gap-1.5">
            {list.map((p) => {
              const on = p.key === value;
              return (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => onChange(p.key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[12px]",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted/50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function voicesFor(p: NaraTtsProviderCatalog | undefined, modelId: string) {
  if (!p) return [];
  const fromModel = p.models.find((m) => m.id === modelId)?.voices;
  if (fromModel?.length) return fromModel;
  if (p.key === "cloudflare-tts") {
    const en = modelId.includes("-en") || modelId.includes("aura-1") || modelId.includes("melotts");
    return p.voices.filter((v) => (en ? v.language === "en" : v.language === "es"));
  }
  return p.voices;
}

export function HistoriaEngineFields(props: {
  llmProviders: HistoriaProviderOpt[];
  imageProviders: HistoriaProviderOpt[];
  videoProviders: HistoriaProviderOpt[];
  ttsProviders: NaraTtsProviderCatalog[];
  llmProvider: string;
  onLlmProvider: (v: string) => void;
  llmModel: string;
  onLlmModel: (v: string) => void;
  ttsProvider: string;
  onTtsProvider: (v: string) => void;
  ttsModel: string;
  onTtsModel: (v: string) => void;
  voiceId: string;
  onVoiceId: (v: string) => void;
  voiceSpeed: number;
  onVoiceSpeed: (v: number) => void;
  imageProvider: string;
  onImageProvider: (v: string) => void;
  imageModel: string;
  onImageModel: (v: string) => void;
  videoProvider: string;
  onVideoProvider: (v: string) => void;
  videoModel: string;
  onVideoModel: (v: string) => void;
  showVideo: boolean;
}) {
  const llm = props.llmProviders.find((p) => p.key === props.llmProvider);
  const image = props.imageProviders.find((p) => p.key === props.imageProvider);
  const video = props.videoProviders.find((p) => p.key === props.videoProvider);
  const tts = props.ttsProviders.find((p) => p.key === props.ttsProvider);
  const ttsVoices = voicesFor(tts, props.ttsModel);

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card/50 p-4">
      <ProviderGrid
        label="LLM (guion)"
        providers={props.llmProviders}
        value={props.llmProvider}
        onChange={(key) => {
          props.onLlmProvider(key);
          const next = props.llmProviders.find((p) => p.key === key);
          if (next?.defaultModel) props.onLlmModel(next.defaultModel);
        }}
      />
      {llm && llm.models.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Modelo LLM</span>
          <DarkSelect
            className="min-w-[16rem]"
            value={props.llmModel || llm.models[0]!.id}
            onValueChange={props.onLlmModel}
            options={llm.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
          />
        </div>
      )}

      <ProviderGrid
        label="TTS (voz)"
        providers={props.ttsProviders.map((p) => ({
          key: p.key,
          label: p.label,
          category: p.category,
          models: p.models.map((m) => ({ id: m.id, label: m.label, note: m.note })),
          defaultModel: p.defaultModel,
        }))}
        value={props.ttsProvider}
        onChange={(key) => {
          props.onTtsProvider(key);
          const next = props.ttsProviders.find((p) => p.key === key);
          if (next?.defaultModel) props.onTtsModel(next.defaultModel);
          if (next?.defaultVoice) props.onVoiceId(next.defaultVoice);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {tts && tts.controls.models && tts.models.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Modelo TTS</span>
            <DarkSelect
              className="min-w-[14rem]"
              value={props.ttsModel || tts.models[0]!.id}
              onValueChange={props.onTtsModel}
              options={tts.models.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
        )}
        {ttsVoices.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Voz</span>
            <DarkSelect
              className="min-w-[14rem]"
              value={props.voiceId || ttsVoices[0]!.id}
              onValueChange={props.onVoiceId}
              options={ttsVoices.map((v) => ({ value: v.id, label: v.label }))}
            />
          </div>
        )}
        {tts?.controls.speed && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Velocidad</span>
            <DarkSelect
              value={String(props.voiceSpeed)}
              onValueChange={(v) => props.onVoiceSpeed(Number(v))}
              options={[0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((n) => ({
                value: String(n),
                label: n === 1 ? "1× normal" : n < 1 ? `${n}× lenta` : `${n}× rápida`,
              }))}
            />
          </div>
        )}
      </div>

      <ProviderGrid
        label="T2I (stills)"
        providers={props.imageProviders}
        value={props.imageProvider}
        onChange={(key) => {
          props.onImageProvider(key);
          const next = props.imageProviders.find((p) => p.key === key);
          if (next?.defaultModel) props.onImageModel(next.defaultModel);
        }}
      />
      {image && image.models.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Modelo T2I</span>
          <DarkSelect
            className="min-w-[16rem]"
            value={props.imageModel || image.models[0]!.id}
            onValueChange={props.onImageModel}
            options={image.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
          />
        </div>
      )}

      {props.showVideo && (
        <>
          <ProviderGrid
            label="I2V (plano continuo)"
            providers={props.videoProviders}
            value={props.videoProvider}
            onChange={(key) => {
              props.onVideoProvider(key);
              const next = props.videoProviders.find((p) => p.key === key);
              if (next?.defaultModel) props.onVideoModel(next.defaultModel);
            }}
          />
          {video && video.models.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Modelo I2V</span>
              <DarkSelect
                className="min-w-[16rem]"
                value={props.videoModel || video.models[0]!.id}
                onValueChange={props.onVideoModel}
                options={video.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
