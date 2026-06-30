import { detectHardware } from '$lib/api';
import { scoreCpu, scoreGpu } from '$lib/prediction';
import type { HardwareProfile } from '$lib/types';

const STORAGE_KEY = 'invin:hardware-override';

/** Holds the active hardware profile (auto-detected, with optional manual overrides). */
class HardwareStore {
  profile = $state<HardwareProfile | null>(null);
  detected = $state<HardwareProfile | null>(null);
  loaded = $state(false);
  detecting = $state(false);

  async init() {
    await this.detect();
    const override = this.loadOverride();
    if (override) this.profile = override;
    this.loaded = true;
  }

  async detect(): Promise<void> {
    this.detecting = true;
    try {
      const hw = await detectHardware();
      this.detected = hw;
      if (!this.profile) this.profile = hw;
    } catch (e) {
      console.error('Hardware detection failed', e);
    } finally {
      this.detecting = false;
    }
  }

  /** Apply a manual override (e.g. user picked a different GPU/CPU). */
  setOverride(patch: Partial<HardwareProfile>) {
    const base = this.profile ?? this.detected;
    if (!base) return;
    const next: HardwareProfile = { ...base, ...patch, source: 'manual' };
    this.profile = next;
    this.saveOverride(next);
  }

  /** Re-score after the user edits the GPU model string. */
  setGpuModel(model: string, vramMb: number | null) {
    const base = this.profile ?? this.detected;
    if (!base) return;
    this.setOverride({ gpu: scoreGpu(model, vramMb ?? base.gpu.vramMb) });
  }

  setCpuModel(brand: string) {
    const base = this.profile ?? this.detected;
    if (!base) return;
    this.setOverride({
      cpu: scoreCpu(brand, base.cpu.physicalCores, base.cpu.logicalCores, base.cpu.baseGhz)
    });
  }

  resetToDetected() {
    if (this.detected) this.profile = this.detected;
    this.clearOverride();
  }

  private loadOverride(): HardwareProfile | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as HardwareProfile) : null;
    } catch {
      return null;
    }
  }
  private saveOverride(hw: HardwareProfile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hw));
    } catch {
      /* ignore */
    }
  }
  private clearOverride() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const hardware = new HardwareStore();
