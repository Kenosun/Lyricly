#[tauri::command(async)]
pub async fn romanize_lyrics(lyrics: String) -> String {
    let language = crate::detect_language::detect_language(&lyrics);
    match language {
        "Korean" => hangeul::romanize(&lyrics),
        "Japanese" => crate::romanize_japanese::romanize_japanese_lyrics(lyrics).await,
        _ => lyrics,
    }
}
