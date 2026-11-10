/* ==========================================================
   Riel Runner
   Volume Settings

   Reads the player's Music and SFX volume (0-100) from the
   saved settings. Every sound multiplies its own base volume
   by these values, e.g. audio.volume = 0.5 * RielVolume.music().
   The Settings page fires a "rielvolumechange" event so music
   that is already playing can update instantly.
========================================================== */

"use strict";

(() => {
  const SETTINGS_KEY = "rielrunner_settings";

  function read(key) {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
      const value = Number(settings[key]);
      if (Number.isFinite(value)) return Math.min(100, Math.max(0, value)) / 100;
    } catch (error) {
      // Fall back to full volume if storage is unavailable.
    }
    return 1;
  }

  window.RielVolume = {
    music: () => read("musicVolume"),
    sfx: () => read("sfxVolume"),

    // Keep a looping music track in sync with the Music slider.
    bindMusic(audio, baseVolume) {
      const apply = () => { audio.volume = baseVolume * read("musicVolume"); };
      apply();
      window.addEventListener("rielvolumechange", apply);
      window.addEventListener("storage", apply);
      return apply;
    }
  };
})();
