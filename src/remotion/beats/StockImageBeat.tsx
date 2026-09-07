import type React from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { kenBurnsTransform } from "../lib/motion";
import type { SceneProps } from "../lib/score-to-props";

export const StockImageBeat: React.FC<SceneProps> = ({
  assetSrc,
  motion,
  motionIntensity = 1.2,
  durationInFrames: sceneFrames,
}) => {
  const frame = useCurrentFrame();
  const duration = Math.max(1, sceneFrames || 1);
  const progress = Math.min(1, frame / duration);
  const { scale, translateX } = kenBurnsTransform({ progress, motion, intensity: motionIntensity });

  return (
    <AbsoluteFill>
      {assetSrc && (
        <Img
          src={assetSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translateX(${translateX}px)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
