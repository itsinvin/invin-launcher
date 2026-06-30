//! Launcher domain models — mirror `src/lib/types.ts` (camelCase JSON).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub active: bool,
    pub expires_at: i64,
    /// Microsoft refresh token. Persisted locally; stripped before reaching the frontend.
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Minecraft access token. Persisted locally; stripped before reaching the frontend.
    #[serde(default)]
    pub access_token: Option<String>,
}

impl Account {
    /// A copy with secrets removed, safe to send to the UI.
    pub fn sanitized(&self) -> Account {
        Account {
            refresh_token: None,
            access_token: None,
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub group: Option<String>,
    pub tags: Vec<String>,
    pub memory_mb: Option<u32>,
    pub java_path: Option<String>,
    pub jvm_args: Option<String>,
    pub account_id: Option<String>,
    pub icon_color: String,
    pub pinned: bool,
    pub last_played: Option<i64>,
    pub total_play_seconds: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceDraft {
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub group: Option<String>,
    pub icon_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub release_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersion {
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProject {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDependency {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub dependency_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModVersion {
    pub version_id: String,
    pub version_number: String,
    pub name: String,
    pub downloads: u64,
    pub date_published: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub file_name: String,
    pub file_url: String,
    pub file_size: u64,
    pub sha1: String,
    pub dependencies: Vec<ModDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub id: String,
    pub instance_id: String,
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub name: String,
    pub file_name: String,
    pub source: String,
    pub enabled: bool,
    pub sha1: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub accent: String,
    pub default_memory_mb: u32,
    pub default_java_path: Option<String>,
    pub concurrent_downloads: u32,
    pub close_on_launch: bool,
    pub redact_logs: bool,
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".into(),
            accent: "#7c5cff".into(),
            default_memory_mb: 4096,
            default_java_path: None,
            concurrent_downloads: 8,
            close_on_launch: false,
            redact_logs: true,
            onboarded: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub task_id: String,
    pub stage: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub instance_id: String,
    pub level: String,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthDeviceCode {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub device_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub detected: bool,
    pub summary: String,
    pub suggestions: Vec<String>,
}
