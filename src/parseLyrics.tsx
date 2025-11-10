export function parseLyrics(lyrics: string) {
  const lines = lyrics.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const startBracket = line.indexOf("[");
    const endBracket = line.indexOf("]");
    if (startBracket && endBracket) {
      const timestamp = line.slice(startBracket + 1, endBracket);
      const text = line.slice(endBracket + 1).trim();

      const colonIndex = timestamp.indexOf(":");
      const minutes = parseInt(timestamp.slice(0, colonIndex));
      const seconds = parseFloat(timestamp.slice(colonIndex + 1));
      const time = minutes * 60 + seconds;
      result.push({ time, text });
    }
  }
  return result;
}
