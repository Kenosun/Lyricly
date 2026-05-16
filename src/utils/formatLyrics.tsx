export function formatLyrics(text: string): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= 3) return text;

  const mainBody = words.slice(0, -3).join(" ");
  const lastThree = words.slice(-3).join("\u00A0"); // Glued together

  return `${mainBody} ${lastThree}`;
}
