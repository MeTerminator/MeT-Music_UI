/**
 * Media Session 适配器(navigator.mediaSession)。
 * 移植自旧 src/utils/mediaSession.js,实现 core 的 MediaSessionAdapter 接口。
 * 系统媒体键(Now Playing / SMTC)由 Chromium 路由到此,禁止再加 globalShortcut。
 */
import type { MediaSessionAdapter } from "@met/core";

const hasMediaSession = () => "mediaSession" in navigator;

let actionsBound = false;
let lastPositionAt = 0;

const POSITION_INTERVAL_MS = 1000;

type Handler = (details?: { seekTime?: number; seekOffset?: number }) => void;

const safeSetHandler = (action: MediaSessionAction, handler: Handler | undefined): void => {
  if (!handler) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Unsupported actions throw on some platforms.
  }
};

export const webMediaSession: MediaSessionAdapter = {
  bindActions(handlers) {
    if (!hasMediaSession() || actionsBound) return;

    safeSetHandler("play", handlers.play);
    safeSetHandler("pause", handlers.pause);
    safeSetHandler("previoustrack", handlers.previoustrack);
    safeSetHandler("nexttrack", handlers.nexttrack);
    safeSetHandler("stop", handlers.stop);
    safeSetHandler("seekto", handlers.seekto);
    safeSetHandler("seekbackward", handlers.seekbackward);
    safeSetHandler("seekforward", handlers.seekforward);

    if (handlers.visibilitychange) {
      const onVisibilityChange = handlers.visibilitychange;
      document.addEventListener("visibilitychange", () => onVisibilityChange());
    }
    actionsBound = true;
  },

  setMetadata({ title, artist, album, artwork }) {
    if (!hasMediaSession()) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "MeT-Music",
      artist: artist || "",
      album: album || "",
      artwork: artwork || [],
    });
  },

  setPlaybackState(isPlaying) {
    if (!hasMediaSession()) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  },

  updatePosition({ duration, position, playbackRate }, force = false) {
    if (!hasMediaSession() || !("setPositionState" in navigator.mediaSession)) return;

    const now = Date.now();
    if (!force && now - lastPositionAt < POSITION_INTERVAL_MS) return;

    const safeDuration = Number(duration) || 0;
    const safePosition = Number(position) || 0;
    if (safeDuration <= 0 || safePosition < 0 || safePosition > safeDuration) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: safeDuration,
        playbackRate: Number(playbackRate) || 1,
        position: safePosition,
      });
      lastPositionAt = now;
    } catch (error) {
      console.warn("Failed to update Media Session position:", error);
    }
  },

  clear() {
    if (!hasMediaSession()) return;

    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    lastPositionAt = 0;

    if ("setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState(undefined);
      } catch {
        // Some engines reject a reset; metadata/state are enough.
      }
    }
  },
};
