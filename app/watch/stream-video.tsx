"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import styles from "@/components/streams/surface.module.css";

/**
 * Plays a direct HLS (.m3u8) or DASH (.mpd) stream with the browser's own
 * controls. It is only mounted after the viewer asked for it, so nothing
 * contacts the stream's host before that click. The player libraries are
 * fetched on demand and never ship with the page. HLS uses hls.js wherever
 * it is supported, even in browsers that also claim native HLS playback
 * (recent Chrome does): one code path, with errors it reports. The browser's
 * own player is the fallback, for example on older iPhones.
 */
export function StreamVideo({ kind, url, label }: { kind: "hls" | "dash"; url: string; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    let destroy = () => {};
    // Entering the failure view also releases the player (requests, timers, media attachment).
    const fail = () => {
      if (disposed) return;
      destroy();
      destroy = () => {};
      setFailed(true);
    };

    async function start(target: HTMLVideoElement) {
      try {
        if (kind === "hls") {
          const { default: Hls } = await import("hls.js");
          if (disposed) return;
          if (!Hls.isSupported()) {
            if (target.canPlayType("application/vnd.apple.mpegurl")) target.src = url;
            else fail();
            return;
          }
          const hls = new Hls();
          hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
          hls.loadSource(url);
          hls.attachMedia(target);
          destroy = () => hls.destroy();
        } else {
          const { MediaPlayer } = await import("dashjs");
          if (disposed) return;
          const player = MediaPlayer().create();
          // Errors after playback became possible (a missed segment) are the player's to retry; before
          // the first frame there is nothing to retry into, even if metadata (readyState 1) has loaded.
          let playable = false;
          target.addEventListener("loadeddata", () => { playable = true; }, { once: true });
          player.on(MediaPlayer.events.ERROR, () => { if (!playable) fail(); });
          player.initialize(target, url, false);
          destroy = () => player.destroy();
        }
      } catch { fail(); }
    }
    void start(element);
    return () => { disposed = true; destroy(); };
  }, [kind, url]);

  if (failed) {
    return <div className={cn(styles.playerMessage)} role="alert">
      <p>This stream could not be played here. Its server may not allow other sites to play it, the address may have expired, or
        the format may be unsupported. Copy the stream address below into a player such as VLC instead.</p>
    </div>;
  }
  return <video ref={video} className={styles.video} controls playsInline preload="none" aria-label={label} onError={() => setFailed(true)} />;
}
