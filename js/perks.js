// Gem upgrades (gem shop, UPGRADES tab): bought with gems, they count in EVERY campaign.
// Each one has 5 tiers. Saved in the shared profile from js/cosmetics.js as
// p.perks = { dashCd: 0-5, dashDist: 0-5, dashSpeed: 0-5, jumpBoost: 0-5, speedBoost: 0-5 }.
// (Different from the KHR upgrades in the between-levels shop, which belong to one campaign.)
window.RielPerks = (function () {
  const C = window.RielCosmetics;
  const W = C.withKey(C.claim());   // saving (claimed while the page loads)

  const MAX_TIER = 5;
  const COSTS = [100, 200, 350, 550, 800];   // gems for tier 1, 2, 3, 4, 5

  // value(tier) is what the game uses. text(tier) is shown in the shop.
  const LIST = [
    { id: 'dashCd', name: 'DASH COOLDOWN', color: '#5dade2',
      value: t => 1 - 0.1 * t,                                  // cooldown multiplier: 10s -> 5s
      text: t => 'DASH EVERY ' + (10 * (1 - 0.1 * t)).toFixed(1).replace('.0', '') + 'S',
      icon: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..'] },
    { id: 'dashDist', name: 'DASH DISTANCE', color: '#f39c12',
      value: t => 1 + 0.12 * t,                                 // distance multiplier: 400 -> 640px
      text: t => 'DASH ' + Math.round(100 * (1 + 0.12 * t)) + '% AS FAR',
      icon: ['........', '#......#', '##....##', '########', '##....##', '#......#', '........', '........'] },
    { id: 'dashSpeed', name: 'DASH SPEED', color: '#e74c3c',
      value: t => 1 + 0.2 * t,                                  // speed multiplier: the dash takes 10 -> 5 frames
      text: t => 'DASH ' + Math.round(100 * (1 + 0.2 * t)) + '% AS FAST',
      icon: ['........', '#..#....', '.#..#...', '..#..#..', '.#..#...', '#..#....', '........', '........'] },
    { id: 'jumpBoost', name: 'JUMP BOOST POWER', color: '#8e44ad',
      value: t => 1.5 + 0.1 * t,                                // J power-up: 1.5x -> 2x jump height
      text: t => 'J POWER-UP: ' + (1.5 + 0.1 * t).toFixed(1) + 'X JUMP HEIGHT',
      icon: ['...##...', '..####..', '.######.', '...##...', '...##...', '...##...', '.######.', '........'] },
    { id: 'speedBoost', name: 'SPEED BOOST POWER', color: '#27ae60',
      value: t => 2 + 0.15 * t,                                 // S power-up: 2x -> 2.75x run speed
      text: t => 'S POWER-UP: ' + (2 + 0.15 * t).toFixed(2).replace(/0$/, '') + 'X RUN SPEED',
      icon: ['....##..', '...##...', '..##....', '.######.', '....##..', '...##...', '..##....', '.##.....'] },
  ];
  const byId = id => LIST.find(p => p.id === id) || null;

  function profile() {
    const p = C.load();
    const k = p.perks = p.perks || {};
    for (const def of LIST) k[def.id] = Math.min(MAX_TIER, Math.max(0, Math.floor(k[def.id]) || 0));
    for (const id of Object.keys(k)) if (!byId(id)) delete k[id];
    return p;
  }
  const tier = id => profile().perks[id] || 0;
  // What the game uses for an upgrade at the tier you own
  const value = id => byId(id).value(tier(id));
  const nextCost = id => (tier(id) >= MAX_TIER ? null : COSTS[tier(id)]);

  function buy(id) {
    const def = byId(id);
    if (!def) return { ok: false, reason: 'UNKNOWN UPGRADE' };
    const p = profile(), t = p.perks[id];
    if (t >= MAX_TIER) return { ok: false, reason: 'MAXED OUT' };
    if (p.gems < COSTS[t]) return { ok: false, reason: 'NOT ENOUGH GEMS' };
    p.gems -= COSTS[t];
    p.perks[id] = t + 1;
    W.save(p);
    return { ok: true, tier: t + 1, maxed: t + 1 >= MAX_TIER };
  }

  function drawIcon(ctx, def, x, y, S, dim) {
    def.icon.forEach((row, r) => {
      for (let c = 0; c < 8; c++) {
        if (row[c] === '.') continue;
        ctx.fillStyle = dim ? '#2a2e44' : def.color;
        ctx.fillRect(x + c * S, y + r * S, S, S);
      }
    });
  }

  return { MAX_TIER, COSTS, LIST, byId, tier, value, nextCost, buy, drawIcon };
})();
