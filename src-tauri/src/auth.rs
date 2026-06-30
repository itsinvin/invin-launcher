//! Microsoft account authentication via the OAuth 2.0 device-code flow, followed by
//! the Xbox Live -> XSTS -> Minecraft services token exchange.
//!
//! The Azure application (public client) id is read from the `INVIN_AZURE_CLIENT_ID`
//! environment variable so distributors supply their own. Online login is unavailable
//! until it is configured.

use crate::models::{Account, AuthDeviceCode};
use anyhow::{anyhow, bail, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const SCOPE: &str = "XboxLive.signin offline_access";

fn client_id() -> Result<String> {
    std::env::var("INVIN_AZURE_CLIENT_ID")
        .map_err(|_| anyhow!("Online login is not configured. Set INVIN_AZURE_CLIENT_ID to your Azure app (public client) id."))
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

pub async fn begin_login(http: &Client) -> Result<AuthDeviceCode> {
    let cid = client_id()?;
    let v: Value = http
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[("client_id", cid.as_str()), ("scope", SCOPE)])
        .send()
        .await?
        .json()
        .await?;
    Ok(AuthDeviceCode {
        user_code: v["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: v["verification_uri"].as_str().unwrap_or_default().to_string(),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
        interval: v["interval"].as_u64().unwrap_or(5),
        device_code: v["device_code"].as_str().unwrap_or_default().to_string(),
    })
}

/// Poll until the user authorises (or the code expires), then complete the full
/// token exchange and return a ready-to-use Minecraft account.
pub async fn poll_login(http: &Client, device_code: &str) -> Result<Account> {
    let cid = client_id()?;
    let (ms_access, refresh) = poll_ms_token(http, &cid, device_code).await?;
    complete_minecraft_login(http, &ms_access, refresh).await
}

async fn poll_ms_token(http: &Client, cid: &str, device_code: &str) -> Result<(String, Option<String>)> {
    let mut interval = 5u64;
    for _ in 0..120 {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        let resp: Value = http
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", cid),
                ("device_code", device_code),
            ])
            .send()
            .await?
            .json()
            .await?;
        if let Some(token) = resp["access_token"].as_str() {
            let refresh = resp["refresh_token"].as_str().map(String::from);
            return Ok((token.to_string(), refresh));
        }
        match resp["error"].as_str() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                interval += 5;
                continue;
            }
            Some(other) => bail!("Microsoft login failed: {other}"),
            None => bail!("Unexpected token response"),
        }
    }
    bail!("Login timed out")
}

/// Exchange an MSA access token for a Minecraft account (XBL -> XSTS -> MC -> profile).
async fn complete_minecraft_login(http: &Client, ms_access: &str, refresh: Option<String>) -> Result<Account> {
    // Xbox Live
    let xbl: Value = http
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({
            "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms_access}") },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .json()
        .await?;
    let xbl_token = xbl["Token"].as_str().ok_or_else(|| anyhow!("XBL auth failed"))?.to_string();
    let uhs = xbl["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or_else(|| anyhow!("missing uhs"))?.to_string();

    // XSTS
    let xsts: Value = http
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .json()
        .await?;
    let xsts_token = xsts["Token"].as_str().ok_or_else(|| anyhow!("XSTS auth failed (account may not own Minecraft)"))?.to_string();

    // Minecraft services
    let mc: Value = http
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
        .send()
        .await?
        .json()
        .await?;
    let mc_access = mc["access_token"].as_str().ok_or_else(|| anyhow!("Minecraft login failed"))?.to_string();
    let expires_in = mc["expires_in"].as_i64().unwrap_or(86400);

    // Profile
    let profile: Value = http
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_access)
        .send()
        .await?
        .json()
        .await?;
    let uuid = profile["id"].as_str().ok_or_else(|| anyhow!("No Minecraft profile (does this account own the game?)"))?.to_string();
    let name = profile["name"].as_str().unwrap_or("Player").to_string();

    Ok(Account {
        id: uuid::Uuid::new_v4().to_string(),
        username: name,
        uuid,
        active: true,
        expires_at: now() + expires_in,
        refresh_token: refresh,
        access_token: Some(mc_access),
    })
}
