import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";

interface LyricsResponse {
  plainLyrics: string;
  syncedLyrics: LyricLine[];
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

interface LyricWord {
  c: string; // content
  o: number; // offset from start time (ts)
}

interface LyricLine {
  ts: number; // start time
  te: number; // end time
  x: string; // full text
  l: LyricWord[]; // word-level data
}

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [media, setMedia] = useState<Media | null>(null);
  const [synced, setSynced] = useState<boolean>(false);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([]);
  const [precisePosition, setPrecisePosition] = useState(0);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // initial setup
  useEffect(() => {
    let unlistenMedia: UnlistenFn;
    let unlistenPosition: UnlistenFn;
    async function setupListeners() {
      // trigger backend loops
      invoke("fetch_media_loop").catch(console.error);
      invoke("fetch_position_loop").catch(console.error);

      // listen for the events the loops will emit
      unlistenMedia = await listen<Media>("update_media", (event) => {
        setMedia(event.payload);
      });
      unlistenPosition = await listen<number>("update_position", (event) => {
        setCurrentPosition(event.payload);
      });
    }
    setupListeners();
    return () => {
      if (unlistenMedia) unlistenMedia();
      if (unlistenPosition) unlistenPosition();
    };
  }, []);

  // on media change
  useEffect(() => {
    // reset everything
    setLoading(true);
    setPlainLyrics("");
    setSyncedLyrics([]);
    setCurrentPosition(0);
    setSynced(false);

    if (!media) return;

    const handleLyrics = async () => {
      // fetch lyrics
      const result = await invoke<LyricsResponse>("fetch_lyrics", {
        artist: media.artist,
        title: media.title,
        duration: media.duration,
      });

      if (!result.failed) {
        console.log(result);
        setSynced(result.synced);
        if (result.synced) {
          // parse the string into an object/array
          const parsedLyrics =
            typeof result.syncedLyrics === "string"
              ? JSON.parse(result.syncedLyrics)
              : result.syncedLyrics;
          setSyncedLyrics(parsedLyrics);
        } else {
          setPlainLyrics(result.plainLyrics);
        }
      }

      setLoading(false);
    };
    handleLyrics();
  }, [media]);

  // sync position
  useEffect(() => {
    let frameId: number;
    const startTime = performance.now();
    const offset = currentPosition;

    const sync = () => {
      const elapsed = performance.now() - startTime;
      setPrecisePosition(offset + elapsed);
      frameId = requestAnimationFrame(sync);
    };

    if (synced) {
      // only run while the music is actually moving
      frameId = requestAnimationFrame(sync);
    }

    return () => cancelAnimationFrame(frameId);
  }, [currentPosition, synced]);

  // find active line using binary search
  const activeLineIndex = useMemo(() => {
    let low = 0;
    let high = syncedLyrics.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = syncedLyrics[mid].ts * 1000;
      const nextLine = syncedLyrics[mid + 1];
      const end = nextLine ? nextLine.ts * 1000 : Infinity;

      if (precisePosition >= start && precisePosition < end) {
        return mid;
      } else if (precisePosition < start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return -1;
  }, [syncedLyrics, precisePosition]);

  // scroll to active line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLineIndex]);

  return (
    <main>
      {media ? (
        <div>
          <div className="album-section">
            {media.thumbnail && (
              <img
                className="album-thumbnail"
                src={`data:image/jpeg;base64,${media.thumbnail}`}
                alt="thumbnail"
              />
            )}
            <div>
              <div className="title">{media.title}</div>
              <div className="artist">{media.artist}</div>
              <div className="album-name">{media.album}</div>
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : synced ? (
            <div className="synced-lyrics">
              {syncedLyrics.map((line, index) => {
                const isActive = activeLineIndex === index;
                return (
                  <div
                    key={line.ts}
                    ref={isActive ? activeLineRef : null}
                    className={`line ${isActive ? "active" : ""}`}
                  >
                    {line.l.map((word, wIdx) => {
                      // word time in ms
                      const wordStart = (line.ts + word.o) * 1000;
                      const nextWord = line.l[wIdx + 1];

                      const wordEnd = nextWord
                        ? (line.ts + nextWord.o) * 1000
                        : line.te * 1000;

                      const isWordActive =
                        precisePosition >= wordStart &&
                        precisePosition < wordEnd;

                      // progress through current word (0 → 1)
                      const progress = isWordActive
                        ? Math.min(
                            1,
                            (precisePosition - wordStart) /
                              (wordEnd - wordStart),
                          )
                        : precisePosition > wordEnd
                          ? 1
                          : 0;

                      return (
                        <span
                          key={wIdx}
                          className={`karaoke-word ${isWordActive ? "active-word" : ""}`}
                          style={
                            {
                              "--progress": progress,
                            } as React.CSSProperties
                          }
                        >
                          {word.c}&nbsp;
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="plain-lyrics">
              <pre>{plainLyrics}</pre>
            </div>
          )}
        </div>
      ) : (
        <p>Nothing is playing.</p>
      )}
    </main>
  );
}
export default App;
