// Browser fallback layer.
//
// invin's "real" data path is the Rust/Tauri backend (`src-tauri`). However, the
// whole UI — including the headline performance-prediction feature — is designed to
// also work in a plain browser (e.g. `vite dev`, the web demo, or before the native
// shell has booted). This module provides best-effort implementations using public
// APIs, `localStorage` persistence, and browser hardware introspection so nothing in
// the app is a dead end without the backend.

import type {
  Account,
  HardwareProfile,
  Instance,
  InstanceDraft,
  InstalledMod,
  LoaderKind,
  LoaderVersion,
  ModProject,
  ModVersion,
  Settings,
  VersionSummary,
  WorkloadProfile
} from './types';
import { scoreCpu, scoreGpu } from './prediction';

const KEY = (k: string) => `invin:${k}`;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(KEY(key), JSON.stringify(value));
  } catch {
    /* ignore quota / private mode errors */
  }
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const now = () => Math.floor(Date.now() / 1000);

// ---- Settings ----
const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: '#7c5cff',
  defaultMemoryMb: 4096,
  defaultJavaPath: null,
  concurrentDownloads: 8,
  closeOnLaunch: false,
  redactLogs: true,
  onboarded: false
};

export const browser = {
  getSettings(): Settings {
    return load('settings', DEFAULT_SETTINGS);
  },
  saveSettings(settings: Settings): Settings {
    save('settings', settings);
    return settings;
  },

  // ---- Accounts (offline/demo profiles; real MSA login requires the backend) ----
  listAccounts(): Account[] {
    return load<Account[]>('accounts', []);
  },
  addOfflineAccount(username: string): Account {
    const list = browser.listAccounts().map((a) => ({ ...a, active: false }));
    const acc: Account = {
      id: uid(),
      username,
      // Deterministic offline UUID (v3-style placeholder).
      uuid: offlineUuid(username),
      active: true,
      expiresAt: 0
    };
    list.push(acc);
    save('accounts', list);
    return acc;
  },
  setActiveAccount(id: string): void {
    save(
      'accounts',
      browser.listAccounts().map((a) => ({ ...a, active: a.id === id }))
    );
  },
  removeAccount(id: string): void {
    save(
      'accounts',
      browser.listAccounts().filter((a) => a.id !== id)
    );
  },

  // ---- Versions / loaders (public APIs) ----
  async listMcVersions(includeSnapshots: boolean): Promise<VersionSummary[]> {
    const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    const data = await res.json();
    return (data.versions as any[])
      .filter((v) => includeSnapshots || v.type === 'release')
      .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
  },
  async listLoaderVersions(loader: LoaderKind, mcVersion: string): Promise<LoaderVersion[]> {
    try {
      if (loader === 'fabric') {
        const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
        const d = await r.json();
        return (d as any[]).map((x) => ({ version: x.loader.version, stable: x.loader.stable }));
      }
      if (loader === 'quilt') {
        const r = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`);
        const d = await r.json();
        return (d as any[]).map((x) => ({ version: x.loader.version, stable: !x.loader.version.includes('beta') }));
      }
      // Forge / NeoForge / vanilla: keep it simple in browser mode.
      return [];
    } catch {
      return [];
    }
  },

  // ---- Instances ----
  listInstances(): Instance[] {
    return load<Instance[]>('instances', []);
  },
  createInstance(draft: InstanceDraft): Instance {
    const list = browser.listInstances();
    const inst: Instance = {
      id: uid(),
      name: draft.name,
      mcVersion: draft.mcVersion,
      loader: draft.loader,
      loaderVersion: draft.loaderVersion,
      group: draft.group,
      tags: [],
      memoryMb: null,
      javaPath: null,
      jvmArgs: null,
      accountId: null,
      iconColor: draft.iconColor,
      pinned: false,
      lastPlayed: null,
      totalPlaySeconds: 0,
      createdAt: now()
    };
    list.push(inst);
    save('instances', list);
    return inst;
  },
  updateInstance(instance: Instance): Instance {
    save(
      'instances',
      browser.listInstances().map((i) => (i.id === instance.id ? instance : i))
    );
    return instance;
  },
  cloneInstance(id: string, name: string): Instance {
    const src = browser.listInstances().find((i) => i.id === id);
    if (!src) throw new Error('instance not found');
    const copy: Instance = { ...src, id: uid(), name, createdAt: now(), lastPlayed: null, totalPlaySeconds: 0 };
    const list = browser.listInstances();
    list.push(copy);
    save('instances', list);
    // Copy installed mods too.
    save(`mods:${copy.id}`, browser.listInstalledMods(id).map((m) => ({ ...m, id: uid(), instanceId: copy.id })));
    return copy;
  },
  deleteInstance(id: string): void {
    save(
      'instances',
      browser.listInstances().filter((i) => i.id !== id)
    );
    save(`mods:${id}`, []);
  },

  // ---- Mods (Modrinth) ----
  async searchMods(query: string, mcVersion: string | null, loader: LoaderKind | null): Promise<ModProject[]> {
    const facets: string[][] = [['project_type:mod']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);
    const url = new URL('https://api.modrinth.com/v2/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '30');
    url.searchParams.set('index', 'relevance');
    url.searchParams.set('facets', JSON.stringify(facets));
    const r = await fetch(url, { headers: { 'User-Agent': 'invin-launcher/0.1 (browser-demo)' } });
    const d = await r.json();
    return (d.hits as any[]).map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      iconUrl: h.icon_url ?? null,
      categories: h.categories ?? [],
      source: 'modrinth'
    }));
  },
  async getModVersions(projectId: string, mcVersion: string, loader: LoaderKind): Promise<ModVersion[]> {
    const url = new URL(`https://api.modrinth.com/v2/project/${projectId}/version`);
    url.searchParams.set('game_versions', JSON.stringify([mcVersion]));
    if (loader !== 'vanilla') url.searchParams.set('loaders', JSON.stringify([loader]));
    const r = await fetch(url);
    const d = await r.json();
    return (d as any[]).map((v) => {
      const primary = (v.files as any[]).find((f) => f.primary) ?? v.files[0] ?? {};
      return {
        versionId: v.id,
        versionNumber: v.version_number,
        name: v.name,
        downloads: v.downloads,
        datePublished: v.date_published,
        gameVersions: v.game_versions,
        loaders: v.loaders,
        fileName: primary.filename ?? '',
        fileUrl: primary.url ?? '',
        fileSize: primary.size ?? 0,
        sha1: primary.hashes?.sha1 ?? '',
        dependencies: (v.dependencies ?? []).map((dep: any) => ({
          projectId: dep.project_id ?? null,
          versionId: dep.version_id ?? null,
          dependencyType: dep.dependency_type
        }))
      };
    });
  },
  async installMod(instanceId: string, projectId: string, versionId: string): Promise<InstalledMod> {
    // Browser mode can't download to disk; record the selection so the UI is coherent.
    let title = projectId;
    let fileName = `${projectId}.jar`;
    let sha1 = versionId;
    try {
      const r = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
      const v = await r.json();
      const primary = (v.files as any[]).find((f) => f.primary) ?? v.files[0] ?? {};
      fileName = primary.filename ?? fileName;
      sha1 = primary.hashes?.sha1 ?? sha1;
      const p = await fetch(`https://api.modrinth.com/v2/project/${projectId}`).then((x) => x.json());
      title = p.title ?? title;
    } catch {
      /* offline: use placeholders */
    }
    const mod: InstalledMod = {
      id: uid(),
      instanceId,
      projectId,
      versionId,
      name: title,
      fileName,
      source: 'modrinth',
      enabled: true,
      sha1
    };
    const list = browser.listInstalledMods(instanceId);
    list.push(mod);
    save(`mods:${instanceId}`, list);
    return mod;
  },
  listInstalledMods(instanceId: string): InstalledMod[] {
    return load<InstalledMod[]>(`mods:${instanceId}`, []);
  },
  toggleMod(modId: string, enabled: boolean): void {
    // Find which instance owns it.
    for (const inst of browser.listInstances()) {
      const mods = browser.listInstalledMods(inst.id);
      const idx = mods.findIndex((m) => m.id === modId);
      if (idx >= 0) {
        mods[idx] = { ...mods[idx], enabled };
        save(`mods:${inst.id}`, mods);
        return;
      }
    }
  },
  removeMod(modId: string): void {
    for (const inst of browser.listInstances()) {
      const mods = browser.listInstalledMods(inst.id);
      if (mods.some((m) => m.id === modId)) {
        save(
          `mods:${inst.id}`,
          mods.filter((m) => m.id !== modId)
        );
        return;
      }
    }
  },

  // ---- Hardware detection (browser introspection) ----
  detectHardware(): HardwareProfile {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    const physical = Math.max(1, Math.round(cores / 2));
    // navigator.deviceMemory is capped at 8 by browsers; treat it as a lower bound.
    const dmem = (navigator as any).deviceMemory as number | undefined;
    const totalRamMb = dmem ? Math.max(dmem, 8) * 1024 : 16384;

    const gpuModel = detectWebglRenderer() ?? 'Unknown GPU';
    const gpu = scoreGpu(gpuModel, null);
    const cpu = scoreCpu(detectCpuBrand(), physical, cores, estimateGhz());

    return {
      cpu,
      gpu,
      totalRamMb,
      os: detectOs(),
      arch: (navigator as any).userAgentData?.platform?.includes('arm') ? 'aarch64' : 'x86_64',
      storage: 'unknown',
      source: 'estimated'
    };
  }
};

function offlineUuid(username: string): string {
  // Deterministic placeholder UUID from the username.
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  const hex = (h.toString(16) + '0'.repeat(32)).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-3${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function detectWebglRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      if (r) return r;
    }
    return gl.getParameter(gl.RENDERER) as string;
  } catch {
    return null;
  }
}

function detectCpuBrand(): string {
  const ua = navigator.userAgent || '';
  if (/Mac/.test(ua) && /Apple/.test((navigator as any).vendor || '')) {
    return 'Apple Silicon';
  }
  return 'Unknown CPU';
}

function estimateGhz(): number {
  return 3.5; // browsers don't expose clock speed; a sane modern default
}

function detectOs(): string {
  const ua = navigator.userAgent || '';
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

/** Derive a WorkloadProfile from an instance + its installed mods + settings. */
export function workloadFromInstance(
  instance: Instance,
  mods: InstalledMod[],
  defaultMemoryMb: number
): WorkloadProfile {
  const names = mods.filter((m) => m.enabled).map((m) => (m.name + ' ' + m.fileName).toLowerCase());
  const optimizationMods = names.some((n) =>
    /sodium|lithium|ferritecore|embeddium|rubidium|modernfix|c2me|krypton|starlight|immediatelyfast/.test(n)
  );
  const shaders = names.some((n) => /iris|oculus|optifine/.test(n));
  const heavyMods = names.some((n) =>
    /create|terralith|biomesoplenty|alex|ad astra|gregtech|industrial|mekanism|immersive|farmer|twilight|oh the biomes|botania|thaumcraft/.test(n)
  );
  return {
    name: instance.name,
    mcVersion: instance.mcVersion,
    loader: instance.loader,
    modCount: mods.filter((m) => m.enabled).length,
    allocatedRamMb: instance.memoryMb ?? defaultMemoryMb,
    renderDistance: 12,
    shaders,
    optimizationMods,
    heavyMods
  };
}
