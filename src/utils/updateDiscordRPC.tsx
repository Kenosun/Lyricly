import { invoke } from "@tauri-apps/api/core";
import { LyricsResponse } from "../types/LyricsResponse";
import { Media } from "../types/Media";

export async function updateDiscordRPC(
  res: LyricsResponse,
  media: Media,
  pos: number,
) {
  const songStartTime = Math.floor((Date.now() - pos) / 1000);
  const songEndTime = Math.floor(songStartTime + media.duration / 1000);

  invoke("set_discord_rpc", {
    details: res.title,
    stateMsg: res.artist,
    startTime: songStartTime,
    endTime: songEndTime,
    albumName: res.albumName,
    albumCoverLink: res.albumCoverLink,
    musixmatchLink: res.musixmatchLink,
    spotifyLink: res.spotifyLink,
  }).catch(console.error);
}
