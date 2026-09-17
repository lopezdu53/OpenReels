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
  muteCharacter?: boolean;
  contentHook?: boolean;
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
  /** Default true: no spoken TTS; Flow SFX still mix in. */
  muteCharacter?: boolean;
  /** First 10s trailer of the full video. Only for 5/8/15 min. */
  contentHook?: boolean;
  videoVolume?: number;
  ttsVolume?: number;
  imageModel: string;
  videoModel: string;
  atlasTtsModel: string;
  visualProvider?: "atlas" | "gflow";
  gflowImageModel?: string;
  gflowVideoModel?: string;
  gflowVideoMode?: string;
  llmModel?: string;
  atlasKey?: string;
}

export interface StickmanCost {
  tokens: number;
  usd: number;
  credits: number;
}

export interface StickmanYoutubePack {
  title: string;
  description: string;
  hashtags: string[];
  seo: string;
  thumbnailRel?: string;
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
  previewRel?: string;
  cost?: StickmanCost;
  youtubePack?: StickmanYoutubePack;
  config: StickmanJobConfig;
}
