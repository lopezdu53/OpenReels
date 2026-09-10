/** Best publish windows for YouTube Shorts in Spanish LATAM (local time). */

export type Demand = "alta" | "media" | "baja";

export interface PublishSlot {
  hour: number;
  minute: number;
  label: string;
  score: number;
  why: string;
}

export const LATAM_TIMEZONES = [
  { id: "America/Mexico_City", label: "México (CDMX)" },
  { id: "America/Bogota", label: "Colombia" },
  { id: "America/Lima", label: "Perú" },
  { id: "America/Guayaquil", label: "Ecuador" },
  { id: "America/Santiago", label: "Chile" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { id: "America/Caracas", label: "Venezuela" },
  { id: "America/La_Paz", label: "Bolivia" },
  { id: "America/Asuncion", label: "Paraguay" },
  { id: "America/Montevideo", label: "Uruguay" },
  { id: "America/Santo_Domingo", label: "Rep. Dominicana" },
  { id: "America/Puerto_Rico", label: "Puerto Rico" },
] as const;

const WEEKDAY: PublishSlot[] = [
  { hour: 7, minute: 0, label: "Commute mañana", score: 64, why: "Trayecto al trabajo/estudio, scroll corto." },
  { hour: 12, minute: 15, label: "Hora de comida", score: 80, why: "Pausa del mediodía; Shorts de 30–45s rinden." },
  { hour: 18, minute: 0, label: "Salida del trabajo", score: 88, why: "Segundo pico de sesión móvil en LATAM." },
  { hour: 20, minute: 0, label: "Prime noche", score: 96, why: "Máxima retención y comentarios en Shorts ES." },
  { hour: 21, minute: 30, label: "Prime+1", score: 90, why: "Quien llegó tarde al prime; buen hueco vs. TV." },
];

const WEEKEND: PublishSlot[] = [
  { hour: 10, minute: 0, label: "Brunch", score: 78, why: "Desayuno tardío; menos competencia que el prime." },
  { hour: 13, minute: 0, label: "Mediodía", score: 84, why: "Scroll de sobremesa, alto share a WhatsApp." },
  { hour: 19, minute: 0, label: "Noche fin de semana", score: 93, why: "Familia + móvil; mejor para series y hooks." },
  { hour: 21, minute: 0, label: "Prime fin de semana", score: 91, why: "Cierra el día; bueno para cliffhangers." },
];

export function isWeekend(dateIso: string): boolean {
  const day = new Date(`${dateIso}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

export function slotsForDate(dateIso: string): PublishSlot[] {
  return isWeekend(dateIso) ? WEEKEND : WEEKDAY;
}

export function bestSlot(dateIso: string): PublishSlot {
  const slots = slotsForDate(dateIso);
  return slots.reduce((a, b) => (b.score > a.score ? b : a));
}

export function formatTime(slot: PublishSlot): string {
  return `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
}

export function weeklyHeatmap(timezone: string): { weekday: string; slots: PublishSlot[] }[] {
  void timezone;
  const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  return names.map((weekday, i) => ({
    weekday,
    slots: i >= 5 ? WEEKEND : WEEKDAY,
  }));
}
