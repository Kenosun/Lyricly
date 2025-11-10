// parse lyrics into an array of time in ms and text
export function parseLyrics(lyrics: string) {
  const lines = lyrics.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const startBracket = line.indexOf("[");
    const endBracket = line.indexOf("]");

    if (startBracket !== -1 && endBracket !== -1) {
      const timestamp = line.slice(startBracket + 1, endBracket);
      let text = line.slice(endBracket + 1).trim();

      if (text === "") {
        text = "♪";
      }

      const colonIndex = timestamp.indexOf(":");
      const minutes = parseInt(timestamp.slice(0, colonIndex));
      const seconds = parseFloat(timestamp.slice(colonIndex + 1));

      const time = (minutes * 60 + seconds) * 1000;

      result.push({ time, text });
    }
  }
  return result;
}
