//! Network data sources: Mojang version manifest, Fabric/Quilt meta, Modrinth.

use crate::models::*;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::Value;

pub async fn list_mc_versions(http: &Client, include_snapshots: bool) -> Result<Vec<VersionSummary>> {
    let v: Value = http
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await?
        .json()
        .await?;
    let arr = v["versions"].as_array().ok_or_else(|| anyhow!("bad manifest"))?;
    Ok(arr
        .iter()
        .filter(|x| include_snapshots || x["type"].as_str() == Some("release"))
        .map(|x| VersionSummary {
            id: x["id"].as_str().unwrap_or_default().to_string(),
            kind: x["type"].as_str().unwrap_or_default().to_string(),
            release_time: x["releaseTime"].as_str().unwrap_or_default().to_string(),
        })
        .collect())
}

pub async fn list_loader_versions(http: &Client, loader: &str, mc_version: &str) -> Result<Vec<LoaderVersion>> {
    match loader {
        "fabric" => {
            let v: Value = http
                .get(format!("https://meta.fabricmc.net/v2/versions/loader/{mc_version}"))
                .send()
                .await?
                .json()
                .await?;
            Ok(v.as_array()
                .map(|a| {
                    a.iter()
                        .map(|x| LoaderVersion {
                            version: x["loader"]["version"].as_str().unwrap_or_default().to_string(),
                            stable: x["loader"]["stable"].as_bool().unwrap_or(false),
                        })
                        .collect()
                })
                .unwrap_or_default())
        }
        "quilt" => {
            let v: Value = http
                .get(format!("https://meta.quiltmc.org/v3/versions/loader/{mc_version}"))
                .send()
                .await?
                .json()
                .await?;
            Ok(v.as_array()
                .map(|a| {
                    a.iter()
                        .map(|x| {
                            let ver = x["loader"]["version"].as_str().unwrap_or_default().to_string();
                            let stable = !ver.contains("beta");
                            LoaderVersion { version: ver, stable }
                        })
                        .collect()
                })
                .unwrap_or_default())
        }
        // Forge / NeoForge resolution is performed at install time; return empty here.
        _ => Ok(vec![]),
    }
}

pub async fn search_mods(
    http: &Client,
    query: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<ModProject>> {
    let mut facets: Vec<Vec<String>> = vec![vec!["project_type:mod".into()]];
    if let Some(mc) = mc_version {
        facets.push(vec![format!("versions:{mc}")]);
    }
    if let Some(l) = loader {
        if l != "vanilla" {
            facets.push(vec![format!("categories:{l}")]);
        }
    }
    let facets_str = serde_json::to_string(&facets)?;
    let v: Value = http
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query", query),
            ("limit", "30"),
            ("index", "relevance"),
            ("facets", &facets_str),
        ])
        .send()
        .await?
        .json()
        .await?;
    let hits = v["hits"].as_array().cloned().unwrap_or_default();
    Ok(hits
        .iter()
        .map(|h| ModProject {
            project_id: h["project_id"].as_str().unwrap_or_default().to_string(),
            slug: h["slug"].as_str().unwrap_or_default().to_string(),
            title: h["title"].as_str().unwrap_or_default().to_string(),
            description: h["description"].as_str().unwrap_or_default().to_string(),
            author: h["author"].as_str().unwrap_or_default().to_string(),
            downloads: h["downloads"].as_u64().unwrap_or(0),
            icon_url: h["icon_url"].as_str().map(|s| s.to_string()),
            categories: h["categories"]
                .as_array()
                .map(|a| a.iter().filter_map(|c| c.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            source: "modrinth".into(),
        })
        .collect())
}

pub async fn get_mod_versions(
    http: &Client,
    project_id: &str,
    mc_version: &str,
    loader: &str,
) -> Result<Vec<ModVersion>> {
    let game_versions = serde_json::to_string(&[mc_version])?;
    let mut req = http
        .get(format!("https://api.modrinth.com/v2/project/{project_id}/version"))
        .query(&[("game_versions", game_versions.as_str())]);
    if loader != "vanilla" {
        let loaders = serde_json::to_string(&[loader])?;
        req = req.query(&[("loaders", loaders)]);
    }
    let v: Value = req.send().await?.json().await?;
    let arr = v.as_array().cloned().unwrap_or_default();
    Ok(arr.iter().map(parse_mod_version).collect())
}

pub async fn get_mod_version(http: &Client, version_id: &str) -> Result<ModVersion> {
    let v: Value = http
        .get(format!("https://api.modrinth.com/v2/version/{version_id}"))
        .send()
        .await?
        .json()
        .await?;
    Ok(parse_mod_version(&v))
}

fn parse_mod_version(v: &Value) -> ModVersion {
    let files = v["files"].as_array().cloned().unwrap_or_default();
    let primary = files
        .iter()
        .find(|f| f["primary"].as_bool() == Some(true))
        .or_else(|| files.first())
        .cloned()
        .unwrap_or(Value::Null);
    ModVersion {
        version_id: v["id"].as_str().unwrap_or_default().to_string(),
        version_number: v["version_number"].as_str().unwrap_or_default().to_string(),
        name: v["name"].as_str().unwrap_or_default().to_string(),
        downloads: v["downloads"].as_u64().unwrap_or(0),
        date_published: v["date_published"].as_str().unwrap_or_default().to_string(),
        game_versions: v["game_versions"]
            .as_array()
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        loaders: v["loaders"]
            .as_array()
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        file_name: primary["filename"].as_str().unwrap_or_default().to_string(),
        file_url: primary["url"].as_str().unwrap_or_default().to_string(),
        file_size: primary["size"].as_u64().unwrap_or(0),
        sha1: primary["hashes"]["sha1"].as_str().unwrap_or_default().to_string(),
        dependencies: v["dependencies"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|d| ModDependency {
                        project_id: d["project_id"].as_str().map(String::from),
                        version_id: d["version_id"].as_str().map(String::from),
                        dependency_type: d["dependency_type"].as_str().unwrap_or("required").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

pub async fn get_project_title(http: &Client, project_id: &str) -> Result<String> {
    let v: Value = http
        .get(format!("https://api.modrinth.com/v2/project/{project_id}"))
        .send()
        .await?
        .json()
        .await?;
    Ok(v["title"].as_str().unwrap_or(project_id).to_string())
}
