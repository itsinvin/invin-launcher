//! Application state + JSON persistence.

use crate::models::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::process::Child;

pub type RunningMap = Arc<Mutex<HashMap<String, Child>>>;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Data {
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub accounts: Vec<Account>,
    #[serde(default)]
    pub instances: Vec<Instance>,
    /// instanceId -> installed mods
    #[serde(default)]
    pub mods: HashMap<String, Vec<InstalledMod>>,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub inner: Mutex<Data>,
    pub running: RunningMap,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        let data = Self::load_from(&data_dir).unwrap_or_default();
        let http = reqwest::Client::builder()
            .user_agent("invin-launcher/0.1 (https://github.com/itsinvin/invin-launcher)")
            .build()
            .unwrap_or_default();
        AppState {
            data_dir,
            inner: Mutex::new(data),
            running: Arc::new(Mutex::new(HashMap::new())),
            http,
        }
    }

    fn data_file(dir: &Path) -> PathBuf {
        dir.join("invin-data.json")
    }

    fn load_from(dir: &Path) -> Option<Data> {
        let raw = std::fs::read_to_string(Self::data_file(dir)).ok()?;
        serde_json::from_str(&raw).ok()
    }

    /// Persist the current in-memory data to disk.
    pub fn save(&self) {
        if let Ok(data) = self.inner.lock() {
            if let Ok(json) = serde_json::to_string_pretty(&*data) {
                let _ = std::fs::write(Self::data_file(&self.data_dir), json);
            }
        }
    }

    pub fn instances_dir(&self) -> PathBuf {
        self.data_dir.join("instances")
    }

    pub fn instance_dir(&self, id: &str) -> PathBuf {
        self.instances_dir().join(id)
    }

    /// Shared content-addressed store used to hard-link mods (dedup across instances).
    pub fn mod_cache_dir(&self) -> PathBuf {
        self.data_dir.join("mod-cache")
    }

    pub fn shared_dir(&self) -> PathBuf {
        self.data_dir.join("shared")
    }
}
