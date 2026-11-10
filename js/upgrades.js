// Shop upgrades: one definition shared by the shop (prices, previews) and the
// game (applying the effects), so both always agree on the numbers.
// Each upgrade has its own level, capped at MAX_LEVEL, and costs 40% more per level.
window.RielUpgrades = (function () {
  const MAX_LEVEL   = 10;
  const COST_GROWTH = 1.4;

  // Base game values the upgrades modify (keep in sync with game.js).
  const BASE_SHOOT_COOLDOWN = 18;      // frames between shots
  const BASE_RELOAD_FRAMES  = 3 * 60;  // 3 seconds

  const pct = n => Math.round(n * 100) + '%';

  // value(level) -> what the upgrade does at that level; format(value) -> text shown in the shop.
  const LIST = [
    { key: 'damage',   name: 'GUN DAMAGE',   baseCost: 6,
      desc: 'EACH BULLET DEALS +2 DAMAGE.',
      value: lvl => 2 + 2 * lvl,                       // matches campaign.gunDamage for new saves
      format: v => v + ' DMG',
      live: (c, step) => (c.gunDamage + 2 * step) + ' DMG' },  // shop preview from the real stat
    { key: 'armor',    name: 'ARMOR',        baseCost: 8,
      desc: 'TAKE 5% LESS DAMAGE FROM ENEMIES AND LASERS.',
      value: lvl => 0.05 * lvl,                        // fraction of damage blocked
      format: v => pct(v) + ' BLOCKED' },
    { key: 'speed',    name: 'SPEED',        baseCost: 6,
      desc: 'MOVE 5% FASTER.',
      value: lvl => 1 + 0.05 * lvl,                    // move speed multiplier
      format: v => pct(v) + ' SPEED' },
    { key: 'maxhp',    name: 'MAX HP',       baseCost: 6,
      desc: 'RAISE YOUR MAXIMUM HEALTH BY 15.',
      value: lvl => 15 * lvl,                          // bonus HP (added to campaign.maxHp on purchase)
      format: v => '+' + v + ' HP',
      live: (c, step) => (c.maxHp + 15 * step) + ' MAX HP' },  // includes boss HP bonuses
    { key: 'firerate', name: 'FIRE RATE',    baseCost: 8,
      desc: 'SHOOT 5% FASTER.',
      value: lvl => Math.round(BASE_SHOOT_COOLDOWN * (1 - 0.05 * lvl)), // frames between shots
      format: v => (60 / v).toFixed(1) + ' SHOTS/S' },
    { key: 'reload',   name: 'RELOAD SPEED', baseCost: 6,
      desc: 'RELOAD 7% FASTER.',
      value: lvl => Math.round(BASE_RELOAD_FRAMES * (1 - 0.07 * lvl)),  // reload time in frames
      format: v => (v / 60).toFixed(1) + 'S RELOAD' },
  ];
  const BY_KEY = Object.fromEntries(LIST.map(u => [u.key, u]));

  // Older saves only had gun upgrades (counted in upgradeCount): carry those over.
  function ensure(campaign) {
    if (!campaign.upgrades || typeof campaign.upgrades !== 'object') {
      campaign.upgrades = { damage: Math.min(MAX_LEVEL, campaign.upgradeCount || 0) };
    }
    for (const u of LIST) {
      const lvl = Number(campaign.upgrades[u.key]) || 0;
      campaign.upgrades[u.key] = Math.max(0, Math.min(MAX_LEVEL, lvl));
    }
    return campaign.upgrades;
  }

  const level  = (campaign, key) => ensure(campaign)[key];
  const cost   = (key, lvl) => Math.round(BY_KEY[key].baseCost * Math.pow(COST_GROWTH, lvl));
  const effect = (campaign, key) => BY_KEY[key].value(level(campaign, key));

  return { MAX_LEVEL, LIST, BY_KEY, ensure, level, cost, effect };
})();
