import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LyricLine } from "./types/LyricLine";
import { LyricsResponse } from "./types/LyricsResponse";
import { Media } from "./types/Media";
import { SubtitleLine } from "./types/SubtitleLine";
import { formatLyrics } from "./utils/formatLyrics";
import { updateDiscordRPC } from "./utils/updateDiscordRPC";
import { getColor } from "colorthief";
import { Maximize, Minimize } from "lucide-react";
import { getLineMs } from "./utils/getLineMs";

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const window = useMemo(() => getCurrentWindow(), []);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [media, setMedia] = useState<Media | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [lyricsResult, setLyricsResult] = useState<LyricsResponse | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<
    (LyricLine | SubtitleLine)[]
  >([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [precisePosition, setPrecisePosition] = useState(0);

  const activeLineRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const prevActiveLineRef = useRef<number>(-1);
  const prevPositionRef = useRef<number>(0);

  // Find active line using binary search
  const activeLineIndex = useMemo(() => {
    let low = 0;
    let high = syncedLyrics.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = getLineMs(syncedLyrics[mid]);
      const nextLine = syncedLyrics[mid + 1];
      const end = nextLine ? getLineMs(nextLine) : Infinity;

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
    const docStyle = document.documentElement.style;
    docStyle.setProperty("--bg", `hsl(${h}, ${s}%, 20%)`);
    docStyle.setProperty("--text-primary", `hsl(${h}, ${s}%, 90%)`);
    docStyle.setProperty("--text-secondary", `hsl(${h}, ${s}%, 70%)`);
    docStyle.setProperty("--text-muted", `hsl(${h}, ${s}%, 50%)`);
    docStyle.setProperty("--accent", `hsl(${h}, ${s}%, 90%)`);
  };

  // Tauri event listeners
  useEffect(() => {
    let active = true;
    const unlistenCleanups: (() => void)[] = [];

    async function setupListeners() {
      try {
        // trigger backend loops
        invoke("fetch_media_loop").catch(console.error);
        invoke("fetch_position_loop").catch(console.error);

        // listen for the events the loops will emit
        const unlistenMedia = await listen<Media>("update_media", (event) => {
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
        if (active) unlistenCleanups.push(unlistenMedia);

        const unlistenPosition = await listen<number>(
          "update_position",
          (event) => {
            setCurrentPosition(event.payload);
          },
        );
        if (active) unlistenCleanups.push(unlistenPosition);
      } catch (err) {
        console.error("Failed to setup Tauri event listeners:", err);
      }
    }

    setupListeners();

    return () => {
      active = false;
      unlistenCleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  // Handle lyrics loading & parsing on media changes
  useEffect(() => {
    // ignore flag for async race conditions
    let active = true;

    // reset everything
    setLoading(true);
    setLyricsResult(null);
    setSyncedLyrics([]);
    prevActiveLineRef.current = -1;
    lyricsContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    if (!media) {
      setCurrentPosition(0);
      setThumbnailUrl(null);
      setLoading(false);
      return;
    }

    setCurrentPosition(media.position);

    // update thumbnail
    let url: string | null = null;
    if (media.thumbnail && media.thumbnail.length > 0) {
      const byteArray = new Uint8Array(media.thumbnail);
      const blob = new Blob([byteArray], { type: "image/jpeg" });
      url = URL.createObjectURL(blob);
      setThumbnailUrl(url);
    } else {
      setThumbnailUrl(null);
    }

    // fetch lyrics
    const fetchLyrics = async () => {
      try {
        const result = await invoke<LyricsResponse>("fetch_lyrics", {
          artist: media.artist,
          title: media.title,
          duration: media.duration,
        });

        // if the user skipped to another song, abort
        if (!active) return;

        setLyricsResult(result);

        if (result?.synced) {
          let parsedLyrics =
            typeof result.syncedLyrics === "string"
              ? JSON.parse(result.syncedLyrics)
              : result.syncedLyrics;

          let processedLyrics: (LyricLine | SubtitleLine)[] = [];

          // add an empty line on gaps > 5 seconds
          if (result.richsynced) {
            const THRESHOLD_MS = 5000; // 5 seconds in milliseconds

            for (let i = 0; i < parsedLyrics.length; i++) {
              const currentLine = parsedLyrics[i];

              if (i > 0) {
                const prevLine = parsedLyrics[i - 1];
                const prevEnd =
                  "te" in prevLine ? prevLine.te * 1000 : getLineMs(prevLine);
                const currentStart = getLineMs(currentLine);

                // if the gap is larger than the threshold, add an empty line
                if (currentStart - prevEnd > THRESHOLD_MS) {
                  processedLyrics.push({
                    ts: prevEnd / 1000 + 2,
                    te: currentStart / 1000,
                    text: "",
                    time: { total: prevEnd / 1000 },
                  } as any);
                }
              }
              processedLyrics.push(currentLine);
            }
          } else {
            processedLyrics = parsedLyrics;
          }
          setSyncedLyrics(processedLyrics);
        }
      } catch (err) {
        console.error("Lyrics fetch failed:", err);
        if (active) setLyricsResult(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchLyrics();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [media?.title, media?.artist, media?.thumbnail]);

  // Track position frame updates
  useEffect(() => {
    if (!lyricsResult || currentPosition === -1) return;

    // detect manual user skips or large jumps backwards
    if (prevPositionRef.current - currentPosition > 2000) {
      lyricsContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevPositionRef.current = currentPosition;

    let frameId: number;
    const startTime = performance.now();
    const offset = currentPosition;

    const sync = () => {
      setPrecisePosition(offset + (performance.now() - startTime));
      frameId = requestAnimationFrame(sync);
    };

    if (lyricsResult.synced) {
      // only run while the music is actually playing
      frameId = requestAnimationFrame(sync);
    }

    return () => cancelAnimationFrame(frameId);
  }, [currentPosition, lyricsResult]);

  // Handle scrolling
  useEffect(() => {
    if (!lyricsContainerRef.current) return;

    // handle active line highlighting
    if (
      activeLineIndex !== -1 &&
      activeLineIndex !== prevActiveLineRef.current
    ) {
      prevActiveLineRef.current = activeLineIndex;
      activeLineRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    // handle intro/track looping
    if (
      activeLineIndex === -1 &&
      precisePosition < 1000 &&
      prevActiveLineRef.current !== -1
    ) {
      prevActiveLineRef.current = -1;
      lyricsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // handle song end
    if (syncedLyrics.length > 0) {
      const lastLine = syncedLyrics[syncedLyrics.length - 1];
      const trackEndMs =
        "te" in lastLine && typeof lastLine.te === "number"
          ? lastLine.te * 1000
          : media?.duration || 0;

      if (
        precisePosition >= trackEndMs &&
        trackEndMs > 0 &&
        prevActiveLineRef.current !== -2
      ) {
        prevActiveLineRef.current = -2;
        lyricsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [activeLineIndex, precisePosition, syncedLyrics, media?.duration]);

  // Update Discord RPC
  useEffect(() => {
    if (currentPosition === -1 || !media || !lyricsResult) {
      invoke("clear_discord_rpc").catch(console.error);
      return;
    }
    updateDiscordRPC(lyricsResult, media, currentPosition);
  }, [currentPosition, media?.title, lyricsResult]);

  if (!media) return <main className="empty-state">Nothing is playing.</main>;

  return (
    <main>
      <button className="fullscreen-btn" onClick={toggleFullscreen}>
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      <section className="album-section">
        {media.thumbnail && thumbnailUrl !== null && (
          <img
            className="album-thumbnail"
            src={thumbnailUrl}
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
        key={`${media?.title}-${media?.artist}-${media?.album}`}
      >
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : lyricsResult?.synced ? (
          <div className="synced-lyrics">
            {syncedLyrics.map((line, index) => {
              const isActive = activeLineIndex === index;
              const lineKey =
                "ts" in line ? line.ts : line.time.total * 1000 + index;
              const rawText =
                "text" in line ? line.text : (line as any).lyric || "";
              const lyricText = rawText.trim() === "" ? "♪" : rawText;

              return (
                <div
                  key={lineKey}
                  ref={isActive ? activeLineRef : null}
                  className={`line ${isActive ? "active" : ""}`}
                >
                  {lyricsResult.richsynced && "l" in line ? (
                    // richsynced lyrics: word-by-word highlight
                    (() => {
                      const totalWords = line.l.length;

                      const renderWord = (word: any, wIdx: number) => {
                        const wordStart = (line.ts + word.o) * 1000;
                        const nextWord = line.l[wIdx + 1];
                        const wordEnd = nextWord
                          ? (line.ts + nextWord.o) * 1000
                          : line.te * 1000;
                        const isWordActive =
                          precisePosition >= wordStart &&
                          precisePosition < wordEnd;

                        let progress = 0;
                        if (precisePosition >= wordEnd) {
                          progress = 1;
                        } else if (isWordActive) {
                          progress = Math.min(
                            1,
                            (precisePosition - wordStart) /
                              (wordEnd - wordStart),
                          );
                        }

                        return (
                          <span
                            key={wIdx}
                            className={`karaoke-word ${isWordActive ? "active-word" : ""}`}
                            style={
                              { "--progress": progress } as React.CSSProperties
                            }
                          >
                            {word.c}&nbsp;
                          </span>
                        );
                      };

                      // if the lyric line has 3 words or fewer, render them normally without nesting
                      if (totalWords <= 3) {
                        return line.l.map((word, wIdx) =>
                          renderWord(word, wIdx),
                        );
                      }

                      // split array into primary segment and final 3 elements
                      const leadingWords = line.l.slice(0, totalWords - 3);
                      const trailingWords = line.l.slice(totalWords - 3);

                      return (
                        <>
                          {leadingWords.map((word, wIdx) =>
                            renderWord(word, wIdx),
                          )}
                          <span
                            style={{
                              display: "inline-block",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {trailingWords.map((word, wIdx) =>
                              renderWord(word, totalWords - 3 + wIdx),
                            )}
                          </span>
                        </>
                      );
                    })()
                  ) : (
                    // subtitle lyrics: display whole line
                    <span>{formatLyrics(lyricText)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : lyricsResult?.plainLyrics ? (
          <div className="plain-lyrics">
            <pre>{lyricsResult.plainLyrics}</pre>
          </div>
        ) : (
          <div className="no-lyrics">
            <p>No lyrics found.</p>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
