use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;

mod discord_rpc;
mod fetch_lyrics;
mod fetch_media_loop;
mod fetch_position_loop;

pub struct DiscordState {
    pub client: Mutex<Option<DiscordIpcClient>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut client = DiscordIpcClient::new("1504508659625885716");

    let connected_client = match client.connect() {
        Ok(_) => {
            println!("Successfully connected to Discord");
            Some(client)
        }
        Err(e) => {
            eprintln!("Failed to connect to Discord: {}", e);
            None
        }
    };

    tauri::Builder::default()
        .manage(DiscordState {
            client: Mutex::new(connected_client),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_media_loop::fetch_media_loop,
            fetch_lyrics::fetch_lyrics,
            fetch_position_loop::fetch_position_loop,
            discord_rpc::set_discord_rpc,
            discord_rpc::clear_discord_rpc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
