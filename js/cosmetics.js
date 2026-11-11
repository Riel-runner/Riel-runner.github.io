// Cosmetics: weapon skins, player skins and trails, bought with GEMS.
// Gems are earned for every level cleared in ANY campaign and are kept in one
// profile shared by all campaigns (they survive a campaign falling).
// Shared by the game (applies the equipped look, awards gems) and store.html.
window.RielCosmetics = (function () {
  const CURRENCY       = 'GEMS';
  const PROFILE_KEY    = 'rielrunner_profile';
  const GEMS_PER_LEVEL = 10;
  const GEMS_PER_BOSS  = 50;   // boss levels (every 10th) pay more

  // Classes: each comes with its own weapon and changes how you play.
  //   dmg: multiplier on your gun damage (upgrades add to the base, then this applies)
  //   mag: bullets per magazine (Mag Size upgrade adds ~25% of this per level)
  //   fireCd: frames between shots, reload: frames to reload (upgrades cut a % of these)
  //   speed: movement multiplier (always faster than enemies)
  //   pellets/spread/range: shotgun blast; pierce: shots go through enemies; bulletSpeed
  //   gun: pixels of the gun sprite as [col,row] (+ 'dark' for magazine/scope/stock),
  //        drawn from the hand at col 6; muzzle: column the flash appears at
  const CLASSES = [
    { id: 'gunner',   name: 'GUNNER',    weapon: 'PISTOL',  price: 0,
      dmg: 1.0,  mag: 20, fireCd: 18, reload: 180, speed: 1.00, bulletSpeed: 10,
      desc: 'BALANCED ALL-ROUNDER.',
      gun: [[7,3],[8,3]], muzzle: 9 },
    { id: 'smg',      name: 'SPEEDSTER', weapon: 'SMG',     price: 600,
      dmg: 0.55, mag: 32, fireCd: 6,  reload: 120, speed: 1.12, bulletSpeed: 11,
      desc: 'SPRAYS BULLETS AND MOVES FAST. LOW DAMAGE PER SHOT.',
      gun: [[7,3],[8,3],[9,3],[8,4,'dark']], muzzle: 10 },
    { id: 'assault',  name: 'ASSAULT',   weapon: 'AK-47',   price: 800,
      dmg: 0.8,  mag: 30, fireCd: 9,  reload: 150, speed: 1.08, bulletSpeed: 11,
      desc: 'BIG MAG, UNLOADS FAST, QUICK ON YOUR FEET. A BIT LESS DAMAGE.',
      gun: [[7,3],[8,3],[9,3],[10,3],[8,4,'dark'],[9,4,'dark']], muzzle: 11 },
    { id: 'shotgun',  name: 'BREACHER',  weapon: 'SHOTGUN', price: 900,
      dmg: 0.7,  mag: 6,  fireCd: 40, reload: 200, speed: 1.00, bulletSpeed: 10,
      pellets: 5, spread: 0.22, range: 24,
      desc: '5 PELLETS PER BLAST. DEVASTATING UP CLOSE, SHORT RANGE.',
      gun: [[7,3],[8,3],[9,3],[7,4],[8,4]], muzzle: 10 },
    { id: 'rifleman', name: 'RIFLEMAN',  weapon: 'RIFLE',   price: 1000,
      dmg: 2.2,  mag: 10, fireCd: 28, reload: 210, speed: 1.00, bulletSpeed: 13,
      desc: 'HEAVY HITS, SMALLER MAG, SLOWER RELOAD.',
      gun: [[7,3],[8,3],[9,3],[10,3],[11,3],[8,4,'dark']], muzzle: 12 },
    { id: 'sniper',   name: 'SNIPER',    weapon: 'SNIPER',  price: 1400,
      dmg: 4.0,  mag: 5,  fireCd: 55, reload: 240, speed: 0.98, bulletSpeed: 16, pierce: true,
      desc: 'HUGE DAMAGE, SHOTS PIERCE THROUGH ENEMIES. TINY MAG, LONG RELOAD.',
      gun: [[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[9,2,'dark'],[10,2,'dark'],[8,4,'dark']], muzzle: 13 },
  ];

  const CATALOG = {
    class: CLASSES,
    weapon: [
      { id: 'standard', name: 'STANDARD', price: 0,   gun: '#888870', bullet: '#f5c400', glow: 'rgba(245,196,0,0.30)' },
      { id: 'gold',     name: 'GOLD',     price: 150, gun: '#f5c400', bullet: '#ffe680', glow: 'rgba(255,230,128,0.40)' },
      { id: 'ruby',     name: 'RUBY',     price: 200, gun: '#c0392b', bullet: '#ff5a5a', glow: 'rgba(255,90,90,0.40)' },
      { id: 'neon',     name: 'NEON',     price: 300, gun: '#1abc9c', bullet: '#5dfdff', glow: 'rgba(93,253,255,0.50)' },
      { id: 'void',     name: 'VOID',     price: 450, gun: '#4a235a', bullet: '#b26bff', glow: 'rgba(178,107,255,0.50)' },
    ],
    player: [
      { id: 'runner', name: 'RUNNER', price: 0,   skin: '#f5c89a', hair: '#222222', jacket: '#2255cc', boot: '#3d2b1f', eye: '#111111' },
      { id: 'jungle', name: 'JUNGLE', price: 150, skin: '#d9a066', hair: '#3b2a14', jacket: '#4a7a2c', boot: '#2d3a1a', eye: '#111111', belt: '#6b8e23' },
      { id: 'ninja',  name: 'NINJA',  price: 250, skin: '#f5c89a', hair: '#1c1c24', jacket: '#1c1c24', boot: '#111111', eye: '#111111', belt: '#c0392b' },
      { id: 'royal',  name: 'ROYAL',  price: 350, skin: '#f5c89a', hair: '#f5c400', jacket: '#6c2eb9', boot: '#3d1f5c', eye: '#111111', belt: '#f5c400' },
      { id: 'robot',  name: 'ROBOT',  price: 500, skin: '#bdc3c7', hair: '#7f8c8d', jacket: '#95a5a6', boot: '#34495e', eye: '#5dade2', belt: '#5dade2' },
    ],
    trail: [
      { id: 'none',    name: 'NONE',    price: 0 },
      { id: 'sparks',  name: 'SPARKS',  price: 100 },
      { id: 'ghost',   name: 'GHOST',   price: 200 },
      { id: 'flame',   name: 'FLAME',   price: 300 },
      { id: 'rainbow', name: 'RAINBOW', price: 500 },
    ],
  };
  const CATEGORIES = ['class', 'weapon', 'player', 'trail'];
  const DEFAULTS = { class: 'gunner', weapon: 'standard', player: 'runner', trail: 'none' };

  // ── Profile (gems, owned, equipped) ──
  function load() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch {}
    if (!p || typeof p !== 'object') p = {};
    p.gems = Math.max(0, Math.floor(Number(p.gems) || 0));
    p.owned = p.owned || {};
    p.equipped = p.equipped || {};
    for (const c of CATEGORIES) {
      const owned = new Set(Array.isArray(p.owned[c]) ? p.owned[c] : []);
      owned.add(DEFAULTS[c]);                                      // free items are always owned
      p.owned[c] = [...owned].filter(id => item(c, id));
      if (!item(c, p.equipped[c]) || !p.owned[c].includes(p.equipped[c])) p.equipped[c] = DEFAULTS[c];
    }
    return p;
  }
  function save(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
  }

  const item     = (cat, id) => (CATALOG[cat] || []).find(i => i.id === id) || null;
  const gems     = () => load().gems;
  const owns     = (cat, id) => load().owned[cat].includes(id);
  const equipped = cat => item(cat, load().equipped[cat]) || item(cat, DEFAULTS[cat]);

  function addGems(n) {
    const p = load();
    p.gems += Math.max(0, Math.floor(n));
    save(p);
    return p.gems;
  }

  function buy(cat, id) {
    const p = load(), it = item(cat, id);
    if (!it) return { ok: false, reason: 'UNKNOWN ITEM' };
    if (p.owned[cat].includes(id)) return { ok: false, reason: 'ALREADY OWNED' };
    if (p.gems < it.price) return { ok: false, reason: 'NOT ENOUGH ' + CURRENCY };
    p.gems -= it.price;
    p.owned[cat].push(id);
    p.equipped[cat] = id;                                          // equip right away
    save(p);
    return { ok: true };
  }

  function equip(cat, id) {
    const p = load();
    if (!p.owned[cat].includes(id)) return false;
    p.equipped[cat] = id;
    save(p);
    return true;
  }

  // Gems for clearing a level: more for boss levels (every 10th).
  const levelReward = level => (level % 10 === 0 ? GEMS_PER_BOSS : GEMS_PER_LEVEL);

  // ── Drawing (same pixel layout as the in-game player) ──
  // Standing player with a skin and weapon skin, for shop previews.
  // (col,row) grid of 10x8 cells; S = cell size; frame 0-2 = leg animation.
  // Draw a class's gun with the hand-grid painter p(col,row,color); flash at the muzzle.
  function drawGun(p, cls, ws, flash) {
    for (const [c, r, dark] of cls.gun) p(c, r, dark ? '#2a2a33' : ws.gun);
    if (flash) { p(cls.muzzle, 3, ws.bullet); p(cls.muzzle, 2, ws.bullet); }
  }

  // Effective numbers for a class after upgrade levels (shared by the game and shops).
  const magStep = cls => Math.max(1, Math.round(cls.mag * 0.25));
  function classStats(cls, levels = {}) {
    const l = k => levels[k] || 0;
    return {
      mag:    cls.mag + magStep(cls) * l('ammo'),
      fireCd: Math.max(2, Math.round(cls.fireCd * (1 - 0.05 * l('firerate')))),
      reload: Math.round(cls.reload * (1 - 0.07 * l('reload'))),
      speed:  cls.speed * (1 + 0.05 * l('speed')),
    };
  }

  function drawPlayerSprite(ctx, x, y, S, playerSkin, weaponSkin, opts = {}) {
    const ps = playerSkin || CATALOG.player[0], ws = weaponSkin || CATALOG.weapon[0];
    const f = opts.facingRight !== false, frame = opts.frame || 0;
    const p = (col, row, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + (f ? col : 8 - col) * S, y + row * S, S, S);
    };
    p(2,0,ps.hair); p(3,0,ps.hair); p(4,0,ps.hair);
    p(1,1,ps.skin); p(2,1,ps.skin); p(3,1,ps.skin); p(4,1,ps.skin); p(5,1,ps.hair);
    p(1,2,ps.skin); p(2,2,ps.skin); p(3,2,ps.eye); p(4,2,ps.skin); p(5,2,ps.skin);
    for (let c = 1; c <= 5; c++) { p(c,3,ps.jacket); p(c,4,ps.belt || ps.jacket); }
    p(6,3,ps.skin);
    drawGun(p, opts.cls || CLASSES[0], ws, opts.gunFlash);
    p(2,5,ps.jacket); p(3,5,ps.jacket); p(4,5,ps.jacket);
    if (frame === 1)      { p(1,6,ps.boot); p(3,6,ps.boot); p(1,7,ps.boot); p(4,7,ps.boot); }
    else if (frame === 2) { p(2,6,ps.boot); p(4,6,ps.boot); p(3,7,ps.boot); p(5,7,ps.boot); }
    else                  { p(2,6,ps.boot); p(4,6,ps.boot); p(2,7,ps.boot); p(4,7,ps.boot); }
  }

  // ── Trails: particles left behind while moving ──
  // spawn(list, trailId, x, y, w, h, t) adds particles at the player's position;
  // update+draw(list, ctx, toScreenX) animates them. t = frame counter.
  function spawnTrail(list, id, x, y, w, h, t) {
    if (id === 'none') return;
    const r = Math.random;
    if (id === 'sparks' && t % 2 === 0) {
      list.push({ x: x + w / 2 + (r() - 0.5) * w, y: y + h - 4, vx: (r() - 0.5) * 1.2, vy: -r() * 1.6, life: 18, max: 18,
                  size: 2, color: r() < 0.5 ? '#f5c400' : '#ffffff' });
    } else if (id === 'ghost' && t % 4 === 0) {
      list.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, w, h, color: '#9fd3ff', ghost: true });
    } else if (id === 'flame') {
      list.push({ x: x + w / 2 + (r() - 0.5) * w * 0.6, y: y + h - 6, vx: (r() - 0.5) * 0.6, vy: -0.6 - r() * 1.2, life: 22, max: 22,
                  size: 3, color: ['#f5c400', '#e67e22', '#e74c3c'][Math.floor(r() * 3)] });
    } else if (id === 'rainbow' && t % 2 === 0) {
      list.push({ x: x + w / 2, y: y + h / 2 + (r() - 0.5) * h * 0.6, vx: 0, vy: 0, life: 26, max: 26,
                  size: 4, color: 'hsl(' + ((t * 8) % 360) + ',90%,60%)' });
    }
  }

  function updateTrail(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.x += q.vx; q.y += q.vy; q.life--;
      if (q.life <= 0) list.splice(i, 1);
    }
  }

  function drawTrail(list, ctx, toScreenX) {
    for (const q of list) {
      ctx.globalAlpha = Math.max(0, q.life / q.max) * (q.ghost ? 0.35 : 0.9);
      ctx.fillStyle = q.color;
      if (q.ghost) ctx.fillRect(toScreenX(q.x), q.y, q.w, q.h);
      else ctx.fillRect(toScreenX(q.x) - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  return { CURRENCY, CATALOG, CLASSES, CATEGORIES, drawGun, magStep, classStats, GEMS_PER_LEVEL, GEMS_PER_BOSS, load, save, item, gems, owns, equipped,
           addGems, buy, equip, levelReward, drawPlayerSprite, spawnTrail, updateTrail, drawTrail };
})();
