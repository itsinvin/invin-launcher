import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Account,
  AuthDeviceCode,
  CrashReport,
  Instance,
  InstanceDraft,
  InstalledMod,
  LoaderKind,
  LoaderVersion,
  LogLine,
  ModProject,
  ModVersion,
  ProgressEvent,
  Settings,
  VersionSummary
} from './types';

// Thin, typed wrapper around the Tauri command surface (`src-tauri/src/commands.rs`).

// ---- Settings ----
export const getSettings = () => invoke<Settings>('get_settings');
export const saveSettings = (settings: Settings) => invoke<Settings>('save_settings', { settings });

// ---- Accounts ----
export const listAccounts = () => invoke<Account[]>('list_accounts');
export const beginLogin = () => invoke<AuthDeviceCode>('begin_login');
export const pollLogin = (deviceCode: string) => invoke<Account>('poll_login', { deviceCode });
export const setActiveAccount = (id: string) => invoke<void>('set_active_account', { id });
export const removeAccount = (id: string) => invoke<void>('remove_account', { id });

// ---- Versions / loaders ----
export const listMcVersions = (includeSnapshots: boolean) =>
  invoke<VersionSummary[]>('list_mc_versions', { includeSnapshots });
export const listLoaderVersions = (loader: LoaderKind, mcVersion: string) =>
  invoke<LoaderVersion[]>('list_loader_versions', { loader, mcVersion });

// ---- Instances ----
export const listInstances = () => invoke<Instance[]>('list_instances');
export const createInstance = (draft: InstanceDraft) => invoke<Instance>('create_instance', { draft });
export const updateInstance = (instance: Instance) => invoke<Instance>('update_instance', { instance });
export const cloneInstance = (id: string, name: string) =>
  invoke<Instance>('clone_instance', { id, name });
export const deleteInstance = (id: string) => invoke<void>('delete_instance', { id });
export const launchInstance = (id: string) => invoke<void>('launch_instance', { id });
export const killInstance = (id: string) => invoke<void>('kill_instance', { id });
export const openInstanceFolder = (id: string) => invoke<void>('open_instance_folder', { id });
export const getCrashReport = (id: string) => invoke<CrashReport>('get_crash_report', { id });

// ---- Mods ----
export const searchMods = (query: string, mcVersion: string | null, loader: LoaderKind | null) =>
  invoke<ModProject[]>('search_mods', { query, mcVersion, loader });
export const getModVersions = (projectId: string, mcVersion: string, loader: LoaderKind) =>
  invoke<ModVersion[]>('get_mod_versions', { projectId, mcVersion, loader });
export const installMod = (instanceId: string, projectId: string, versionId: string) =>
  invoke<InstalledMod>('install_mod', { instanceId, projectId, versionId });
export const listInstalledMods = (instanceId: string) =>
  invoke<InstalledMod[]>('list_installed_mods', { instanceId });
export const toggleMod = (modId: string, enabled: boolean) =>
  invoke<void>('toggle_mod', { modId, enabled });
export const removeMod = (modId: string) => invoke<void>('remove_mod', { modId });

// ---- Logs ----
export const getInstanceLog = (id: string) => invoke<LogLine[]>('get_instance_log', { id });
export const exportSanitizedLog = (id: string) => invoke<string>('export_sanitized_log', { id });

// ---- Event subscriptions ----
export const onProgress = (cb: (e: ProgressEvent) => void): Promise<UnlistenFn> =>
  listen<ProgressEvent>('invin://progress', (e) => cb(e.payload));
export const onLog = (cb: (e: LogLine) => void): Promise<UnlistenFn> =>
  listen<LogLine>('invin://log', (e) => cb(e.payload));
export const onInstanceExit = (cb: (id: string) => void): Promise<UnlistenFn> =>
  listen<string>('invin://instance-exit', (e) => cb(e.payload));
