use tokio;
use windows::{Media::Control::GlobalSystemMediaTransportControlsSessionManager, core::Result};

#[tokio::main]
async fn main() -> Result<()> {
    let global_media_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?;
    let manager = global_media_manager.await?;

    let mut last_track = None;

    loop {
        if let Ok(session) = manager.GetCurrentSession() {
            if let Ok(media_props) = session.TryGetMediaPropertiesAsync() {
                if let Ok(media) = media_props.await {
                    let artist = media.Artist()?.to_string_lossy();
                    let title = media.Title()?.to_string_lossy();
                    let current_track = format!("{} - {}", artist, title);

                    if last_track != Some(current_track.clone()) {
                        println!("Now playing: {}", current_track);
                        last_track = Some(current_track)
                    }
                }
            }
        }
    }
}
