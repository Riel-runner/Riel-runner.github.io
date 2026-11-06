/* ==========================================================
   Riel Runner
   Background Music Continuity

   Plays the menu music on non-game pages and carries its
   playback position across page navigation in the same tab.
   game.html and shop.html intentionally do not load this file.
========================================================== */

"use strict";

(() => {
  const STORAGE_KEY = "rielRunnerMusicPosition";
  const MUSIC_PATH = "assets/audio/music/Title-screen-music.flac";

  const audio = new Audio(MUSIC_PATH);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.35;

  let restored = false;

  function restorePosition() {
    if (restored || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }

    restored = true;

    try {
      const saved = Number.parseFloat(sessionStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= 0) {
        audio.currentTime = saved % audio.duration;
      }
    } catch (error) {
      // Music can still play if sessionStorage is unavailable.
    }
  }

  function savePosition() {
    if (!Number.isFinite(audio.currentTime)) return;

    try {
      sessionStorage.setItem(STORAGE_KEY, String(audio.currentTime));
    } catch (error) {
      // Ignore storage restrictions; playback itself is unaffected.
    }
  }

  audio.addEventListener("loadedmetadata", restorePosition, { once: true });
  audio.addEventListener("timeupdate", savePosition);

  window.addEventListener("pagehide", () => {
    savePosition();
    audio.pause();
  });

  function startMusic() {
    restorePosition();

    const playAttempt = audio.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        // Some browsers block autoplay until the visitor interacts.
      });
    }
  }

  startMusic();

  // Retry after the first interaction if the browser blocked autoplay.
  window.addEventListener("pointerdown", startMusic, { once: true });
  window.addEventListener("keydown", startMusic, { once: true });
})();
