<div align="center">

# invin launcher

**A next-generation, hardware-aware Minecraft launcher.**

Predict how a modpack will run on *your* machine before you install it — then manage instances, mods and accounts in a fast, modern UI.

Built with **Tauri 2** (Rust) + **SvelteKit 5** + **Tailwind CSS 4**.

</div>

---

## Why invin?

invin is a spiritual successor to launchers like [PandoraLauncher](https://github.com/Moulberry/PandoraLauncher) — it keeps the things power users love (clean instance management, Modrinth integration, mod dedup, log redaction) and adds a headline capability no other launcher has out of the box:

> ### Will it run? Find out *before* you install.
> invin's **Performance Predictor** estimates the FPS, RAM usage, launch time, and the limiting bottleneck for any modpack on your exact hardware, and tells you precisely what to change to make it smoother.

## Features

### Performance prediction (the headline feature)
- Detects your CPU, GPU, RAM, OS and storage (via `sysinfo` + native GPU probing).
- Estimates **average & 1%-low FPS**, **RAM usage / sufficiency**, **launch time**, **worldgen-lag risk**, and the limiting **bottleneck** (CPU / GPU / RAM / storage).
- Gives a smoothness **rating** and **prioritised, actionable recommendations** (e.g. *"Install Sodium → ~140% FPS"*, *"Increase RAM to 6 GB"*, *"Use a lighter shader preset"*).
- **Live what-if controls** + modpack presets (Vanilla, Fabulously Optimized, ATM9, RLCraft-style…), plus per-instance analysis of your actually-installed mods.
- Transparent, documented heuristic model with built-in GPU/CPU benchmark tables — **not a black box** — implemented identically in TypeScript and Rust and covered by **29 unit tests** (15 TS + 14 Rust).

### Launcher essentials (Pandora parity, and then some)
- **Instances** — create / edit / clone / delete, per-instance RAM, JVM args, Java path, pinning, groups & tags.
- **Mods** — browse & install from Modrinth, enable/disable, remove. Installs are **deduplicated** via a content-addressed cache and **hard-linked** into instances (no wasted disk).
- **Accounts** — Microsoft sign-in via the OAuth **device-code flow** (XBL → XSTS → Minecraft), plus offline profiles. Tokens are persisted locally and **never sent to the UI**.
- **Native launch pipeline** — resolves the version, downloads the client, libraries, natives and assets, merges **Fabric/Quilt** profiles, assembles the JVM command line and launches the game while **streaming logs** with automatic **token redaction**. Crash logs get a heuristic diagnosis.
- **Auto-tuning** — suggests an ideal default RAM allocation for your system during onboarding and flags over-/under-allocation.
- **Modern UX** — onboarding wizard, dark/light themes, accent colours, progress toasts, keyboard-friendly modals.

### Works with or without the native shell
The entire UI — including prediction — also runs in a plain browser via a fallback layer (public Mojang/Modrinth APIs + `localStorage`), so development and demos don't require building the native app.

## How the prediction model works

The model is anchored to a known reference system (Ryzen 5 5600X + RTX 3060, vanilla 1.20 ≈ 260 FPS uncapped at render distance 12) and scales from there. The final FPS estimate is:

```
avgFps = REF_BASE_FPS
       × bottleneckBlend(gpuFactor, cpuFactor, renderDistance, shaders)  // harmonic blend: the weaker part drags it down
       × renderDistanceFactor      // ~ (12 / rd)^1.3
       × modCountFactor            // 1 / (1 + mods × 0.0035)
       × optimizationFactor        // ×2.4 with Sodium-class mods
       × shaderFactor              // ×0.18–0.55, worse on weak GPUs
       × heavyModsFactor           // ×0.82 for heavy tech/worldgen packs
       × ramFactor                 // penalty for GC thrash when under-allocated
```

GPU and CPU "factors" come from benchmark tables (relative scores, RTX 4090 = 100 for GPUs; i9-14900K/7800X3D ≈ 100 single-thread for CPUs), with graceful fallbacks for unknown parts and manual override. RAM need, recommended allocation, 1%-low FPS, load time, bottleneck, worldgen risk and confidence are derived alongside. See [`src/lib/prediction.ts`](src/lib/prediction.ts) (and the Rust mirror in [`src-tauri/core/src/prediction.rs`](src-tauri/core/src/prediction.rs)) — every coefficient is documented.

> Predictions are heuristic estimates. Real performance varies with drivers, OS, background apps and specific mods. invin reports a **confidence** level with every prediction.

## Project structure

```
src/                       SvelteKit frontend
  lib/
    prediction.ts          performance prediction engine (TS)
    prediction.test.ts     15 unit tests
    types.ts               shared types (mirror of the Rust models)
    api.ts                 typed Tauri command wrapper + browser fallback router
    browser.ts             browser fallback (public APIs + localStorage)
    components/            UI components (PredictionCard, HardwarePanel, …)
    stores/                runtime state (settings, instances, hardware, …)
  routes/                  pages: home, instances, mods, performance, accounts, settings
src-tauri/                 Tauri (Rust) backend
  core/                    invin-core: GUI-free hardware + prediction (14 unit tests)
  src/                     commands, persistence, net, auth, launch, logs
```

## Development

Prerequisites: Node 18+, Rust (stable, edition-2024 capable), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install

# Frontend only (browser mode — prediction works without the backend):
npm run dev

# Full native app (Tauri):
npm run tauri dev

# Quality gates:
npm run check          # svelte-check (types)
npm run test           # vitest (prediction engine)
cd src-tauri/core && cargo test   # Rust prediction/hardware tests
cd src-tauri && cargo build       # build the native backend
```

### Online login

Microsoft sign-in requires an Azure application (public client). Set the client id before running the native app:

```bash
export INVIN_AZURE_CLIENT_ID="<your-azure-app-client-id>"
```

Offline profiles work without any configuration.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the planned feature set and enhancements.

## License

MIT.
