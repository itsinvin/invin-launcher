# invin launcher — feature plan & roadmap

This document plans how invin becomes a "way better and more advanced" launcher than
[PandoraLauncher](https://github.com/Moulberry/PandoraLauncher), and how each idea
enhances the experience. Items marked **[done]** ship in this repo today; the rest are
sequenced by value and dependency (no calendar estimates — this is an autonomous
project).

## Baseline: Pandora parity

Pandora's strengths, and where invin stands:

| Pandora feature | invin status |
| --- | --- |
| Instance management | **[done]** create/edit/clone/delete, per-instance RAM/JVM/Java, pinning, groups, tags |
| Mod browser (Modrinth) | **[done]** search + install + enable/disable/remove |
| Mod deduplication (hard links) | **[done]** content-addressed cache + hard links into instances |
| Secure account credentials | **[done]** MSA device-code flow; tokens persisted locally, never sent to the UI *(roadmap: OS keyring)* |
| Custom game output / logs | **[done]** live log streaming + per-instance log files |
| Sensitive-info redaction in logs | **[done]** access-token & JWT redaction |
| Cross-instance file syncing | **[planned]** (see below) |
| Modpack management | **[partial]** instances + Modrinth; pack import planned |

## The differentiator: hardware-aware intelligence

This is what sets invin apart.

### 1. Performance prediction **[done]**
Estimate FPS (avg + 1% lows), RAM usage/sufficiency, launch time, bottleneck,
worldgen-lag risk and a smoothness rating for any modpack on the user's exact
hardware — *before* installing — with prioritised, actionable recommendations.
Implemented identically in TS and Rust, unit-tested, with live what-if controls and
modpack presets. **Why it helps:** users stop wasting time installing packs that turn
into a slideshow, and get a clear, ranked to-do list to fix performance.

### 2. One-click "optimize this pack" **[planned]**
Turn each recommendation into an action: auto-install Sodium/Lithium/FerriteCore (or
Embeddium/ModernFix for Forge), set the predicted-ideal RAM, apply tuned G1GC flags,
and re-run the prediction to show the gain. **Why:** closes the loop between insight
and fix.

### 3. Smart memory & JVM auto-tuning **[partial → planned]**
Onboarding already suggests an ideal default RAM. Next: per-instance auto-allocation
based on the predicted working set, Aikar-style flags applied automatically, and a
warning when an oversized heap will cause GC frame spikes. **Why:** most "lag" is
mis-tuned memory; invin fixes it without forum threads.

### 4. Live in-game telemetry feedback loop **[planned]**
Capture real FPS/frame-time/RAM from a running instance (log/JMX/agent) and feed it
back to calibrate the prediction model per-machine over time. **Why:** turns the
heuristic model into a personalised, self-improving one.

### 5. Pre-flight compatibility scan **[planned]**
Before launch, validate that all mods match the MC + loader version, detect missing
dependencies and known incompatibilities (via Modrinth dependency graph), and surface
issues with fixes. **Why:** prevents the most common crash class entirely.

## Experience enhancements

- **Modpack import/export [planned]** — Modrinth `.mrpack` and CurseForge zip import;
  export an instance as a shareable pack.
- **CurseForge source [planned]** — add CF alongside Modrinth in the mod browser.
- **Cross-instance sync [planned]** — share options.txt, keybinds, resource packs and
  saves between instances (Pandora-style), with conflict handling.
- **Crash assistant [partial → planned]** — current heuristic diagnosis expands into a
  guided fixer that can apply the suggested change.
- **OS keyring for tokens [planned]** — move secrets from the local data file into the
  platform keyring.
- **Java runtime management [planned]** — auto-download the correct Mojang/Adoptium JRE
  per MC version, removing manual Java setup.
- **Forge / NeoForge launching [planned]** — run their installers and merge profiles
  (vanilla + Fabric + Quilt already supported).
- **Accessibility & themes [partial]** — dark/light + accent colours today; full
  keyboard navigation and reduced-motion next.
- **Per-instance performance history [planned]** — chart predicted vs. measured FPS over
  time as the pack and hardware change.

## Quality bar

- Shared types between Rust and TypeScript to keep the boundary honest.
- The prediction engine is pure and unit-tested in both languages (29 tests today).
- The UI runs in a plain browser via a fallback layer, so it's always demonstrable.
