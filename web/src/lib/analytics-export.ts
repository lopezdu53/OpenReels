import type { ChannelStrategy, ContentCalendar, NicheResearch } from "@/hooks/useApi";

function strategyMarkdown(strategy: ChannelStrategy): string[] {
  const lines = [
    "",
    `# Canal: ${strategy.channelName}`,
    strategy.tagline,
    "",
    strategy.positioning,
  ];
  lines.push("", "## Pilares");
  for (const p of strategy.contentPillars) {
    lines.push(`- **${p.name}**: ${p.description}`);
  }
  return lines;
}

function calendarMarkdown(calendar: ContentCalendar): string[] {
  const lines = ["", `# Calendario — ${calendar.channelName} (${calendar.videosPerDay}/día)`];
  for (const day of calendar.days) {
    lines.push("", `## ${day.weekday} ${day.date}`);
    for (const item of day.items) {
      lines.push(`### ${item.slot}. ${item.topic} · ${item.pillar} (${item.format})`);
      for (const [name, pack] of [
        ["YouTube", item.youtube],
        ["TikTok", item.tiktok],
        ["Bilibili", item.bilibili],
        ["Facebook", item.facebook],
      ] as const) {
        lines.push(`- **${name}**`);
        lines.push(`  - Título: ${pack.title}`);
        lines.push(`  - Descripción: ${pack.description}`);
        lines.push(`  - Hashtags: ${pack.hashtags.join(" ")}`);
      }
    }
  }
  return lines;
}

export function researchToMarkdown(
  research: NicheResearch,
  strategy?: ChannelStrategy | null,
  calendar?: ContentCalendar | null,
): string {
  const lines: string[] = [`# Analytic — ${research.query}`, ""];
  lines.push(`Fuente: ${research.source}`);
  lines.push(
    `CPM long-form ~$${research.cpmLongformUsd} · Shorts ~$${research.cpmShortsUsd} USD / 1k views`,
  );
  lines.push("");
  lines.push("## Canales");
  for (const c of research.channels) {
    lines.push(
      `- **${c.title}** ${c.url} — ${c.subscribers.toLocaleString()} subs · ${c.views.toLocaleString()} views · ads ~$${c.estimatedRevenueUsd.toFixed(0)}`,
    );
  }
  lines.push("", "## Videos");
  for (const v of research.videos) {
    lines.push(
      `- **${v.title}** ${v.url} — ${v.views.toLocaleString()} views · ${v.shorts ? "Short" : "long"} · ~$${v.estimatedRevenueUsd.toFixed(0)}`,
    );
  }
  if (research.webHits.length) {
    lines.push("", "## Web");
    for (const h of research.webHits) lines.push(`- [${h.title}](${h.url}) — ${h.content}`);
  }
  if (strategy) lines.push(...strategyMarkdown(strategy));
  if (calendar) lines.push(...calendarMarkdown(calendar));
  return lines.join("\n");
}

function csvCell(value: string): string {
  const s = value.replaceAll('"', '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function calendarToCsv(calendar: ContentCalendar): string {
  const header = [
    "date",
    "weekday",
    "slot",
    "topic",
    "pillar",
    "format",
    "platform",
    "title",
    "description",
    "hashtags",
  ];
  const rows = [header.join(",")];
  for (const day of calendar.days) {
    for (const item of day.items) {
      for (const [platform, pack] of [
        ["youtube", item.youtube],
        ["tiktok", item.tiktok],
        ["bilibili", item.bilibili],
        ["facebook", item.facebook],
      ] as const) {
        rows.push(
          [
            csvCell(day.date),
            csvCell(day.weekday),
            String(item.slot),
            csvCell(item.topic),
            csvCell(item.pillar),
            csvCell(item.format),
            platform,
            csvCell(pack.title),
            csvCell(pack.description),
            csvCell(pack.hashtags.join(" ")),
          ].join(","),
        );
      }
    }
  }
  return rows.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
