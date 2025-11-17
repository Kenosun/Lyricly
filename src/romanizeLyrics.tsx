import { convert } from "hangul-romanization";
import { invoke } from "@tauri-apps/api/core";

export async function romanizeLyrics(lyrics: string) {
  // korean
  if (/[\u3130-\u318F\uAC00-\uD7AF]/.test(lyrics)) {
    return convert(lyrics);
  }

  // japanese
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(lyrics)) {
    const result = await invoke<string>("romanize_japanese_lyrics", { lyrics });
    console.log(result);
    return result;
  }

  // latin or unknown
  return lyrics;
}
