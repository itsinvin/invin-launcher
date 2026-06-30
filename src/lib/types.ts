// Shared types mirroring the Rust backend (`src-tauri/src`).

export type LoaderKind = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';

export interface Account {
  id: string;
  username: string;
  uuid: string;
  /** Whether this is the currently selected account. */
  active: boolean;
  /** Unix seconds when the cached token expires. */
  expiresAt: number;
}

export interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  /** Optional group/folder used for organisation. */
  group: string | null;
  /** Comma-free list of tags. */
  tags: string[];
  /** Per-instance memory override in MB (null = use global default). */
  memoryMb: number | null;
  /** Per-instance java path override (null = auto/global). */
  javaPath: string | null;
  /** Extra JVM args, space separated. */
  jvmArgs: string | null;
  /** Account id used by default for this instance (null = global active). */
  accountId: string | null;
  iconColor: string;
  pinned: boolean;
  lastPlayed: number | null;
  totalPlaySeconds: number;
  createdAt: number;
}

export interface InstanceDraft {
  name: string;
  mcVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  group: string | null;
  iconColor: string;
}

export interface VersionSummary {
  id: string;
  /** "release" | "snapshot" | "old_beta" | "old_alpha" */
  type: string;
  releaseTime: string;
}

export interface LoaderVersion {
  version: string;
  stable: boolean;
}

export interface ModProject {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  categories: string[];
  /** modrinth | curseforge */
  source: string;
}

export interface ModVersion {
  versionId: string;
  versionNumber: string;
  name: string;
  downloads: number;
  datePublished: string;
  gameVersions: string[];
  loaders: string[];
  /** Direct download info for the primary file. */
  fileName: string;
  fileUrl: string;
  fileSize: number;
  sha1: string;
  dependencies: ModDependency[];
}

export interface ModDependency {
  projectId: string | null;
  versionId: string | null;
  /** required | optional | incompatible | embedded */
  dependencyType: string;
}

export interface InstalledMod {
  id: string;
  instanceId: string;
  projectId: string | null;
  versionId: string | null;
  name: string;
  fileName: string;
  source: string;
  enabled: boolean;
  /** sha1 used for the dedup store. */
  sha1: string;
}

export interface Settings {
  theme: 'dark' | 'light';
  accent: string;
  defaultMemoryMb: number;
  defaultJavaPath: string | null;
  concurrentDownloads: number;
  closeOnLaunch: boolean;
  redactLogs: boolean;
  onboarded: boolean;
}

// ---- Live event payloads (emitted from Rust) ----

export interface ProgressEvent {
  /** stable id of the running task, e.g. instance id. */
  taskId: string;
  stage: string;
  current: number;
  total: number;
  message: string;
}

export interface LogLine {
  instanceId: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface AuthDeviceCode {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  deviceCode: string;
}

export interface CrashReport {
  detected: boolean;
  summary: string;
  suggestions: string[];
}

// ---- Hardware detection & performance prediction ----

export type GpuTier = 'integrated' | 'entry' | 'mainstream' | 'high' | 'enthusiast';
export type StorageKind = 'ssd' | 'hdd' | 'unknown';
export type HardwareSource = 'detected' | 'manual' | 'estimated';

export interface CpuInfo {
  brand: string;
  vendor: string;
  physicalCores: number;
  logicalCores: number;
  baseGhz: number;
  /** Estimated single-thread score (0-100, 100 = current top tier). MC is single-thread heavy. */
  singleThreadScore: number;
  /** Estimated multi-thread score (0-100). */
  multiThreadScore: number;
}

export interface GpuInfo {
  model: string;
  vendor: string;
  vramMb: number | null;
  /** Relative gaming performance score (0-100, anchored to RTX 4090 = 100). */
  score: number;
  tier: GpuTier;
  integrated: boolean;
}

export interface HardwareProfile {
  cpu: CpuInfo;
  gpu: GpuInfo;
  totalRamMb: number;
  os: string;
  arch: string;
  storage: StorageKind;
  source: HardwareSource;
}

export interface WorkloadProfile {
  name: string;
  mcVersion: string;
  loader: LoaderKind;
  modCount: number;
  /** Allocated JVM heap in MB. */
  allocatedRamMb: number;
  /** Render distance in chunks. */
  renderDistance: number;
  shaders: boolean;
  /** Performance/optimization mods present (Sodium, Lithium, FerriteCore, ...). */
  optimizationMods: boolean;
  /** Heavy worldgen / tech / content mods present (Create, Terralith, ...). */
  heavyMods: boolean;
}

export type PerfRating = 'unplayable' | 'choppy' | 'playable' | 'smooth' | 'excellent';
export type Bottleneck = 'cpu' | 'gpu' | 'ram' | 'storage' | 'balanced';
export type RiskLevel = 'low' | 'medium' | 'high';
export type Confidence = 'low' | 'medium' | 'high';
export type RecommendationSeverity = 'info' | 'tip' | 'warning' | 'critical';

export interface Recommendation {
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  /** Estimated FPS multiplier gain if applied (e.g. 2.4 = +140%). */
  estimatedFpsGain?: number;
}

export interface PredictionFactor {
  label: string;
  /** -1..1 contribution to the final result (for the impact chart). */
  impact: number;
  detail: string;
}

export interface PerformancePrediction {
  avgFps: number;
  fpsRange: [number, number];
  /** 1% low FPS (frame-time stability). */
  lowFps: number;
  ramUsageMb: number;
  ramHeadroomMb: number;
  ramSufficient: boolean;
  recommendedRamMb: number;
  loadTimeSec: number;
  rating: PerfRating;
  /** Overall 0-100 score used for the rating. */
  ratingScore: number;
  bottleneck: Bottleneck;
  worldgenLagRisk: RiskLevel;
  confidence: Confidence;
  recommendations: Recommendation[];
  factors: PredictionFactor[];
}
