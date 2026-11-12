// Pets: rolled on the pet wheel in the gem shop (store.html), the only way to get them.
// The equipped pet follows you in game and gives passive buffs. Common pets give one
// buff, better ones give combinations. Rolling a pet you own adds a copy: FUSE 3 copies
// for level 2, then 10 more to AWAKEN it (level 3), which adds a special effect.
// Saved in the shared profile from js/cosmetics.js as
// p.pets = { owned: { id: { level, copies } }, equipped, rolls }.
window.RielPets = (function () {
  const C = window.RielCosmetics;
  const W = C.withKey(C.claim());   // saving (claimed while the page loads)

  const ROLL_COST = 100;                   // gems per spin
  const FUSE_COPIES = [0, 3, 10];          // copies to go from level 1 -> 2, and 2 -> 3
  const MAX_LEVEL = 3;                     // level 3 = AWAKENED
  const LEVEL_NAMES = ['', 'LV 1', 'LV 2', 'AWAKENED'];
  const RARITIES = window.RielAbilities ? window.RielAbilities.RARITIES : {
    common:    { name: 'COMMON',     color: '#a8b8c8', weight: 60 },
    rare:      { name: 'RARE',       color: '#3498db', weight: 27 },
    super:     { name: 'SUPER RARE', color: '#b05ce0', weight: 10 },
    legendary: { name: 'LEGENDARY',  color: '#f5c400', weight: 3 },
  };
  const RARITY_ORDER = ['common', 'rare', 'super', 'legendary'];

  // Buff types (numbers are percentages):
  //   dmg    +% damage          armor  -% damage taken     speed  +% move speed
  //   fire   +% fire rate       regen  heals % of max HP every 3s   riels  +% riels from kills
  const BUFF_TEXT = {
    dmg:   v => '+' + v + '% DAMAGE',
    armor: v => '-' + v + '% DAMAGE TAKEN',
    speed: v => '+' + v + '% MOVE SPEED',
    fire:  v => '+' + v + '% FIRE RATE',
    regen: v => 'HEALS ' + v + '% MAX HP EVERY 3S',
    riels: v => '+' + v + '% RIELS FROM KILLS',
  };

  // lv: buffs at levels 1, 2, 3. trait: the awakened effect (game code: js/game.js PETS).
  // art: pixel rows: '#' main colour, 'o' second colour, '+' white, 'k' black.
  const LIST = [
    { id: 'pup', name: 'SCRAPPY', kind: 'PUP', rarity: 'common', color: '#b5793f', color2: '#f0d2a8',
      lv: [{ dmg: 6 }, { dmg: 9 }, { dmg: 12 }],
      trait: 'BOSS HUNTER: +30% DAMAGE ON BOSS LEVELS',
      art: ['........', '.######.', 'o######o', 'o#k##k#o', 'o##oo##o', '.#okko#.', '.######.', '.#....#.'] },
    { id: 'turtle', name: 'SHELLY', kind: 'TURTLE', rarity: 'common', color: '#3f8f3a', color2: '#a6d96a',
      lv: [{ armor: 6 }, { armor: 9 }, { armor: 12 }],
      trait: 'HARD SHELL: THE FIRST HIT AFTER EACH LEVEL START OR RESPAWN IS BLOCKED',
      art: ['..........', '...####...', '..#o##o#..', '.#######oo', '.#o###o#ok', '..######o.', '..o....o..', '..........'] },
    { id: 'bunny', name: 'HOPPER', kind: 'BUNNY', rarity: 'common', color: '#e8e8f0', color2: '#f5a3c0',
      lv: [{ speed: 5 }, { speed: 7 }, { speed: 10 }],
      trait: 'SPRING: +25% DAMAGE FOR 3S AFTER EVERY DASH',
      art: ['.#....#.', '.o#..#o.', '.o#..#o.', '..####..', '.#k##k#.', '.##oo##.', '.######.', '..#..#..'] },
    { id: 'owl', name: 'HOOT', kind: 'OWL', rarity: 'rare', color: '#8e6b4a', color2: '#f2d27a',
      lv: [{ fire: 8 }, { fire: 12 }, { fire: 16 }],
      trait: 'SHARP EYE: EVERY 8TH SHOT HITS FOR TRIPLE DAMAGE',
      art: ['#......#', '##....##', '########', '#oo##oo#', '#ok##ko#', '###oo###', '.#+##+#.', '..o..o..'] },
    { id: 'frog', name: 'CROAK', kind: 'FROG', rarity: 'rare', color: '#4caf50', color2: '#c8f08c',
      lv: [{ regen: 1 }, { regen: 1.5 }, { regen: 2 }],
      trait: 'FEAST: EVERY KILL HEALS 2% OF YOUR MAX HP',
      art: ['........', '.##..##.', '#+k##+k#', '########', '#o####o#', '.#oooo#.', '##.##.##', '........'] },
    { id: 'cat', name: 'LUCKY', kind: 'CAT', rarity: 'rare', color: '#f0b429', color2: '#fff1c1',
      lv: [{ riels: 10 }, { riels: 15 }, { riels: 20 }],
      trait: 'JACKPOT: BOSS LEVELS PAY DOUBLE RIELS',
      art: ['#......#', '##....##', '########', '#k####k#', '###oo###', '#o#oo#o#', '.######.', '.#.##.#.'] },
    { id: 'fox', name: 'EMBER', kind: 'FOX', rarity: 'super', color: '#e8711c', color2: '#fff1e0',
      lv: [{ dmg: 6, fire: 6 }, { dmg: 9, fire: 9 }, { dmg: 12, fire: 12 }],
      trait: 'FINISHER: +40% DAMAGE TO ENEMIES UNDER 30% HP',
      art: ['#......#', '##....##', '########', '#k####k#', 'o##kk##o', 'oo####oo', '.oo##oo.', '...oo...'] },
    { id: 'penguin', name: 'FROSTY', kind: 'PENGUIN', rarity: 'super', color: '#2b3247', color2: '#ff9f1c',
      lv: [{ armor: 6, speed: 5 }, { armor: 9, speed: 7 }, { armor: 12, speed: 10 }],
      trait: 'LAST STAND: UNDER 30% HP YOU TAKE 30% LESS DAMAGE',
      art: ['..####..', '.######.', '.#k##k#.', '.##oo##.', '#++++++#', '#++++++#', '.#++++#.', '..o..o..'] },
    { id: 'dragon', name: 'DRACO', kind: 'DRAGON', rarity: 'legendary', color: '#c0392b', color2: '#f5c400',
      lv: [{ dmg: 10, fire: 8, regen: 1 }, { dmg: 14, fire: 11, regen: 1.5 }, { dmg: 18, fire: 14, regen: 2 }],
      trait: 'FIRE BREATH: EVERY 6S BREATHES A FIREBALL AT THE NEAREST ENEMY FOR 3X YOUR DAMAGE',
      art: ['.o......o.', '.#o....o#.', '#.######.#', '##ok##ko##', '#.######.#', '..#oooo#..', '..######..', '..#....#..'] },
  ];
  const byId = id => LIST.find(a => a.id === id) || null;

  // ── Profile ──
  function profile() {
    const p = C.load();
    const a = p.pets = p.pets || {};
    a.owned = a.owned || {};
    for (const id of Object.keys(a.owned)) {         // drop unknown ids, fix bad numbers
      const o = a.owned[id];
      if (!byId(id) || !o) { delete a.owned[id]; continue; }
      o.level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(o.level) || 1));
      o.copies = Math.max(0, Math.floor(o.copies) || 0);
    }
    if (!a.owned[a.equipped]) a.equipped = null;
    return p;
  }
  const owned = id => profile().pets.owned[id] || null;
  const equippedId = () => profile().pets.equipped;

  // Buffs for a pet at a level (1-3), every type filled in (0 if it doesn't give it).
  function stats(def, level) {
    const lv = def.lv[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
    const s = { dmg: 0, armor: 0, speed: 0, fire: 0, regen: 0, riels: 0 };
    return Object.assign(s, lv);
  }
  // "+6% DAMAGE · +6% FIRE RATE"
  const buffText = (def, level) => Object.entries(def.lv[Math.min(MAX_LEVEL, Math.max(1, level)) - 1])
    .map(([k, v]) => BUFF_TEXT[k](v)).join(' · ');
  const copiesToFuse = level => (level >= MAX_LEVEL ? null : FUSE_COPIES[level]);

  // The equipped pet for the game: { def, level, awakened, s } or null.
  function equippedInfo() {
    const p = profile(), id = p.pets.equipped;
    if (!id) return null;
    const def = byId(id), level = p.pets.owned[id].level;
    return { def, level, awakened: level >= MAX_LEVEL, s: stats(def, level) };
  }

  // Pick a rarity by weight, then one of its pets. rng() returns 0..1.
  function pick(rng = Math.random) {
    let r = rng() * 100, rarity = RARITY_ORDER[0];
    for (const k of RARITY_ORDER) { if (r < RARITIES[k].weight) { rarity = k; break; } r -= RARITIES[k].weight; }
    const pool = LIST.filter(a => a.rarity === rarity);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }

  // Spend gems and roll. A new pet is equipped if none is; repeats add a copy.
  function roll(rng) {
    const p = profile();
    if (p.gems < ROLL_COST) return { ok: false, reason: 'NOT ENOUGH GEMS' };
    p.gems -= ROLL_COST;
    const def = pick(rng);
    const own = p.pets.owned;
    const isNew = !own[def.id];
    if (isNew) own[def.id] = { level: 1, copies: 0 };
    else own[def.id].copies++;
    if (!p.pets.equipped) p.pets.equipped = def.id;
    p.pets.rolls = (p.pets.rolls || 0) + 1;
    W.save(p);
    return { ok: true, def, isNew, ...own[def.id] };
  }

  function canFuse(id) {
    const o = owned(id);
    return !!o && o.level < MAX_LEVEL && o.copies >= FUSE_COPIES[o.level];
  }
  // Fuse copies into the next level (3 for LV 2, then 10 to awaken).
  function fuse(id) {
    const p = profile(), o = p.pets.owned[id];
    if (!o || o.level >= MAX_LEVEL) return { ok: false, reason: 'ALREADY AWAKENED' };
    const need = FUSE_COPIES[o.level];
    if (o.copies < need) return { ok: false, reason: 'NEED ' + need + ' COPIES' };
    o.copies -= need;
    o.level++;
    W.save(p);
    return { ok: true, level: o.level, awakened: o.level >= MAX_LEVEL };
  }
  function equip(id) {
    const p = profile();
    if (!p.pets.owned[id]) return false;
    p.pets.equipped = id;
    W.save(p);
    return true;
  }

  // Draw a pet's pixel art with its top-left at (x, y), S px per pixel. flip: face left.
  function draw(ctx, def, x, y, S, opts = {}) {
    const cols = { '#': def.color, o: def.color2, '+': '#ffffff', k: '#111111' };
    const w = Math.max(...def.art.map(r => r.length));
    def.art.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = opts.dim ? '#2a2e44' : cols[ch];
        const cx = opts.flip ? w - 1 - c : c;
        ctx.fillRect(x + cx * S, y + r * S, S, S);
      }
    });
  }
  const artWidth = def => Math.max(...def.art.map(r => r.length));

  return { ROLL_COST, FUSE_COPIES, MAX_LEVEL, LEVEL_NAMES, RARITIES, RARITY_ORDER, LIST, BUFF_TEXT, byId,
           owned, equippedId, stats, buffText, copiesToFuse, equippedInfo, pick, roll, canFuse, fuse, equip, draw, artWidth };
})();
