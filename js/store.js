// Cosmetics shop (store.html): spend gems on weapon skins, player skins and trails.
// Catalog, gems and owned/equipped items live in js/cosmetics.js.
const C = window.RielCosmetics;
const TAB_KEY = 'rielrunner_store_tab';

let tab = 'class';
try { const t = localStorage.getItem(TAB_KEY); if (C.CATEGORIES.includes(t)) tab = t; } catch {}

const grid = document.getElementById('store-grid');
let previews = [];   // { canvas, cat, item, particles } — redrawn every frame

const GEM_SVG = '<svg class="gem-icon small" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">' +
  '<rect x="2" y="0" width="4" height="1" fill="#5dade2"/><rect x="1" y="1" width="6" height="1" fill="#5dade2"/>' +
  '<rect x="0" y="2" width="8" height="2" fill="#2e86de"/><rect x="1" y="4" width="6" height="1" fill="#2e86de"/>' +
  '<rect x="2" y="5" width="4" height="1" fill="#21618c"/><rect x="3" y="6" width="2" height="1" fill="#21618c"/></svg>';

// ─── RENDER ──────────────────────────────────────────────────────────
function render() {
  const profile = C.load();
  document.getElementById('gem-count').textContent = profile.gems.toLocaleString('en-US');
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.cat === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });

  document.getElementById('store-foot').innerHTML = tab === 'class'
    ? 'CLASSES CHANGE YOUR WEAPON &middot; UPGRADES SCALE WITH IT'
    : 'LOOKS ONLY &middot; NO EFFECT ON GAMEPLAY';
  grid.innerHTML = '';
  previews = [];
  for (const it of C.CATALOG[tab]) {
    const owned = profile.owned[tab].includes(it.id);
    const equipped = profile.equipped[tab] === it.id;
    const affordable = profile.gems >= it.price;
    const card = document.createElement('div');
    card.className = 'store-card' + (equipped ? ' equipped' : owned ? ' owned' : affordable ? ' affordable' : ' locked');
    card.innerHTML = `
      <canvas class="store-preview" width="120" height="72"></canvas>
      <div class="store-name">${it.name}</div>
      ${tab === 'class' ? classStatsHtml(it) : ''}
      <div class="store-price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : it.price === 0 ? 'FREE' : GEM_SVG + ' ' + it.price}</div>
      <button class="store-btn" data-id="${it.id}"></button>`;
    const btn = card.querySelector('.store-btn');
    if (equipped)   { btn.textContent = 'EQUIPPED'; btn.disabled = true; btn.classList.add('is-equipped'); }
    else if (owned) { btn.textContent = 'EQUIP'; btn.classList.add('is-equip'); }
    else            { btn.textContent = 'BUY'; btn.disabled = !affordable; btn.classList.add('is-buy'); }
    btn.addEventListener('click', () => (owned ? equipItem(it) : buyItem(it)));
    grid.appendChild(card);
    previews.push({ canvas: card.querySelector('canvas'), cat: tab, item: it, particles: [] });
  }
}

// Weapon stats for a class card (base numbers; upgrades build on these).
function classStatsHtml(c) {
  const rows = [
    ['DMG',    (c.dmg === 1 ? '1' : c.dmg) + 'x' + (c.pellets ? ' (' + c.pellets + ' PELLETS)' : '')],
    ['MAG',    String(c.mag)],
    ['FIRE',   (60 / c.fireCd).toFixed(1) + '/S'],
    ['RELOAD', (c.reload / 60).toFixed(1) + 'S'],
    ['SPEED',  Math.round(c.speed * 100) + '%'],
  ];
  return '<div class="class-weapon">' + c.weapon + (c.pierce ? ' &middot; PIERCES' : '') + '</div>' +
    '<div class="class-stats">' + rows.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
    '<div class="class-desc">' + c.desc + '</div>';
}

// ─── PREVIEWS (animated) ─────────────────────────────────────────────
let t = 0;
function drawPreviews() {
  t++;
  const eqPlayer = C.equipped('player'), eqWeapon = C.equipped('weapon'), eqClass = C.equipped('class');
  for (const pv of previews) {
    const ctx = pv.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, pv.canvas.width, pv.canvas.height);
    ctx.fillStyle = '#2a2e44';                       // floor line
    ctx.fillRect(0, 62, pv.canvas.width, 2);
    const S = 5, px = 22, py = 62 - 8 * S;          // runner drawn at 5px per pixel
    const playerSkin = pv.cat === 'player' ? pv.item : eqPlayer;
    const weaponSkin = pv.cat === 'weapon' ? pv.item : eqWeapon;
    const running = pv.cat === 'trail';
    if (running) {
      // Pretend the runner moves right: spawn at the player, drift particles left.
      C.spawnTrail(pv.particles, pv.item.id, px + S, py, 5 * S, 8 * S, t);
      for (const q of pv.particles) q.x -= 1.6;
      C.updateTrail(pv.particles);
      C.drawTrail(pv.particles, ctx, x => x);
    }
    C.drawPlayerSprite(ctx, px, py, S, playerSkin, weaponSkin,
      { frame: running ? Math.floor(t / 8) % 3 : 0, gunFlash: (pv.cat === 'weapon' || pv.cat === 'class') && t % 40 < 5,
        cls: pv.cat === 'class' ? pv.item : eqClass });
    if (pv.cat === 'weapon' || pv.cat === 'class') { // a bullet flying out of the gun
      const gunEnd = (pv.cat === 'class' ? pv.item : eqClass).muzzle + 1;
      const bx = px + gunEnd * S + ((t * 3) % 30);
      ctx.fillStyle = weaponSkin.glow;  ctx.fillRect(bx - 12, py + 3 * S + 1, 12, 4);
      ctx.fillStyle = weaponSkin.bullet; ctx.fillRect(bx, py + 3 * S + 1, 14, 4);
    }
  }
  requestAnimationFrame(drawPreviews);
}

// ─── ACTIONS ─────────────────────────────────────────────────────────
function buyItem(it) {
  const r = C.buy(tab, it.id);
  if (!r.ok) { showToast(r.reason + '!'); return; }
  const sound = new Audio('assets/audio/sfx/upgrade.ogg');
  sound.volume = 0.55 * window.RielVolume.sfx();
  sound.play().catch(() => {});
  const flash = document.getElementById('purchase-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 300);
  render();
  showToast('UNLOCKED ' + it.name + '! EQUIPPED');
}

function equipItem(it) {
  if (C.equip(tab, it.id)) { render(); showToast(it.name + ' EQUIPPED'); }
}

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.cat;
  try { localStorage.setItem(TAB_KEY, tab); } catch {}
  render();
}));

// ─── TOAST ───────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ─── INIT ────────────────────────────────────────────────────────────
render();
requestAnimationFrame(drawPreviews);

// Shop music loops while browsing (same track as the upgrade shop).
const shopMusic = new Audio('assets/audio/music/shop-music.flac');
shopMusic.loop = true;
window.RielVolume.bindMusic(shopMusic, 0.50);
shopMusic.play().catch(() => {});
window.addEventListener('pointerdown', () => shopMusic.play().catch(() => {}), { once: true });
window.addEventListener('keydown', () => shopMusic.play().catch(() => {}), { once: true });
