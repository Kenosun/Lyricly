use ib_romaji::HepburnRomanizer;
use lindera::{
    dictionary::load_dictionary, mode::Mode, segmenter::Segmenter, tokenizer::Tokenizer,
};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use wana_kana::ConvertJapanese;

// #[tauri::command(async)]
// pub async fn romanize_japanese_lyrics(lyrics: String) -> String {
//     let result = kakasi::convert(lyrics);
//     return result.romaji;
// }

// use wana_kana::ConvertJapanese;
//
// #[tauri::command(async)]
// pub async fn romanize_japanese_lyrics(lyrics: String) -> String {
//     let tokenizer = TOKENIZER.lock().unwrap();
//     let mut tokens = tokenizer.tokenize(&lyrics).unwrap();
//     let mut kana_output = String::new();

//     // convert lyrics to kana
//     for token in tokens.iter_mut() {
//         if let Some(reading) = token.get_detail(10) {
//             kana_output.push_str(&reading);
//         } else if let Some(phonetic) = token.get_detail(13) {
//             kana_output.push_str(&phonetic);
//         } else if let Some(phonetic_base) = token.get_detail(15) {
//             kana_output.push_str(&phonetic_base);
//         } else {
//             kana_output.push_str(&token.surface);
//         }
//     }

//     // convert kana to romaji
//     let result = kakasi::convert(kana_output).hiragana;
//     let romanized_lyrics = result.to_romaji();
//     return romanized_lyrics;
// }

fn is_japanese(text: &str) -> bool {
    text.chars().any(|c| {
        matches!(c,
            '\u{3040}'..='\u{30FF}' | // hiragana + katakana
            '\u{4E00}'..='\u{9FFF}'   // kanji
        )
    })
}

static TOKENIZER: Lazy<Mutex<Tokenizer>> = Lazy::new(|| {
    let dictionary = load_dictionary("embedded://unidic").unwrap();
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None).keep_whitespace(true);
    let tokenizer = Tokenizer::new(segmenter);
    Mutex::new(tokenizer)
});

static ROMANIZER: Lazy<HepburnRomanizer> = Lazy::new(HepburnRomanizer::default);

#[tauri::command(async)]
pub async fn romanize_japanese_lyrics(lyrics: String) -> String {
    let tokenizer = TOKENIZER.lock().unwrap();
    let tokens = tokenizer.tokenize(&lyrics).unwrap();
    let mut romanized_output = String::new();

    for mut token in tokens {
        let surface = token.surface.to_string();

        if is_japanese(surface.as_str()) {
            let details = token.details();
            let reading = details
                .get(10) // UniDic reading index
                .filter(|&&r| r != "*")
                .map(|&r| r.to_string())
                .unwrap_or_else(|| surface.to_string());
            let katakana_reading = ConvertJapanese::to_katakana(reading.as_str());
            let mut word_readings = Vec::new();
            ROMANIZER.romanize_and_try_for_each(&katakana_reading, |len, romaji| {
                word_readings.push((len, romaji));
                None::<()>
            });
            println!(
                "Surface: [{}], Reading: [{}], Romanized: [{:?}]",
                surface, reading, word_readings
            );
            // let word_readings = ROMANIZER.romanize_vec(&reading);
            if let Some((_, top_reading)) = word_readings.first() {
                romanized_output.push_str(top_reading);
            } else {
                romanized_output.push_str(surface.as_str());
            }
        } else {
            romanized_output.push_str(surface.as_str());
        }
    }

    romanized_output.trim().to_string()
}
