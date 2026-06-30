//! invin launcher — native (Tauri) backend entry point.

mod auth;
mod commands;
mod launch;
mod logs;
mod models;
mod net;
mod store;

use store::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolve a per-user data directory for instances, settings, caches.
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("invin");
            app.manage(AppState::new(data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::list_accounts,
            commands::begin_login,
            commands::poll_login,
            commands::add_offline_account,
            commands::set_active_account,
            commands::remove_account,
            commands::list_mc_versions,
            commands::list_loader_versions,
            commands::list_instances,
            commands::create_instance,
            commands::update_instance,
            commands::clone_instance,
            commands::delete_instance,
            commands::launch_instance,
            commands::kill_instance,
            commands::open_instance_folder,
            commands::get_crash_report,
            commands::search_mods,
            commands::get_mod_versions,
            commands::install_mod,
            commands::list_installed_mods,
            commands::toggle_mod,
            commands::remove_mod,
            commands::detect_hardware,
            commands::get_instance_log,
            commands::export_sanitized_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running invin launcher");
}
