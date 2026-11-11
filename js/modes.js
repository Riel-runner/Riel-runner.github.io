// Campaign types (modes) and Riel Tokens.
// Finishing a campaign that has an end earns 1 Riel Token. Your lifetime token total
// unlocks new campaign types (tokens are never spent). Tokens and records (best Time
// Attack time, best Endless wave) live in the shared profile from js/cosmetics.js.
// Used by the game, level select, the between-level shop and the title screen.
window.RielModes = (function () {
  const C = window.RielCosmetics;
  const W = C.withKey(C.claim());   // saving tokens / records (claimed while the page loads)

  // finalLevel: the level that completes the campaign (null = never ends).
  // levelStep: how far "continue" in the shop moves (Boss Rush jumps boss to boss).
  const MODES = {
    normal: {
      id: 'normal', name: 'CAMPAIGN', tokens: 0, color: '#f5c400',
      desc: '100 LEVELS, 10 BOSSES. FINISH IT TO EARN A RIEL TOKEN.',
      startLevel: 1, levelStep: 1, finalLevel: 100, lives: 3, startRiels: 0,
      enemyMult: 1, gemMult: 1, allEnemies: false, givesToken: true,
    },
    timeattack: {
      id: 'timeattack', name: 'TIME ATTACK', tokens: 1, color: '#5dade2',
      desc: '25 LEVELS AGAINST THE CLOCK. BEAT YOUR BEST TIME.',
      startLevel: 1, levelStep: 1, finalLevel: 25, lives: 3, startRiels: 0,
      enemyMult: 1, gemMult: 1, allEnemies: false, givesToken: true, timed: true,
    },
    endless: {
      id: 'endless', name: 'ENDLESS', tokens: 2, color: '#2ecc71',
      desc: 'WAVES NEVER STOP AND KEEP GETTING HARDER. HOW FAR CAN YOU GO?',
      startLevel: 1, levelStep: 1, finalLevel: null, lives: 3, startRiels: 0,
      enemyMult: 1, gemMult: 1, allEnemies: false, givesToken: false,
    },
    bossrush: {
      id: 'bossrush', name: 'BOSS RUSH', tokens: 3, color: '#e67e22',
      desc: 'ALL 10 BOSSES BACK TO BACK. SHOP BETWEEN FIGHTS.',
      startLevel: 10, levelStep: 10, finalLevel: 100, lives: 3, startRiels: 50,
      enemyMult: 1, gemMult: 1, allEnemies: false, givesToken: true, bossRiels: 30,
    },
    nightmare: {
      id: 'nightmare', name: 'NIGHTMARE', tokens: 4, color: '#c0392b',
      desc: 'EVERY ENEMY TYPE FROM LEVEL 1, 50% TOUGHER, 1 LIFE. DOUBLE GEMS.',
      startLevel: 1, levelStep: 1, finalLevel: 100, lives: 1, startRiels: 0,
      enemyMult: 1.5, gemMult: 2, allEnemies: true, givesToken: true,
    },
  };
  const ORDER = ['normal', 'timeattack', 'endless', 'bossrush', 'nightmare'];

  const get = idOrCampaign => {
    const id = typeof idOrCampaign === 'string' ? idOrCampaign : (idOrCampaign && idOrCampaign.mode);
    return MODES[id] || MODES.normal;
  };

  // ── Tokens & records (stored in the shared profile) ──
  function profile() {
    const p = C.load();
    p.tokens = Math.max(0, Math.floor(Number(p.tokens) || 0));
    p.records = p.records || {};
    return p;
  }
  const tokens = () => profile().tokens;
  const unlocked = id => tokens() >= get(id).tokens;
  const records = () => profile().records;

  function addToken() {
    const p = profile();
    p.tokens += 1;
    W.save(p);
    return p.tokens;
  }

  // Save a record if it beats the old one (lower is better for times).
  function saveRecord(key, value, lowerIsBetter) {
    const p = profile();
    const old = p.records[key];
    const better = old == null || (lowerIsBetter ? value < old : value > old);
    if (better) { p.records[key] = value; W.save(p); }
    return better;
  }

  // ── Progress helpers ──
  const isFinal = c => { const m = get(c); return m.finalLevel != null && c.level >= m.finalLevel; };
  const nextLevel = c => c.level + get(c).levelStep;

  // How many stages a full run has, and how many are done (null total = endless).
  function progress(c) {
    const m = get(c);
    if (m.finalLevel == null) return { total: null, done: Math.max(0, c.level - 1) };
    if (m.id === 'bossrush') {
      const done = c.completed ? 10 : Math.max(0, Math.floor(c.level / 10) - 1);
      return { total: 10, done };
    }
    return { total: m.finalLevel, done: c.completed ? m.finalLevel : Math.max(0, c.level - 1) };
  }

  // Short label for the current stage, e.g. "LVL 7 / 25", "WAVE 12", "BOSS 3 / 10".
  function stageLabel(c, short) {
    const m = get(c);
    if (m.id === 'endless') return 'WAVE ' + c.level;
    if (m.id === 'bossrush') return 'BOSS ' + Math.max(1, Math.floor(c.level / 10)) + ' / 10';
    return (short ? 'LVL ' : 'LEVEL ') + c.level + ' / ' + m.finalLevel;
  }

  function formatTime(ms) {
    const t = Math.floor((ms || 0) / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  // Starting values for a brand-new campaign of this type.
  function newCampaignFields(id) {
    const m = get(id);
    return { mode: m.id, level: m.startLevel, lives: m.lives, riels: m.startRiels };
  }

  // Giving tokens / saving records only for game scripts holding the save key.
  const withKey = key => (C.withKey(key) ? { addToken, saveRecord } : null);
  return { MODES, ORDER, get, tokens, unlocked, records, withKey,
           isFinal, nextLevel, progress, stageLabel, formatTime, newCampaignFields };
})();
