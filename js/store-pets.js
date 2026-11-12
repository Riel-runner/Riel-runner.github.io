// PETS tab of the gem shop (store.html): spin the pet wheel, then equip / fuse / awaken
// the pets you own. Rules and data: js/pets.js. Uses render() and showToast() from js/store.js.
window.StorePets = (function () {
  const P = window.RielPets;
  const wheel = document.getElementById('pet-wheel');
  const rollBtn = document.getElementById('pet-roll-btn');
  const resultEl = document.getElementById('pet-roll-result');
  const listEl = document.getElementById('pet-list');

  let angle = 0;          // wheel rotation so far (degrees, keeps growing)
  let spinning = false;
  const api = { SPIN_MS: 3200, render: renderPanel };

  // ── Wheel: one slice per rarity, sized by its chance ──
  const slices = [];
  let at = 0;
  for (const k of P.RARITY_ORDER) {
    const size = P.RARITIES[k].weight * 3.6;
    slices.push({ rarity: k, from: at, to: at + size });
    at += size;
  }
  wheel.style.background = 'conic-gradient(' +
    slices.map(s => P.RARITIES[s.rarity].color + ' ' + s.from + 'deg ' + s.to + 'deg').join(', ') + ')';
  for (const s of slices) {
    if (s.to - s.from < 30) continue;
    const label = document.createElement('div');
    label.className = 'wheel-label';
    label.textContent = P.RARITIES[s.rarity].name;
    label.style.transform = 'rotate(' + (s.from + s.to) / 2 + 'deg)';
    wheel.appendChild(label);
  }
  document.getElementById('pet-wheel-odds').innerHTML = P.RARITY_ORDER.map(k =>
    '<span style="color:' + P.RARITIES[k].color + '">&#9632; ' + P.RARITIES[k].name + ' ' + P.RARITIES[k].weight + '%</span>').join('');

  // ── Rolling ──
  function spinTo(rarity) {
    const s = slices.find(x => x.rarity === rarity);
    const target = s.from + (s.to - s.from) * (0.2 + Math.random() * 0.6);
    const now = ((angle % 360) + 360) % 360;
    angle += 5 * 360 + (((360 - target) - now) % 360 + 360) % 360;
    wheel.style.transition = 'transform ' + api.SPIN_MS + 'ms cubic-bezier(0.12, 0.7, 0.15, 1)';
    wheel.style.transform = 'rotate(' + angle + 'deg)';
  }

  function doRoll() {
    if (spinning) return;
    const r = P.roll();
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
    const rar = P.RARITIES[r.def.rarity];
    const need = P.copiesToFuse(r.level);
    const sub = r.isNew ? 'NEW PET!' + (P.equippedId() === r.def.id ? ' EQUIPPED' : '')
      : '+1 COPY &middot; ' + (need == null ? 'ALREADY AWAKENED' : r.copies + ' / ' + need + ' TO ' + (r.level === 2 ? 'AWAKEN' : 'FUSE TO LV 2'));
    resultEl.innerHTML = '<canvas width="56" height="48"></canvas><div>' +
      '<div class="rr-rarity" style="color:' + rar.color + '">' + rar.name + '</div>' +
      '<div class="rr-name">' + r.def.name + ' THE ' + r.def.kind + '</div><div class="rr-sub">' + sub + '</div></div>';
    resultEl.className = 'roll-result r-' + r.def.rarity + (r.isNew ? ' is-new' : '');
    resultEl.hidden = false;
    drawArt(resultEl.querySelector('canvas'), r.def, 5, false);
    playSfx('assets/audio/sfx/upgrade.ogg', 0.55);
    if (r.def.rarity === 'legendary' || r.def.rarity === 'super') flash();
    renderPanel();
  }

  // Pet art centred in its canvas
  function drawArt(cv, def, S, dim) {
    const ctx = cv.getContext('2d');
    const w = P.artWidth(def) * S, h = def.art.length * S;
    P.draw(ctx, def, Math.round((cv.width - w) / 2), Math.round((cv.height - h) / 2), S, { dim });
  }

  // ── Collection ──
  function card(def) {
    const o = P.owned(def.id), rar = P.RARITIES[def.rarity];
    const level = o ? o.level : 1;
    const equipped = !!o && P.equippedId() === def.id, awakened = level >= P.MAX_LEVEL;
    const need = P.copiesToFuse(level);
    const el = document.createElement('div');
    el.className = 'ability-card pet-card r-' + def.rarity + (o ? ' owned' : ' locked') + (equipped ? ' equipped' : '') + (awakened ? ' awakened' : '');
    el.dataset.id = def.id;
    let progress = '', buttons = '';
    if (o) {
      progress = awakened
        ? '<div class="ab-copies">AWAKENED &middot; MAX LEVEL' + (o.copies ? ' &middot; ' + o.copies + ' SPARE' : '') + '</div>'
        : '<div class="ab-bar"><div style="width:' + Math.min(100, 100 * o.copies / need) + '%;background:' + rar.color + '"></div></div>' +
          '<div class="ab-copies">' + o.copies + ' / ' + need + ' COPIES TO ' + (level === 2 ? 'AWAKEN' : 'FUSE TO LV 2') + '</div>';
      buttons = '<div class="ab-buttons">' +
        '<button class="store-btn pet-equip ' + (equipped ? 'is-equipped' : 'is-equip') + '"' + (equipped ? ' disabled' : '') + '>' + (equipped ? 'EQUIPPED' : 'EQUIP') + '</button>' +
        (awakened ? '' : '<button class="store-btn is-buy pet-fuse"' + (P.canFuse(def.id) ? '' : ' disabled') + '>' + (level === 2 ? 'AWAKEN' : 'FUSE') + '</button>') +
        '</div>';
    } else {
      progress = '<div class="ab-copies">NOT FOUND YET &middot; WIN IT ON THE PET WHEEL</div>';
    }
    el.innerHTML =
      '<div class="ab-head"><canvas width="44" height="40"></canvas><div>' +
        '<div class="ab-name">' + def.name + ' <span class="pet-kind">THE ' + def.kind + '</span></div>' +
        '<div class="ab-tags"><span style="color:' + rar.color + '">' + rar.name + '</span>' +
        (o ? ' &middot; <span class="ab-level">' + P.LEVEL_NAMES[level] + '</span>' : '') + '</div></div></div>' +
      '<div class="ab-desc">' + P.buffText(def, level) + '</div>' +
      '<div class="ab-trait' + (awakened ? ' on' : '') + '">' + (awakened ? '&#9733; ' : 'AWAKENED: ') + def.trait + '</div>' +
      progress + buttons;
    drawArt(el.querySelector('canvas'), def, 4, !o);
    const eq = el.querySelector('.pet-equip'), fu = el.querySelector('.pet-fuse');
    if (eq) eq.addEventListener('click', () => { if (P.equip(def.id)) { renderPanel(); showToast(def.name + ' IS FOLLOWING YOU'); } });
    if (fu) fu.addEventListener('click', () => {
      const r = P.fuse(def.id);
      if (!r.ok) { showToast(r.reason + '!'); return; }
      playSfx('assets/audio/sfx/upgrade.ogg', 0.55);
      flash();
      renderPanel();
      showToast(r.awakened ? def.name + ' AWAKENED!' : def.name + ' FUSED TO LV ' + r.level + '!');
    });
    return el;
  }

  function renderPanel() {
    updateRollBtn();
    const id = P.equippedId();
    document.getElementById('pet-bar').innerHTML = id
      ? '<span>FOLLOWING YOU: <b>' + P.byId(id).name + ' THE ' + P.byId(id).kind + '</b></span>'
      : '<span>NO PET YET &middot; SPIN THE WHEEL TO GET ONE</span>';
    listEl.innerHTML = '';
    const ownedFirst = P.LIST.slice().sort((a, b) => (!!P.owned(b.id) - !!P.owned(a.id)) ||
      (P.RARITY_ORDER.indexOf(b.rarity) - P.RARITY_ORDER.indexOf(a.rarity)));
    for (const def of ownedFirst) listEl.appendChild(card(def));
  }

  function updateRollBtn() {
    const gems = window.RielCosmetics.gems();
    rollBtn.innerHTML = spinning ? 'SPINNING...' : 'SPIN &middot; ' + P.ROLL_COST + ' GEMS';
    rollBtn.disabled = spinning || gems < P.ROLL_COST;
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
  updateRollBtn();
  return api;
})();
render();   // store.js rendered before this file loaded: draw the tab now if it's open
