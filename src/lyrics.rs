use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
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
}

pub async fn fetch_lyrics(
    artist: &str,
    title: &str,
    duration: f64,
) -> Option<(LyricsResponse, String)> {
    let encoded_artist = urlencoding::encode(artist);
    let encoded_title = urlencoding::encode(title);
    let url = format!(
        "https://lrclib.net/api/search?artist_name={}&track_name={}&duration={}",
        encoded_artist, encoded_title, duration
    );
    println!("Fetching lyrics: {}", url);
    let response_text = reqwest::get(url).await.ok()?.text().await.ok()?;
    let lyrics_response_list =
        serde_json::from_str::<Vec<LyricsResponse>>(response_text.as_str()).ok()?;
    for lyrics_response in lyrics_response_list {
        if let Some(synced_lyrics) = lyrics_response.synced_lyrics.clone() {
            return Some((lyrics_response, synced_lyrics));
        }
        if let Some(plain_lyrics) = lyrics_response.plain_lyrics.clone() {
            return Some((lyrics_response, plain_lyrics));
        }
    }
    None
}
