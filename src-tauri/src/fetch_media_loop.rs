use base64::{engine::general_purpose, Engine};
use serde::Serialize;
use std::time::Duration;
use tauri::Emitter;
use tokio::time::sleep;
use windows::{
    Media::Control::GlobalSystemMediaTransportControlsSessionManager, Storage::Streams::DataReader,
};

#[derive(Clone, Serialize)]
struct Track {
    artist: String,
    title: String,
    duration: f64,
    position: f64,
    album: String,
    thumbnail: String,
}

#[tauri::command]
pub fn fetch_media_loop(app: tauri::AppHandle) {
    // spawn a dedicated thread with a current-thread (single-threaded) Tokio runtime
    // so that Windows COM futures which are not Send can run without crossing threads
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build runtime");
        rt.block_on(async move {
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
                            // get media metadata
                            let artist = media_props
                                .Artist()
                                .unwrap_or("Unknown Artist".into())
                                .to_string_lossy();

                            let title = media_props
                                .Title()
                                .unwrap_or("Unknown Title".into())
                                .to_string_lossy();

                            let album = media_props
                                .AlbumTitle()
                                .unwrap_or("Unknown Album".into())
                                .to_string_lossy();

                            let mut thumbnail = String::new();
                            if let Ok(reference) = media_props.Thumbnail() {
                                if let Ok(operation) = reference.OpenReadAsync() {
                                    if let Ok(stream) = operation.await {
                                        let size = stream.Size().unwrap();
                                        let reader = DataReader::CreateDataReader(&stream).unwrap();
                                        reader.LoadAsync(size as u32).unwrap().await.unwrap();
                                        let mut buffer = vec![0u8; size as usize];
                                        reader.ReadBytes(&mut buffer).unwrap();
                                        thumbnail = general_purpose::STANDARD.encode(buffer);
                                    }
                                }
                            }

                            let current_media = format!("{} - {}", artist, title);

                            if let Ok(timeline) = session.GetTimelineProperties() {
                                // calculate media position and duration in ms
                                let position =
                                    timeline.Position().unwrap().Duration as f64 / 10_000.0;
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
                                            album,
                                            thumbnail,
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
    });
}
