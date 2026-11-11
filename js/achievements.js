// Achievements: one-time goals that pay out GEMS the moment they're earned.
// Progress lives in the shared profile from js/cosmetics.js (so it counts across
// every campaign): p.life holds lifetime counters, p.achievements holds what's
// unlocked ({ id: { at, seen } }). Needs cosmetics.js and modes.js loaded first.
// Used by the game (reports clears, kills, times...), the title screen (badge for
// new ones) and achievements.html.
window.RielAchievements = (function () {
  const C = window.RielCosmetics, M = window.RielModes;

  // stat + goal: counts toward a lifetime number (shows a progress bar).
  // No stat: unlocked by something happening in the game (see the hooks below).
  const LIST = [
    // Levels (any campaign type)
    { id: 'levels_1',   cat: 'LEVELS', name: 'FIRST STEPS',     desc: 'CLEAR YOUR FIRST LEVEL',          gems: 25,   stat: 'levelsCleared', goal: 1 },
    { id: 'levels_10',  cat: 'LEVELS', name: 'WARMED UP',       desc: 'CLEAR 10 LEVELS',                 gems: 50,   stat: 'levelsCleared', goal: 10 },
    { id: 'levels_50',  cat: 'LEVELS', name: 'HALFWAY THERE',   desc: 'CLEAR 50 LEVELS',                 gems: 150,  stat: 'levelsCleared', goal: 50 },
    { id: 'levels_100', cat: 'LEVELS', name: 'CENTURY',         desc: 'CLEAR 100 LEVELS',                gems: 300,  stat: 'levelsCleared', goal: 100 },
    { id: 'levels_250', cat: 'LEVELS', name: 'MARATHON',        desc: 'CLEAR 250 LEVELS',                gems: 600,  stat: 'levelsCleared', goal: 250 },
    // Bosses
    { id: 'bosses_1',   cat: 'BOSSES', name: 'BOSS SLAYER',     desc: 'DEFEAT A BOSS',                   gems: 75,   stat: 'bossesBeaten', goal: 1 },
    { id: 'bosses_5',   cat: 'BOSSES', name: 'BOSS HUNTER',     desc: 'DEFEAT 5 BOSSES',                 gems: 200,  stat: 'bossesBeaten', goal: 5 },
    { id: 'bosses_10',  cat: 'BOSSES', name: 'BOSS LEGEND',     desc: 'DEFEAT 10 BOSSES',                gems: 400,  stat: 'bossesBeaten', goal: 10 },
    // Combat
    { id: 'kills_100',  cat: 'COMBAT', name: 'TRIGGER HAPPY',   desc: 'DEFEAT 100 ENEMIES',              gems: 50,   stat: 'kills', goal: 100 },
    { id: 'kills_1000', cat: 'COMBAT', name: 'ONE-MAN ARMY',    desc: 'DEFEAT 1,000 ENEMIES',            gems: 200,  stat: 'kills', goal: 1000 },
    { id: 'kills_5000', cat: 'COMBAT', name: 'UNSTOPPABLE',     desc: 'DEFEAT 5,000 ENEMIES',            gems: 500,  stat: 'kills', goal: 5000 },
    { id: 'no_damage',  cat: 'COMBAT', name: 'UNTOUCHABLE',     desc: 'CLEAR LEVEL 5 OR HIGHER WITHOUT TAKING DAMAGE', gems: 150 },
    { id: 'sharpshooter', cat: 'COMBAT', name: 'SHARPSHOOTER',  desc: 'CLEAR A LEVEL WITH 90% ACCURACY (20+ SHOTS)',  gems: 150 },
    { id: 'ability_only', cat: 'COMBAT', name: 'ABILITY MASTER', desc: 'CLEAR LEVEL 5 OR HIGHER ONLY DEALING DAMAGE WITH ABILITIES OR WHILE ONE IS IN ACTION', gems: 1000 },
    // Speed
    { id: 'fast_30',    cat: 'SPEED',  name: 'SPEEDY',          desc: 'CLEAR A LEVEL IN UNDER 30 SECONDS', gems: 100 },
    { id: 'fast_15',    cat: 'SPEED',  name: 'LIGHTNING',       desc: 'CLEAR A LEVEL IN UNDER 15 SECONDS', gems: 250 },
    { id: 'boss_fast',  cat: 'SPEED',  name: 'BOSS BLITZ',      desc: 'DEFEAT A BOSS LEVEL IN UNDER 60 SECONDS', gems: 300 },
    // Campaign types
    { id: 'beat_normal',     cat: 'CAMPAIGNS', name: 'CHAMPION',      desc: 'FINISH A CAMPAIGN (100 LEVELS)',   gems: 1000 },
    { id: 'beat_timeattack', cat: 'CAMPAIGNS', name: 'AGAINST THE CLOCK', desc: 'FINISH TIME ATTACK',       gems: 500 },
    { id: 'endless_25', cat: 'CAMPAIGNS', name: 'NO END IN SIGHT', desc: 'REACH WAVE 25 IN ENDLESS',         gems: 400,  stat: 'bestWave', goal: 25 },
    { id: 'endless_50', cat: 'CAMPAIGNS', name: 'FOREVER RUNNER',  desc: 'REACH WAVE 50 IN ENDLESS',         gems: 800,  stat: 'bestWave', goal: 50 },
    { id: 'beat_bossrush',   cat: 'CAMPAIGNS', name: 'GAUNTLET',      desc: 'FINISH BOSS RUSH',                 gems: 750 },
    { id: 'beat_nightmare',  cat: 'CAMPAIGNS', name: 'NIGHTMARE SURVIVOR', desc: 'FINISH NIGHTMARE',            gems: 2000 },
    { id: 'no_revive',  cat: 'CAMPAIGNS', name: 'NO SECOND CHANCES', desc: 'FINISH ANY CAMPAIGN TYPE WITHOUT REVIVING', gems: 500 },
    // Extras
    { id: 'new_class',  cat: 'EXTRAS', name: 'NEW RECRUIT',     desc: 'BUY A NEW CLASS IN THE SHOP',     gems: 50 },
  ];
  const CATEGORIES = ['LEVELS', 'BOSSES', 'COMBAT', 'SPEED', 'CAMPAIGNS', 'EXTRAS'];
  const byId = id => LIST.find(a => a.id === id);

  function profile() {
    const p = C.load();
    p.life = p.life || {};
    p.achievements = p.achievements || {};
    return p;
  }

  // Unlock every achievement whose condition is met, pay its gems into p (not saved).
  function grant(p, ids) {
    const got = [];
    for (const id of ids) {
      const a = byId(id);
      if (!a || p.achievements[id]) continue;
      p.achievements[id] = { at: Date.now(), seen: false };
      p.gems += a.gems;
      got.push(a);
    }
    return got;
  }
  const counterIds = p => LIST.filter(a => a.stat && (p.life[a.stat] || 0) >= a.goal).map(a => a.id);

  // First run of this version: credit progress from campaigns and records that already
  // exist, so players don't lose what they've done.
  function seed(p) {
    if (p.life.seeded) return;
    p.life.seeded = true;
    let all = [];
    try { all = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || []; } catch {}
    const ids = [];
    for (const c of all) {
      if (!c) continue;
      p.life.levelsCleared = (p.life.levelsCleared || 0) + (M.progress(c).done || 0);
      p.life.kills = (p.life.kills || 0) + (c.enemiesKilled || 0);
      p.life.bossesBeaten = (p.life.bossesBeaten || 0) + (c.bossesBeaten || 0);
      if (c.completed) {
        ids.push('beat_' + M.get(c).id);
        if (!c.revives) ids.push('no_revive');
      }
    }
    const rec = (p.records || {});
    if (rec.endless) p.life.bestWave = Math.max(p.life.bestWave || 0, rec.endless);
    if (rec.timeattack != null) ids.push('beat_timeattack');
    return ids;
  }

  // Load the profile, let change(p) update it and name achievements it earned, then
  // grant those plus any counter goals reached, save, and return what was unlocked.
  function update(change) {
    const p = profile();
    const ids = seed(p) || [];
    ids.push(...(change(p) || []));
    ids.push(...counterIds(p));
    if ((p.owned.class || []).length > 1) ids.push('new_class');
    const got = grant(p, ids);
    C.save(p);
    return got;
  }

  // Check everything that can be worked out from saved data (also seeds old saves).
  const sync = () => update(() => []);

  // ── Hooks used by the game ──
  const add = (stat, n = 1) => update(p => { p.life[stat] = (p.life[stat] || 0) + n; });
  const max = (stat, value) => update(p => { p.life[stat] = Math.max(p.life[stat] || 0, value); });
  const unlock = (...ids) => update(() => ids);

  // A level was cleared. info: { level, timeMs, damage, shots, hits, boss }.
  function levelCleared(info) {
    const ids = [];
    if (info.timeMs < 30000) ids.push('fast_30');
    if (info.timeMs < 15000) ids.push('fast_15');
    if (info.boss && info.timeMs < 60000) ids.push('boss_fast');
    if (info.level >= 5 && info.damage <= 0) ids.push('no_damage');
    if (info.shots >= 20 && info.hits / info.shots >= 0.9) ids.push('sharpshooter');
    if (info.level >= 5 && info.abilityOnly) ids.push('ability_only');
    return update(p => { p.life.levelsCleared = (p.life.levelsCleared || 0) + 1; return ids; });
  }

  // A campaign type was finished.
  function campaignFinished(modeId, revives) {
    const ids = ['beat_' + modeId];
    if (!revives) ids.push('no_revive');
    return unlock(...ids);
  }

  // ── For the achievements page / title screen ──
  function status() {
    const p = profile();
    return LIST.map(a => {
      const u = p.achievements[a.id];
      return { ...a, unlocked: !!u, at: u ? u.at : null, isNew: !!u && !u.seen,
               progress: a.stat ? Math.min(a.goal, p.life[a.stat] || 0) : null };
    });
  }
  const unseen = () => status().filter(a => a.isNew).length;
  function markSeen() {
    const p = profile();
    for (const id in p.achievements) p.achievements[id].seen = true;
    C.save(p);
  }

  return { LIST, CATEGORIES, sync, add, max, unlock, levelCleared, campaignFinished,
           status, unseen, markSeen };
})();
