export type StickmanCastMode = "solo" | "duo";

export type StickmanStatus =
  | "drafting"
  | "awaiting_script"
  | "producing"
  | "completed"
  | "failed"
  | "cancelled";

export interface StickmanVoice {
  voice_id: string;
  language: string;
  speed: number;
}

export interface StickmanCastMember {
  name: string;
  role: "hero" | "partner";
  head: "circle" | "oval";
  accessory: string;
  lineColor: string;
}

export interface StickmanBible {
  look: string;
  cast: StickmanCastMember[];
  world: string;
}

export interface StickmanBeat {
  id: number;
  title: string;
  pose: string;
  scene: string;
  narration: string;
  durationSec: number;
  stillPath?: string;
  clipPath?: string;
}

export interface StickmanScript {
  project: string;
  topic: string;
  language: string;
  aspect: string;
  style: "stickman";
  provider: "atlas_cloud";
  look: string;
  castMode: StickmanCastMode;
  arc: string;
  bible: StickmanBible;
  voice: StickmanVoice;
  captions: boolean;
  animate: boolean;
  image_model: string;
  video_model: string;
  beats: StickmanBeat[];
}

export interface StickmanJobConfig {
  topic: string;
  durationSec: number;
  aspect: string;
  language: string;
  look: string;
  castMode: StickmanCastMode;
  arc: string;
  voiceId: string;
  voiceSpeed: number;
  captions: boolean;
  animate: boolean;
  imageModel: string;
  videoModel: string;
  atlasTtsModel: string;
  atlasKey?: string;
}

export interface StickmanJobMeta {
  id: string;
  kind: "stickman";
  userId: string;
  topic: string;
  status: StickmanStatus;
  stage: string;
  detail: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  config: StickmanJobConfig;
}
