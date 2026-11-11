// ABILITIES tab of the gem shop (store.html): spin the wheel for an ability, then
// equip / upgrade / awaken the ones you own. Rules and data: js/abilities.js.
// Uses render() and showToast() from js/store.js.
window.StoreAbilities = (function () {
  const A = window.RielAbilities;
  const wheel = document.getElementById('wheel');
  const rollBtn = document.getElementById('roll-btn');
  const resultEl = document.getElementById('roll-result');
  const listEl = document.getElementById('ability-list');

  let angle = 0;          // wheel rotation so far (degrees, keeps growing)
  let spinning = false;
  const api = { SPIN_MS: 3200, render: renderPanel };

  // ── Wheel: one slice per rarity, sized by its chance ──
  const slices = [];      // { rarity, from, to } in degrees, clockwise from the top
  let at = 0;
  for (const k of A.RARITY_ORDER) {
    const size = A.RARITIES[k].weight * 3.6;
    slices.push({ rarity: k, from: at, to: at + size });
    at += size;
  }
  wheel.style.background = 'conic-gradient(' +
    slices.map(s => A.RARITIES[s.rarity].color + ' ' + s.from + 'deg ' + s.to + 'deg').join(', ') + ')';
  // Labels on the slices big enough to hold one
  for (const s of slices) {
    if (s.to - s.from < 30) continue;
    const mid = (s.from + s.to) / 2;
    const label = document.createElement('div');
    label.className = 'wheel-label';
    label.textContent = A.RARITIES[s.rarity].name;
    label.style.transform = 'rotate(' + mid + 'deg)';   // full-size box: text sits near the rim
    wheel.appendChild(label);
  }
  document.getElementById('wheel-odds').innerHTML = A.RARITY_ORDER.map(k =>
    '<span style="color:' + A.RARITIES[k].color + '">&#9632; ' + A.RARITIES[k].name + ' ' + A.RARITIES[k].weight + '%</span>').join('');

  // ── Rolling ──
  function spinTo(rarity) {
    const s = slices.find(x => x.rarity === rarity);
    const target = s.from + (s.to - s.from) * (0.2 + Math.random() * 0.6);   // somewhere inside the slice
    const now = ((angle % 360) + 360) % 360;
    // The pointer is at the top, so the wheel must turn until `target` sits under it.
    angle += 5 * 360 + (((360 - target) - now) % 360 + 360) % 360;
    wheel.style.transition = 'transform ' + api.SPIN_MS + 'ms cubic-bezier(0.12, 0.7, 0.15, 1)';
    wheel.style.transform = 'rotate(' + angle + 'deg)';
  }

  function doRoll() {
    if (spinning) return;
    const r = A.roll();
    if (!r.ok) { showToast(r.reason + '!'); return; }
    spinning = true;
    resultEl.hidden = true;
    document.getElementById('gem-count').textContent = window.RielCosmetics.gems().toLocaleString('en-US');
    updateRollBtn();
    spinTo(r.def.rarity);
    playSfx('assets/audio/sfx/shoot.ogg', 0.25);
    setTimeout(() => reveal(r), api.SPIN_MS);
  }

  function reveal(r) {
    spinning = false;
    const rar = A.RARITIES[r.def.rarity];
    const need = A.copiesToUpgrade(r.level);
    const sub = r.isNew ? 'NEW ABILITY UNLOCKED!' + (A.equippedId() === r.def.id ? ' EQUIPPED' : '')
      : '+1 COPY &middot; ' + (need == null ? 'ALREADY AWAKENED' : r.copies + ' / ' + need + ' TO ' + (r.level === 2 ? 'AWAKEN' : 'LV ' + (r.level + 1)));
    resultEl.innerHTML = '<canvas width="48" height="48"></canvas><div>' +
      '<div class="rr-rarity" style="color:' + rar.color + '">' + rar.name + '</div>' +
      '<div class="rr-name">' + r.def.name + '</div><div class="rr-sub">' + sub + '</div></div>';
    resultEl.className = 'roll-result r-' + r.def.rarity + (r.isNew ? ' is-new' : '');
    resultEl.hidden = false;
    A.drawIcon(resultEl.querySelector('canvas').getContext('2d'), r.def, 4, 4, 5);
    playSfx('assets/audio/sfx/upgrade.ogg', 0.55);
    if (r.def.rarity === 'legendary' || r.def.rarity === 'super') flash();
    renderPanel();
  }

  // ── Collection ──
  function card(def) {
    const o = A.owned(def.id), rar = A.RARITIES[def.rarity];
    const level = o ? o.level : 1, s = A.stats(def, level);
    const equipped = o && A.equippedId() === def.id, awakened = level >= A.MAX_LEVEL;
    const need = A.copiesToUpgrade(level);
    const el = document.createElement('div');
    el.className = 'ability-card r-' + def.rarity + (o ? ' owned' : ' locked') + (equipped ? ' equipped' : '') + (awakened ? ' awakened' : '');
    el.dataset.id = def.id;
    let progress = '', buttons = '';
    if (o) {
      progress = awakened
        ? '<div class="ab-copies">AWAKENED &middot; MAX LEVEL' + (o.copies ? ' &middot; ' + o.copies + ' SPARE' : '') + '</div>'
        : '<div class="ab-bar"><div style="width:' + Math.min(100, 100 * o.copies / need) + '%;background:' + rar.color + '"></div></div>' +
          '<div class="ab-copies">' + o.copies + ' / ' + need + ' COPIES TO ' + (level === 2 ? 'AWAKEN' : 'LV 2') + '</div>';
      buttons = '<div class="ab-buttons">' +
        '<button class="store-btn ab-equip ' + (equipped ? 'is-equipped' : 'is-equip') + '"' + (equipped ? ' disabled' : '') + '>' + (equipped ? 'EQUIPPED' : 'EQUIP') + '</button>' +
        (awakened ? '' : '<button class="store-btn is-buy ab-upgrade"' + (A.canUpgrade(def.id) ? '' : ' disabled') + '>' + (level === 2 ? 'AWAKEN' : 'UPGRADE') + '</button>') +
        '</div>';
    } else {
      progress = '<div class="ab-copies">NOT FOUND YET &middot; WIN IT ON THE WHEEL</div>';
    }
    el.innerHTML =
      '<div class="ab-head"><canvas width="40" height="40"></canvas><div>' +
        '<div class="ab-name">' + def.name + '</div>' +
        '<div class="ab-tags"><span style="color:' + rar.color + '">' + rar.name + '</span>' +
        (o ? ' &middot; <span class="ab-level">' + A.LEVEL_NAMES[level] + '</span>' : '') + '</div></div></div>' +
      '<div class="ab-desc">' + def.desc(s) + '</div>' +
      '<div class="ab-cd">COOLDOWN ' + def.cd + 'S</div>' +
      '<div class="ab-trait' + (awakened ? ' on' : '') + '">' + (awakened ? '&#9733; ' : 'AWAKEN TRAIT: ') + def.trait + '</div>' +
      progress + buttons;
    A.drawIcon(el.querySelector('canvas').getContext('2d'), def, 4, 4, 4, !o);
    const eq = el.querySelector('.ab-equip'), up = el.querySelector('.ab-upgrade');
    if (eq) eq.addEventListener('click', () => { if (A.equip(def.id)) { renderPanel(); showToast(def.name + ' EQUIPPED'); } });
    if (up) up.addEventListener('click', () => {
      const r = A.upgrade(def.id);
      if (!r.ok) { showToast(r.reason + '!'); return; }
      playSfx('assets/audio/sfx/upgrade.ogg', 0.55);
      flash();
      renderPanel();
      showToast(r.awakened ? def.name + ' AWAKENED!' : def.name + ' UPGRADED TO LV ' + r.level + '!');
    });
    return el;
  }

  function renderPanel() {
    updateRollBtn();
    listEl.innerHTML = '';
    const ownedFirst = A.LIST.slice().sort((a, b) => (!!A.owned(b.id) - !!A.owned(a.id)) ||
      (A.RARITY_ORDER.indexOf(b.rarity) - A.RARITY_ORDER.indexOf(a.rarity)));
    for (const def of ownedFirst) listEl.appendChild(card(def));
  }

  function updateRollBtn() {
    const gems = window.RielCosmetics.gems();
    rollBtn.innerHTML = spinning ? 'SPINNING...' : 'SPIN &middot; ' + A.ROLL_COST + ' GEMS';
    rollBtn.disabled = spinning || gems < A.ROLL_COST;
  }

  function playSfx(src, vol) {
    const a = new Audio(src);
    a.volume = vol * window.RielVolume.sfx();
    a.play().catch(() => {});
  }
  function flash() {
    const f = document.getElementById('purchase-flash');
    f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 300);
  }

  rollBtn.addEventListener('click', doRoll);
  api.roll = doRoll;
  updateRollBtn();          // label + disabled state even before the tab is opened
  return api;
})();
render();   // store.js rendered before this file loaded: draw the tab now if it's open
