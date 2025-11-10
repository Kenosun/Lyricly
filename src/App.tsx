import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { fetchLyricsResponse } from "./fetchLyricsResponse";

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
  const [loading, setLoading] = useState<boolean>(false);
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    // start listening to the events
    listen<Media>("update_media", (event) => {
      setMedia(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    // trigger backend to fetch media
    invoke("fetch_media_loop").catch(console.error);

    // cleanup function to unsubscribe when component unmounts
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!media) return;

    const fetchLyrics = async () => {
      setLoading(true);
      const result = await fetchLyricsResponse(
        media.artist,
        media.title,
        media.duration
      );
      setLoading(false);
      if (result) {
        const { lyricsResponse, synced } = result;
        if (synced) {
          setLyrics(lyricsResponse.syncedLyrics);
        } else {
          setLyrics(lyricsResponse.plainLyrics);
        }
      } else {
        setLyrics("No lyrics found.");
      }
    };
    fetchLyrics();
  }, [media]);

  return (
    <main className="container">
      {media ? (
        <>
          <p>
            {media.artist} - {media.title}
          </p>
          <p>Initial position: {media.position}</p>
          {loading ? <p>Loading lyrics...</p> : <pre>{lyrics}</pre>}
        </>
      ) : (
        <p>Nothing is playing.</p>
      )}
    </main>
  );
}

export default App;
