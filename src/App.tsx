import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

interface LyricsResponse {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  plainLyrics: string;
  syncedLyrics: string;
  synced: boolean;
  failed: boolean;
}

interface Media {
  artist: string;
  title: string;
  duration: number;
  position: number;
  album: string;
  thumbnail: string;
}

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const [media, setMedia] = useState<Media | null>(null);
  const [lyrics, setLyrics] = useState<string>("");
  const [synced, setSynced] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentLines, setCurrentLines] = useState<string[]>([]);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [parsedLyrics, setParsedLyrics] = useState<
    { time: number; text: string }[]
  >([]);

  // start listening to the event
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<Media>("update_media", (event) => {
      setMedia(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    // trigger backend
    invoke("fetch_media_loop").catch(console.error);

    // cleanup function to unsubscribe when component unmounts
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<number>("update_position", (event) => {
      setCurrentPosition(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    // trigger backend
    invoke("fetch_position_loop").catch(console.error);

    // cleanup function to unsubscribe when component unmounts
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // on media change
  useEffect(() => {
    // reset everything
    setLyrics("");
    setSynced(false);
    setLoading(true);
    setCurrentLines([]);
    setCurrentPosition(0);
    setHighlightedIndex(0);
    setParsedLyrics([]);
    console.log("reset everything");

    if (!media) return;
    let cancelled = false;

    const handleLyrics = async () => {
      setLoading(true);

      // fetch lyrics
      const result = await invoke<LyricsResponse>("fetch_lyrics", {
        artist: media.artist,
        title: media.title,
        duration: media.duration,
      });

      // ignore outdated results
      if (cancelled) return;

      if (result.failed) {
        setLyrics("No lyrics found.");
      } else {
        const fetchedText = result.synced
          ? result.syncedLyrics
          : result.plainLyrics;
        setSynced(result.synced);
        setLyrics(fetchedText);
        console.log("fetched lyrics");

        // romanize lyrics
        const romanizeResult = await invoke<string>("romanize_lyrics", {
          lyrics: fetchedText,
        });
        if (cancelled) return;
        setLyrics(romanizeResult);
        console.log("romanized lyrics");

        // parse lyrics
        const parseResult = await invoke<{ time: number; text: string }[]>(
          "parse_lyrics",
          {
            lyrics: romanizeResult,
          }
        );
        if (cancelled) return;
        setParsedLyrics(parseResult);
        console.log("parsed lyrics");
      }
      setLoading(false);
    };
    handleLyrics();
    return () => {
      cancelled = true;
    };
  }, [media]);

  // update current lines
  useEffect(() => {
    if (!media || parsedLyrics.length === 0) return;
    let id: number;

    let startTime = performance.now();
    let offset = currentPosition ?? media.position;

    const update = () => {
      const elapsed = performance.now() - startTime;
      const currentTime = offset + elapsed;

      // find the current line index
      const currentIndex = parsedLyrics.findIndex(
        (l, i) =>
          l.time <= currentTime &&
          (i === parsedLyrics.length - 1 ||
            parsedLyrics[i + 1].time > currentTime)
      );

      if (currentIndex === -1) {
        setCurrentLines(parsedLyrics.slice(0, 5).map((l) => l.text));
        setHighlightedIndex(-1);
      } else if (currentIndex < 2) {
        setHighlightedIndex(currentIndex);
      } else if (currentIndex >= 2) {
        const start = Math.max(currentIndex - 2, 0);
        const end = Math.min(currentIndex + 3, parsedLyrics.length);
        setCurrentLines(parsedLyrics.slice(start, end).map((l) => l.text));
        setHighlightedIndex(currentIndex - start);
      }

      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [media, parsedLyrics, currentPosition]);

  return (
    <main className="container">
      {media ? (
        <div className="card" role="region" aria-label="Now playing">
          <div className="meta">
            <div className="album-section">
              {media.thumbnail && (
                <img
                  className="album-thumbnail"
                  src={`data:image/jpeg;base64,${media.thumbnail}`}
                  alt="thumbnail"
                />
              )}
              <div className="track-info">
                <div className="title">{media.title}</div>
                <div className="artist">{media.artist}</div>
                <div className="album-name">{media.album}</div>
              </div>
            </div>
            {loading || !lyrics ? (
              <div className="loading">
                <div className="spinner" />
              </div>
            ) : synced ? (
              <div className="lyrics">
                <div className="lyric-list">
                  {currentLines.map((line, i) => (
                    <div
                      key={i}
                      className={`lyric-line ${
                        i === highlightedIndex ? "active" : ""
                      }`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="lyrics">
                <pre>{lyrics}</pre>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p>Nothing is playing.</p>
      )}
    </main>
  );
}
export default App;
