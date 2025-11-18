fn is_korean(c: char) -> bool {
    let x = c as u32;
    (0x1100..=0x11FF).contains(&x)   // Hangul Jamo
        || (0x3130..=0x318F).contains(&x) // Hangul Compatibility Jamo
        || (0xAC00..=0xD7AF).contains(&x) // Hangul Syllables
}

fn is_japanese(c: char) -> bool {
    let x = c as u32;
    (0x3040..=0x309F).contains(&x)   // Hiragana
        || (0x30A0..=0x30FF).contains(&x) // Katakana
        || (0x31F0..=0x31FF).contains(&x) // Katakana Phonetic Extensions
}

pub fn detect_language(text: &str) -> &str {
    let mut korean = 0;
    let mut japanese = 0;

    for c in text.chars() {
        if is_korean(c) {
            korean += 1;
        } else if is_japanese(c) {
            japanese += 1;
        }
    }

    match (korean, japanese) {
        (k, j) if k > j && k > 0 => "Korean",
        (k, j) if j > k && j > 0 => "Japanese",
        _ => "Unknown / Mixed / Other",
    }
}
