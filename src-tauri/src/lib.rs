#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // window-state must be registered on the builder chain (not in `setup`): it
  // restores a window's size/position via the window-creation hook, and the config
  // "main" window already exists by the time `setup` runs — registering it there
  // would miss that window and skip the restore. Desktop-only crate, so guard the
  // call with cfg(desktop).
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
  }
  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
