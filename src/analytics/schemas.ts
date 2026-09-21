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

export const demandSchema = z.enum(["alta", "media", "baja"]);

export const topNicheSchema = z.object({
  rank: z.number().int().min(1).max(10),
  name: z.string(),
  query: z.string(),
  why: z.string(),
  demand: demandSchema,
  competition: demandSchema,
  cpmLongformUsd: z.number(),
  cpmShortsUsd: z.number(),
  exampleTopics: z.array(z.string()).max(5),
  formats: z.array(z.string()).max(4),
});

export const topNichesSchema = z.object({
  region: z.string(),
  source: z.enum(["curated", "vivi", "mixed"]),
  niches: z.array(topNicheSchema).min(8).max(10),
  warning: z.string().optional(),
});

export const clonedVideoIdeaSchema = z.object({
  title: z.string(),
  hook: z.string(),
  format: z.enum(["short", "long"]),
});

export const clonedChannelSchema = strategySchema.extend({
  sourceChannel: z.string(),
  polishNotes: z.string(),
  firstVideos: z.array(clonedVideoIdeaSchema).min(3).max(10),
});

export const clonedContentSchema = z.object({
  sourceTitle: z.string(),
  sourceChannel: z.string(),
  polishNotes: z.string(),
  hook: z.string(),
  script: z.string(),
  visualNotes: z.string(),
  youtube: platformPackSchema,
  tiktok: platformPackSchema,
  bilibili: platformPackSchema,
  facebook: platformPackSchema,
});

export type ChannelStrategy = z.infer<typeof strategySchema>;
export type ContentCalendar = z.infer<typeof calendarSchema>;
export type TopNiche = z.infer<typeof topNicheSchema>;
export type TopNiches = z.infer<typeof topNichesSchema>;
export type ClonedChannel = z.infer<typeof clonedChannelSchema>;
export type ClonedContent = z.infer<typeof clonedContentSchema>;
