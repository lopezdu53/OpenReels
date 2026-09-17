import { Palette, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilmLookOption {
  id: string;
  label: string;
  mood: string;
}

export interface FilmArcOption {
  id: string;
  label: string;
  when: string;
  hint: string;
}

export const FALLBACK_FILM_LOOKS: FilmLookOption[] = [
  { id: "3d-toon", label: "3D toon", mood: "animación estilizada" },
  { id: "clay", label: "Clay", mood: "plastilina" },
  { id: "anime", label: "Anime", mood: "cine 2D" },
  { id: "documentary", label: "Documental", mood: "cine realista" },
  { id: "noir", label: "Noir", mood: "alto contraste" },
  { id: "isometric", label: "Isométrico", mood: "diorama" },
  { id: "paper-craft", label: "Papel", mood: "recortes 3D" },
];

export const FALLBACK_FILM_ARCS: FilmArcOption[] = [
  {
    id: "joke_punchline",
    label: "Chiste → punchline",
    when: "humor rápido",
    hint: "Abre con un gancho y cierra con el chiste. Para temas cortos, memes o un solo gag.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "explicar un proceso",
    hint: "Explica un proceso paso a paso: qué es, cómo va y el resultado.",
  },
  {
    id: "vs_debate",
    label: "Cara a cara",
    when: "dos ideas chocan",
    hint: "Dos posturas se contradicen: una dice A, la otra B. El héroe o el elenco las encarna.",
  },
  {
    id: "listicle",
    label: "Lista",
    when: "N puntos",
    hint: "Promete N puntos y los recorre uno a uno (tips, ranking, errores).",
  },
  {
    id: "origin",
    label: "Origen",
    when: "de dónde sale algo",
    hint: "Cuenta de dónde nace algo: el antes, el salto y cómo quedó hoy.",
  },
  {
    id: "warning",
    label: "Advertencia",
    when: "un error común",
    hint: "Señala un error común, por qué duele y cómo no caer.",
  },
];

interface Props {
  looks?: FilmLookOption[];
  arcs?: FilmArcOption[];
  lookId: string;
  arcId: string;
  onLook: (id: string) => void;
  onArc: (id: string) => void;
}

export function DirectorKitPicker({ looks, arcs, lookId, arcId, onLook, onArc }: Props) {
  const lookOptions = looks?.length ? looks : FALLBACK_FILM_LOOKS;
  const arcOptions = arcs?.length ? arcs : FALLBACK_FILM_ARCS;
  const selectedArc = arcOptions.find((arc) => arc.id === arcId);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
          Director cinético
        </p>
        <p className="text-sm font-medium">Look de diseño y arco — no es Stickman</p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          El personaje queda bloqueado (cara, cuerpo, ropa). El mundo y los props morphan. Nunca
          palitos.
        </p>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Palette className="size-3.5" />
          Look
        </p>
        <div className="flex flex-wrap gap-1.5">
          {lookOptions.map((item) => {
            const on = lookId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onLook(item.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {item.label}
                <span className="ml-1 opacity-60">· {item.mood}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          Arco narrativo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {arcOptions.map((item) => {
            const on = arcId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onArc(item.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {selectedArc ? (
          <p className="max-w-2xl text-[12px] leading-snug text-muted-foreground">
            {selectedArc.hint}
          </p>
        ) : null}
      </div>
    </section>
  );
}
