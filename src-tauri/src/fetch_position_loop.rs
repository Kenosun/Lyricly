use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

async fn emit_current_position(
    app: &tauri::AppHandle,
    manager: &GlobalSystemMediaTransportControlsSessionManager,
    event: &str,
    previous_pos_ms: &mut f64,
) -> Result<(), windows::core::Error> {
    let session = manager.GetCurrentSession()?;
    let playback_info = session.GetPlaybackInfo()?;
    let status = playback_info.PlaybackStatus()?;

    let current_pos_ms =
        if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
            -1.0 // not playing
        } else {
            let timeline = session.GetTimelineProperties()?;
            // Windows duration is in 100ns units, dividing by 10,000 gives milliseconds
            (timeline.Position()?.Duration as f64) / 10_000.0
        };

    if (current_pos_ms - *previous_pos_ms).abs() >= 50.0 {
        *previous_pos_ms = current_pos_ms;
        let _ = app.emit(event, current_pos_ms);
    }

    Ok(())
}

#[tauri::command(async)]
pub async fn fetch_position_loop(app: tauri::AppHandle) {
    // event has to match with frontend
    const MEDIA_EVENT: &str = "update_position";

    // initialize media manager
    let manager_async = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
        Ok(op) => op,
        Err(_) => {
            let _ = app.emit(MEDIA_EVENT, "Failed to request media manager");
            return;
        }
    };

    let Ok(manager) = manager_async.await else {
        let _ = app.emit(MEDIA_EVENT, "Failed to get session manager");
        return;
    };

    let mut previous_pos_ms = -2.0;

    loop {
        // emit current media position in ms
        let _ = emit_current_position(&app, &manager, MEDIA_EVENT, &mut previous_pos_ms).await;
        sleep(Duration::from_millis(1)).await;
    }
}
