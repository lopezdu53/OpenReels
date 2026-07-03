export interface AtelierStyle {
  id: string;
  label: string;
  artStyle: string;
}

export const ATELIER_STYLES: AtelierStyle[] = [
  { id: "cyberpunk",   label: "Cyberpunk / Neón",    artStyle: "Cinematic neon-noir, teal-magenta palette, volumetric rain and fog, soft bloom, anamorphic lens, shallow depth of field, film grain" },
  { id: "filmic",      label: "Cine realista",        artStyle: "Filmic realism, natural lighting, soft bokeh, 35mm lens, muted colors, subtle grain" },
  { id: "watercolor",  label: "Acuarela",             artStyle: "Watercolor illustration, soft edges, pastel palette, paper texture, gentle gradients" },
  { id: "anime",       label: "Anime",                artStyle: "Anime cinematic style, vibrant colors, clean lines, dramatic lighting, expressive characters" },
  { id: "noir",        label: "Cine negro (B/N)",     artStyle: "Black and white film noir, high contrast, strong shadows, rim lighting, grainy texture" },
  { id: "ghibli",      label: "Estilo Ghibli",        artStyle: "Studio Ghibli style, hand-painted backgrounds, soft lighting, whimsical atmosphere, lush nature, dreamy clouds" },
  { id: "oilpainting", label: "Óleo",                 artStyle: "Classical oil painting style, rich textures, dramatic chiaroscuro lighting, Renaissance composition, visible brushstrokes" },
  { id: "pixar",       label: "Pixar 3D",             artStyle: "Pixar 3D animation style, vibrant saturated colors, soft global illumination, expressive characters, detailed textures" },
  { id: "inkwash",     label: "Tinta china",          artStyle: "Chinese ink wash painting, minimalist composition, flowing brushstrokes, misty mountains, traditional aesthetics, monochrome with subtle color accents" },
  { id: "scifi",       label: "Ciencia ficción",      artStyle: "Futuristic sci-fi, sleek metallic surfaces, holographic displays, blue and orange color scheme, epic scale, lens flares" },
  { id: "fantasy",     label: "Fantasía mágica",      artStyle: "Epic fantasy style, magical glowing elements, dramatic lighting, mythical creatures, rich jewel tones, cinematic composition" },
  { id: "retro",       label: "Retro / Vintage",      artStyle: "Vintage retro aesthetic, warm sepia tones, film grain, light leaks, 1970s color palette, nostalgic mood" },
  { id: "comic",       label: "Cómic americano",      artStyle: "American comic book style, bold outlines, halftone dots, dynamic action poses, vibrant primary colors, dramatic shadows" },
  { id: "minimalist",  label: "Minimalista",          artStyle: "Minimalist design, clean geometric shapes, limited color palette, negative space, modern aesthetics, subtle gradients" },
  { id: "steampunk",   label: "Steampunk",            artStyle: "Steampunk aesthetic, brass and copper machinery, Victorian architecture, gears and clockwork, warm amber lighting, industrial fog" },
];
