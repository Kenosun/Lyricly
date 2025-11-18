mod detect_language;
mod fetch_lyrics;
mod fetch_media_loop;
mod fetch_position_loop;
mod parse_lyrics;
mod romanize_japanese;
mod romanize_lyrics;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_lyrics::fetch_lyrics,
            fetch_media_loop::fetch_media_loop,
            fetch_position_loop::fetch_position_loop,
            romanize_lyrics::romanize_lyrics,
            parse_lyrics::parse_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
