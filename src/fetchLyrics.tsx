export async function fetchLyrics(
  artist: string,
  title: string,
  duration: number
): Promise<{ lyricsResponse: any; synced: boolean } | null> {
  const encodedArtist = encodeURIComponent(artist);
  const encodedTitle = encodeURIComponent(title);
  const durationInSeconds = duration / 1000;
  const url = `https://lrclib.net/api/search?artist_name=${encodedArtist}&track_name=${encodedTitle}&duration=${durationInSeconds}`;

  console.log(url);

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
