const SETTINGS_KEY = 'rielrunner_settings';

// Settings toggle sound effect
const toggleSound = new Audio('assets/audio/sfx/toggle.ogg');
toggleSound.preload = 'auto';

function playToggleSound() {
  const sound = toggleSound.cloneNode();
  sound.volume = 0.5 * window.RielVolume.sfx();
  sound.play().catch(() => {});
}

// Return to the exact section that opened Settings.
// Use a distinct value for the upgrade shop so it can't be confused with store.html
// (the cosmetics shop).
const returnTo = new URLSearchParams(window.location.search).get('returnTo');
const backButton = document.getElementById('backButton');
if (returnTo === 'game.html') {
  backButton.href = 'game.html?resumePaused=1';
} else if (returnTo === 'upgrade-shop') {
  backButton.href = 'shop.html';
} else if (returnTo === 'cosmetics-shop') {
  backButton.href = 'store.html';
}

const DEFAULTS = {
  autoAim: true,
  hpBars: true,
  damageNumbers: true,
  touchControls: false,
  musicVolume: 100,
  sfxVolume: 100
};

function loadSettings() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch { return { ...DEFAULTS }; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function bindToggle(checkboxId, stateId, settingKey) {
  const checkbox = document.getElementById(checkboxId);
  const stateEl  = document.getElementById(stateId);

  function update(val) {
    checkbox.checked = val;
    stateEl.textContent = val ? 'ON' : 'OFF';
    stateEl.className = 'toggle-state' + (val ? ' on' : '');
  }

  const settings = loadSettings();
  update(settings[settingKey]);

  checkbox.addEventListener('change', () => {
    const s = loadSettings();
    s[settingKey] = checkbox.checked;
    saveSettings(s);
    update(checkbox.checked);
    playToggleSound();
    showToast('SAVED');
  });
}

bindToggle('toggle-autoaim',  'autoaim-state',  'autoAim');
bindToggle('toggle-hpbars',   'hpbars-state',   'hpBars');
bindToggle('toggle-damnums',  'damnums-state',  'damageNumbers');
bindToggle('toggle-touch',    'touch-state',    'touchControls');

// ─── VOLUME SLIDERS ──────────────────────────────────────────────────
function bindVolume(sliderId, valueId, settingKey) {
  const slider  = document.getElementById(sliderId);
  const valueEl = document.getElementById(valueId);

  function show(val) {
    slider.value = val;
    valueEl.textContent = val > 0 ? val + '%' : 'MUTED';
    valueEl.className = 'volume-value' + (val > 0 ? '' : ' muted');
  }

  show(loadSettings()[settingKey]);

  // Update while dragging so the menu music changes live.
  slider.addEventListener('input', () => {
    const s = loadSettings();
    s[settingKey] = Number(slider.value);
    saveSettings(s);
    show(s[settingKey]);
    window.dispatchEvent(new Event('rielvolumechange'));
  });

  // On release, play a sample SFX and confirm the save.
  slider.addEventListener('change', () => {
    if (settingKey === 'sfxVolume') playToggleSound();
    showToast('SAVED');
  });

  return () => show(loadSettings()[settingKey]);
}

const refreshMusicSlider = bindVolume('slider-music', 'music-value', 'musicVolume');
const refreshSfxSlider   = bindVolume('slider-sfx',   'sfx-value',   'sfxVolume');

// ─── RESET ───────────────────────────────────────────────────────────
let resetStep = 0;
let resetTimer;

document.getElementById('reset-btn').addEventListener('click', () => {
  if (resetStep === 0) {
    resetStep = 1;
    document.getElementById('reset-btn').textContent = 'SURE?';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetStep = 0;
      document.getElementById('reset-btn').textContent = 'RESET';
    }, 3000);
  } else {
    localStorage.clear();
    saveSettings({ ...DEFAULTS });
    playToggleSound();
    resetStep = 0;
    document.getElementById('reset-btn').textContent = 'RESET';
    bindToggle('toggle-autoaim',  'autoaim-state',  'autoAim');
    bindToggle('toggle-hpbars',   'hpbars-state',   'hpBars');
    bindToggle('toggle-damnums',  'damnums-state',  'damageNumbers');
    bindToggle('toggle-touch',    'touch-state',    'touchControls');
    refreshMusicSlider();
    refreshSfxSlider();
    window.dispatchEvent(new Event('rielvolumechange'));
    showToast('ALL DATA CLEARED');
  }
});

// ─── TOAST ───────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
