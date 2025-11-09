import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

interface Media {
  artist: string;
  title: string;
  album: string;
  duration: number;
  lyrics: string;
}

function App() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

  const [media, setMedia] = useState<Media | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    // start listening to the event
    listen<Media>("fetch_current_media", (event) => {
      setMedia(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    // trigger backend to fetch media
    invoke("fetch_current_media").catch(console.error);

    // cleanup function to unsubscribe when component unmounts
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <main className="container">
      {media ? (
        <>
          <p>
            {media.artist} - {media.title}
          </p>
          <pre>{media.lyrics || "No lyrics found."}</pre>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </main>
  );
}

export default App;
