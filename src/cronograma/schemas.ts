import { z } from "zod";

export const demandSchema = z.enum(["alta", "media", "baja"]);

export const cronogramaNicheSchema = z.object({
  rank: z.number().int().min(1).max(100),
  name: z.string(),
  query: z.string(),
  category: z.string(),
  youtubeCategory: z.string(),
  why: z.string(),
  demand: demandSchema,
  competition: demandSchema,
  cpmLongformUsd: z.number(),
  cpmShortsUsd: z.number(),
  exampleTopics: z.array(z.string()).max(6),
  formats: z.array(z.string()).max(4),
});

export const channelLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const channelKitSchema = z.object({
  name: z.string(),
  handle: z.string(),
  tagline: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).max(16),
  country: z.string(),
  defaultLanguage: z.string(),
  youtubeCategory: z.string(),
  voiceTone: z.string(),
  targetAudience: z.string(),
  links: z.array(channelLinkSchema).max(4),
  brandColors: z.object({ primary: z.string(), accent: z.string() }),
  avatarPrompt: z.string(),
  bannerPrompt: z.string(),
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
  uploadDefaults: z.object({
    visibility: z.enum(["public", "unlisted", "private"]),
    madeForKids: z.boolean(),
    allowComments: z.boolean(),
    license: z.string(),
  }),
  firstMonthFocus: z.string(),
});

export const scheduleItemSchema = z.object({
  slot: z.number().int().min(1),
  time: z.string(),
  format: z.enum(["short", "long"]),
  pillar: z.string(),
  idea: z.string(),
  hook: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).max(16),
  hashtags: z.array(z.string()).max(12),
  category: z.string(),
  thumbnailText: z.string(),
  thumbnailPrompt: z.string(),
});

export const scheduleDaySchema = z.object({
  date: z.string(),
  weekday: z.string(),
  items: z.array(scheduleItemSchema).min(1).max(4),
});

export const weekSchema = z.object({
  days: z.array(scheduleDaySchema).min(1).max(7),
});

export type CronogramaNiche = z.infer<typeof cronogramaNicheSchema>;
export type ChannelKit = z.infer<typeof channelKitSchema>;
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
