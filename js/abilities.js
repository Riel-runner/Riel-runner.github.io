// Abilities: rolled on the wheel in the gem shop (store.html), the only way to get them.
// Equip one and press E in game (ability button on touch). Each has a cooldown.
// Rolling one you own adds a copy: 3 copies upgrade it to level 2, then 10 more
// AWAKEN it (level 3), which adds its trait. Saved in the shared profile from
// js/cosmetics.js as p.abilities = { owned: { id: { level, copies } }, equipped, slot2, equipped2 }.
// A second slot (used with Q) can be bought for SLOT2_COST gems.
window.RielAbilities = (function () {
  const C = window.RielCosmetics;
  const W = C.withKey(C.claim());   // saving (claimed while the page loads)

  const ROLL_COST = 100;                   // gems per spin
  const SLOT2_COST = 250;                  // gems for the second ability slot (Q)
  const UPGRADE_COPIES = [0, 3, 10];       // copies to go from level 1 -> 2, and 2 -> 3
  const MAX_LEVEL = 3;                     // level 3 = AWAKENED
  const LEVEL_NAMES = ['', 'LV 1', 'LV 2', 'AWAKENED'];

  // weight = chance out of 100 to land on that rarity
  const RARITIES = {
    common:    { name: 'COMMON',     color: '#a8b8c8', weight: 60 },
    rare:      { name: 'RARE',       color: '#3498db', weight: 27 },
    super:     { name: 'SUPER RARE', color: '#b05ce0', weight: 10 },
    legendary: { name: 'LEGENDARY',  color: '#f5c400', weight: 3 },
  };
  const RARITY_ORDER = ['common', 'rare', 'super', 'legendary'];

  // lv: numbers for levels 1, 2, 3 (index 0..2). cd: cooldown in seconds.
  // icon: 8x8 pixel art, '#' = ability colour, '+' = white highlight.
  const LIST = [
    { id: 'shield', name: 'SHIELD', rarity: 'common', cd: 20, color: '#5dade2',
      lv: [{ dur: 3 }, { dur: 4.5 }, { dur: 6 }],
      desc: s => 'BLOCKS ALL DAMAGE FOR ' + s.dur + 'S',
      trait: 'POWER SURGE: +50% DAMAGE WHILE SHIELDED',
      icon: ['.######.', '#++++++#', '#+####+#', '#+####+#', '#+####+#', '.#+##+#.', '..#++#..', '...##...'] },
    { id: 'medkit', name: 'MED KIT', rarity: 'common', cd: 30, color: '#2ecc71',
      lv: [{ heal: 20 }, { heal: 30 }, { heal: 40 }],
      desc: s => 'HEALS ' + s.heal + '% OF YOUR MAX HP',
      trait: 'RECOVERY: THEN HEALS 2% MAX HP PER SECOND FOR 5S',
      icon: ['..####..', '.#++++#.', '#+++##+#', '#+####+#', '#+####+#', '#+++##+#', '.#++++#.', '..####..'] },
    { id: 'quickdraw', name: 'QUICK DRAW', rarity: 'common', cd: 15, color: '#e67e22',
      lv: [{ dur: 3 }, { dur: 4 }, { dur: 5 }],
      desc: s => 'INSTANT RELOAD, THEN 50% FASTER FIRE FOR ' + s.dur + 'S',
      trait: 'BOTTOMLESS: SHOTS USE NO AMMO WHILE ACTIVE',
      icon: ['........', '.######.', '#++++++#', '#######.', '..#.....', '..#.....', '.##.....', '........'] },
    { id: 'shockwave', name: 'SHOCKWAVE', rarity: 'rare', cd: 18, color: '#f39c12',
      lv: [{ radius: 110, dmg: 3 }, { radius: 140, dmg: 4 }, { radius: 170, dmg: 5 }],
      desc: s => 'BLASTS ENEMIES WITHIN ' + s.radius + 'PX FOR ' + s.dmg + 'X GUN DAMAGE AND KNOCKS THEM BACK',
      trait: 'CONCUSSION: HIT ENEMIES ARE STUNNED FOR 1.5S',
      icon: ['..####..', '.#....#.', '#..##..#', '#.#++#.#', '#.#++#.#', '#..##..#', '.#....#.', '..####..'] },
    { id: 'adrenaline', name: 'ADRENALINE', rarity: 'rare', cd: 25, color: '#e74c3c',
      lv: [{ dur: 4 }, { dur: 5.5 }, { dur: 7 }],
      desc: s => '+40% MOVE SPEED FOR ' + s.dur + 'S',
      trait: 'RUSH: DASH HAS NO COOLDOWN WHILE ACTIVE',
      icon: ['....##..', '...##...', '..##....', '.######.', '....##..', '...##...', '..##....', '.##.....'] },
    { id: 'freeze', name: 'FREEZE', rarity: 'super', cd: 30, color: '#9be7ff',
      lv: [{ dur: 2.5 }, { dur: 3.5 }, { dur: 4.5 }],
      desc: s => 'FREEZES EVERY ENEMY ON SCREEN FOR ' + s.dur + 'S (BOSSES HALF AS LONG)',
      trait: 'SHATTER: FROZEN ENEMIES TAKE +50% DAMAGE',
      icon: ['...#....', '.#.#.#..', '..###...', '###+###.', '..###...', '.#.#.#..', '...#....', '........'] },
    { id: 'lightning', name: 'CHAIN LIGHTNING', rarity: 'super', cd: 22, color: '#d4a5ff',
      lv: [{ targets: 3, dmg: 5 }, { targets: 4, dmg: 6 }, { targets: 5, dmg: 7 }],
      desc: s => 'ZAPS THE ' + s.targets + ' NEAREST ENEMIES ON SCREEN FOR ' + s.dmg + 'X GUN DAMAGE',
      trait: 'OVERLOAD: EACH KILL CUTS THE COOLDOWN BY 4S',
      icon: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'] },
    { id: 'leech', name: 'LIFE LEECH', rarity: 'legendary', cd: 35, color: '#ff4d6d',
      lv: [{ dur: 5, pct: 50 }, { dur: 6.5, pct: 50 }, { dur: 8, pct: 50 }],
      desc: s => 'FOR ' + s.dur + 'S, ALL DAMAGE YOU DEAL HEALS YOU FOR ' + s.pct + '% OF IT',
      trait: 'OVERCHARGE: HEALING PAST MAX HP BECOMES EXTRA HP (UP TO 50% OF MAX) THAT CAN\'T BE HEALED BACK AND STAYS UNTIL DAMAGE USES IT UP',
      icon: ['.##..##.', '#++##++#', '#+####+#', '#######.', '.######.', '..####..', '...##...', '........'] },
  ];
  const byId = id => LIST.find(a => a.id === id) || null;

  // ── Profile ──
  function profile() {
    const p = C.load();
    const a = p.abilities = p.abilities || {};
    a.owned = a.owned || {};
    for (const id of Object.keys(a.owned)) {         // drop unknown ids, fix bad numbers
      const o = a.owned[id];
      if (!byId(id) || !o) { delete a.owned[id]; continue; }
      o.level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(o.level) || 1));
      o.copies = Math.max(0, Math.floor(o.copies) || 0);
    }
    if (!a.owned[a.equipped]) a.equipped = null;
    a.slot2 = !!a.slot2;
    if (!a.slot2 || !a.owned[a.equipped2] || a.equipped2 === a.equipped) a.equipped2 = null;
    return p;
  }
  const owned = id => profile().abilities.owned[id] || null;
  // Ability in slot 1 (E) or slot 2 (Q).
  const equippedId = (slot = 1) => { const a = profile().abilities; return slot === 2 ? a.equipped2 : a.equipped; };
  const hasSlot2 = () => profile().abilities.slot2;

  // Numbers for an ability at a level (1-3).
  const stats = (def, level) => def.lv[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
  const copiesToUpgrade = level => (level >= MAX_LEVEL ? null : UPGRADE_COPIES[level]);

  // The ability in a slot for the game: { def, level, awakened, s } or null.
  function equippedInfo(slot = 1) {
    const p = profile(), id = slot === 2 ? p.abilities.equipped2 : p.abilities.equipped;
    if (!id) return null;
    const def = byId(id), level = p.abilities.owned[id].level;
    return { def, level, awakened: level >= MAX_LEVEL, s: stats(def, level) };
  }

  // Pick a rarity by weight, then one of its abilities. rng() returns 0..1.
  function pick(rng = Math.random) {
    let r = rng() * 100, rarity = RARITY_ORDER[0];
    for (const k of RARITY_ORDER) { if (r < RARITIES[k].weight) { rarity = k; break; } r -= RARITIES[k].weight; }
    const pool = LIST.filter(a => a.rarity === rarity);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }

  // Spend gems and roll. New abilities are equipped if nothing is; repeats add a copy.
  function roll(rng) {
    const p = profile();
    if (p.gems < ROLL_COST) return { ok: false, reason: 'NOT ENOUGH GEMS' };
    p.gems -= ROLL_COST;
    const def = pick(rng);
    const own = p.abilities.owned;
    const isNew = !own[def.id];
    if (isNew) own[def.id] = { level: 1, copies: 0 };
    else own[def.id].copies++;
    if (!p.abilities.equipped) p.abilities.equipped = def.id;
    p.abilities.rolls = (p.abilities.rolls || 0) + 1;
    W.save(p);
    return { ok: true, def, isNew, ...own[def.id] };
  }

  function canUpgrade(id) {
    const o = owned(id);
    return !!o && o.level < MAX_LEVEL && o.copies >= UPGRADE_COPIES[o.level];
  }
  function upgrade(id) {
    const p = profile(), o = p.abilities.owned[id];
    if (!o || o.level >= MAX_LEVEL) return { ok: false, reason: 'ALREADY AWAKENED' };
    const need = UPGRADE_COPIES[o.level];
    if (o.copies < need) return { ok: false, reason: 'NEED ' + need + ' COPIES' };
    o.copies -= need;
    o.level++;
    W.save(p);
    return { ok: true, level: o.level, awakened: o.level >= MAX_LEVEL };
  }
  // Put an ability in slot 1 or 2. If it's already in the other slot, the two swap.
  function equip(id, slot = 1) {
    const p = profile(), a = p.abilities;
    if (!a.owned[id] || (slot === 2 && !a.slot2)) return false;
    const key = slot === 2 ? 'equipped2' : 'equipped', other = slot === 2 ? 'equipped' : 'equipped2';
    if (a[other] === id) a[other] = a[key] || null;
    if (other === 'equipped2' && !a.slot2) a.equipped2 = null;
    a[key] = id;
    W.save(p);
    return true;
  }

  function buySlot2() {
    const p = profile();
    if (p.abilities.slot2) return { ok: false, reason: 'ALREADY OWNED' };
    if (p.gems < SLOT2_COST) return { ok: false, reason: 'NOT ENOUGH GEMS' };
    p.gems -= SLOT2_COST;
    p.abilities.slot2 = true;
    W.save(p);
    return { ok: true };
  }

  // Draw an ability's pixel icon at (x, y), S screen px per pixel.
  function drawIcon(ctx, def, x, y, S, dim) {
    def.icon.forEach((row, r) => {
      for (let c = 0; c < 8; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = dim ? '#2a2e44' : ch === '+' ? '#ffffff' : def.color;
        ctx.fillRect(x + c * S, y + r * S, S, S);
      }
    });
  }

  return { ROLL_COST, SLOT2_COST, hasSlot2, buySlot2, UPGRADE_COPIES, MAX_LEVEL, LEVEL_NAMES, RARITIES, RARITY_ORDER, LIST, byId,
           owned, equippedId, stats, copiesToUpgrade, equippedInfo, pick, roll, canUpgrade, upgrade, equip, drawIcon };
})();
