//! Minecraft launch pipeline.
//!
//! Resolves a version (vanilla, with optional Fabric/Quilt profile merge), downloads
//! the client jar, libraries, natives and assets, assembles the JVM command line, and
//! spawns the game while streaming (redacted) logs back to the UI.
//!
//! Forge / NeoForge require their own installers and are reported as not-yet-supported
//! rather than launched incorrectly.

use crate::logs;
use crate::models::{LogLine, ProgressEvent};
use crate::store::AppState;
use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn classpath_sep() -> char {
    if cfg!(target_os = "windows") {
        ';'
    } else {
        ':'
    }
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn emit_progress(app: &AppHandle, task_id: &str, stage: &str, current: u64, total: u64, message: &str) {
    let _ = app.emit(
        "invin://progress",
        ProgressEvent {
            task_id: task_id.to_string(),
            stage: stage.to_string(),
            current,
            total,
            message: message.to_string(),
        },
    );
}

/// Download a file if missing (optionally verifying a sha1).
async fn download_file(http: &Client, url: &str, dest: &Path, sha1: Option<&str>) -> Result<()> {
    if dest.exists() {
        if let Some(expected) = sha1 {
            if let Ok(bytes) = tokio::fs::read(dest).await {
                if sha1_hex(&bytes) == expected {
                    return Ok(());
                }
            }
        } else {
            return Ok(());
        }
    }
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    let bytes = http
        .get(url)
        .send()
        .await
        .with_context(|| format!("download {url}"))?
        .error_for_status()?
        .bytes()
        .await?;
    tokio::fs::write(dest, &bytes).await?;
    Ok(())
}

fn sha1_hex(bytes: &[u8]) -> String {
    use sha1::{Digest, Sha1};
    let mut h = Sha1::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

/// A maven coordinate ("group:artifact:version[:classifier]") -> relative path.
fn maven_to_path(coord: &str) -> String {
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return coord.replace(':', "/");
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 { format!("-{}", parts[3]) } else { String::new() };
    format!("{group}/{artifact}/{version}/{artifact}-{version}{classifier}.jar")
}

fn rules_allow(rules: &Value) -> bool {
    let Some(arr) = rules.as_array() else { return true };
    let mut allowed = false;
    for rule in arr {
        let action = rule["action"].as_str().unwrap_or("allow");
        // We don't support "features" gating; treat feature rules as not matching.
        if rule.get("features").is_some() {
            continue;
        }
        let matches = match rule.get("os").and_then(|o| o.get("name")).and_then(|n| n.as_str()) {
            Some(name) => name == os_name(),
            None => true,
        };
        if matches {
            allowed = action == "allow";
        }
    }
    allowed
}

struct Resolved {
    libraries_classpath: Vec<PathBuf>,
    main_class: String,
    asset_index_id: String,
    extra_game_args: Vec<String>,
    extra_jvm_args: Vec<String>,
}

async fn resolve_version_json(http: &Client, versions_dir: &Path, mc_version: &str) -> Result<Value> {
    let dest = versions_dir.join(mc_version).join(format!("{mc_version}.json"));
    if let Ok(raw) = tokio::fs::read_to_string(&dest).await {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            return Ok(v);
        }
    }
    let manifest: Value = http
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await?
        .json()
        .await?;
    let url = manifest["versions"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["id"].as_str() == Some(mc_version)))
        .and_then(|x| x["url"].as_str())
        .ok_or_else(|| anyhow!("Minecraft version {mc_version} not found"))?
        .to_string();
    let v: Value = http.get(&url).send().await?.json().await?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(&dest, serde_json::to_vec(&v)?).await.ok();
    Ok(v)
}

/// Launch an instance. `instance_id`, account and settings are read up front so the
/// state lock is never held across an await.
pub async fn launch(app: AppHandle, state: &AppState, instance_id: String) -> Result<()> {
    let (instance, account, settings) = {
        let data = state.inner.lock().map_err(|_| anyhow!("state poisoned"))?;
        let instance = data
            .instances
            .iter()
            .find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| anyhow!("instance not found"))?;
        let account = instance
            .account_id
            .as_ref()
            .and_then(|aid| data.accounts.iter().find(|a| &a.id == aid))
            .or_else(|| data.accounts.iter().find(|a| a.active))
            .cloned();
        (instance, account, data.settings.clone())
    };

    if instance.loader == "forge" || instance.loader == "neoforge" {
        bail!("Launching {} packs is not yet supported by the native runner. Vanilla, Fabric and Quilt are supported.", instance.loader);
    }

    let http = &state.http;
    let task = instance.id.clone();
    emit_progress(&app, &task, "Preparing", 0, 100, "Resolving version");

    let libraries_dir = state.shared_dir().join("libraries");
    let versions_dir = state.shared_dir().join("versions");
    let assets_dir = state.shared_dir().join("assets");
    let game_dir = state.instance_dir(&instance.id);
    let natives_dir = game_dir.join("natives");
    tokio::fs::create_dir_all(&game_dir).await.ok();
    tokio::fs::create_dir_all(&natives_dir).await.ok();

    let version_json = resolve_version_json(http, &versions_dir, &instance.mc_version).await?;

    // Client jar.
    let client_url = version_json["downloads"]["client"]["url"].as_str().ok_or_else(|| anyhow!("no client jar"))?;
    let client_sha1 = version_json["downloads"]["client"]["sha1"].as_str();
    let client_jar = versions_dir.join(&instance.mc_version).join(format!("{}.jar", instance.mc_version));
    emit_progress(&app, &task, "Downloading", 10, 100, "Client jar");
    download_file(http, client_url, &client_jar, client_sha1).await?;

    // Vanilla libraries + natives.
    let mut classpath: Vec<PathBuf> = vec![client_jar.clone()];
    if let Some(libs) = version_json["libraries"].as_array() {
        let total = libs.len() as u64;
        for (i, lib) in libs.iter().enumerate() {
            emit_progress(&app, &task, "Downloading", 20 + (i as u64 * 40 / total.max(1)), 100, "Libraries");
            if !rules_allow(&lib["rules"]) {
                continue;
            }
            if let Some(artifact) = lib["downloads"]["artifact"].as_object() {
                let path = artifact["path"].as_str().unwrap_or_default();
                let url = artifact["url"].as_str().unwrap_or_default();
                let sha1 = artifact["sha1"].as_str();
                if !path.is_empty() && !url.is_empty() {
                    let dest = libraries_dir.join(path);
                    download_file(http, url, &dest, sha1).await?;
                    classpath.push(dest);
                }
            }
            // Natives.
            if let Some(classifier) = lib["natives"][os_name()].as_str() {
                let key = classifier.replace("${arch}", if cfg!(target_pointer_width = "64") { "64" } else { "32" });
                if let Some(native) = lib["downloads"]["classifiers"][&key].as_object() {
                    let url = native["url"].as_str().unwrap_or_default();
                    let path = native["path"].as_str().unwrap_or_default();
                    if !url.is_empty() {
                        let dest = libraries_dir.join(path);
                        download_file(http, url, &dest, native["sha1"].as_str()).await?;
                        extract_natives(&dest, &natives_dir)?;
                    }
                }
            }
        }
    }

    // Assets.
    emit_progress(&app, &task, "Downloading", 60, 100, "Assets");
    let asset_index_id = version_json["assetIndex"]["id"].as_str().unwrap_or("legacy").to_string();
    download_assets(http, &version_json, &assets_dir).await?;

    // Optional Fabric/Quilt merge.
    let mut resolved = Resolved {
        libraries_classpath: classpath,
        main_class: version_json["mainClass"].as_str().unwrap_or("net.minecraft.client.main.Main").to_string(),
        asset_index_id: asset_index_id.clone(),
        extra_game_args: vec![],
        extra_jvm_args: vec![],
    };
    if instance.loader == "fabric" || instance.loader == "quilt" {
        merge_loader_profile(http, &instance, &libraries_dir, &mut resolved).await?;
    }

    // Java.
    let java = resolve_java(&instance, &settings)?;
    let memory = instance.memory_mb.unwrap_or(settings.default_memory_mb);

    // Build the command line.
    let classpath_str = resolved
        .libraries_classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(&classpath_sep().to_string());

    let placeholder = |s: &str| -> String {
        s.replace("${auth_player_name}", account.as_ref().map(|a| a.username.as_str()).unwrap_or("Player"))
            .replace("${version_name}", &instance.mc_version)
            .replace("${game_directory}", &game_dir.to_string_lossy())
            .replace("${assets_root}", &assets_dir.to_string_lossy())
            .replace("${assets_index_name}", &resolved.asset_index_id)
            .replace("${auth_uuid}", account.as_ref().map(|a| a.uuid.as_str()).unwrap_or("0"))
            .replace("${auth_access_token}", account.as_ref().and_then(|a| a.access_token.as_deref()).unwrap_or("0"))
            .replace("${clientid}", "0")
            .replace("${auth_xuid}", "0")
            .replace("${user_type}", "msa")
            .replace("${version_type}", "release")
            .replace("${natives_directory}", &natives_dir.to_string_lossy())
            .replace("${launcher_name}", "invin")
            .replace("${launcher_version}", "0.1.0")
            .replace("${classpath}", &classpath_str)
    };

    let mut args: Vec<String> = Vec::new();
    args.push(format!("-Xmx{memory}M"));
    args.push(format!("-Xms{}M", (memory / 2).max(512)));
    args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    args.push("-cp".into());
    args.push(classpath_str.clone());
    if let Some(extra) = &instance.jvm_args {
        for a in extra.split_whitespace() {
            args.push(a.to_string());
        }
    }
    args.extend(resolved.extra_jvm_args.iter().map(|s| placeholder(s)));
    args.push(resolved.main_class.clone());

    // Game args (modern arguments.game or legacy minecraftArguments).
    if let Some(game) = version_json["arguments"]["game"].as_array() {
        for entry in game {
            if let Some(s) = entry.as_str() {
                args.push(placeholder(s));
            } else if rules_allow(&entry["rules"]) {
                if let Some(s) = entry["value"].as_str() {
                    args.push(placeholder(s));
                } else if let Some(vals) = entry["value"].as_array() {
                    for v in vals {
                        if let Some(s) = v.as_str() {
                            args.push(placeholder(s));
                        }
                    }
                }
            }
        }
    } else if let Some(legacy) = version_json["minecraftArguments"].as_str() {
        for a in legacy.split_whitespace() {
            args.push(placeholder(a));
        }
    }
    args.extend(resolved.extra_game_args.iter().map(|s| placeholder(s)));

    emit_progress(&app, &task, "Launching", 100, 100, "Starting game");

    let mut child = Command::new(&java)
        .args(&args)
        .current_dir(&game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to start java at {java}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut running = state.running.lock().map_err(|_| anyhow!("state poisoned"))?;
        running.insert(instance.id.clone(), child);
    }

    // Mark last-played + persist.
    {
        if let Ok(mut data) = state.inner.lock() {
            if let Some(inst) = data.instances.iter_mut().find(|i| i.id == instance.id) {
                inst.last_played = Some(now());
            }
        }
        state.save();
    }

    let logs_dir = game_dir.join("logs");
    tokio::fs::create_dir_all(&logs_dir).await.ok();
    let log_path = logs_dir.join("invin-latest.jsonl");
    let _ = tokio::fs::write(&log_path, b"").await; // truncate for the new session
    spawn_log_pumps(app.clone(), settings.redact_logs, instance.id.clone(), log_path, stdout, stderr);

    // Reaper: wait for exit, then notify the UI.
    let app2 = app.clone();
    let iid = instance.id.clone();
    let running = state.running.clone();
    tokio::spawn(async move {
        let child = {
            let mut guard = running.lock().ok();
            guard.as_mut().and_then(|r| r.remove(&iid))
        };
        if let Some(mut child) = child {
            let _ = child.wait().await;
            let _ = app2.emit("invin://instance-exit", iid.clone());
        }
    });

    Ok(())
}

fn spawn_log_pumps(
    app: AppHandle,
    redact: bool,
    instance_id: String,
    log_path: PathBuf,
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
) {
    if let Some(out) = stdout {
        pump(app.clone(), redact, instance_id.clone(), log_path.clone(), out);
    }
    if let Some(err) = stderr {
        pump(app, redact, instance_id, log_path, err);
    }
}

fn pump<R>(app: AppHandle, redact: bool, instance_id: String, log_path: PathBuf, reader: R)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    use std::io::Write;
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let msg = if redact { logs::redact(&line) } else { line.clone() };
            let entry = LogLine {
                instance_id: instance_id.clone(),
                level: logs::level_of(&line).to_string(),
                message: msg,
                timestamp: now(),
            };
            if let Ok(json) = serde_json::to_string(&entry) {
                if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                    let _ = writeln!(f, "{json}");
                }
            }
            let _ = app.emit("invin://log", entry);
        }
    });
}

fn extract_natives(jar: &Path, natives_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(jar)?;
    let mut archive = zip::ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        if name.starts_with("META-INF/") || name.ends_with('/') {
            continue;
        }
        let out = natives_dir.join(&name);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let mut outfile = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}

async fn download_assets(http: &Client, version_json: &Value, assets_dir: &Path) -> Result<()> {
    let index_id = version_json["assetIndex"]["id"].as_str().unwrap_or("legacy");
    let index_url = version_json["assetIndex"]["url"].as_str().unwrap_or_default();
    if index_url.is_empty() {
        return Ok(());
    }
    let index_dest = assets_dir.join("indexes").join(format!("{index_id}.json"));
    download_file(http, index_url, &index_dest, version_json["assetIndex"]["sha1"].as_str()).await?;
    let index: Value = serde_json::from_slice(&tokio::fs::read(&index_dest).await?)?;
    if let Some(objects) = index["objects"].as_object() {
        for (_name, obj) in objects {
            let hash = obj["hash"].as_str().unwrap_or_default();
            if hash.len() < 2 {
                continue;
            }
            let sub = &hash[0..2];
            let url = format!("https://resources.download.minecraft.net/{sub}/{hash}");
            let dest = assets_dir.join("objects").join(sub).join(hash);
            download_file(http, &url, &dest, Some(hash)).await?;
        }
    }
    Ok(())
}

async fn merge_loader_profile(
    http: &Client,
    instance: &crate::models::Instance,
    libraries_dir: &Path,
    resolved: &mut Resolved,
) -> Result<()> {
    let loader_version = instance
        .loader_version
        .clone()
        .ok_or_else(|| anyhow!("no {} loader version selected", instance.loader))?;
    let url = if instance.loader == "fabric" {
        format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
            instance.mc_version, loader_version
        )
    } else {
        format!(
            "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
            instance.mc_version, loader_version
        )
    };
    let profile: Value = http.get(&url).send().await?.json().await?;
    if let Some(main) = profile["mainClass"].as_str() {
        resolved.main_class = main.to_string();
    }
    if let Some(libs) = profile["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or_default();
            let base = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");
            if name.is_empty() {
                continue;
            }
            let rel = maven_to_path(name);
            let dl_url = format!("{}{}", base.trim_end_matches('/'), format!("/{rel}"));
            let dest = libraries_dir.join(&rel);
            if download_file(http, &dl_url, &dest, None).await.is_ok() {
                resolved.libraries_classpath.push(dest);
            }
        }
    }
    Ok(())
}

fn resolve_java(instance: &crate::models::Instance, settings: &crate::models::Settings) -> Result<String> {
    if let Some(p) = instance.java_path.clone().filter(|s| !s.is_empty()) {
        return Ok(p);
    }
    if let Some(p) = settings.default_java_path.clone().filter(|s| !s.is_empty()) {
        return Ok(p);
    }
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let candidate = Path::new(&home).join("bin").join(if cfg!(windows) { "java.exe" } else { "java" });
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }
    Ok("java".to_string())
}
