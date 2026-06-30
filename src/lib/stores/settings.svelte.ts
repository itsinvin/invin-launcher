import { getSettings, saveSettings } from '$lib/api';
import type { Settings } from '$lib/types';

const DEFAULTS: Settings = {
  theme: 'dark',
  accent: '#7c5cff',
  defaultMemoryMb: 4096,
  defaultJavaPath: null,
  concurrentDownloads: 8,
  closeOnLaunch: false,
  redactLogs: true,
  onboarded: false
};

class SettingsStore {
  current = $state<Settings>({ ...DEFAULTS });
  loaded = $state(false);

  async load() {
    try {
      this.current = await getSettings();
    } catch (e) {
      console.error('Failed to load settings, using defaults', e);
      this.current = { ...DEFAULTS };
    }
    this.loaded = true;
    this.apply();
  }

  async update(patch: Partial<Settings>) {
    this.current = { ...this.current, ...patch };
    this.apply();
    try {
      this.current = await saveSettings(this.current);
    } catch (e) {
      console.error('Failed to persist settings', e);
    }
  }

  /** Apply theme + accent to the document root. */
  apply() {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.current.theme);
    document.documentElement.style.setProperty('--invin-accent', this.current.accent);
  }
}

export const settings = new SettingsStore();
