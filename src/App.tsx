import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LyricLine } from "./types/LyricLine";
import { LyricsResponse } from "./types/LyricsResponse";
import { Media } from "./types/Media";
import { convertSubtitleLyrics } from "./utils/convertSubtitleLyrics";
import { updateDiscordRPC } from "./utils/updateDiscordRPC";
import { getColor } from "colorthief";
import { Maximize, Minimize } from "lucide-react";

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const window = useMemo(() => getCurrentWindow(), []);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [media, setMedia] = useState<Media | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>("");
  const [lyricsResult, setLyricsResult] = useState<LyricsResponse | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [precisePosition, setPrecisePosition] = useState(0);

  const imgRef = useRef(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

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

  const toggleFullscreen = async () => {
    const state = await window.isFullscreen();
    await window.setFullscreen(!state);
    setIsFullscreen(!state);
  };

  const handleImageLoad = async (e: React.SyntheticEvent<HTMLImageElement>) => {
    const result = await getColor(e.currentTarget);
    if (!result) return;

    const { h, s } = result.hsl();
    document.documentElement.style.setProperty("--bg", `hsl(${h}, ${s}%, 20%)`);
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
  };

  // scroll to active line
  useEffect(() => {
    if (activeLineRef.current && activeLineIndex !== -1) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLineIndex]);

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
        setMedia((prev) => {
          if (
            prev?.title === event.payload.title &&
            prev?.artist === event.payload.artist &&
            prev?.album === event.payload.album
          ) {
            return prev;
          }

          return event.payload;
        });
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
    setLyricsResult(null);
    setSyncedLyrics([]);

    if (!media) {
      setCurrentPosition(0);
      return;
    }

    setCurrentPosition(media.position);

    if (lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    const fetchLyrics = async () => {
      try {
        const result = await invoke<LyricsResponse>("fetch_lyrics", {
          artist: media.artist,
          title: media.title,
          duration: media.duration,
        });

        setLyricsResult(result);

        if (result?.synced) {
          let parsedLyrics =
            typeof result.syncedLyrics === "string"
              ? JSON.parse(result.syncedLyrics)
              : result.syncedLyrics;

          if (!result.richsynced) {
            parsedLyrics = convertSubtitleLyrics(parsedLyrics);
          }

          setSyncedLyrics(parsedLyrics);
        }
      } catch {
        setLyricsResult(null);
      } finally {
        setLoading(false);
      }
    };
    fetchLyrics();
  }, [media?.title, media?.artist]);

  // sync position
  useEffect(() => {
    if (!lyricsResult || currentPosition === -1) {
      return;
    }

    let frameId: number;
    const startTime = performance.now();
    const offset = currentPosition;

    const sync = () => {
      const elapsed = performance.now() - startTime;
      setPrecisePosition(offset + elapsed);
      frameId = requestAnimationFrame(sync);
    };

    if (lyricsResult.synced) {
      // only run while the music is actually moving
      frameId = requestAnimationFrame(sync);
    }

    return () => cancelAnimationFrame(frameId);
  }, [currentPosition, lyricsResult]);

  // update discord rpc
  useEffect(() => {
    if (currentPosition === -1 || !media || !lyricsResult) {
      invoke("clear_discord_rpc").catch(console.error);
      return;
    }
    updateDiscordRPC(lyricsResult, media, currentPosition);
  }, [currentPosition, media?.title, lyricsResult]);

  // create thumbnail
  useEffect(() => {
    if (!media?.thumbnail) return;

    const byteArray = new Uint8Array(media.thumbnail);

    const blob = new Blob([byteArray], {
      type: "image/jpeg",
    });

    const url = URL.createObjectURL(blob);

    setThumbnailUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [media?.thumbnail]);

  if (!media) return <main className="empty-state">Nothing is playing.</main>;

  return (
    <main>
      <button className="fullscreen-btn" onClick={toggleFullscreen}>
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      <section className="album-section">
        {media.thumbnail && (
          <img
            ref={imgRef}
            className="album-thumbnail"
            src={thumbnailUrl ?? undefined}
            alt="thumbnail"
            onLoad={handleImageLoad}
          />
        )}
        <div>
          <div className="title">{media.title}</div>
          <div className="artist">{media.artist}</div>
          <div className="album-name">{media.album}</div>
          {lyricsResult?.richsynced && <p className="richsynced">Richsynced</p>}
        </div>
      </section>

      <div
        ref={lyricsContainerRef}
        className="lyrics-wrapper"
        key={media?.title + media?.artist}
      >
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : !lyricsResult ? (
          <div className="no-lyrics">
            <p>No lyrics found.</p>
          </div>
        ) : lyricsResult.synced ? (
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
                      precisePosition >= wordStart && precisePosition < wordEnd;

                    // progress through current word (0 → 1)
                    let progress = 0;
                    if (precisePosition >= wordEnd) {
                      progress = 1;
                    } else if (isWordActive) {
                      progress = Math.min(
                        1,
                        (precisePosition - wordStart) / (wordEnd - wordStart),
                      );
                    }

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
            <pre>{lyricsResult.plainLyrics}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
