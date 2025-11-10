import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { fetchLyricsResponse } from "./fetchLyricsResponse";
import { parseLyrics } from "./parseLyrics";

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
  const parsedLyrics = useMemo(() => parseLyrics(lyrics), [lyrics]);

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

  // reset everything when media changes
  useEffect(() => {
    setCurrentPosition(0);
    setLyrics("");
    setCurrentLines([]);
    setSynced(false);
    setLoading(true);
  }, [media]);

  // fetch lyrics
  useEffect(() => {
    if (!media) return;
    let cancelled = false;

    const fetchLyrics = async () => {
      setLoading(true);

      const result = await fetchLyricsResponse(
        media.artist,
        media.title,
        media.duration
      );

      // ignore outdated results
      if (cancelled) return;

      setLoading(false);
      if (result) {
        const { lyricsResponse, synced } = result;
        if (synced) {
          setSynced(true);
          setLyrics(lyricsResponse.syncedLyrics);
        } else {
          setSynced(false);
          setLyrics(lyricsResponse.plainLyrics);
        }
      } else {
        setLyrics("No lyrics found.");
      }
    };
    fetchLyrics();
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
        <>
          <p>
            {media.artist} - {media.title}
          </p>
          {loading || !lyrics ? (
            <p>Loading lyrics...</p>
          ) : synced ? (
            <pre style={{ textAlign: "center", lineHeight: "1.6em" }}>
              {currentLines.map((line, i) => (
                // highlight the current line
                <div
                  key={i}
                  style={{
                    opacity: i === highlightedIndex ? 1 : 0.5,
                    fontWeight: i === highlightedIndex ? "bold" : "normal",
                  }}
                >
                  {line}
                </div>
              ))}
            </pre>
          ) : (
            <pre>{lyrics}</pre>
          )}
        </>
      ) : (
        <p>Nothing is playing.</p>
      )}
    </main>
  );
}

export default App;
