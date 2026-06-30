//! Log handling with automatic redaction of sensitive values (access tokens, etc.).

/// Replace anything that looks like a secret with a placeholder.
pub fn redact(line: &str) -> String {
    let mut out = line.to_string();
    // Minecraft / OAuth access tokens often appear after these markers.
    for marker in ["--accessToken", "accessToken", "access_token", "session token", "Bearer "] {
        if let Some(pos) = out.find(marker) {
            let start = pos + marker.len();
            // Redact the following whitespace-delimited token.
            let tail = &out[start..];
            let trimmed = tail.trim_start();
            let ws = tail.len() - trimmed.len();
            let end_rel = trimmed.find(|c: char| c.is_whitespace()).unwrap_or(trimmed.len());
            if end_rel > 0 {
                let abs_start = start + ws;
                let abs_end = abs_start + end_rel;
                out.replace_range(abs_start..abs_end, "[REDACTED]");
            }
        }
    }
    // Long JWT-like blobs (three base64 segments).
    out = redact_jwts(&out);
    out
}

fn redact_jwts(s: &str) -> String {
    s.split_whitespace()
        .map(|tok| {
            let dots = tok.matches('.').count();
            if dots == 2 && tok.len() > 60 && tok.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
                "[REDACTED]".to_string()
            } else {
                tok.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Classify a raw log line into a level for the UI.
pub fn level_of(line: &str) -> &'static str {
    let l = line.to_ascii_lowercase();
    if l.contains("/error") || l.contains(" error") || l.contains("exception") || l.contains("fatal") {
        "error"
    } else if l.contains("/warn") || l.contains(" warn") {
        "warn"
    } else if l.contains("/debug") {
        "debug"
    } else {
        "info"
    }
}

/// Heuristic crash analysis from a log tail.
pub fn analyze_crash(log: &str) -> (bool, String, Vec<String>) {
    let mut suggestions = Vec::new();
    let lower = log.to_ascii_lowercase();
    let mut summary = String::new();
    let mut detected = false;

    if lower.contains("java.lang.outofmemoryerror") {
        detected = true;
        summary = "The game ran out of memory.".into();
        suggestions.push("Increase allocated RAM in the instance settings.".into());
        suggestions.push("Add FerriteCore / remove memory-heavy mods.".into());
    } else if lower.contains("could not reserve enough space") || lower.contains("unrecognized vm option") {
        detected = true;
        summary = "The JVM failed to start with the given memory/flags.".into();
        suggestions.push("Lower allocated RAM, or install a 64-bit Java runtime.".into());
    } else if lower.contains("incompatible") && lower.contains("mod") {
        detected = true;
        summary = "A mod is incompatible with this Minecraft/loader version.".into();
        suggestions.push("Check the crash log for the named mod and update or remove it.".into());
    } else if lower.contains("mixin") && lower.contains("apply") {
        detected = true;
        summary = "A mod mixin failed to apply (often a version mismatch).".into();
        suggestions.push("Ensure all mods match your Minecraft + loader version.".into());
    } else if lower.contains("exception") || lower.contains("crash") {
        detected = true;
        summary = "The game crashed. See the log for details.".into();
        suggestions.push("Review the stack trace for the offending mod.".into());
    }

    (detected, summary, suggestions)
}
