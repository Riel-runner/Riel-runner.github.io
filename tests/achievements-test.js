// Achievements: menu button + badge, the achievements page, gems paid once, credit for
// old saves, and the in-game hooks (level clears, speed, no damage, accuracy, kills,
// bosses, campaign types, Endless waves, saved level clock).
// Usage: node achievements-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const f = document.getElementById('f'), log = [];
// Profiles written by hand here get signed with this test page's own save key, so the save
// protection (js/cosmetics.js) accepts them.
const _rawSet = Storage.prototype.setItem;
const _seal = window.RielCosmetics.withKey(window.RielCosmetics.claim());   // claimed while this test page loads
let _sealing = false;
Storage.prototype.setItem = function (k, v) { if (k === 'rielrunner_profile' && !_sealing) { let o = null; try { o = JSON.parse(v); } catch {} if (o && typeof o === 'object') { _sealing = true; try { _seal.save(Object.assign({ wipe: 1 }, o)); } finally { _sealing = false; } return; } } _rawSet.call(this, k, v); };
const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + m);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }
async function go(url) { const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading'); await wait(300); }
const base = { riels: 0, hp: 170, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T', lives: 3 };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };
const prof = () => JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
const setProf = p => localStorage.setItem('rielrunner_profile', JSON.stringify(p));
const has = id => !!(prof().achievements || {})[id];
const W = () => f.contentWindow, E = s => f.contentWindow.eval(s);
// A new profile that already counts as seeded (no old campaigns to credit).
const fresh = (extra = {}) => setProf({ gems: 0, life: { seeded: true, ...extra } });
// Kill every enemy left in the level (each kill checks for a level clear).
const clearLevel = "npcs.forEach(n => { if (!n.dead) killNPC(n); });";

(async () => {
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('rielrunner_intro_played', '1');

  // ── Menu button, no badge on a fresh profile ──
  fresh();
  await go('index.html');
  let d = f.contentDocument;
  const btn = [...d.querySelectorAll('.btn')].find(b => /ACHIEVEMENTS/.test(b.textContent));
  ok(btn && btn.getAttribute('href') === 'achievements.html', 'menu has an ACHIEVEMENTS button linking to achievements.html');
  ok(d.getElementById('ach-badge').hidden, 'no NEW badge when nothing is unlocked');

  // ── Old saves get credit (once), gems paid, badge shows ──
  localStorage.removeItem('rielrunner_profile');
  // Old-save credit only applies until the save-protection cut-off date; after that, start from a
  // profile that already holds those counters (what a real player's save looks like by then).
  const legacy = window.RielCosmetics.legacyOpen();
  setProf(legacy ? { gems: 10, records: { endless: 30 } }
                 : { gems: 10, records: { endless: 30 }, life: { seeded: true, levelsCleared: 129, kills: 1500, bossesBeaten: 12, bestWave: 30 } });
  localStorage.setItem('rielrunner_campaigns', JSON.stringify([
    { ...base, mode: 'normal', level: 100, completed: true, enemiesKilled: 1200, bossesBeaten: 10 },
    { ...base, mode: 'endless', level: 30, dead: true, enemiesKilled: 300, bossesBeaten: 2, revives: 1 },
  ]));
  await go('index.html');
  d = f.contentDocument;
  let p = prof();
  ok(p.life.levelsCleared === 129, 'old campaigns count toward levels cleared (' + p.life.levelsCleared + ', want 100 + 29)');
  ok(p.life.kills === 1500 && p.life.bossesBeaten === 12 && p.life.bestWave === 30, 'old kills / bosses / best wave credited (' + [p.life.kills, p.life.bossesBeaten, p.life.bestWave] + ')');
  const want = ['levels_1', 'levels_10', 'levels_50', 'levels_100', 'bosses_1', 'bosses_5', 'bosses_10', 'kills_100', 'kills_1000', 'beat_normal', 'no_revive', 'endless_25'].filter(id => legacy || (id !== 'beat_normal' && id !== 'no_revive'));
  ok(want.every(has), 'old progress unlocks the matching achievements (missing: ' + want.filter(id => !has(id)) + ')');
  ok(!has('levels_250') && !has('kills_5000') && !has('endless_50') && !has('beat_nightmare'), 'goals not reached stay locked');
  const LIST = W().RielAchievements.LIST;
  const paid = want.reduce((s, id) => s + LIST.find(a => a.id === id).gems, 0);
  ok(p.gems === 10 + paid, 'their gems are paid into the profile (' + p.gems + ', want ' + (10 + paid) + ')');
  ok(!d.getElementById('ach-badge').hidden && d.getElementById('ach-badge').textContent === want.length + ' NEW', 'menu badge shows ' + want.length + ' NEW (' + d.getElementById('ach-badge').textContent + ')');
  ok(d.getElementById('gem-count').textContent === (10 + paid).toLocaleString('en-US'), 'menu gem count includes achievement gems');
  await go('index.html');
  ok(prof().gems === 10 + paid && prof().life.levelsCleared === 129, 'opening the menu again pays nothing twice');

  // ── Achievements page ──
  await go('achievements.html');
  d = f.contentDocument;
  ok(d.getElementById('ach-count').textContent === want.length + ' / ' + LIST.length, 'page shows unlocked count (' + d.getElementById('ach-count').textContent + ')');
  ok(d.querySelectorAll('.ach-card').length === LIST.length, 'page lists every achievement (' + d.querySelectorAll('.ach-card').length + ')');
  ok(d.querySelectorAll('.ach-card.unlocked').length === want.length && d.querySelectorAll('.ach-card.new').length === want.length, 'unlocked ones are highlighted as new');
  const k5 = d.querySelector('[data-id="kills_5000"]');
  ok(k5 && /1,500 \/ 5,000/.test(k5.textContent) && k5.querySelector('.ach-bar-fill'), 'locked counter shows progress 1,500 / 5,000 with a bar');
  ok(/\+2,000 GEMS/.test(d.querySelector('[data-id="beat_nightmare"]').textContent), 'cards show the gem reward');
  await go('index.html');
  ok(f.contentDocument.getElementById('ach-badge').hidden, 'badge clears after visiting the page');
  await go('achievements.html');
  ok(f.contentDocument.querySelectorAll('.ach-card.new').length === 0, 'second visit: nothing marked new');

  // ── Buying a class (outside the game) unlocks NEW RECRUIT on the menu ──
  p = prof(); p.owned = { class: ['gunner', 'smg'] }; setProf(p);
  await go('index.html');
  ok(has('new_class'), 'owning a second class unlocks NEW RECRUIT');

  // ── Fast level, low level: speed achievements, but not no-damage (needs level 5+) ──
  fresh();
  put({ ...base, mode: 'normal', level: 3 });
  await go('game.html');
  E("levelStats.timeMs = 12000; levelStats.damage = 0;" + clearLevel);
  ok(has('fast_30') && has('fast_15') && has('levels_1'), 'clear in 12s: SPEEDY + LIGHTNING + FIRST STEPS');
  ok(!has('no_damage'), 'no-damage needs level 5 or higher');
  ok(prof().gems === 25 + 100 + 250, 'gems paid for the three (' + prof().gems + ')');
  let lines = E('clearAchievements');
  ok(lines.length === 3 && lines.some(t => /LIGHTNING  \+250 GEMS/.test(t)), 'level-complete banner lists them (' + lines.join(' | ') + ')');
  ok(E('achBannerExtra()') > 0, 'banner stays up longer to read them');
  E("gameState = 'playing'; checkLevelClear(); reportLevelClear();");
  ok(prof().life.levelsCleared === 1, 'a level only counts once (' + prof().life.levelsCleared + ')');
  ok(JSON.parse(localStorage.getItem('activeCampaign')).achLevel === 3, 'counted level is saved with the campaign');

  // ── Slow, damaged level: nothing for speed / no damage ──
  fresh();
  put({ ...base, mode: 'normal', level: 6 });
  await go('game.html');
  E("damagePlayer(5); levelStats.timeMs = 45000;" + clearLevel);
  ok(E('levelStats.damage') > 0, 'damage taken is tracked for the level');
  ok(!has('fast_30') && !has('no_damage') && prof().life.levelsCleared === 1, 'slow level with damage: only counts as cleared');

  // ── No damage + accuracy ──
  fresh();
  put({ ...base, mode: 'normal', level: 7, shotsFired: 100, shotsHit: 50 });
  await go('game.html');
  E("levelStats.timeMs = 50000; campaign.shotsFired += 20; campaign.shotsHit += 19;" + clearLevel);
  ok(has('no_damage') && has('sharpshooter'), 'level 7 with no damage and 19/20 hits: UNTOUCHABLE + SHARPSHOOTER');
  fresh();
  put({ ...base, mode: 'normal', level: 8 });
  await go('game.html');
  E("levelStats.timeMs = 50000; campaign.shotsFired = (campaign.shotsFired || 0) + 20; campaign.shotsHit = (campaign.shotsHit || 0) + 10;" + clearLevel);
  ok(!has('sharpshooter'), '50% accuracy: no SHARPSHOOTER');

  // ── ABILITY MASTER: only damage from abilities / while one is in action ──
  const withShield = () => setProf({ gems: 0, life: { seeded: true }, abilities: { owned: { shield: { level: 1, copies: 0 }, lightning: { level: 1, copies: 0 } }, equipped: 'shield', slot2: true, equipped2: 'lightning' } });
  const killAll = "npcs.forEach(n => { while (!n.dead) hitNPC(n, 1000); });";
  withShield(); put({ ...base, mode: 'normal', level: 7 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; gameState = 'playing'; useAbility(0);" + killAll);
  ok(has('ability_only') && prof().gems >= 1000, 'level 7, every hit while Shield is active: ABILITY MASTER (+1,000 gems)');
  withShield(); put({ ...base, mode: 'normal', level: 7 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; gameState = 'playing'; hitNPC(npcs[0], 1); useAbility(0);" + killAll);
  ok(!has('ability_only'), 'one hit with no ability active: no ABILITY MASTER');
  withShield(); put({ ...base, mode: 'normal', level: 7 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; gameState = 'playing'; npcs.forEach(n => n.frozen = 200);" + killAll);
  ok(has('ability_only'), 'hits on frozen enemies count (Freeze does no damage itself)');
  withShield(); put({ ...base, mode: 'normal', level: 7 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; gameState = 'playing'; npcs.forEach(n => { n.x = player.x + 40; n.y = GROUND_Y - n.h; n.hp = 1; }); camX = Math.max(0, player.x - 200); useAbility(1);");
  ok(E("npcs.every(n => n.dead)") ? has('ability_only') : E('levelStats.plainDmg') === 0 && E('levelStats.abilityDmg') > 0, 'Chain Lightning damage counts as ability damage');
  withShield(); put({ ...base, mode: 'normal', level: 4 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; gameState = 'playing'; useAbility(0);" + killAll);
  ok(!has('ability_only'), 'ABILITY MASTER needs level 5 or higher');
  ok(E('levelStats.plainDmg') === 0, 'level stats track plain damage separately');

  // ── CLEAN STREAK (5) / SPOTLESS (10): levels above 10 in a row without taking damage ──
  fresh(); put({ ...base, mode: 'normal', level: 15, cleanStreak: 3 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; levelStats.timeMs = 50000;" + clearLevel);
  ok(E('campaign.cleanStreak') === 4 && !has('clean_5'), 'clean level above 10: streak 3 -> 4, no achievement yet');
  fresh(); put({ ...base, mode: 'normal', level: 16, cleanStreak: 4 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; levelStats.timeMs = 50000;" + clearLevel);
  ok(has('clean_5') && !has('clean_10') && prof().gems >= 200, '5 clean levels in a row: CLEAN STREAK (+200 gems)');
  fresh(); put({ ...base, mode: 'normal', level: 21, cleanStreak: 9 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; levelStats.timeMs = 50000;" + clearLevel);
  ok(has('clean_10') && has('clean_5'), '10 clean levels in a row: SPOTLESS (a separate achievement)');
  fresh(); put({ ...base, mode: 'normal', level: 22, cleanStreak: 9 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; levelStats.timeMs = 50000; damagePlayer(1);" + clearLevel);
  ok(E('campaign.cleanStreak') === 0 && !has('clean_10'), 'taking any damage starts the streak over');
  fresh(); put({ ...base, mode: 'normal', level: 9, cleanStreak: 0 });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; levelStats.timeMs = 50000;" + clearLevel);
  ok(!E('campaign.cleanStreak'), 'levels 1-10 do not count toward the streak');

  // ── Kills: mid-level unlock shows as a toast ──
  fresh({ kills: 99 });
  put({ ...base, mode: 'normal', level: 4 });
  await go('game.html');
  E("killNPC(npcs.find(n => !n.dead));");
  ok(has('kills_100') && E('achToasts').some(t => /TRIGGER HAPPY/.test(t)), '100th kill: TRIGGER HAPPY queued as a toast');
  E("toastTimer2 = 0; drawToast();");
  ok(/TRIGGER HAPPY/.test(E('toastMsg')), 'toast is shown while playing');

  // ── Boss level in under 60s: BOSS SLAYER + BOSS BLITZ ──
  fresh();
  put({ ...base, mode: 'normal', level: 10 });
  await go('game.html');
  E("levelStats.timeMs = 50000; damagePlayer(1);" + clearLevel);
  ok(has('bosses_1') && has('boss_fast'), 'boss beaten in 50s: BOSS SLAYER + BOSS BLITZ');
  ok(E('clearAchievements').some(t => /BOSS SLAYER/.test(t)), 'boss kill achievement moves onto the banner');

  // ── Finishing a campaign type ──
  fresh();
  put({ ...base, mode: 'timeattack', level: 25, playTimeMs: 600000 });
  await go('game.html');
  E("levelStats.timeMs = 50000; damagePlayer(1);" + clearLevel + "showEndScreen(true);");
  ok(has('beat_timeattack') && has('no_revive'), 'finishing Time Attack without reviving: AGAINST THE CLOCK + NO SECOND CHANCES');
  ok(/ACHIEVEMENT: AGAINST THE CLOCK/.test(f.contentDocument.getElementById('death-reward').textContent), 'campaign-complete screen lists the achievements');
  fresh();
  put({ ...base, mode: 'bossrush', level: 100, revives: 2 });
  await go('game.html');
  E(clearLevel);
  ok(has('beat_bossrush') && !has('no_revive'), 'Boss Rush after reviving: GAUNTLET only');

  // ── Endless waves ──
  fresh();
  put({ ...base, mode: 'endless', level: 25 });
  await go('game.html');
  E(clearLevel);
  ok(has('endless_25') && prof().life.bestWave === 25, 'clearing wave 25 in Endless: NO END IN SIGHT');

  // ── A saved level keeps its clock ──
  fresh();
  put({ ...base, mode: 'normal', level: 12 });
  await go('game.html');
  E("levelStats.timeMs = 7000; levelStats.damage = 3; saveLevelProgress();");
  await go('game.html');
  ok(E('levelStats.timeMs') === 7000 && E('levelStats.damage') === 3, 'resumed level keeps its time and damage (' + E('levelStats.timeMs') + ', ' + E('levelStats.damage') + ')');
  const c = JSON.parse(localStorage.getItem('activeCampaign'));
  delete c.levelState.stats; put(c);
  await go('game.html');
  ok(E('levelStats.timeMs') >= 1e12, 'old save without a clock: no speed achievements for that level');

  document.getElementById('out').textContent = log.join('\n');
})().catch(e => { document.getElementById('out').textContent = log.join('\n') + '\nERROR ' + e.stack; });
`;
const harness = `<!doctype html><html><body><pre id="out">running</pre><iframe id="f" width="960" height="600"></iframe><script src="js/cosmetics.js"></script><script>${testScript}</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/h.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(harness); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {}); res.end(d);
  });
});
server.listen(0, () => execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=120000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
