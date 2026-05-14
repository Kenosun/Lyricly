import { LyricLine } from "./LyricLine";

export interface LyricsResponse {
  // Metadata
  title: string;
  artist: string;
  albumName: string;
  albumCoverLink?: string;
  musixmatchLink?: string;
  spotifyLink?: string;

  // Lyrics
  plainLyrics?: string;
  syncedLyrics?: LyricLine[] | string;

  // Status
  synced: boolean;
  richsynced: boolean;
}
