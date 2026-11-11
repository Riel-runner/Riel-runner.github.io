// Shop upgrades: one definition shared by the shop (prices, previews) and the
// game (applying the effects), so both always agree on the numbers.
// Each upgrade has its own level, capped at MAX_LEVEL, and costs 40% more per level.
window.RielUpgrades = (function () {
  const MAX_LEVEL   = 10;
  const COST_GROWTH = 1.4;

  // Base numbers come from the equipped class (js/cosmetics.js), so upgrades scale with
  // your weapon: e.g. Mag Size adds ~25% of the class's magazine per level (pistol +5,
  // AK +8, sniper +1) and fire rate / reload cut a percentage of the class's base.
  const DEFAULT_CLASS = { name: 'GUNNER', weapon: 'PISTOL', dmg: 1, mag: 20, fireCd: 18, reload: 180, speed: 1 };
  const cls = () => (window.RielCosmetics && window.RielCosmetics.equipped('class')) || DEFAULT_CLASS;
  const magStep = c => Math.max(1, Math.round(c.mag * 0.25));
  const num = v => (Math.round(v * 10) / 10).toString();             // 1.6, 4, 2.2
  const dmgText = (base, c) => num(base * c.dmg) + (c.pellets ? ' x' + c.pellets : '') + ' DMG';

  const pct = n => Math.round(n * 100) + '%';

  // value(level) -> what the upgrade does at that level; format(value) -> text shown in the shop.
  const LIST = [
    { key: 'damage',   name: 'GUN DAMAGE',   baseCost: 6,
      desc: () => cls().dmg === 1 ? 'EACH BULLET DEALS +2 DAMAGE.'
                                  : '+2 BASE DAMAGE (x' + num(cls().dmg) + ' WITH THE ' + cls().weapon + ').',
      value: lvl => 2 + 2 * lvl,                       // base damage (campaign.gunDamage for new saves)
      format: v => dmgText(v, cls()),
      live: (c, step) => dmgText(c.gunDamage + 2 * step, cls()) },  // real stat x class multiplier
    { key: 'armor',    name: 'ARMOR',        baseCost: 8,
      desc: 'TAKE 5% LESS DAMAGE FROM ENEMIES AND LASERS.',
      value: lvl => 0.05 * lvl,                        // fraction of damage blocked
      format: v => pct(v) + ' BLOCKED' },
    { key: 'speed',    name: 'SPEED',        baseCost: 6,
      desc: 'MOVE 5% FASTER.',
      value: lvl => cls().speed * (1 + 0.05 * lvl),    // move speed multiplier (class base x upgrades)
      format: v => pct(v) + ' SPEED' },
    { key: 'maxhp',    name: 'MAX HP',       baseCost: 6,
      desc: 'RAISE YOUR MAXIMUM HEALTH BY 15.',
      value: lvl => 15 * lvl,                          // bonus HP (added to campaign.maxHp on purchase)
      format: v => '+' + v + ' HP',
      live: (c, step) => (c.maxHp + 15 * step) + ' MAX HP' },  // includes boss HP bonuses
    { key: 'firerate', name: 'FIRE RATE',    baseCost: 8,
      desc: 'SHOOT 5% FASTER.',
      value: lvl => cls().fireCd * (1 - 0.05 * lvl),  // frames between shots (fractional: every level counts)
      format: v => (60 / v).toFixed(60 / v < 3 ? 2 : 1) + ' SHOTS/S' },  // 2 decimals for slow guns so every level shows a change
    { key: 'ammo',     name: 'MAG SIZE',     baseCost: 6,
      desc: () => 'HOLD ' + magStep(cls()) + ' MORE BULLET' + (magStep(cls()) > 1 ? 'S' : '') + ' PER MAGAZINE.',
      value: lvl => cls().mag + magStep(cls()) * lvl,  // bullets per magazine (pistol 20 -> 70)
      format: v => v + ' ROUNDS' },
    { key: 'reload',   name: 'RELOAD SPEED', baseCost: 6,
      desc: 'RELOAD 7% FASTER.',
      value: lvl => Math.round(cls().reload * (1 - 0.07 * lvl)),       // reload time in frames
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

  const descOf = u => (typeof u.desc === 'function' ? u.desc() : u.desc);
  return { MAX_LEVEL, LIST, BY_KEY, ensure, level, cost, effect, descOf, currentClass: cls };
})();
