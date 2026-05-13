use musixmatch_inofficial::{
    models::{SortOrder, TrackId},
    MusixmatchBuilder,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResponse {
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
    let duration_in_seconds = (duration / 1000.0) as f32;

    if let Ok(client) = MusixmatchBuilder::new().build() {
        if let Ok(response) = client
            .track_search()
            .q_track_artist((artist + " " + &title).as_str())
            .s_track_rating(SortOrder::Desc)
            .send(1, 1)
            .await
        {
            if let Some(track) = response.first() {
                let commontrack_id = TrackId::Commontrack(track.commontrack_id);
                if track.has_richsync {
                    if let Ok(lyrics) = client
                        .track_richsync(commontrack_id, Some(duration_in_seconds), Some(1 as f32))
                        .await
                    {
                        return Ok(LyricsResponse {
                            synced_lyrics: Some(lyrics.richsync_body),
                            synced: true,
                            failed: false,
                            ..Default::default()
                        });
                    }
                } else {
                    if let Ok(lyrics) = client.track_lyrics(commontrack_id).await {
                        return Ok(LyricsResponse {
                            plain_lyrics: Some(lyrics.lyrics_body),
                            synced: false,
                            failed: false,
                            ..Default::default()
                        });
                    }
                }
            }
        }
    }
    Ok(LyricsResponse {
        failed: true,
        ..Default::default()
    })
}
