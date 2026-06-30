//! invin-core — the GUI-independent heart of the invin launcher.
//!
//! This crate intentionally has no Tauri / webview dependency so it can be built and
//! unit-tested on any platform (CI, headless servers, etc.). It contains:
//!
//! * [`models`] — the data types shared with the frontend (serde, camelCase).
//! * [`hardware`] — GPU/CPU benchmark scoring + best-effort hardware detection.
//! * [`prediction`] — the performance-prediction engine, a 1:1 mirror of the
//!   TypeScript engine in `src/lib/prediction.ts`.

pub mod hardware;
pub mod models;
pub mod prediction;

pub use hardware::{detect_hardware, score_cpu, score_gpu};
pub use models::*;
pub use prediction::predict_performance;
