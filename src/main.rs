mod lyrics;

use tokio::time::{Duration, sleep};
use windows::{Media::Control::GlobalSystemMediaTransportControlsSessionManager, core::Result};

#[tokio::main]
async fn main() -> Result<()> {
    let global_media_manager =
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    let mut last_track = None;
    loop {
        let session = global_media_manager.GetCurrentSession()?;
        let media = session.TryGetMediaPropertiesAsync()?.await?;
        let artist = media.Artist()?.to_string_lossy();
        let title = media.Title()?.to_string_lossy();
        let current_track = format!("{} - {}", artist, title);
        if last_track != Some(current_track.clone()) {
            last_track = Some(current_track);
            let timeline = session.GetTimelineProperties()?;
            let duration = (timeline.EndTime()?.Duration - timeline.StartTime()?.Duration) as f64
                / 10_000_000.0;
            if let Some((lyrics_response, lyrics)) =
                lyrics::fetch_lyrics(&artist, &title, duration).await
            {
                println!(
                    "Now playing: {} - {}",
                    lyrics_response.artist_name.unwrap(),
                    lyrics_response.track_name.unwrap()
                );
                println!("Album: {}", lyrics_response.album_name.unwrap());
                println!("Duration: {}", lyrics_response.duration.unwrap());
                println!("{}", lyrics);
            } else {
                println!("No lyrics found.")
            }
        }
        sleep(Duration::from_millis(250)).await;
    }
}
