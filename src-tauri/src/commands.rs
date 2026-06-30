//! Tauri command surface — the API the SvelteKit frontend calls via `invoke`.

use crate::auth;
use crate::launch;
use crate::logs;
use crate::models::*;
use crate::net;
use crate::store::AppState;
use invin_core::models::HardwareProfile;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

type R<T> = Result<T, String>;

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}
fn uid() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ---- Settings ----
#[tauri::command]
pub fn get_settings(state: State<AppState>) -> R<Settings> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.settings.clone())
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Settings) -> R<Settings> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        data.settings = settings.clone();
    }
    state.save();
    Ok(settings)
}

// ---- Accounts ----
#[tauri::command]
pub fn list_accounts(state: State<AppState>) -> R<Vec<Account>> {
    let data = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(data.accounts.iter().map(|a| a.sanitized()).collect())
}

#[tauri::command]
pub async fn begin_login(state: State<'_, AppState>) -> R<AuthDeviceCode> {
    auth::begin_login(&state.http).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_login(state: State<'_, AppState>, device_code: String) -> R<Account> {
    let account = auth::poll_login(&state.http, &device_code).await.map_err(|e| e.to_string())?;
    let sanitized = account.sanitized();
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        for a in data.accounts.iter_mut() {
            a.active = false;
        }
        data.accounts.push(account);
    }
    state.save();
    Ok(sanitized)
}

#[tauri::command]
pub fn add_offline_account(state: State<AppState>, username: String) -> R<Account> {
    let acc = Account {
        id: uid(),
        username: username.clone(),
        uuid: offline_uuid(&username),
        active: true,
        expires_at: 0,
        refresh_token: None,
        access_token: None,
    };
    let sanitized = acc.sanitized();
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        for a in data.accounts.iter_mut() {
            a.active = false;
        }
        data.accounts.push(acc);
    }
    state.save();
    Ok(sanitized)
}

#[tauri::command]
pub fn set_active_account(state: State<AppState>, id: String) -> R<()> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        for a in data.accounts.iter_mut() {
            a.active = a.id == id;
        }
    }
    state.save();
    Ok(())
}

#[tauri::command]
pub fn remove_account(state: State<AppState>, id: String) -> R<()> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        data.accounts.retain(|a| a.id != id);
    }
    state.save();
    Ok(())
}

// ---- Versions / loaders ----
#[tauri::command]
pub async fn list_mc_versions(state: State<'_, AppState>, include_snapshots: bool) -> R<Vec<VersionSummary>> {
    net::list_mc_versions(&state.http, include_snapshots).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_loader_versions(state: State<'_, AppState>, loader: String, mc_version: String) -> R<Vec<LoaderVersion>> {
    net::list_loader_versions(&state.http, &loader, &mc_version).await.map_err(|e| e.to_string())
}

// ---- Instances ----
#[tauri::command]
pub fn list_instances(state: State<AppState>) -> R<Vec<Instance>> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.instances.clone())
}

#[tauri::command]
pub fn create_instance(state: State<AppState>, draft: InstanceDraft) -> R<Instance> {
    let inst = Instance {
        id: uid(),
        name: draft.name,
        mc_version: draft.mc_version,
        loader: draft.loader,
        loader_version: draft.loader_version,
        group: draft.group,
        tags: vec![],
        memory_mb: None,
        java_path: None,
        jvm_args: None,
        account_id: None,
        icon_color: draft.icon_color,
        pinned: false,
        last_played: None,
        total_play_seconds: 0,
        created_at: now(),
    };
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        data.instances.push(inst.clone());
    }
    std::fs::create_dir_all(state.instance_dir(&inst.id)).ok();
    state.save();
    Ok(inst)
}

#[tauri::command]
pub fn update_instance(state: State<AppState>, instance: Instance) -> R<Instance> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(slot) = data.instances.iter_mut().find(|i| i.id == instance.id) {
            *slot = instance.clone();
        }
    }
    state.save();
    Ok(instance)
}

#[tauri::command]
pub fn clone_instance(state: State<AppState>, id: String, name: String) -> R<Instance> {
    let copy = {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        let src = data.instances.iter().find(|i| i.id == id).cloned().ok_or("instance not found")?;
        let copy = Instance {
            id: uid(),
            name,
            last_played: None,
            total_play_seconds: 0,
            created_at: now(),
            ..src
        };
        let mods = data.mods.get(&id).cloned().unwrap_or_default();
        let cloned_mods: Vec<InstalledMod> = mods
            .into_iter()
            .map(|m| InstalledMod { id: uid(), instance_id: copy.id.clone(), ..m })
            .collect();
        data.instances.push(copy.clone());
        data.mods.insert(copy.id.clone(), cloned_mods);
        copy
    };
    std::fs::create_dir_all(state.instance_dir(&copy.id)).ok();
    state.save();
    Ok(copy)
}

#[tauri::command]
pub fn delete_instance(state: State<AppState>, id: String) -> R<()> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        data.instances.retain(|i| i.id != id);
        data.mods.remove(&id);
    }
    std::fs::remove_dir_all(state.instance_dir(&id)).ok();
    state.save();
    Ok(())
}

#[tauri::command]
pub async fn launch_instance(app: AppHandle, state: State<'_, AppState>, id: String) -> R<()> {
    launch::launch(app, state.inner(), id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_instance(state: State<AppState>, id: String) -> R<()> {
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    if let Some(child) = running.get_mut(&id) {
        let _ = child.start_kill();
    }
    Ok(())
}

#[tauri::command]
pub fn open_instance_folder(state: State<AppState>, id: String) -> R<()> {
    let path = state.instance_dir(&id);
    std::fs::create_dir_all(&path).ok();
    open_path(&path.to_string_lossy());
    Ok(())
}

#[tauri::command]
pub fn get_crash_report(state: State<AppState>, id: String) -> R<CrashReport> {
    let log_path = state.instance_dir(&id).join("logs").join("invin-latest.jsonl");
    let text = std::fs::read_to_string(&log_path).unwrap_or_default();
    let messages: String = text
        .lines()
        .filter_map(|l| serde_json::from_str::<LogLine>(l).ok())
        .map(|l| l.message)
        .collect::<Vec<_>>()
        .join("\n");
    let (detected, summary, suggestions) = logs::analyze_crash(&messages);
    Ok(CrashReport { detected, summary, suggestions })
}

// ---- Mods ----
#[tauri::command]
pub async fn search_mods(state: State<'_, AppState>, query: String, mc_version: Option<String>, loader: Option<String>) -> R<Vec<ModProject>> {
    net::search_mods(&state.http, &query, mc_version.as_deref(), loader.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mod_versions(state: State<'_, AppState>, project_id: String, mc_version: String, loader: String) -> R<Vec<ModVersion>> {
    net::get_mod_versions(&state.http, &project_id, &mc_version, &loader)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_mod(state: State<'_, AppState>, instance_id: String, project_id: String, version_id: String) -> R<InstalledMod> {
    let version = net::get_mod_version(&state.http, &version_id).await.map_err(|e| e.to_string())?;
    let title = net::get_project_title(&state.http, &project_id).await.unwrap_or_else(|_| project_id.clone());

    // Content-addressed cache (dedup), then hard-link into the instance mods folder.
    let cache = state.mod_cache_dir();
    std::fs::create_dir_all(&cache).ok();
    let cached = cache.join(&version.sha1);
    if !cached.exists() && !version.file_url.is_empty() {
        let bytes = state
            .http
            .get(&version.file_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        std::fs::write(&cached, &bytes).map_err(|e| e.to_string())?;
    }
    let mods_dir = state.instance_dir(&instance_id).join("mods");
    std::fs::create_dir_all(&mods_dir).ok();
    let target = mods_dir.join(&version.file_name);
    let _ = std::fs::remove_file(&target);
    if std::fs::hard_link(&cached, &target).is_err() {
        let _ = std::fs::copy(&cached, &target);
    }

    let installed = InstalledMod {
        id: uid(),
        instance_id: instance_id.clone(),
        project_id: Some(project_id),
        version_id: Some(version_id),
        name: title,
        file_name: version.file_name,
        source: "modrinth".into(),
        enabled: true,
        sha1: version.sha1,
    };
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        data.mods.entry(instance_id).or_default().push(installed.clone());
    }
    state.save();
    Ok(installed)
}

#[tauri::command]
pub fn list_installed_mods(state: State<AppState>, instance_id: String) -> R<Vec<InstalledMod>> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.mods.get(&instance_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn toggle_mod(state: State<AppState>, mod_id: String, enabled: bool) -> R<()> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        let dir_updates: Vec<(String, String, bool)> = {
            let mut updates = vec![];
            for (inst_id, mods) in data.mods.iter_mut() {
                if let Some(m) = mods.iter_mut().find(|m| m.id == mod_id) {
                    m.enabled = enabled;
                    updates.push((inst_id.clone(), m.file_name.clone(), enabled));
                }
            }
            updates
        };
        for (inst_id, file_name, en) in dir_updates {
            toggle_mod_file(&state.instance_dir(&inst_id).join("mods"), &file_name, en);
        }
    }
    state.save();
    Ok(())
}

#[tauri::command]
pub fn remove_mod(state: State<AppState>, mod_id: String) -> R<()> {
    {
        let mut data = state.inner.lock().map_err(|e| e.to_string())?;
        for (inst_id, mods) in data.mods.iter_mut() {
            if let Some(pos) = mods.iter().position(|m| m.id == mod_id) {
                let m = mods.remove(pos);
                let mods_dir = state.instance_dir(inst_id).join("mods");
                let _ = std::fs::remove_file(mods_dir.join(&m.file_name));
                let _ = std::fs::remove_file(mods_dir.join(format!("{}.disabled", m.file_name)));
                break;
            }
        }
    }
    state.save();
    Ok(())
}

// ---- Hardware ----
#[tauri::command]
pub fn detect_hardware() -> R<HardwareProfile> {
    Ok(invin_core::detect_hardware())
}

// ---- Logs ----
#[tauri::command]
pub fn get_instance_log(state: State<AppState>, id: String) -> R<Vec<LogLine>> {
    let log_path = state.instance_dir(&id).join("logs").join("invin-latest.jsonl");
    let text = std::fs::read_to_string(&log_path).unwrap_or_default();
    Ok(text.lines().filter_map(|l| serde_json::from_str::<LogLine>(l).ok()).collect())
}

#[tauri::command]
pub fn export_sanitized_log(state: State<AppState>, id: String) -> R<String> {
    let dir = state.instance_dir(&id).join("logs");
    let log_path = dir.join("invin-latest.jsonl");
    let text = std::fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let out: String = text
        .lines()
        .filter_map(|l| serde_json::from_str::<LogLine>(l).ok())
        .map(|l| format!("[{}] {}", l.level, l.message))
        .collect::<Vec<_>>()
        .join("\n");
    let export_path = dir.join("invin-export.log");
    std::fs::write(&export_path, &out).map_err(|e| e.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

// ---- helpers ----
fn offline_uuid(username: &str) -> String {
    let mut h: u32 = 0;
    for b in username.bytes() {
        h = h.wrapping_mul(31).wrapping_add(b as u32);
    }
    let hex = format!("{:032x}", h as u128);
    format!(
        "{}-{}-3{}-8{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[13..16],
        &hex[17..20],
        &hex[20..32]
    )
}

fn toggle_mod_file(mods_dir: &std::path::Path, file_name: &str, enabled: bool) {
    let enabled_path = mods_dir.join(file_name);
    let disabled_path = mods_dir.join(format!("{file_name}.disabled"));
    if enabled {
        let _ = std::fs::rename(&disabled_path, &enabled_path);
    } else {
        let _ = std::fs::rename(&enabled_path, &disabled_path);
    }
}

fn open_path(path: &str) {
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(path).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(path).spawn();
}
