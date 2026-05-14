import "./App.css";
import { getColor } from "colorthief";
import { Maximize, Minimize } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface LyricsResponse {
  plainLyrics: string;
  syncedLyrics: LyricLine[];
  synced: boolean;
  richsynced: boolean;
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

interface SubtitleLine {
  text: string;
  time: {
    total: number;
  };
}

// convert subtitle lyrics to richsynced lyrics
function convertLyrics(subtitle: SubtitleLine[]): LyricLine[] {
  return subtitle.map((line, index) => {
    const ts = line.time.total;

    // next line timestamp = this line end
    const next = subtitle[index + 1];
    const te = next ? next.time.total : ts + 4;

    // split Japanese safely
    const words = line.text.trim().split(/(\s+)/).filter(Boolean);

    // if no spaces (Japanese lyrics usually), fallback to character timing
    const units = words.length <= 1 ? [...line.text] : words;

    const duration = te - ts;
    const step = duration / Math.max(units.length, 1);

    const l: LyricWord[] = units.map((u, i) => ({
      c: u,
      o: i * step,
    }));

    return {
      ts,
      te,
      x: line.text,
      l,
    };
  });
}

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [media, setMedia] = useState<Media | null>(null);
  const [lyricsNotFound, setLyricsNotFound] = useState(false);
  const [synced, setSynced] = useState<boolean>(false);
  const [richsynced, setRichsynced] = useState<boolean>(false);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([]);
  const [precisePosition, setPrecisePosition] = useState(0);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef(null);
  const window = useMemo(() => getCurrentWindow(), []);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    setRichsynced(false);
    setLyricsNotFound(false);

    if (lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (!media) return;

    const handleLyrics = async () => {
      // fetch lyrics
      const result = await invoke<LyricsResponse>("fetch_lyrics", {
        artist: media.artist,
        title: media.title,
        duration: media.duration,
      });

      if (result.failed) {
        setLyricsNotFound(true);

        // clear discord RPC
        invoke("clear_discord_rpc").catch(console.error);
      } else {
        setSynced(result.synced);

        if (result.synced) {
          // parse the string into an object/array
          let parsedLyrics =
            typeof result.syncedLyrics === "string"
              ? JSON.parse(result.syncedLyrics)
              : result.syncedLyrics;

          if (!result.richsynced) {
            parsedLyrics = convertLyrics(parsedLyrics);
          }
          setRichsynced(result.richsynced);
          setSyncedLyrics(parsedLyrics);
        } else {
          setPlainLyrics(result.plainLyrics);
        }

        // update discord RPC
        invoke("set_discord_rpc", {
          details: media.title,
          stateMsg: media.artist,
        }).catch(console.error);
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
    if (activeLineRef.current && activeLineIndex !== -1) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLineIndex]);

  const toggleFullscreen = async () => {
    const alreadyFullscreen = await window.isFullscreen();
    await window.setFullscreen(!alreadyFullscreen);
    setIsFullscreen(!alreadyFullscreen);
  };

  return (
    <main>
      {media ? (
        <div>
          <button className="fullscreen-btn" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <div className="album-section">
            {media.thumbnail && (
              <img
                ref={imgRef}
                className="album-thumbnail"
                src={`data:image/jpeg;base64,${media.thumbnail}`}
                alt="thumbnail"
                onLoad={async (e) => {
                  try {
                    const result = await getColor(e.currentTarget);
                    if (!result) return;
                    const { h, s } = result.hsl();
                    document.documentElement.style.setProperty(
                      "--bg",
                      `hsl(${h}, ${s}%, 20%)`,
                    );
                    document.documentElement.style.setProperty(
                      "--text-primary",
                      `hsl(${h}, ${s}%, 90%)`,
                    );
                    document.documentElement.style.setProperty(
                      "--text-secondary",
                      `hsl(${h}, ${s}%, 70%)`,
                    );
                    document.documentElement.style.setProperty(
                      "--text-muted",
                      `hsl(${h}, ${s}%, 50%)`,
                    );
                    document.documentElement.style.setProperty(
                      "--accent",
                      `hsl(${h}, ${s}%, 90%)`,
                    );
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            )}
            <div>
              <div className="title">{media.title}</div>
              <div className="artist">{media.artist}</div>
              <div className="album-name">{media.album}</div>
              {richsynced && <p className="richsynced">Richsynced</p>}
            </div>
          </div>

          <div
            ref={lyricsContainerRef}
            className="lyrics-wrapper"
            key={media?.title + media?.artist}
          >
            {loading ? (
              <div className="loading">
                <div className="spinner" />
              </div>
            ) : lyricsNotFound ? (
              <div className="no-lyrics">
                <p>No lyrics found.</p>
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
        </div>
      ) : (
        <p>Nothing is playing.</p>
      )}
    </main>
  );
}
export default App;
