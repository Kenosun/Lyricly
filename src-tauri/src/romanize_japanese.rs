use lindera::{
    dictionary::load_dictionary, mode::Mode, segmenter::Segmenter, tokenizer::Tokenizer,
};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use wana_kana::ConvertJapanese;

static TOKENIZER: Lazy<Mutex<Tokenizer>> = Lazy::new(|| {
    let dictionary = load_dictionary("embedded://unidic").unwrap();
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None).keep_whitespace(true);
    let tokenizer = Tokenizer::new(segmenter);
    Mutex::new(tokenizer)
});

#[tauri::command]
pub fn romanize_japanese_lyrics(lyrics: String) -> String {
    let tokenizer = TOKENIZER.lock().unwrap();
    let mut tokens = tokenizer.tokenize(&lyrics).unwrap();
    let mut kana_output = String::new();

    // convert lyrics to kana
    for token in tokens.iter_mut() {
        if let Some(reading) = token.get_detail(10) {
            kana_output.push_str(&reading);
        } else if let Some(phonetic) = token.get_detail(13) {
            kana_output.push_str(&phonetic);
        } else if let Some(phonetic_base) = token.get_detail(15) {
            kana_output.push_str(&phonetic_base);
        } else {
            kana_output.push_str(&token.surface);
        }
    }

    // convert kana to romaji
    let result = kakasi::convert(kana_output).hiragana;
    let romanized_lyrics = result.to_romaji();
    return romanized_lyrics;
}
