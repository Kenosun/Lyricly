use serde::Serialize;

#[derive(Serialize)]
pub struct LyricLine {
    time: f64, // milliseconds
    text: String,
}

fn parse_time(time_str: &str) -> f64 {
    let time_str = time_str.trim_matches(&['[', ']'][..]);
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return 0.0;
    }
    let minutes = parts[0].parse::<f64>().unwrap_or(0.0);
    let seconds = parts[1].parse::<f64>().unwrap_or(0.0);
    (minutes * 60.0 + seconds) * 1000.0 // milliseconds
}

#[tauri::command(async)]
pub async fn parse_lyrics(lyrics: String) -> Vec<LyricLine> {
    let mut result = Vec::new();

    for line in lyrics.lines() {
        let mut parts = line.split("] ");
        let time = parse_time(parts.next().unwrap_or(""));
        let mut text = parts.next().unwrap_or("").trim().to_string();
        if text.is_empty() {
            text = "♪".to_string();
        }
        // make first letter of the text uppercase
        if let Some(first_char) = text.chars().next() {
            text = format!(
                "{}{}",
                first_char.to_uppercase(),
                text.chars().skip(1).collect::<String>()
            );
        }
        result.push(LyricLine { time, text });
    }
    result
}
