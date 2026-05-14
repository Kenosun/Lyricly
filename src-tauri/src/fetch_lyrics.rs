use musixmatch_inofficial::{
    models::{SortOrder, SubtitleFormat, TrackId},
    MusixmatchBuilder,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResponse {
    // Metadata
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album_name: String,
    #[serde(default)]
    pub album_cover_link: Option<String>,
    #[serde(default)]
    pub musixmatch_link: Option<String>,
    #[serde(default)]
    pub spotify_link: Option<String>,

    // Lyrics
    #[serde(default)]
    pub plain_lyrics: Option<String>,
    #[serde(default)]
    pub synced_lyrics: Option<String>,

    // Status
    #[serde(default)]
    pub synced: bool,
    #[serde(default)]
    pub richsynced: bool,
}

#[tauri::command(async)]
pub async fn fetch_lyrics(
    artist: String,
    title: String,
    duration: f64,
) -> Result<Option<LyricsResponse>, ()> {
    let duration_secs = (duration / 1000.0) as f32;
    let client = MusixmatchBuilder::new().build().map_err(|_| ())?;
    let search_query = format!("{} {}", artist, title);

    let response = client
        .track_search()
        .q_track_artist(&search_query)
        .s_track_rating(SortOrder::Desc)
        .send(1, 1)
        .await
        .map_err(|_| ())?;

    let track = response.first().ok_or(())?;
    let commontrack_id = TrackId::Commontrack(track.commontrack_id);

    let mut lyrics_res = LyricsResponse {
        title: track.track_name.clone(),
        artist: track.artist_name.clone(),
        album_name: track.album_name.clone(),
        musixmatch_link: Some(format!(
            "https://www.musixmatch.com/lyrics/{}",
            track.commontrack_vanity_id
        )),
        spotify_link: track
            .track_spotify_id
            .as_ref()
            .map(|id| format!("https://open.spotify.com/track/{}", id)),
        album_cover_link: track
            .album_coverart_800x800
            .as_ref()
            .or(track.album_coverart_500x500.as_ref())
            .or(track.album_coverart_350x350.as_ref())
            .or(track.album_coverart_100x100.as_ref())
            .cloned(),
        ..Default::default()
    };

    if track.has_richsync {
        if let Ok(rs) = client
            .track_richsync(commontrack_id.clone(), Some(duration_secs), Some(1.0))
            .await
        {
            lyrics_res.synced_lyrics = Some(rs.richsync_body);
            lyrics_res.synced = true;
            lyrics_res.richsynced = true;
            return Ok(Some(lyrics_res));
        }
    }

    if track.has_subtitles {
        if let Ok(sub) = client
            .track_subtitle(
                commontrack_id.clone(),
                SubtitleFormat::Json,
                Some(duration_secs),
                Some(1.0),
            )
            .await
        {
            lyrics_res.synced_lyrics = Some(sub.subtitle_body);
            lyrics_res.synced = true;
            return Ok(Some(lyrics_res));
        }
    }

    if track.has_lyrics {
        if let Ok(lyrics) = client.track_lyrics(commontrack_id).await {
            lyrics_res.plain_lyrics = Some(lyrics.lyrics_body);
            return Ok(Some(lyrics_res));
        }
    }

    Ok(None)
}
