// invin launcher — hardware-aware performance prediction engine.
//
// Given a detected (or manually entered) `HardwareProfile` and a `WorkloadProfile`
// (a modpack / instance configuration), this estimates how Minecraft will actually
// run: average & 1%-low FPS, RAM usage, launch time, the limiting bottleneck, and a
// prioritised list of concrete recommendations to make it run better.
//
// The model is a transparent, physically-motivated heuristic anchored to a known
// reference system, not a black box. Every multiplier below is documented so the
// numbers can be reasoned about and tuned. This module is intentionally pure (no DOM,
// no I/O) so it can be unit-tested and mirrored 1:1 by the Rust backend.

import type {
  Bottleneck,
  Confidence,
  CpuInfo,
  GpuInfo,
  GpuTier,
  HardwareProfile,
  PerfRating,
  PerformancePrediction,
  PredictionFactor,
  Recommendation,
  RiskLevel,
  WorkloadProfile
} from './types';

// ---------------------------------------------------------------------------
// Reference anchor: a Ryzen 5 5600X + RTX 3060, 16 GB RAM. On this machine,
// vanilla 1.20 at render distance 12 with an adequate heap runs ~260 FPS uncapped.
// All factors are relative to this baseline.
// ---------------------------------------------------------------------------
const REF_GPU_SCORE = 38; // RTX 3060 on the 0-100 (4090 = 100) scale
const REF_CPU_SINGLE = 72; // Ryzen 5 5600X single-thread on the 0-100 scale
const REF_RENDER_DISTANCE = 12;
const REF_BASE_FPS = 260;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

// ---------------------------------------------------------------------------
// GPU scoring. Scores are relative gaming performance, anchored RTX 4090 = 100.
// Patterns are matched most-specific first; every token in `tokens` must appear
// in the normalised model string.
// ---------------------------------------------------------------------------
interface GpuEntry {
  tokens: string[];
  score: number;
  integrated?: boolean;
}

const GPU_TABLE: GpuEntry[] = [
  // NVIDIA RTX 40
  { tokens: ['4090'], score: 100 },
  { tokens: ['4080', 'super'], score: 88 },
  { tokens: ['4080'], score: 84 },
  { tokens: ['4070', 'ti', 'super'], score: 74 },
  { tokens: ['4070', 'ti'], score: 70 },
  { tokens: ['4070', 'super'], score: 66 },
  { tokens: ['4070'], score: 60 },
  { tokens: ['4060', 'ti'], score: 48 },
  { tokens: ['4060'], score: 42 },
  // NVIDIA RTX 30
  { tokens: ['3090', 'ti'], score: 82 },
  { tokens: ['3090'], score: 78 },
  { tokens: ['3080', 'ti'], score: 76 },
  { tokens: ['3080'], score: 72 },
  { tokens: ['3070', 'ti'], score: 62 },
  { tokens: ['3070'], score: 58 },
  { tokens: ['3060', 'ti'], score: 50 },
  { tokens: ['3060'], score: 38 },
  { tokens: ['3050'], score: 28 },
  // NVIDIA RTX 20
  { tokens: ['2080', 'ti'], score: 60 },
  { tokens: ['2080', 'super'], score: 54 },
  { tokens: ['2080'], score: 50 },
  { tokens: ['2070', 'super'], score: 48 },
  { tokens: ['2070'], score: 44 },
  { tokens: ['2060', 'super'], score: 40 },
  { tokens: ['2060'], score: 36 },
  // NVIDIA GTX 16
  { tokens: ['1660', 'ti'], score: 32 },
  { tokens: ['1660', 'super'], score: 30 },
  { tokens: ['1660'], score: 28 },
  { tokens: ['1650', 'super'], score: 22 },
  { tokens: ['1650'], score: 18 },
  // NVIDIA GTX 10
  { tokens: ['1080', 'ti'], score: 48 },
  { tokens: ['1080'], score: 40 },
  { tokens: ['1070', 'ti'], score: 38 },
  { tokens: ['1070'], score: 34 },
  { tokens: ['1060'], score: 26 },
  { tokens: ['1050', 'ti'], score: 16 },
  { tokens: ['1050'], score: 13 },
  // AMD RX 7000
  { tokens: ['7900', 'xtx'], score: 92 },
  { tokens: ['7900', 'xt'], score: 82 },
  { tokens: ['7800', 'xt'], score: 66 },
  { tokens: ['7700', 'xt'], score: 56 },
  { tokens: ['7600'], score: 42 },
  // AMD RX 6000
  { tokens: ['6950', 'xt'], score: 80 },
  { tokens: ['6900', 'xt'], score: 74 },
  { tokens: ['6800', 'xt'], score: 70 },
  { tokens: ['6800'], score: 62 },
  { tokens: ['6750', 'xt'], score: 56 },
  { tokens: ['6700', 'xt'], score: 52 },
  { tokens: ['6650', 'xt'], score: 44 },
  { tokens: ['6600', 'xt'], score: 42 },
  { tokens: ['6600'], score: 36 },
  { tokens: ['6500', 'xt'], score: 20 },
  // AMD RX 5000 / 500
  { tokens: ['5700', 'xt'], score: 44 },
  { tokens: ['5600', 'xt'], score: 38 },
  { tokens: ['rx', '580'], score: 26 },
  { tokens: ['rx', '570'], score: 22 },
  // Intel Arc
  { tokens: ['arc', 'a770'], score: 46 },
  { tokens: ['arc', 'a750'], score: 42 },
  { tokens: ['arc', 'a580'], score: 36 },
  { tokens: ['arc', 'a380'], score: 20 },
  // Apple Silicon (integrated)
  { tokens: ['m3', 'max'], score: 78, integrated: true },
  { tokens: ['m3', 'pro'], score: 55, integrated: true },
  { tokens: ['m3'], score: 38, integrated: true },
  { tokens: ['m2', 'ultra'], score: 90, integrated: true },
  { tokens: ['m2', 'max'], score: 68, integrated: true },
  { tokens: ['m2', 'pro'], score: 50, integrated: true },
  { tokens: ['m2'], score: 34, integrated: true },
  { tokens: ['m1', 'ultra'], score: 76, integrated: true },
  { tokens: ['m1', 'max'], score: 62, integrated: true },
  { tokens: ['m1', 'pro'], score: 45, integrated: true },
  { tokens: ['m1'], score: 30, integrated: true },
  { tokens: ['m4'], score: 44, integrated: true },
  // AMD integrated (APU / mobile)
  { tokens: ['780m'], score: 30, integrated: true },
  { tokens: ['760m'], score: 24, integrated: true },
  { tokens: ['680m'], score: 22, integrated: true },
  { tokens: ['660m'], score: 16, integrated: true },
  { tokens: ['vega', '8'], score: 9, integrated: true },
  { tokens: ['vega'], score: 8, integrated: true },
  // Intel integrated
  { tokens: ['iris', 'xe'], score: 12, integrated: true },
  { tokens: ['iris'], score: 9, integrated: true },
  { tokens: ['uhd', '770'], score: 7, integrated: true },
  { tokens: ['uhd', '630'], score: 5, integrated: true },
  { tokens: ['uhd'], score: 4, integrated: true },
  { tokens: ['hd', 'graphics'], score: 3, integrated: true }
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/nvidia|geforce|amd|radeon|\(r\)|\(tm\)|corporation|graphics card/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tierFromScore(score: number): GpuTier {
  if (score >= 70) return 'enthusiast';
  if (score >= 48) return 'high';
  if (score >= 28) return 'mainstream';
  if (score >= 14) return 'entry';
  return 'integrated';
}

/** Resolve a raw GPU model string into a scored `GpuInfo`. */
export function scoreGpu(model: string, vramMb: number | null = null): GpuInfo {
  const norm = ` ${normalize(model)} `;
  let matched: GpuEntry | null = null;
  for (const entry of GPU_TABLE) {
    if (entry.tokens.every((t) => norm.includes(` ${t} `) || norm.includes(`${t} `) || norm.includes(` ${t}`))) {
      matched = entry;
      break;
    }
  }

  const vendor = /nvidia|geforce|rtx|gtx/i.test(model)
    ? 'NVIDIA'
    : /amd|radeon|\brx\b/i.test(model)
      ? 'AMD'
      : /intel|arc|iris|uhd/i.test(model)
        ? 'Intel'
        : /apple|m1|m2|m3|m4/i.test(model)
          ? 'Apple'
          : 'Unknown';

  if (matched) {
    return {
      model: model.trim() || 'Unknown GPU',
      vendor,
      vramMb,
      score: matched.score,
      tier: tierFromScore(matched.score),
      integrated: matched.integrated ?? false
    };
  }

  // Unknown model: estimate from VRAM as a weak proxy, default to entry tier.
  const guess = vramMb ? clamp(8 + (vramMb / 1024) * 7, 8, 55) : 22;
  const integrated = /iris|uhd|vega|apple|m[1-4]|integrated/i.test(model);
  return {
    model: model.trim() || 'Unknown GPU',
    vendor,
    vramMb,
    score: integrated ? Math.min(guess, 30) : guess,
    tier: tierFromScore(guess),
    integrated
  };
}

// ---------------------------------------------------------------------------
// CPU scoring. Single-thread score anchored to ~100 = i9-14900K / 7800X3D class.
// ---------------------------------------------------------------------------
interface CpuEntry {
  tokens: string[];
  single: number;
}

const CPU_TABLE: CpuEntry[] = [
  // AMD X3D (exceptional for Minecraft thanks to large L3 cache)
  { tokens: ['7800x3d'], single: 100 },
  { tokens: ['7950x3d'], single: 100 },
  { tokens: ['7900x3d'], single: 98 },
  { tokens: ['5800x3d'], single: 84 },
  // AMD Ryzen 7000
  { tokens: ['7950x'], single: 98 },
  { tokens: ['7900x'], single: 95 },
  { tokens: ['7700x'], single: 92 },
  { tokens: ['7700'], single: 89 },
  { tokens: ['7600x'], single: 90 },
  { tokens: ['7600'], single: 86 },
  // AMD Ryzen 5000
  { tokens: ['5950x'], single: 82 },
  { tokens: ['5900x'], single: 80 },
  { tokens: ['5800x'], single: 78 },
  { tokens: ['5700x'], single: 74 },
  { tokens: ['5600x'], single: 72 },
  { tokens: ['5600'], single: 70 },
  { tokens: ['5500'], single: 64 },
  // AMD Ryzen 3000
  { tokens: ['3900x'], single: 66 },
  { tokens: ['3700x'], single: 64 },
  { tokens: ['3600x'], single: 62 },
  { tokens: ['3600'], single: 60 },
  // Intel 14th/13th gen
  { tokens: ['14900k'], single: 100 },
  { tokens: ['14700k'], single: 97 },
  { tokens: ['14600k'], single: 92 },
  { tokens: ['13900k'], single: 98 },
  { tokens: ['13700k'], single: 94 },
  { tokens: ['13600k'], single: 90 },
  { tokens: ['13400'], single: 80 },
  // Intel 12th gen
  { tokens: ['12900k'], single: 90 },
  { tokens: ['12700k'], single: 86 },
  { tokens: ['12600k'], single: 82 },
  { tokens: ['12400'], single: 74 },
  // Intel 10th/11th gen
  { tokens: ['11700k'], single: 76 },
  { tokens: ['11600k'], single: 72 },
  { tokens: ['10700k'], single: 70 },
  { tokens: ['10600k'], single: 66 },
  { tokens: ['10400'], single: 58 },
  { tokens: ['9900k'], single: 66 },
  { tokens: ['9700k'], single: 64 },
  { tokens: ['8700k'], single: 58 },
  // Apple Silicon
  { tokens: ['m3', 'max'], single: 96 },
  { tokens: ['m3', 'pro'], single: 92 },
  { tokens: ['m3'], single: 90 },
  { tokens: ['m2', 'max'], single: 86 },
  { tokens: ['m2', 'pro'], single: 84 },
  { tokens: ['m2'], single: 82 },
  { tokens: ['m1', 'max'], single: 74 },
  { tokens: ['m1', 'pro'], single: 73 },
  { tokens: ['m1'], single: 70 }
];

/** Resolve a raw CPU brand string + topology into a scored `CpuInfo`. */
export function scoreCpu(
  brand: string,
  physicalCores: number,
  logicalCores: number,
  baseGhz: number
): CpuInfo {
  const norm = normalize(brand).replace(/\s+/g, '');
  const spaced = ` ${normalize(brand)} `;
  let single: number | null = null;
  for (const entry of CPU_TABLE) {
    if (entry.tokens.every((t) => norm.includes(t) || spaced.includes(` ${t} `))) {
      single = entry.single;
      break;
    }
  }

  const vendor = /intel/i.test(brand)
    ? 'Intel'
    : /amd|ryzen/i.test(brand)
      ? 'AMD'
      : /apple|m[1-4]/i.test(brand)
        ? 'Apple'
        : 'Unknown';

  if (single === null) {
    // Fallback: estimate single-thread from clock speed with a modest IPC assumption.
    single = clamp((baseGhz / 5.1) * 60 + 18, 14, 90);
  }

  // Multi-thread scales with cores but with diminishing returns; cap at ~100.
  const cores = Math.max(physicalCores, 1);
  const multi = clamp(single * (1 + Math.log2(cores) * 0.42), single, 100 + cores);

  return {
    brand: brand.trim() || 'Unknown CPU',
    vendor,
    physicalCores,
    logicalCores: Math.max(logicalCores, physicalCores),
    baseGhz,
    singleThreadScore: round(single),
    multiThreadScore: round(Math.min(multi, 130))
  };
}

// ---------------------------------------------------------------------------
// RAM model: estimate the working-set the JVM heap needs to avoid GC thrashing.
// ---------------------------------------------------------------------------
function estimateRamNeededMb(w: WorkloadProfile): number {
  const base = 900; // JVM + vanilla MC client baseline
  const perMod = 6.5; // average heap per mod (mixin classes, registries, caches)
  const renderOverhead = Math.pow(w.renderDistance, 2) * 3; // chunk meshes & entity data
  const shaderOverhead = w.shaders ? 700 : 0;
  const heavyOverhead = w.heavyMods ? 800 : 0;
  // FerriteCore/Sodium et al. shrink memory footprint noticeably.
  const optMultiplier = w.optimizationMods ? 0.82 : 1.0;
  return round((base + w.modCount * perMod + renderOverhead + shaderOverhead + heavyOverhead) * optMultiplier);
}

// ---------------------------------------------------------------------------
// Main predictor.
// ---------------------------------------------------------------------------
export function predictPerformance(
  hw: HardwareProfile,
  w: WorkloadProfile
): PerformancePrediction {
  const gpuFactor = clamp(hw.gpu.score / REF_GPU_SCORE, 0.05, 6);
  const cpuFactor = clamp(hw.cpu.singleThreadScore / REF_CPU_SINGLE, 0.1, 2.2);

  // Bottleneck blend: GPU weight grows with render distance and dominates with shaders.
  const gpuWeight = clamp(
    0.38 + (w.renderDistance - 8) * 0.028 + (w.shaders ? 0.3 : 0),
    0.3,
    0.85
  );
  const cpuWeight = 1 - gpuWeight;
  // Harmonic-style blend: the weaker component drags the result down (a real bottleneck).
  const combinedFactor = 1 / (gpuWeight / gpuFactor + cpuWeight / cpuFactor);

  // Render distance: cost grows ~ renderDistance^1.3 (chunk count, partially culled).
  const rdFactor = Math.pow(REF_RENDER_DISTANCE / Math.max(w.renderDistance, 2), 1.3);

  // Mod count: each mod adds tick + render overhead.
  const modFactor = 1 / (1 + w.modCount * 0.0035);

  // Optimization mods (Sodium/Lithium/etc.) roughly multiply FPS.
  const optFactor = w.optimizationMods ? 2.4 : 1.0;

  // Shaders: large GPU hit, worse on weak GPUs.
  const shaderFactor = w.shaders ? clamp(0.25 + gpuFactor * 0.1, 0.18, 0.55) : 1.0;

  // Heavy content/tech mods: extra CPU + memory churn.
  const heavyFactor = w.heavyMods ? 0.82 : 1.0;

  // RAM sufficiency: tight heap causes GC thrash that tanks FPS and frame times.
  const ramNeeded = estimateRamNeededMb(w);
  const ramSufficient = w.allocatedRamMb >= ramNeeded;
  const ramRatio = w.allocatedRamMb / Math.max(ramNeeded, 1);
  const ramFactor = ramSufficient ? 1.0 : clamp(0.3 + ramRatio * 0.6, 0.3, 0.95);

  let avgFps =
    REF_BASE_FPS *
    combinedFactor *
    rdFactor *
    modFactor *
    optFactor *
    shaderFactor *
    heavyFactor *
    ramFactor;
  avgFps = clamp(round(avgFps), 1, 2000);

  // 1% lows: dominated by frame-time spikes from GC + single-thread stalls.
  const lowRatio = clamp(
    0.42 + (ramSufficient ? 0.1 : -0.12) + (cpuFactor - 1) * 0.08 + (w.optimizationMods ? 0.08 : 0),
    0.25,
    0.72
  );
  const lowFps = clamp(round(avgFps * lowRatio), 1, avgFps);
  const fpsRange: [number, number] = [round(avgFps * 0.82), round(avgFps * 1.22)];

  // RAM usage estimate (what it will actually consume, bounded by heap).
  const ramUsageMb = round(Math.min(ramNeeded, w.allocatedRamMb) * 0.92 + Math.min(ramNeeded, w.allocatedRamMb) * 0.08);
  const recommendedRamMb = clamp(
    Math.ceil((ramNeeded * 1.3) / 512) * 512,
    1024,
    Math.max(1024, Math.floor((hw.totalRamMb - 2048) / 512) * 512)
  );
  const ramHeadroomMb = w.allocatedRamMb - ramNeeded;

  // Launch time: scales with mods + storage + CPU.
  const storageMult = hw.storage === 'hdd' ? 2.2 : hw.storage === 'unknown' ? 1.3 : 1.0;
  const loadTimeSec = round(
    (4 + w.modCount * 0.18 + (w.shaders ? 4 : 0)) * storageMult / Math.sqrt(clamp(cpuFactor, 0.4, 2))
  );

  // Rating.
  const ratingScore = computeRatingScore(avgFps, lowFps, ramSufficient);
  const rating = ratingFromScore(ratingScore);

  // Bottleneck.
  const bottleneck = identifyBottleneck({
    gpuFactor,
    cpuFactor,
    ramSufficient,
    ramRatio,
    storage: hw.storage,
    shaders: w.shaders
  });

  // Worldgen lag risk (single-thread + heavy mods + memory).
  const worldgenLagRisk = worldgenRisk(hw.cpu.singleThreadScore, w, ramSufficient);

  const confidence = computeConfidence(hw);
  const recommendations = buildRecommendations(hw, w, {
    avgFps,
    ramNeeded,
    ramSufficient,
    recommendedRamMb,
    bottleneck,
    gpuFactor
  });
  const factors = buildFactors(hw, w, { rdFactor, modFactor, optFactor, shaderFactor, ramFactor, gpuFactor, cpuFactor });

  return {
    avgFps,
    fpsRange,
    lowFps,
    ramUsageMb,
    ramHeadroomMb,
    ramSufficient,
    recommendedRamMb,
    loadTimeSec,
    rating,
    ratingScore,
    bottleneck,
    worldgenLagRisk,
    confidence,
    recommendations,
    factors
  };
}

function computeRatingScore(avgFps: number, lowFps: number, ramSufficient: boolean): number {
  // Map FPS to a 0-100 perceptual smoothness score (log-ish: 30->~55, 60->~75, 120->~92).
  const fpsScore = clamp(Math.log2(avgFps / 12) * 26, 0, 100);
  const lowScore = clamp(Math.log2(Math.max(lowFps, 1) / 8) * 22, 0, 100);
  let score = fpsScore * 0.6 + lowScore * 0.4;
  if (!ramSufficient) score *= 0.78;
  return clamp(round(score), 0, 100);
}

function ratingFromScore(score: number): PerfRating {
  if (score >= 88) return 'excellent';
  if (score >= 70) return 'smooth';
  if (score >= 50) return 'playable';
  if (score >= 32) return 'choppy';
  return 'unplayable';
}

function identifyBottleneck(args: {
  gpuFactor: number;
  cpuFactor: number;
  ramSufficient: boolean;
  ramRatio: number;
  storage: string;
  shaders: boolean;
}): Bottleneck {
  if (!args.ramSufficient && args.ramRatio < 0.85) return 'ram';
  const ratio = args.gpuFactor / args.cpuFactor;
  if (args.shaders && args.gpuFactor < args.cpuFactor) return 'gpu';
  if (ratio < 0.75) return 'gpu';
  if (ratio > 1.4) return 'cpu';
  return 'balanced';
}

function worldgenRisk(cpuSingle: number, w: WorkloadProfile, ramSufficient: boolean): RiskLevel {
  let risk = 0;
  if (cpuSingle < 55) risk += 2;
  else if (cpuSingle < 72) risk += 1;
  if (w.heavyMods) risk += 1;
  if (w.modCount > 180) risk += 1;
  if (!ramSufficient) risk += 1;
  if (risk >= 3) return 'high';
  if (risk >= 1) return 'medium';
  return 'low';
}

function computeConfidence(hw: HardwareProfile): Confidence {
  if (hw.source === 'manual') return 'medium';
  const gpuKnown = hw.gpu.model !== 'Unknown GPU' && hw.gpu.score > 0;
  const cpuKnown = hw.cpu.brand !== 'Unknown CPU';
  if (hw.source === 'detected' && gpuKnown && cpuKnown) return 'high';
  if (gpuKnown || cpuKnown) return 'medium';
  return 'low';
}

function buildRecommendations(
  hw: HardwareProfile,
  w: WorkloadProfile,
  ctx: {
    avgFps: number;
    ramNeeded: number;
    ramSufficient: boolean;
    recommendedRamMb: number;
    bottleneck: Bottleneck;
    gpuFactor: number;
  }
): Recommendation[] {
  const recs: Recommendation[] = [];
  const fabricFamily = w.loader === 'fabric' || w.loader === 'quilt' || w.loader === 'neoforge';

  if (!w.optimizationMods) {
    recs.push({
      severity: 'tip',
      title: fabricFamily ? 'Install Sodium + Lithium' : 'Install Embeddium + performance mods',
      detail: fabricFamily
        ? 'Sodium (rendering), Lithium (game logic) and FerriteCore (memory) typically more than double FPS and cut RAM use. invin can add them in one click.'
        : 'For Forge, Embeddium + FerriteCore + ModernFix give large rendering and memory gains.',
      estimatedFpsGain: 2.4
    });
  }

  if (!ctx.ramSufficient) {
    recs.push({
      severity: 'critical',
      title: `Increase allocated RAM to ${(ctx.recommendedRamMb / 1024).toFixed(1)} GB`,
      detail: `This workload needs ~${(ctx.ramNeeded / 1024).toFixed(1)} GB but only ${(w.allocatedRamMb / 1024).toFixed(1)} GB is allocated. Too little heap causes constant garbage-collection stutter.`
    });
  } else if (w.allocatedRamMb > ctx.ramNeeded * 2.2 && w.allocatedRamMb >= 8192) {
    recs.push({
      severity: 'warning',
      title: 'Lower allocated RAM',
      detail: `Allocating ${(w.allocatedRamMb / 1024).toFixed(1)} GB is far more than this pack needs (~${(ctx.ramNeeded / 1024).toFixed(1)} GB). Oversized heaps cause longer GC pauses (frame spikes). ${(ctx.recommendedRamMb / 1024).toFixed(1)} GB is ideal.`
    });
  }

  if (ctx.bottleneck === 'gpu' && w.shaders) {
    recs.push({
      severity: 'tip',
      title: 'Use a lighter shader preset',
      detail: 'Shaders are your bottleneck. Switch to a performance shader (e.g. Complementary on Medium) or lower shadow quality to recover a large amount of FPS.',
      estimatedFpsGain: 1.7
    });
  }

  if (ctx.bottleneck === 'gpu' && w.renderDistance > 12) {
    recs.push({
      severity: 'tip',
      title: `Reduce render distance to 12 chunks`,
      detail: `Render distance ${w.renderDistance} is GPU-heavy. Dropping toward 12 chunks raises FPS significantly with little visual impact.`,
      estimatedFpsGain: 1.3
    });
  }

  if (ctx.bottleneck === 'cpu' || worldgenRisk(hw.cpu.singleThreadScore, w, ctx.ramSufficient) === 'high') {
    recs.push({
      severity: 'info',
      title: 'CPU is the limiting factor',
      detail: 'Minecraft is single-thread heavy. Lithium/C2ME (chunk gen) help, and lowering simulation distance reduces CPU load during exploration.'
    });
  }

  if (hw.storage === 'hdd') {
    recs.push({
      severity: 'warning',
      title: 'Move the instance to an SSD',
      detail: 'You appear to be on a hard drive. SSDs dramatically cut launch time and chunk-load stutter while exploring.'
    });
  }

  // Always offer optimised JVM args.
  recs.push({
    severity: 'info',
    title: 'Apply optimised JVM flags',
    detail: 'invin can apply tuned G1GC flags (Aikar-style) for smoother frame times. Already enabled by default for new instances.'
  });

  if (ctx.avgFps < 25 && hw.gpu.integrated) {
    recs.push({
      severity: 'warning',
      title: 'Integrated graphics detected',
      detail: 'A dedicated GPU would give the biggest uplift here. Until then, keep render distance ≤ 8, avoid shaders, and rely on Sodium.'
    });
  }

  return recs;
}

function buildFactors(
  hw: HardwareProfile,
  w: WorkloadProfile,
  m: {
    rdFactor: number;
    modFactor: number;
    optFactor: number;
    shaderFactor: number;
    ramFactor: number;
    gpuFactor: number;
    cpuFactor: number;
  }
): PredictionFactor[] {
  const asImpact = (mult: number) => clamp(Math.log2(mult) / 2, -1, 1);
  const factors: PredictionFactor[] = [
    { label: 'GPU', impact: asImpact(m.gpuFactor), detail: `${hw.gpu.model} (score ${hw.gpu.score})` },
    { label: 'CPU (single-thread)', impact: asImpact(m.cpuFactor), detail: `${hw.cpu.brand} (score ${hw.cpu.singleThreadScore})` },
    { label: 'Render distance', impact: asImpact(m.rdFactor), detail: `${w.renderDistance} chunks` },
    { label: 'Mod count', impact: asImpact(m.modFactor), detail: `${w.modCount} mods` },
    { label: 'Optimization mods', impact: asImpact(m.optFactor), detail: w.optimizationMods ? 'Present (Sodium-class)' : 'None installed' },
    { label: 'RAM allocation', impact: asImpact(m.ramFactor), detail: m.ramFactor >= 1 ? 'Sufficient' : 'Too low — GC thrash' }
  ];
  if (w.shaders) {
    factors.push({ label: 'Shaders', impact: asImpact(m.shaderFactor), detail: 'Enabled' });
  }
  return factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
