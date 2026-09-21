import { Box, MapPin, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CharacterStudio } from "@/components/film/CharacterStudio";
import { LocationStudio } from "@/components/film/LocationStudio";
import { ObjectStudio } from "@/components/film/ObjectStudio";
import {
  api,
  type LibraryCharacter,
  type LibraryLocation,
  type LibraryObject,
  type ProviderOption,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const CASTING_PROVIDERS: ProviderOption[] = [
  { key: "gflow", label: "gflow (Nano Banana)" },
  { key: "vivi", label: "VIVI" },
  { key: "gemini", label: "Google Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok Imagine" },
  { key: "runpod", label: "RunPod (público)" },
  { key: "fal", label: "fal.ai" },
  { key: "alicloud", label: "Alibaba Cloud" },
];

const TABS = [
  { path: "/casting/personajes", label: "Personajes", icon: Users },
  { path: "/casting/objetos", label: "Objetos", icon: Box },
  { path: "/casting/entornos", label: "Entornos", icon: MapPin },
] as const;

function sectionOf(pathname: string): "personajes" | "objetos" | "entornos" | "all" {
  if (pathname.startsWith("/casting/objetos")) return "objetos";
  if (pathname.startsWith("/casting/entornos")) return "entornos";
  if (pathname.startsWith("/casting/personajes")) return "personajes";
  return "all";
}

export function CastingPage() {
  const location = useLocation();
  const section = sectionOf(location.pathname);
  const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
  const [objects, setObjects] = useState<LibraryObject[]>([]);
  const [locations, setLocations] = useState<LibraryLocation[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.listCharacters(), api.listObjects(), api.listLocations()])
      .then(([c, o, l]) => {
        setCharacters(c.characters);
        setObjects(o.objects);
        setLocations(l.locations);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const showPeople = section === "all" || section === "personajes";
  const showObjects = section === "all" || section === "objetos";
  const showPlaces = section === "all" || section === "entornos";

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Casting
          </p>
          <h1 className="flex items-center gap-2 text-3xl sm:text-5xl font-bold uppercase tracking-tight">
            <Users className="size-8 text-primary" />
            Casting
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Personajes, objetos y entornos de la biblioteca. Las fichas se generan con gflow (Nano
            Banana). Nueva Historia los carga en vez de palitos.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const on = location.pathname.startsWith(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="size-3.5" />
                {tab.label}
              </Link>
            );
          })}
          <Link
            to="/historia"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="size-3.5" />
            Nueva Historia
          </Link>
        </nav>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showPeople ? (
          <CharacterStudio
            characters={characters}
            selectedIds={characterIds}
            maxSelect={80}
            title="Personajes"
            subtitle="Fichas 16:9 generadas con gflow. Reutilízalas en Nueva Historia y Nuevo Film."
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setCharacterIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              );
            }}
            onSave={async (body) => {
              const { character } = body.id
                ? await api.updateCharacter(String(body.id), body)
                : await api.saveCharacter(body);
              setCharacters((prev) => {
                const rest = prev.filter((c) => c.id !== character.id);
                return [character, ...rest];
              });
            }}
            onDelete={async (id) => {
              await api.deleteCharacter(id);
              setCharacters((prev) => prev.filter((c) => c.id !== id));
              setCharacterIds((prev) => prev.filter((x) => x !== id));
            }}
          />
        ) : null}

        {showObjects ? (
          <ObjectStudio
            objects={objects}
            selectedIds={objectIds}
            maxSelect={80}
            title="Objetos"
            subtitle="Tableros de props generados con gflow. Nueva Historia los carga en el plano."
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setObjectIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              );
            }}
            onSave={async (body) => {
              const { object } = body.id
                ? await api.updateObject(String(body.id), body)
                : await api.saveObject(body);
              setObjects((prev) => {
                const rest = prev.filter((o) => o.id !== object.id);
                return [object, ...rest];
              });
            }}
            onDelete={async (id) => {
              await api.deleteObject(id);
              setObjects((prev) => prev.filter((o) => o.id !== id));
              setObjectIds((prev) => prev.filter((x) => x !== id));
            }}
          />
        ) : null}

        {showPlaces ? (
          <LocationStudio
            locations={locations}
            selectedIds={locationIds}
            maxSelect={80}
            title="Entornos"
            subtitle="Tableros de locación generados con gflow. Un lugar por plano."
            imageProviders={CASTING_PROVIDERS}
            defaultSheetProvider="gflow"
            onToggle={(id) => {
              setLocationIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              );
            }}
            onSave={async (body) => {
              const { location } = body.id
                ? await api.updateLocation(String(body.id), body)
                : await api.saveLocation(body);
              setLocations((prev) => {
                const rest = prev.filter((l) => l.id !== location.id);
                return [location, ...rest];
              });
            }}
            onDelete={async (id) => {
              await api.deleteLocation(id);
              setLocations((prev) => prev.filter((l) => l.id !== id));
              setLocationIds((prev) => prev.filter((x) => x !== id));
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
