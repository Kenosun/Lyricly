import { LyricWord } from "./LyricWord";

export interface LyricLine {
  ts: number; // start time
  te: number; // end time
  x: string; // full text
  l: LyricWord[]; // word-level data
}
