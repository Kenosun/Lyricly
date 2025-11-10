use serde::Serialize;
use std::time::Duration;
use tauri::{async_runtime, Emitter};
use tokio::time::sleep;
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

#[derive(Clone, Serialize)]
struct Track {
    artist: String,
    title: String,
    duration: f64,
    position: f64,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn fetch_media_loop(app: tauri::AppHandle) {
    async_runtime::spawn(async move {
        // event has to match with frontend
        let media_event = "update_media";

        // initialize media manager
        let manager_result = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if manager_result.is_err() {
            let _ = app.emit(media_event, "Failed to request media manager");
            return;
        }
        let manager = match manager_result.unwrap().await {
            Ok(m) => m,
            Err(_) => {
                let _ = app.emit(media_event, "Failed to get session manager");
                return;
            }
        };

        let mut last_media = String::new();

        loop {
            // get current media
            if let Ok(session) = manager.GetCurrentSession() {
                if let Ok(media) = session.TryGetMediaPropertiesAsync() {
                    if let Ok(media_props) = media.await {
                        // get artist and title
                        let artist = media_props
                            .Artist()
                            .unwrap_or("Unknown Artist".into())
                            .to_string_lossy();
                        let title = media_props
                            .Title()
                            .unwrap_or("Unknown Title".into())
                            .to_string_lossy();
                        let current_media = format!("{} - {}", artist, title);
                        if let Ok(timeline) = session.GetTimelineProperties() {
                            // calculate media position and duration in ms
                            let position = timeline.Position().unwrap().Duration as f64 / 10_000.0;
                            let duration = (timeline.EndTime().unwrap().Duration
                                - timeline.StartTime().unwrap().Duration)
                                as f64
                                / 10_000.0;

                            // emit only if media changed
                            if current_media != last_media {
                                last_media = current_media.clone();
                                let _ = app.emit(
                                    media_event,
                                    Track {
                                        artist,
                                        title,
                                        duration,
                                        position,
                                    },
                                );
                            }
                        }
                    }
                }
            }
            sleep(Duration::from_millis(1)).await;
        }
    });
}

#[tauri::command]
async fn fetch_position_loop(app: tauri::AppHandle) {
    async_runtime::spawn(async move {
        // event has to match with frontend
        let media_event = "update_position";

        // initialize media manager
        let manager_result = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        if manager_result.is_err() {
            let _ = app.emit(media_event, "Failed to request media manager");
            return;
        }
        let manager = match manager_result.unwrap().await {
            Ok(m) => m,
            Err(_) => {
                let _ = app.emit(media_event, "Failed to get session manager");
                return;
            }
        };

        loop {
            // get current media
            if let Ok(session) = manager.GetCurrentSession() {
                if let Ok(timeline) = session.GetTimelineProperties() {
                    // emit media position in ms
                    let position = timeline.Position().unwrap().Duration as f64 / 10_000.0;
                    let _ = app.emit(media_event, position);
                }
            }
            sleep(Duration::from_millis(1)).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_media_loop,
            fetch_position_loop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
