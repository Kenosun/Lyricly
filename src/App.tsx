import "./App.css";
import { fetchLyrics } from "./fetchLyrics";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { parseLyrics } from "./parseLyrics";
import { romanizeLyrics } from "./romanizeLyrics";
import { useEffect, useState } from "react";

interface Media {
  artist: string;
  title: string;
  duration: number;
  position: number;
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

  // handle lyrics
  useEffect(() => {
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

      const result = await fetchLyrics(
        media.artist,
        media.title,
        media.duration
      );

      // ignore outdated results
      if (cancelled) return;

      if (result) {
        const { lyricsResponse, synced } = result;
        const fetchedText = synced
          ? lyricsResponse.syncedLyrics
          : lyricsResponse.plainLyrics;
        setSynced(synced);
        setLyrics(fetchedText);
        console.log("fetched lyrics");

        // romanize lyrics
        const romanizeResult = await romanizeLyrics(fetchedText);
        if (cancelled) return;
        setLyrics(romanizeResult);
        console.log("romanized lyrics");

        // parse lyrics
        const parseResult = parseLyrics(romanizeResult);
        if (cancelled) return;
        setParsedLyrics(parseResult);
        console.log("parsed lyrics");
      } else {
        setLyrics("No lyrics found.");
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
            <div className="title">
              {media.artist} — {media.title}
            </div>
            {loading || !lyrics ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: 160,
                }}
              >
                <div className="spinner" />
                <div className="hint">Fetching lyrics…</div>
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
