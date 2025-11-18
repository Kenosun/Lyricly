use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResponse {
    #[serde(default)]
    pub track_name: Option<String>,
    #[serde(default)]
    pub artist_name: Option<String>,
    #[serde(default)]
    pub album_name: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub plain_lyrics: Option<String>,
    #[serde(default)]
    pub synced_lyrics: Option<String>,
    #[serde(default)]
    pub synced: bool,
}

#[tauri::command(async)]
pub async fn fetch_lyrics(
    artist: String,
    title: String,
    duration: f64,
) -> Result<LyricsResponse, ()> {
    let encoded_artist = urlencoding::encode(&artist);
    let encoded_title = urlencoding::encode(&title);
    let duration_in_seconds = duration / 1000.0;

    let url = format!(
        "https://lrclib.net/api/search?artist_name={}&track_name={}&duration={}",
        encoded_artist, encoded_title, duration_in_seconds
    );

    if let Some(response) = reqwest::get(url).await.ok() {
        if let Some(response_text) = response.text().await.ok() {
            if let Some(lyrics_response_list) =
                serde_json::from_str::<Vec<LyricsResponse>>(response_text.as_str()).ok()
            {
                // check if synced lyrics are available
                for mut lyrics_response in lyrics_response_list.clone() {
                    if lyrics_response.synced_lyrics.is_some() {
                        lyrics_response.synced = true;
                        return Ok(lyrics_response.clone());
                    }
                }

                // fallback to plain lyrics
                for mut lyrics_response in lyrics_response_list {
                    if lyrics_response.plain_lyrics.is_some() {
                        lyrics_response.synced = false;
                        return Ok(lyrics_response);
                    }
                }
            }
        }
    }
    return Err(());
}
