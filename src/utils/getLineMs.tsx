import { LyricLine } from "../types/LyricLine";
import { SubtitleLine } from "../types/SubtitleLine";

export const getLineMs = (line: LyricLine | SubtitleLine): number => {
  return "ts" in line ? line.ts * 1000 : line.time.total * 1000;
};
