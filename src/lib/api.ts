import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Account,
  AuthDeviceCode,
  CrashReport,
  HardwareProfile,
  Instance,
  InstanceDraft,
  InstalledMod,
  LoaderKind,
  LoaderVersion,
  LogLine,
  ModProject,
  ModVersion,
  PerformancePrediction,
  ProgressEvent,
  Settings,
  VersionSummary,
  WorkloadProfile
} from './types';
import { browser, workloadFromInstance } from './browser';
import { predictPerformance as predictLocal } from './prediction';

// invin runs in two modes:
//  - Native (Tauri): commands are handled by the Rust backend in `src-tauri`.
//  - Browser (dev/web demo): we transparently fall back to `./browser` so every
//    screen — including performance prediction — works without the native shell.

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Invoke a Tauri command, or run the browser fallback when not in Tauri. */
async function cmd<T>(name: string, args: Record<string, unknown>, fallback: () => T | Promise<T>): Promise<T> {
  if (isTauri()) return invoke<T>(name, args);
  return fallback();
}

// ---- Settings ----
export const getSettings = () => cmd('get_settings', {}, () => browser.getSettings());
export const saveSettings = (settings: Settings) =>
  cmd('save_settings', { settings }, () => browser.saveSettings(settings));

// ---- Accounts ----
export const listAccounts = () => cmd('list_accounts', {}, () => browser.listAccounts());
export const beginLogin = () => invoke<AuthDeviceCode>('begin_login');
export const pollLogin = (deviceCode: string) => invoke<Account>('poll_login', { deviceCode });
export const addOfflineAccount = (username: string) =>
  cmd('add_offline_account', { username }, () => browser.addOfflineAccount(username));
export const setActiveAccount = (id: string) =>
  cmd<void>('set_active_account', { id }, () => browser.setActiveAccount(id));
export const removeAccount = (id: string) => cmd<void>('remove_account', { id }, () => browser.removeAccount(id));

// ---- Versions / loaders ----
export const listMcVersions = (includeSnapshots: boolean) =>
  cmd('list_mc_versions', { includeSnapshots }, () => browser.listMcVersions(includeSnapshots));
export const listLoaderVersions = (loader: LoaderKind, mcVersion: string) =>
  cmd('list_loader_versions', { loader, mcVersion }, () => browser.listLoaderVersions(loader, mcVersion));

// ---- Instances ----
export const listInstances = () => cmd('list_instances', {}, () => browser.listInstances());
export const createInstance = (draft: InstanceDraft) =>
  cmd('create_instance', { draft }, () => browser.createInstance(draft));
export const updateInstance = (instance: Instance) =>
  cmd('update_instance', { instance }, () => browser.updateInstance(instance));
export const cloneInstance = (id: string, name: string) =>
  cmd('clone_instance', { id, name }, () => browser.cloneInstance(id, name));
export const deleteInstance = (id: string) => cmd<void>('delete_instance', { id }, () => browser.deleteInstance(id));
export const launchInstance = (id: string) =>
  cmd<void>('launch_instance', { id }, () => {
    throw new Error('Launching the game requires the native invin app.');
  });
export const killInstance = (id: string) =>
  cmd<void>('kill_instance', { id }, () => {
    throw new Error('Not running.');
  });
export const openInstanceFolder = (id: string) =>
  cmd<void>('open_instance_folder', { id }, () => {
    throw new Error('Folder access requires the native invin app.');
  });
export const getCrashReport = (id: string) =>
  cmd<CrashReport>('get_crash_report', { id }, () => ({ detected: false, summary: '', suggestions: [] }));

// ---- Mods ----
export const searchMods = (query: string, mcVersion: string | null, loader: LoaderKind | null) =>
  cmd('search_mods', { query, mcVersion, loader }, () => browser.searchMods(query, mcVersion, loader));
export const getModVersions = (projectId: string, mcVersion: string, loader: LoaderKind) =>
  cmd('get_mod_versions', { projectId, mcVersion, loader }, () => browser.getModVersions(projectId, mcVersion, loader));
export const installMod = (instanceId: string, projectId: string, versionId: string) =>
  cmd('install_mod', { instanceId, projectId, versionId }, () => browser.installMod(instanceId, projectId, versionId));
export const listInstalledMods = (instanceId: string) =>
  cmd('list_installed_mods', { instanceId }, () => browser.listInstalledMods(instanceId));
export const toggleMod = (modId: string, enabled: boolean) =>
  cmd<void>('toggle_mod', { modId, enabled }, () => browser.toggleMod(modId, enabled));
export const removeMod = (modId: string) => cmd<void>('remove_mod', { modId }, () => browser.removeMod(modId));

// ---- Hardware & performance prediction ----
export const detectHardware = () =>
  cmd<HardwareProfile>('detect_hardware', {}, () => browser.detectHardware());

/**
 * Predict performance for a hardware + workload pair.
 *
 * Prediction is pure computation, so it always runs in the (unit-tested) TypeScript
 * engine in both browser and native modes — this guarantees identical results
 * everywhere. The Rust backend mirrors the same model (`invin-core`) for any
 * server-side use and to keep the two implementations in lock-step.
 */
export const predictPerformance = (hardware: HardwareProfile, workload: WorkloadProfile): PerformancePrediction =>
  predictLocal(hardware, workload);

/** Build a WorkloadProfile from an existing instance (analyses its installed mods). */
export async function analyzeInstanceWorkload(instanceId: string): Promise<WorkloadProfile> {
  const all = await listInstances();
  const inst = all.find((i) => i.id === instanceId);
  if (!inst) throw new Error('instance not found');
  const mods = await listInstalledMods(instanceId);
  const settings = await getSettings();
  return workloadFromInstance(inst, mods, settings.defaultMemoryMb);
}

// ---- Logs ----
export const getInstanceLog = (id: string) =>
  cmd<LogLine[]>('get_instance_log', { id }, () => [] as LogLine[]);
export const exportSanitizedLog = (id: string) =>
  cmd<string>('export_sanitized_log', { id }, () => {
    throw new Error('Log export requires the native invin app.');
  });

// ---- Event subscriptions (native only; harmless no-ops in the browser) ----
export const onProgress = (cb: (e: ProgressEvent) => void): Promise<UnlistenFn> =>
  isTauri()
    ? listen<ProgressEvent>('invin://progress', (e) => cb(e.payload))
    : Promise.resolve((() => {}) as UnlistenFn);
export const onLog = (cb: (e: LogLine) => void): Promise<UnlistenFn> =>
  isTauri()
    ? listen<LogLine>('invin://log', (e) => cb(e.payload))
    : Promise.resolve((() => {}) as UnlistenFn);
export const onInstanceExit = (cb: (id: string) => void): Promise<UnlistenFn> =>
  isTauri()
    ? listen<string>('invin://instance-exit', (e) => cb(e.payload))
    : Promise.resolve((() => {}) as UnlistenFn);
