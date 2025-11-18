use std::time::Duration;
use tauri::{async_runtime, Emitter};
use tokio::time::sleep;
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

#[tauri::command]
pub async fn fetch_position_loop(app: tauri::AppHandle) {
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
