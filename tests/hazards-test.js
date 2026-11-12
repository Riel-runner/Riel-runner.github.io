// Zone hazards (js/hazards.js): 50% roll per level matching the zone, each hazard's
// warning + damage rules, that the hazard is saved with the level, and each zone's music track.
// Usage: node hazards-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const f = document.getElementById('f'), log = [];
const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + m);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }
async function go(url) { const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading'); await wait(300); }
const base = { riels: 0, hp: 170, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T', lives: 3 };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };

(async () => {
  localStorage.clear(); sessionStorage.clear();
  put({ ...base, level: 25 });
  await go('game.html');
  const w = f.contentWindow, E = js => w.eval(js), J = js => JSON.parse(E(js));

  // ── Each zone plays its own music track ──
  ok(/game-music-dirt\.flac$/.test(w.eval('gameMusic.src')), 'grassy field level plays game-music-dirt.flac');
  const tracks = J("JSON.stringify([5, 25, 45, 65, 85].map(L => 'assets/audio/music/game-music-' + ZONE_MUSIC[window.RielThemes.forLevel(L).id] + '.flac'))");
  const found = [];
  for (const t of tracks) { const r = await fetch(t, { method: 'HEAD' }); found.push(r.ok); }
  ok(tracks.join() === ['ice', 'dirt', 'lava', 'sky', 'space'].map(a => 'assets/audio/music/game-music-' + a + '.flac').join() && found.every(Boolean), 'ice, grass (dirt), lava, sky and space each have their own music file, and every file exists');

  // ── The roll: about half the levels, always the zone's own hazard ──
  const roll = J("(() => { const out = {}; const lvl0 = campaign.level; for (const L of [5, 25, 45, 65, 85, 1, 2, 10, 50]) { campaign.level = L; let n = 0; const ids = new Set(); for (let k = 0; k < 400; k++) { const h = pickZoneHazard(); if (h) { n++; ids.add(h.id); } } out[L] = { n, ids: [...ids] }; } campaign.level = lvl0; zoneHazard = null; return JSON.stringify(out); })()");
  const zoneOf = { 5: 'slippery', 25: 'thorns', 45: 'geysers', 65: 'wind', 85: 'meteors' };
  for (const L of [5, 25, 45, 65, 85]) ok(roll[L].n > 150 && roll[L].n < 250 && roll[L].ids.join() === zoneOf[L], 'level ' + L + ': hazard on about 50% of levels (' + roll[L].n + '/400), always ' + zoneOf[L]);
  ok([1, 2, 10, 50].every(L => roll[L].n === 0), 'no hazard on levels 1-2 or boss levels');
  E("npcs.length = 0; lasers.length = 0; powerups.length = 0; applyLevelEvent(null); player.dead = false; player.invuln = 0; player.maxHp = 1000; player.hp = 1000;");
  const reset = "player.x = 1000; player.y = GROUND_Y - PLAYER_H; player.vy = 0; player.vx = 0; player.onGround = true; player.dead = false; player.invuln = 0; player.hp = player.maxHp; player.isDashing = false; player.dashCooldown = 999; for (const k in keys) keys[k] = false; mouseDown = false;";

  // ── Slippery ice ──
  const ice = J("(() => { " + reset + " zoneHazard = null; keys.ArrowRight = true; for (let i = 0; i < 30; i++) updatePlayer(); keys.ArrowRight = false; updatePlayer(); const normalStop = player.vx; " + reset + " setZoneHazard('slippery'); keys.ArrowRight = true; const v = []; for (let i = 0; i < 90; i++) { updatePlayer(); v.push(player.vx); } const top = player.vx, full = MOVE_SPEED * PLAYER_SPEED_MULT; keys.ArrowRight = false; updatePlayer(); const slide1 = player.vx; let frames = 0; while (player.vx !== 0 && frames < 600) { updatePlayer(); frames++; } return JSON.stringify({ normalStop, first: v[0], top, full, slide1, frames }); })()");
  ok(ice.normalStop === 0, 'normal ground: you stop the moment you let go');
  ok(ice.first < ice.full * 0.5 && Math.abs(ice.top - ice.full) < 0.05, 'slippery ice: you speed up gradually (' + ice.first.toFixed(2) + ' on the first frame), same top speed (' + ice.top.toFixed(2) + ')');
  ok(ice.slide1 > ice.full * 0.8 && ice.frames > 30 && ice.frames < 300, 'slippery ice: letting go slides you to a stop (' + ice.frames + ' frames)');

  // ── Thorn bushes ──
  const th = J("(() => { " + reset + " lasers.length = 0; lasers.push({ x: 2000, y: 300, w: 6, h: 90, t: 0 }); setZoneHazard('thorns'); const b = zoneHazard.items; const placed = b.every(i => i.x >= 600 && i.x + i.w < LEVEL_WIDTH - 300 && Math.abs(i.x - 2000) >= 70) && b.every((i, k) => k === 0 || i.x - b[k - 1].x >= 350); const bush = b[0]; player.x = bush.x + 4; player.y = GROUND_Y - PLAYER_H; let hp0 = player.hp; for (let i = 0; i < 61; i++) { frameCount++; updateHazards(); } const inDmg = hp0 - player.hp; player.y = GROUND_Y - PLAYER_H - THORN_H - 2; hp0 = player.hp; for (let i = 0; i < 61; i++) { frameCount++; updateHazards(); } const overDmg = hp0 - player.hp; lasers.length = 0; return JSON.stringify({ n: b.length, placed, inDmg, overDmg, low: THORN_H < JUMP_HEIGHT / 4 }); })()");
  ok(th.n >= 3 && th.n <= 5 && th.placed, 'thorn bushes: ' + th.n + ' bushes, spread out, away from the start and the lasers');
  ok(th.inDmg > 0 && th.overDmg === 0 && th.low, 'thorn bushes: touching one hurts (' + Math.round(th.inDmg) + '), jumping over does not, and they are low enough to jump');

  // ── Lava geysers ──
  const gy = J("(() => { " + reset + " setZoneHazard('geysers'); const g = zoneHazard.items[0]; const states = []; g.t = 0; for (let i = 0; i < GEYSER_CYCLE; i++) { states.push(geyserErupt(g) ? 'e' : geyserWarn(g) ? 'w' : 'i'); g.t++; } const firstErupt = states.indexOf('e'), warnBefore = states.slice(0, firstErupt).filter(s => s === 'w').length; player.x = g.x + 2; player.y = GROUND_Y - PLAYER_H; g.t = 0; let hp0 = player.hp; for (let i = 0; i < GEYSER_IDLE + GEYSER_WARN - 1; i++) { frameCount++; updateHazards(); } const quiet = hp0 - player.hp; hp0 = player.hp; for (let i = 0; i < 40; i++) { frameCount++; updateHazards(); } const hot = hp0 - player.hp; const ts = new Set(zoneHazard.items.map(i => i.t % GEYSER_CYCLE)); return JSON.stringify({ warnBefore, quiet, hot, staggered: ts.size === zoneHazard.items.length, n: zoneHazard.items.length }); })()");
  ok(gy.warnBefore >= 45, 'lava geysers: bubble for ' + gy.warnBefore + ' frames before every eruption');
  ok(gy.quiet === 0 && gy.hot > 0, 'lava geysers: harmless while quiet or bubbling, hurt while erupting (' + Math.round(gy.hot) + ')');
  ok(gy.n >= 3 && gy.staggered, 'lava geysers: ' + gy.n + ' vents on different timers');

  // ── Wind gusts ──
  const wd = J("(() => { " + reset + " setZoneHazard('wind'); zoneHazard.t = WIND_CALM - 1; updateHazards(); const dir = zoneHazard.dir; const warned = windWarn() && windStrength() === 0; let warnFrames = 0; while (!windGust()) { updateHazards(); warnFrames++; } for (let i = 0; i < 25; i++) updateHazards(); const x0 = player.x; for (let i = 0; i < 30; i++) updateHazards(); const drift = (player.x - x0) * dir; keys[dir > 0 ? 'ArrowLeft' : 'ArrowRight'] = true; const x1 = player.x; for (let i = 0; i < 30; i++) { updatePlayer(); updateHazards(); } const into = (x1 - player.x) * dir; for (const k in keys) keys[k] = false; return JSON.stringify({ warned, warnFrames, drift, into, push: WIND_PUSH, speed: MOVE_SPEED }); })()");
  ok(wd.warned && wd.warnFrames >= 45, 'wind gusts: streaks warn for ' + wd.warnFrames + ' frames before the gust, which already knows its direction');
  ok(wd.drift > 20, 'wind gusts: a gust pushes you sideways (' + Math.round(wd.drift) + 'px in 0.5s)');
  ok(wd.push < wd.speed && wd.into > 20, 'wind gusts: you can still walk into the wind (' + Math.round(wd.into) + 'px in 0.5s)');

  // ── Meteor shower ──
  const mt = J("(() => { " + reset + " setZoneHazard('meteors'); zoneHazard.next = 1; updateHazards(); const m = zoneHazard.items[0]; if (!m) return JSON.stringify({ none: true }); m.x = Math.round(player.x + PLAYER_W / 2); m.y = GROUND_Y; let frames = 1, hp0 = player.hp; zoneHazard.next = 1e9; while (!m.boom && frames < 300) { updateHazards(); frames++; } const hitDmg = hp0 - player.hp; zoneHazard.items = [{ x: Math.round(player.x + 160), y: GROUND_Y, t: 0, boom: 0 }]; hp0 = player.hp; for (let i = 0; i < METEOR_WARN + 2; i++) updateHazards(); const missDmg = hp0 - player.hp; return JSON.stringify({ frames, hitDmg, missDmg }); })()");
  ok(!mt.none && mt.frames >= 45, 'meteor shower: the landing marker flashes for ' + mt.frames + ' frames before impact');
  ok(mt.hitDmg > 0 && mt.missDmg === 0, 'meteor shower: standing on the marker hurts (' + Math.round(mt.hitDmg) + '), stepping away is safe');

  // ── Banner + HUD list the hazard ──
  const ui = J("(() => { applyLevelEvent(LEVEL_EVENTS[0]); setZoneHazard('thorns'); const labels = shownEvents().map(e => e.label); const drawn = []; const ft = ctx.fillText; ctx.fillText = function (t) { drawn.push(String(t)); return ft.apply(this, arguments); }; try { gameState = 'playing'; drawEventHUDBadge(); eventBannerTimer = 100; drawEventBanner(); } finally { ctx.fillText = ft; } applyLevelEvent(null); return JSON.stringify({ labels, drawn }); })()");
  ok(ui.labels.length === 2 && /THORN/.test(ui.labels[1]), 'the hazard is listed after the event: ' + ui.labels.join(' + '));
  ok(ui.drawn.filter(t => /THORN/.test(t)).length >= 2 && ui.drawn.some(t => /EVENT \+ ZONE HAZARD/.test(t)), 'the level banner and the HUD both show the hazard');

  // ── Saved with the level: pausing / reloading never re-rolls it ──
  E("setZoneHazard('geysers'); zoneHazard.items[0].t = 77; gameState = 'playing'; saveLevelProgress();");
  await go('game.html');
  ok(f.contentWindow.eval("zoneHazard && zoneHazard.id === 'geysers' && zoneHazard.items[0].t === 77 && /GEYSER/.test(zoneHazard.label)"), 'the hazard and its timers are saved with the level and come back after a reload');
  f.contentWindow.eval("zoneHazard = null; gameState = 'playing'; saveLevelProgress();");
  let stayedOff = true;
  for (let i = 0; i < 4; i++) { await go('game.html'); if (f.contentWindow.eval('zoneHazard') !== null) stayedOff = false; }
  ok(stayedOff, 'a level without a hazard stays without one after reloading (no re-roll)');

  document.getElementById('out').textContent = log.join('\n');
})().catch(e => { document.getElementById('out').textContent = log.join('\n') + '\nERROR ' + e.stack; });
`;
const harness = `<!doctype html><html><body><pre id="out">running</pre><iframe id="f" width="960" height="600"></iframe><script>${testScript}</script></body></html>`;

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
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=40000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
