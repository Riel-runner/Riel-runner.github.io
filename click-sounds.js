/* ==========================================================
   Riel Runner
   Button Click Sound Effects

   Wait for click.ogg to finish before allowing the original
   button/link action to run. This prevents page navigation
   from cutting the sound off.
========================================================== */

"use strict";

(() => {
  const CLICK_SOUND = "assets/audio/sfx/click.ogg";
  const replayedEvents = new WeakSet();
  let actionPending = false;

  function isExcluded(control) {
    return (
      control.matches("#btn-buy, .btn-buy, .t-btn") ||
      control.closest("#btn-buy, .btn-buy, .t-btn") !== null
    );
  }

  function playClickThenRun(control, originalEvent) {
    const sound = new Audio(CLICK_SOUND);
    sound.preload = "auto";
    sound.volume = 0.45;

    let finished = false;

    const runOriginalAction = () => {
      if (finished) return;
      finished = true;
      actionPending = false;

      // Replay the click after the sound has finished. This lets
      // the page's existing handlers and normal link behavior run.
      const replay = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: originalEvent.detail,
        button: originalEvent.button,
        buttons: originalEvent.buttons,
        clientX: originalEvent.clientX,
        clientY: originalEvent.clientY
      });
      replayedEvents.add(replay);
      control.dispatchEvent(replay);
    };

    sound.addEventListener("ended", runOriginalAction, { once: true });

    // Fallback in case the browser cannot load/play the sound.
    const fallback = window.setTimeout(runOriginalAction, 1200);

    sound.addEventListener("ended", () => {
      window.clearTimeout(fallback);
    }, { once: true });

    sound.play().catch(() => {
      window.clearTimeout(fallback);
      runOriginalAction();
    });
  }

  document.addEventListener("click", event => {
    if (replayedEvents.has(event)) return;

    const control = event.target.closest(
      "button, a[href], [role='button']"
    );

    if (!control || control.disabled || isExcluded(control)) return;

    // Avoid double-triggering while a previous click is waiting.
    if (actionPending) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    // Stop the original click so navigation or button handlers
    // cannot unload the page before the sound has finished.
    event.preventDefault();
    event.stopImmediatePropagation();
    actionPending = true;

    playClickThenRun(control, event);
  }, true);

  // The pause control is a touch-only game UI control. Movement,
  // jump, dash, and shoot remain excluded from click sounds.
  const pauseButton = document.getElementById("btn-pause");
  if (pauseButton) {
    pauseButton.addEventListener("touchstart", () => {
      const sound = new Audio(CLICK_SOUND);
      sound.volume = 0.45;
      sound.play().catch(() => {});
    }, { passive: true });
  }
})();
