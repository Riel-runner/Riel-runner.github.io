/* ==========================================================
   Riel Runner
   Button Click Sound Effects

   Standard UI buttons and links use click.ogg.
   Settings toggles keep their dedicated toggle.ogg handling.
   Gameplay touch controls and the shop upgrade button are excluded.
========================================================== */

"use strict";

(() => {
  const CLICK_SOUND = "assets/audio/sfx/click.ogg";

  function playClickSound() {
    const sound = new Audio(CLICK_SOUND);
    sound.volume = 0.45;
    sound.play().catch(() => {});
  }

  document.addEventListener("click", event => {
    const control = event.target.closest(
      "button, a[href], [role='button']"
    );

    if (!control) return;
    if (control.disabled) return;
    if (control.matches("#btn-buy, .btn-buy, .t-btn")) return;

    playClickSound();
  });

  // The pause control is a touch-only game UI control, unlike
  // movement, jump, dash, and shoot controls.
  const pauseButton = document.getElementById("btn-pause");
  if (pauseButton) {
    pauseButton.addEventListener("touchstart", () => {
      playClickSound();
    }, { passive: true });
  }
})();
