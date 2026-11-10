// Runs in <head>, before the page is drawn: if the intro already played in this
// browser session, mark the page so CSS hides the video straight away (no flash).
// sessionStorage resets when the tab is closed, so opening the game again replays it.
window.RIEL_INTRO_KEY = 'rielrunner_intro_played';
try {
  if (sessionStorage.getItem(window.RIEL_INTRO_KEY)) {
    document.documentElement.classList.add('intro-seen');
  }
} catch (e) {
  // Storage unavailable (e.g. some private modes): just play the intro as before.
}
