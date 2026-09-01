import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  KOKORO_DEFAULT_CONNECT_MIX,
  KOKORO_SPANISH_MIX_PRESETS,
  parseKokoroVoiceSpec,
  serializeKokoroVoiceSpec,
} from "@/lib/kokoro-voice";
import type { VoiceOption } from "@/hooks/useApi";

const SPANISH_IDS = ["ef_dora", "em_alex", "em_santa"] as const;

interface KokoroVoiceMixerProps {
  voices: VoiceOption[];
  value: string;
  onChange: (spec: string) => void;
  speed: number;
  onSpeedChange: (n: number) => void;
}

export function KokoroVoiceMixer({ voices, value, onChange, speed, onSpeedChange }: KokoroVoiceMixerProps) {
  const spanish = voices.filter((v) => v.language === "es");
  const englishUs = voices.filter((v) => v.language === "en-us");
  const englishUk = voices.filter((v) => v.language === "en-gb");
  const isSpanish = value.startsWith("e") || SPANISH_IDS.some((id) => value.includes(id));

  const mix = useMemo(() => {
    const weights: Record<string, number> = { ef_dora: 0, em_alex: 0, em_santa: 0 };
    const parts = parseKokoroVoiceSpec(value);
    for (const part of parts) {
      if (part.id in weights) weights[part.id] = part.weight;
    }
    if (parts.length === 1 && !(parts[0]!.id in weights)) {
      weights.ef_dora = 100;
    }
    return weights;
  }, [value]);

  const setMix = (id: string, weight: number) => {
    const next = { ...mix, [id]: weight };
    onChange(
      serializeKokoroVoiceSpec(
        SPANISH_IDS.map((vid) => ({ id: vid, weight: next[vid] ?? 0 })),
      ),
    );
  };

  const applyPreset = (spec: string, presetSpeed: number) => {
    onChange(spec);
    onSpeedChange(presetSpeed);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Voz base</label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={value.includes("+") ? "__mix__" : value}
            onChange={(e) => {
              if (e.target.value === "__mix__") {
                applyPreset(KOKORO_DEFAULT_CONNECT_MIX, 1.1);
                return;
              }
              onChange(e.target.value);
            }}
          >
            <optgroup label="Español">
              {spanish.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
              <option value="__mix__">Personalizada (mezcla Dora / Alex / Santa)</option>
            </optgroup>
            <optgroup label="English US">
              {englishUs.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
            <optgroup label="English UK">
              {englishUk.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Velocidad: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min={0.7}
            max={1.5}
            step={0.1}
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="w-full accent-primary mt-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>0.7x lento</span><span>1.0x</span><span>1.5x rápido</span>
          </div>
        </div>
      </div>

      {(isSpanish && value.includes("+")) && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Mezcla de voz en español</p>
            <p className="text-[11px] text-muted-foreground">
              Combina los tres presets oficiales. No clona una persona: interpola Dora, Alex y Santa.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {KOKORO_SPANISH_MIX_PRESETS.map((preset) => {
              const active = value === preset.spec;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.spec, preset.speed)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-left",
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-text-subtle hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <span className="block text-[11px] font-semibold leading-tight">{preset.label}</span>
                  <span className="block text-[9px] opacity-80">{preset.hint}</span>
                </button>
              );
            })}
          </div>
          {spanish.map((v) => (
            <div key={v.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-foreground">{v.label}</span>
                <span className="tabular-nums text-muted-foreground">{Math.round(mix[v.id] ?? 0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={mix[v.id] ?? 0}
                onChange={(e) => setMix(v.id, Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground font-mono">{value}</p>
        </div>
      )}

      {isSpanish && !value.includes("+") && (
        <button
          type="button"
          onClick={() => applyPreset(KOKORO_DEFAULT_CONNECT_MIX, 1.1)}
          className="text-xs text-primary hover:underline"
        >
          Mezcla recomendada para conectar (Dora 60 / Alex 30 / Santa 10)
        </button>
      )}
    </div>
  );
}
