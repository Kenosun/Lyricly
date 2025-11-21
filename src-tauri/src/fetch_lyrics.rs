use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
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
    #[serde(default)]
    pub failed: bool,
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
            if let Ok(lyrics_list) = serde_json::from_str::<Vec<LyricsResponse>>(&response_text) {
                let mut best_synced: Option<LyricsResponse> = None;
                let mut best_plain: Option<LyricsResponse> = None;
                let mut smallest_diff_synced = f64::MAX;
                let mut smallest_diff_plain = f64::MAX;

                // find best fitting lyrics based on duration
                for mut lyrics in lyrics_list {
                    if let Some(lyrics_duration) = lyrics.duration {
                        let diff = (lyrics_duration - duration_in_seconds).abs();

                        if lyrics.synced_lyrics.is_some() {
                            if diff < smallest_diff_synced {
                                smallest_diff_synced = diff;
                                lyrics.synced = true;
                                best_synced = Some(lyrics);
                            }
                        } else if lyrics.plain_lyrics.is_some() {
                            if diff < smallest_diff_plain {
                                smallest_diff_plain = diff;
                                lyrics.synced = false;
                                best_plain = Some(lyrics);
                            }
                        }
                    }
                }

                // prefer synced lyrics if available
                if let Some(mut lyrics) = best_synced {
                    lyrics.failed = false;
                    return Ok(lyrics);
                } else if let Some(mut lyrics) = best_plain {
                    lyrics.failed = false;
                    return Ok(lyrics);
                }
            }
        }
    }
    Ok(LyricsResponse {
        failed: true,
        ..Default::default()
    })
}
