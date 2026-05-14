import { LyricLine } from "../types/LyricLine";
import { LyricWord } from "../types/LyricWord";
import { SubtitleLine } from "../types/SubtitleLine";

// convert subtitle lyrics to richsynced lyrics
export function convertSubtitleLyrics(subtitle: SubtitleLine[]): LyricLine[] {
  return subtitle.map((line, index) => {
    const ts = line.time.total;

    // next line timestamp = this line end
    const next = subtitle[index + 1];
    const te = next ? next.time.total : ts + 4;

    // split Japanese safely
    const words = line.text.trim().split(/(\s+)/).filter(Boolean);

    // if no spaces (Japanese lyrics usually), fallback to character timing
    const units = words.length <= 1 ? [...line.text] : words;

    const duration = te - ts;
    const step = duration / Math.max(units.length, 1);

    const l: LyricWord[] = units.map((u, i) => ({
      c: u,
      o: i * step,
    }));

    return {
      ts,
      te,
      x: line.text,
      l,
    };
  });
}
