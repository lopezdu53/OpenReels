export type VoxMode = "broll" | "aroll" | "croll";

export type VoxStatus =
  | "drafting"
  | "awaiting_beats"
  | "baking"
  | "awaiting_style"
  | "producing"
  | "completed"
  | "failed"
  | "cancelled";

export interface VoxVoice {
  voice_id: string;
  language: string;
  speed: number;
  clone_ref?: string;
  persona?: string;
}

export interface VoxShot {
  id: string;
  dur: number;
  title: boolean;
  shot_size: string;
  camera_move: string;
  scene: string;
  element_motion: string;
  keyframe_url?: string;
  keyframe_path?: string;
}

export interface VoxBeat {
  id: number;
  title_cn: string;
  title_en: string;
  bg: string;
  feel: string;
  hook?: string;
  narration: string;
  shots: VoxShot[];
}

export interface VoxBeatsDoc {
  project: string;
  topic: string;
  language: string;
  aspect: string;
  style: "collage";
  provider: "atlas_cloud";
  theme?: string;
  collage_style?: string;
  arc: string;
  video_model: string;
  image_model: string;
  image_resolution: string;
  video_resolution: string;
  motion_style: string;
  constraints: string;
  voice: VoxVoice;
  music: string;
  mix?: { music: number; voice: number };
  caption_style: string;
  captions: boolean;
  watermark: string;
  mode?: "croll" | "aroll" | "broll";
  anchor_photo?: string;
  croll_subject?: "portrait" | "product";
  subject_wardrobe?: string;
  subject_desc?: string;
  aspect_approx_confirmed?: boolean;
  video_model_fallback?: string;
  beats: VoxBeat[];
}

export interface VoxJobConfig {
  mode: VoxMode;
  topic: string;
  durationSec: number;
  aspect: string;
  language: string;
  arc: string;
  voiceId: string;
  voiceSpeed: number;
  themes: string[];
  videoModel: string;
  imageModel: string;
  motionStyle: string;
  constraints: string;
  music: string;
  captions: boolean;
  captionStyle: string;
  watermark: string;
  realPeople: boolean;
  atlasKey?: string;
  clonePersona?: string;
  crollSubject?: "portrait" | "product";
  subjectWardrobe?: string;
  subjectDesc?: string;
}

export interface VoxJobMeta {
  id: string;
  kind: "vox";
  userId: string;
  topic: string;
  status: VoxStatus;
  stage: string;
  detail: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  config: VoxJobConfig;
  selectedTheme?: string;
  bakeoffThemes?: string[];
}
