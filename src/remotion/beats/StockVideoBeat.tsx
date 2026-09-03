import type React from "react";
import { AbsoluteFill, Loop, OffthreadVideo, useVideoConfig } from "remotion";
import { resolveVideoPlayback } from "../lib/motion";
import type { SceneProps } from "../lib/score-to-props";

export const StockVideoBeat: React.FC<SceneProps> = ({
  assetSrc,
  sourceDurationInSeconds,
  visualType,
  durationInFrames: sceneFrames,
}) => {
  const { fps } = useVideoConfig();
  const sceneDurationSeconds = Math.max(1, sceneFrames || 1) / fps;
  const { playbackRate, loop } = resolveVideoPlayback({
    sourceDurationSeconds: sourceDurationInSeconds,
    sceneDurationSeconds,
    visualType,
  });

  const loopDurationInFrames =
    sourceDurationInSeconds != null
      ? Math.max(1, Math.floor((sourceDurationInSeconds / playbackRate) * fps))
      : Math.max(1, sceneFrames || 1);

  const video = assetSrc ? (
    <OffthreadVideo
      src={assetSrc}
      playbackRate={playbackRate}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }}
      muted
    />
  ) : null;

  return (
    <AbsoluteFill>
      {video && (loop ? <Loop durationInFrames={loopDurationInFrames}>{video}</Loop> : video)}
    </AbsoluteFill>
  );
};
