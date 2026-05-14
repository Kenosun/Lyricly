use crate::DiscordState;
use discord_rich_presence::{activity, DiscordIpc};

#[tauri::command]
pub fn set_discord_rpc(
    state: tauri::State<DiscordState>,
    details: Option<String>,
    state_msg: Option<String>,
    start_time: Option<i64>,
    end_time: Option<i64>,
) -> Result<(), String> {
    let mut client_lock = state.client.lock().map_err(|_| "Failed to lock mutex")?;

    if let Some(client) = client_lock.as_mut() {
        let mut payload = activity::Activity::new();
        let mut timestamps = activity::Timestamps::new();

        if let Some(start) = start_time {
            timestamps = timestamps.start(start);
        }

        if let Some(end) = end_time {
            timestamps = timestamps.end(end);
        }

        payload = payload
            .timestamps(timestamps)
            .activity_type(activity::ActivityType::Listening);

        if let Some(ref d) = details {
            payload = payload.details(d);
        }
        if let Some(ref s) = state_msg {
            payload = payload.state(s);
        }

        client.set_activity(payload).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Discord client not initialized".to_string())
    }
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
