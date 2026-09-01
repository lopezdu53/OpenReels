import { z } from "zod";

export const platformPackSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()).max(12),
});

export const strategySchema = z.object({
  channelName: z.string(),
  tagline: z.string(),
  positioning: z.string(),
  targetAudience: z.string(),
  voiceTone: z.string(),
  contentPillars: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        exampleTopics: z.array(z.string()).max(5),
      }),
    )
    .min(3)
    .max(6),
  differentiation: z.array(z.string()).max(8),
  monetization: z.object({
    youtube: z.string(),
    tiktok: z.string(),
    facebook: z.string(),
    bilibili: z.string(),
  }),
  firstMonthFocus: z.string(),
  postingCadence: z.string(),
});

export const calendarItemSchema = z.object({
  slot: z.number().int().min(1),
  topic: z.string(),
  pillar: z.string(),
  format: z.enum(["short", "long"]),
  youtube: platformPackSchema,
  tiktok: platformPackSchema,
  bilibili: platformPackSchema,
  facebook: platformPackSchema,
});

export const calendarDaySchema = z.object({
  date: z.string(),
  weekday: z.string(),
  items: z.array(calendarItemSchema).min(1).max(10),
});

export const calendarSchema = z.object({
  channelName: z.string(),
  videosPerDay: z.number().int(),
  days: z.array(calendarDaySchema).min(1).max(7),
});

export type ChannelStrategy = z.infer<typeof strategySchema>;
export type ContentCalendar = z.infer<typeof calendarSchema>;
