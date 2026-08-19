const hasMediaSession = () => "mediaSession" in navigator;

let actionsBound = false;
let lastPositionAt = 0;

const POSITION_INTERVAL_MS = 1000;

const safeSetHandler = (action, handler) => {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Unsupported actions throw on some platforms.
  }
};

export const bindMediaSessionActions = (handlers) => {
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
    document.addEventListener("visibilitychange", handlers.visibilitychange);
  }
  actionsBound = true;
};

export const setMediaSessionMetadata = ({ title, artist, album, artwork }) => {
  if (!hasMediaSession()) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title || "MeT-Music",
    artist: artist || "",
    album: album || "",
    artwork: artwork || [],
  });
};

export const setMediaSessionPlaybackState = (isPlaying) => {
  if (!hasMediaSession()) return;
  navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
};

export const updateMediaSessionPosition = ({ duration, position, playbackRate }, force = false) => {
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
};

export const clearMediaSession = () => {
  if (!hasMediaSession()) return;

  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
  lastPositionAt = 0;

  if ("setPositionState" in navigator.mediaSession) {
    try {
      navigator.mediaSession.setPositionState(null);
    } catch {
      // Some engines reject a null reset; metadata/state are enough.
    }
  }
};
