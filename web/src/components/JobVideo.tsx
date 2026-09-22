const RATIO: Record<string, string> = {
  "16:9": "aspect-video max-w-3xl",
  "1:1": "aspect-square max-w-md",
  "9:16": "aspect-[9/16] max-w-sm",
};

export function mediaAspect(raw: unknown, fallback = "9:16"): string {
  if (raw && typeof raw === "object" && "aspect" in raw) {
    const value = (raw as { aspect?: unknown }).aspect;
    if (typeof value === "string" && value in RATIO) return value;
  }
  return fallback;
}

export function JobVideo({
  src,
  aspect,
  poster,
}: {
  src: string;
  aspect?: string;
  poster?: string;
}) {
  const box = RATIO[aspect ?? ""] ?? RATIO["9:16"];
  return (
    <div className="space-y-2">
      <div
        className={`mx-auto w-full overflow-hidden rounded-2xl border border-border bg-black ${box}`}
      >
        <video
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
        >
          <track kind="captions" />
        </video>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <a href={src} className="underline underline-offset-2" target="_blank" rel="noreferrer">
          Abrir video
        </a>
      </p>
    </div>
  );
}
