export async function fetchLyricsResponse(
  artist: string,
  title: string,
  duration: number
): Promise<{ lyricsResponse: any; synced: boolean } | null> {
  const encodedArtist = encodeURIComponent(artist);
  const encodedTitle = encodeURIComponent(title);
  const url = `https://lrclib.net/api/search?artist_name=${encodedArtist}&track_name=${encodedTitle}&duration=${duration}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const lyricsResponseList = await response.json();

    for (const lyricsResponse of lyricsResponseList) {
      if (lyricsResponse.syncedLyrics) {
        return { lyricsResponse, synced: true };
      }
      if (lyricsResponse.plainLyrics) {
        return { lyricsResponse, synced: false };
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    return null;
  }
}
