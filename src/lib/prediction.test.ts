import { describe, it, expect } from 'vitest';
import { predictPerformance, scoreCpu, scoreGpu, tierFromScore } from './prediction';
import type { HardwareProfile, WorkloadProfile } from './types';

function hw(partial: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: scoreCpu('AMD Ryzen 5 5600X', 6, 12, 3.7),
    gpu: scoreGpu('NVIDIA GeForce RTX 3060', 12288),
    totalRamMb: 16384,
    os: 'Windows 10/11',
    arch: 'x86_64',
    storage: 'ssd',
    source: 'detected',
    ...partial
  };
}

function work(partial: Partial<WorkloadProfile> = {}): WorkloadProfile {
  return {
    name: 'test',
    mcVersion: '1.20.1',
    loader: 'fabric',
    modCount: 100,
    allocatedRamMb: 4096,
    renderDistance: 12,
    shaders: false,
    optimizationMods: false,
    heavyMods: false,
    ...partial
  };
}

describe('GPU scoring', () => {
  it('ranks GPUs in the expected order', () => {
    expect(scoreGpu('RTX 4090').score).toBeGreaterThan(scoreGpu('RTX 3060').score);
    expect(scoreGpu('RTX 3060 Ti').score).toBeGreaterThan(scoreGpu('RTX 3060').score);
    expect(scoreGpu('RTX 3060').score).toBeGreaterThan(scoreGpu('Intel UHD Graphics 630').score);
  });

  it('detects integrated GPUs', () => {
    expect(scoreGpu('Intel Iris Xe Graphics').integrated).toBe(true);
    expect(scoreGpu('Apple M1').integrated).toBe(true);
    expect(scoreGpu('NVIDIA GeForce RTX 4070').integrated).toBe(false);
  });

  it('assigns sensible tiers', () => {
    expect(tierFromScore(scoreGpu('RTX 4090').score)).toBe('enthusiast');
    expect(scoreGpu('Intel UHD Graphics 630').tier).toBe('integrated');
  });

  it('handles unknown models gracefully', () => {
    const g = scoreGpu('SomeBrand Mystery GPU 9000', 8192);
    expect(g.score).toBeGreaterThan(0);
    expect(g.score).toBeLessThan(60);
  });
});

describe('CPU scoring', () => {
  it('rates X3D and modern chips highly', () => {
    expect(scoreCpu('AMD Ryzen 7 7800X3D', 8, 16, 4.2).singleThreadScore).toBeGreaterThan(90);
    expect(scoreCpu('Intel Core i9-14900K', 24, 32, 3.2).singleThreadScore).toBeGreaterThan(90);
  });

  it('falls back from clock speed for unknown CPUs', () => {
    const c = scoreCpu('Unknown CPU', 4, 8, 3.0);
    expect(c.singleThreadScore).toBeGreaterThan(10);
    expect(c.singleThreadScore).toBeLessThan(90);
  });
});

describe('performance prediction', () => {
  it('produces a complete, sane prediction', () => {
    const p = predictPerformance(hw(), work());
    expect(p.avgFps).toBeGreaterThan(0);
    expect(p.fpsRange[0]).toBeLessThanOrEqual(p.avgFps);
    expect(p.fpsRange[1]).toBeGreaterThanOrEqual(p.avgFps);
    expect(p.lowFps).toBeLessThanOrEqual(p.avgFps);
    expect(p.recommendedRamMb).toBeGreaterThan(0);
    expect(['unplayable', 'choppy', 'playable', 'smooth', 'excellent']).toContain(p.rating);
  });

  it('optimization mods substantially raise FPS', () => {
    const base = predictPerformance(hw(), work({ optimizationMods: false }));
    const opt = predictPerformance(hw(), work({ optimizationMods: true }));
    expect(opt.avgFps).toBeGreaterThan(base.avgFps * 1.5);
    // And it should surface a recommendation when missing.
    expect(base.recommendations.some((r) => /sodium|embeddium|performance/i.test(r.title))).toBe(true);
  });

  it('shaders reduce FPS and can shift the bottleneck to the GPU', () => {
    const noShader = predictPerformance(hw(), work({ optimizationMods: true }));
    const shader = predictPerformance(hw(), work({ optimizationMods: true, shaders: true }));
    expect(shader.avgFps).toBeLessThan(noShader.avgFps);
  });

  it('more mods reduce FPS', () => {
    const few = predictPerformance(hw(), work({ modCount: 30 }));
    const many = predictPerformance(hw(), work({ modCount: 400 }));
    expect(many.avgFps).toBeLessThan(few.avgFps);
  });

  it('higher render distance reduces FPS', () => {
    const low = predictPerformance(hw(), work({ renderDistance: 8 }));
    const high = predictPerformance(hw(), work({ renderDistance: 24 }));
    expect(high.avgFps).toBeLessThan(low.avgFps);
  });

  it('flags insufficient RAM as the bottleneck with a critical recommendation', () => {
    const p = predictPerformance(hw(), work({ modCount: 400, heavyMods: true, allocatedRamMb: 1536 }));
    expect(p.ramSufficient).toBe(false);
    expect(p.bottleneck).toBe('ram');
    expect(p.recommendations.some((r) => r.severity === 'critical')).toBe(true);
  });

  it('stronger hardware predicts higher FPS', () => {
    const weak = predictPerformance(
      hw({ gpu: scoreGpu('Intel UHD Graphics 630'), cpu: scoreCpu('Intel Core i5-8400', 6, 6, 2.8) }),
      work({ optimizationMods: true })
    );
    const strong = predictPerformance(
      hw({ gpu: scoreGpu('RTX 4090'), cpu: scoreCpu('AMD Ryzen 7 7800X3D', 8, 16, 4.2) }),
      work({ optimizationMods: true })
    );
    expect(strong.avgFps).toBeGreaterThan(weak.avgFps);
    expect(strong.ratingScore).toBeGreaterThan(weak.ratingScore);
  });

  it('integrated GPU + heavy pack is rated poorly', () => {
    const p = predictPerformance(
      hw({ gpu: scoreGpu('Intel UHD Graphics 630'), totalRamMb: 8192 }),
      work({ modCount: 250, heavyMods: true, optimizationMods: false, shaders: true })
    );
    expect(['unplayable', 'choppy']).toContain(p.rating);
  });

  it('reports higher confidence for detected, recognised hardware', () => {
    const known = predictPerformance(hw(), work());
    const unknown = predictPerformance(
      hw({ gpu: scoreGpu('Unknown GPU'), cpu: scoreCpu('Unknown CPU', 4, 8, 3), source: 'estimated' }),
      work()
    );
    expect(known.confidence).toBe('high');
    expect(unknown.confidence).not.toBe('high');
  });
});
