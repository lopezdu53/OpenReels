import { Clapperboard, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilmCastMode = "scene" | "hero";

interface Props {
  value: FilmCastMode;
  onChange: (mode: FilmCastMode) => void;
}

const OPTIONS: {
  id: FilmCastMode;
  icon: typeof User;
  title: string;
  body: string;
}[] = [
  {
    id: "scene",
    icon: Clapperboard,
    title: "Modo Escena",
    body: "Solo en cuadro quien nombra la locución. Puede haber planos de lugar o atmósfera vacíos.",
  },
  {
    id: "hero",
    icon: User,
    title: "Modo Héroe",
    body: "Plano continuo: la cámara sigue al primer personaje; el mundo se pega o se desplaza a su cuerpo. Todas las escenas IA se animan.",
  },
];

export function CastModePicker({ value, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
          Cámara
        </p>
        <p className="text-sm font-medium">Cómo se usa el elenco en cada plano</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const on = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                on ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  on ? "bg-primary text-primary-foreground" : "bg-surface-inset text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{opt.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{opt.body}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
