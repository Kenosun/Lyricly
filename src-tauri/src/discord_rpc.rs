use crate::DiscordState;
use discord_rich_presence::{activity, DiscordIpc};

#[tauri::command]
pub fn set_discord_rpc(
    state: tauri::State<DiscordState>,
    details: Option<String>,
    state_msg: Option<String>,
    start_time: Option<i64>,
    end_time: Option<i64>,
    album_name: String,
    album_cover_link: Option<String>,
    musixmatch_link: Option<String>,
    spotify_link: Option<String>,
) -> Result<(), String> {
    let mut client_lock = state.client.lock().map_err(|_| "Failed to lock mutex")?;
    let client = client_lock
        .as_mut()
        .ok_or("Discord client not initialized")?;

    let mut payload = activity::Activity::new().activity_type(activity::ActivityType::Watching);

    // timestamps
    let mut timestamps = activity::Timestamps::new();
    if let Some(start) = start_time {
        timestamps = timestamps.start(start);
    }
    if let Some(end) = end_time {
        timestamps = timestamps.end(end);
    }
    payload = payload.timestamps(timestamps);

    // text fields
    if let Some(ref d) = details {
        payload = payload.details(d);
    }
    if let Some(ref s) = state_msg {
        payload = payload.state(s);
    }

    // assets
    if let Some(ref a) = album_cover_link {
        let assets = activity::Assets::new()
            .large_image(a)
            .large_text(&album_name);
        payload = payload.assets(assets);
    }

    // buttons
    let mut buttons = Vec::new();
    if let Some(ref m) = musixmatch_link {
        buttons.push(activity::Button::new("View Lyrics on Musixmatch", m));
    }
    if let Some(ref s) = spotify_link {
        buttons.push(activity::Button::new("Listen on Spotify", s));
    }

    if !buttons.is_empty() {
        payload = payload.buttons(buttons);
    }

    client.set_activity(payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_discord_rpc(state: tauri::State<DiscordState>) -> Result<(), String> {
    let mut client_lock = state.client.lock().map_err(|_| "Failed to lock mutex")?;

    if let Some(client) = client_lock.as_mut() {
        client.clear_activity().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Discord client not initialized".to_string())
    }
}
