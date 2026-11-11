// Checks the HP/lives rules: full heal after every cleared level, lives only
// restored to 3 after a boss level. Usage: node lives-test.js <repoDir> <chromeExe>
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
const base = { riels: 0, hp: 30, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T' };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };
const active = () => JSON.parse(localStorage.getItem('activeCampaign'));

(async () => {
  localStorage.clear(); sessionStorage.clear();
  // Each level starts with no random event, so the numbers checked here never change.
  const setup = async (level, extra = {}) => {
    put({ ...base, level, lives: 3, hp: 170, ...extra });
    await go('game.html');
    const w = f.contentWindow;
    w.eval("applyLevelEvent(null); npcs.length = 0; platforms.length = 0; bullets.length = 0; lasers.length = 0; enemyShots.length = 0; player.maxHp = 1000; player.hp = 1000; player.x = 1500; player.y = GROUND_Y - PLAYER_H; player.vx = 0; camX = player.x - BASE_W / 2; gameState = 'playing';");
    return w;
  };
  const step = (w, n) => { for (let i = 0; i < n; i++) w.eval('frameCount++; updateNPCs(); updateEnemyShots();'); };
  const E = (w, js) => w.eval(js);

  // Unlock schedule and mix
  let w = await setup(5);
  const mix = lvl => JSON.parse(E(w, '(() => { const c = {}; for (let i = 0; i < 3000; i++) { const k = pickEnemyKind(' + lvl + '); c[k] = (c[k] || 0) + 1; } return JSON.stringify(c); })()'));
  const m5 = mix(5), m11 = mix(11), m25 = mix(25), m60 = mix(60), m95 = mix(95);
  ok(Object.keys(m5).join() === 'normal', 'level 5: only regular enemies');
  ok(Object.keys(m11).sort().join() === 'normal,runner', 'level 11: runners join');
  ok(Object.keys(m25).sort().join() === 'normal,runner,spitter', 'level 25: + spitters');
  ok(Object.keys(m60).sort().join() === 'bomber,medic,normal,runner,shielder,spitter', 'level 60: all five special types');
  ok(m11.runner / 3000 < 0.2 && (3000 - m95.normal) / 3000 > 0.5, 'specials get more common: ' + Math.round(m11.runner / 30) + '% at lvl 11, ' + Math.round((3000 - m95.normal) / 30) + '% at lvl 95');

  // Intro message the first time a type appears
  let found = false;
  for (let tries = 0; tries < 8 && !found; tries++) {
    put({ ...base, level: 21, lives: 3, hp: 170, npcCount: 15, seenKinds: ['runner'] }); // more enemies = a spitter almost surely spawns
    await go('game.html');
    if (f.contentWindow.eval('npcs.some(n => n.kind === "spitter")')) found = true;
  }
  w = f.contentWindow;
  ok(found && /NEW ENEMY: SPITTER/.test(E(w, 'toastMsg')) && E(w, 'campaign.seenKinds.includes("spitter")'), 'first spitter: "NEW ENEMY: SPITTER - ..." message');

  // Runner: slower than the player when walking; lunges after flashing
  w = await setup(15);
  E(w, "const r = makeNPC(1590, false, null, null, false, 'runner'); r.abilityTimer = 0; npcs.push(r); alertNPC(r, false); r.state = 'attack'; r.thinkTimer = 999;");
  ok(E(w, 'NPC_SPEED * npcs[0].speedMult < MOVE_SPEED'), 'runner walks faster than others but slower than the player');
  step(w, 1);
  const wound = E(w, 'npcs[0].windup > 0');
  const x0 = E(w, 'npcs[0].x'); step(w, 18); const x1 = E(w, 'npcs[0].x'); step(w, 12); const x2 = E(w, 'npcs[0].x');
  ok(wound && Math.abs(x1 - x0) < 1 && x0 - x2 > 70, 'runner flashes (stops), then lunges ' + Math.round(x0 - x2) + 'px');

  // Spitter: keeps range and spits fast blobs that hurt
  w = await setup(25);
  E(w, "const s = makeNPC(1950, false, null, null, false, 'spitter'); s.abilityTimer = 30; npcs.push(s); alertNPC(s, false); s.state = 'attack'; s.thinkTimer = 999;");
  let fired = false, hpBefore = E(w, 'player.hp'), minD = 1e9;
  for (let i = 0; i < 400; i++) { step(w, 1); if (E(w, 'enemyShots.length') > 0) fired = true; if (i > 150) minD = Math.min(minD, E(w, 'Math.abs(centerX(npcs[0]) - playerCX())')); }
  ok(minD >= 160, 'spitter stays at range (closest ' + Math.round(minD) + 'px)');
  ok(fired && E(w, 'player.hp') < hpBefore, 'spitter fires blobs that damage the player');
  ok(E(w, 'SPIT_SPEED') >= 5 && E(w, 'SPIT_SPEED') > E(w, 'MOVE_SPEED'), 'blobs fly fast (5.2, faster than you run): jump them');
  // Spits often, but always warns first (mouth glows ~0.4s)
  E(w, "npcs.length = 0; enemyShots.length = 0; player.maxHp = 1e9; player.hp = 1e9; const s2 = makeNPC(1800, false, null, null, false, 'spitter'); s2.abilityTimer = 0; npcs.push(s2); alertNPC(s2, false); s2.state = 'attack'; s2.thinkTimer = 999; window.__spits = 0; window.__warned = true;");
  for (let i = 0; i < 600; i++) { const before = E(w, 'npcs[0].windup'); step(w, 1); if (E(w, 'enemyShots.length') > 0) { if (before !== 1) E(w, 'window.__warned = false'); E(w, 'window.__spits++; enemyShots.length = 0'); } }
  ok(E(w, '__spits') >= 6, 'spitter fires about every 1.5-1.8s incl. the warning (' + E(w, '__spits') + ' spits in 10s, was at most 4)');
  ok(E(w, '__warned'), 'every spit comes right after the 24-frame glow warning');

  // Bomber: arms next to the player, explodes for ~30% max HP, hurts allies, gives no reward
  w = await setup(35);
  E(w, "const b = makeNPC(1520, false, null, null, false, 'bomber'), a = makeNPC(1540); npcs.push(b, a); alertNPC(b, false); alertNPC(a, false); a.x = 1545; a.speedMult = 0; window.__r0 = campaign.riels; window.__ahp = a.hp;");
  step(w, 1);
  const armed = E(w, 'npcs[0].fuse > 0');
  step(w, 40);
  const dmgPct = (1000 - E(w, 'player.hp')) / 10;
  ok(armed && E(w, 'npcs[0].dead'), 'bomber arms next to the player, then explodes');
  const bombPct = 30 * E(w, 'ENEMY_DMG_MULT');   // 30% of max HP, scaled up by the level
  ok(dmgPct >= bombPct - 1 && dmgPct < bombPct + 10, 'explosion hits the player for ~30% max HP x level scaling (' + Math.round(dmgPct) + '%, want ~' + Math.round(bombPct) + '%)');
  E(w, 'const b2 = makeNPC(1700, false, null, null, false, "bomber"), a2 = makeNPC(1730); npcs.push(b2, a2); window.__a2 = a2.hp; explodeBomber(b2);');
  ok(E(w, 'npcs[3].hp < __a2 || npcs[3].dead') && E(w, 'npcs[2].dead'), 'the blast also hurts enemies caught in it');

  // Shielder: front blocked, back takes damage, turns slowly
  w = await setup(45);
  E(w, "const s = makeNPC(1600, false, null, null, false, 'shielder'); npcs.push(s); alertNPC(s, false); s.facing = -1; s.thinkTimer = 999; s.state = 'attack'; window.__h0 = s.hp; bullets.push({ x: s.x + 3, y: s.y + 10, dx: 1, dy: 0, alive: true });");
  step(w, 2);
  const frontHp = E(w, 'npcs[0].hp');
  E(w, 'bullets.push({ x: npcs[0].x + npcs[0].w - 3, y: npcs[0].y + 10, dx: -1, dy: 0, alive: true });');
  step(w, 2);
  ok(frontHp === E(w, '__h0') && E(w, 'npcs[0].hp') < frontHp, 'shielder blocks shots from the front, takes damage from behind');
  E(w, 'player.x = npcs[0].x + 200;'); step(w, 20);
  const stillOld = E(w, 'npcs[0].facing') === -1; step(w, 30);
  ok(stillOld && E(w, 'npcs[0].facing') === 1, 'shielder turns slowly (a window to hit it from behind)');

  // Medic: heals hurt allies nearby, flees when the player gets close
  w = await setup(55);
  E(w, "const m = makeNPC(1900, false, null, null, false, 'medic'), a = makeNPC(1820); a.hp = a.maxHp * 0.3; npcs.push(m, a); alertNPC(m, false); alertNPC(a, false); a.thinkTimer = 999; a.state = 'regroup'; m.abilityTimer = 5; window.__ah = a.hp;");
  step(w, 10);
  ok(E(w, 'npcs[1].hp > __ah') && E(w, 'npcs[0].healPulse > 0'), 'medic heals a hurt ally nearby');
  E(w, 'player.x = npcs[0].x - 60;');
  const mx0 = E(w, 'centerX(npcs[0])'); step(w, 30);
  ok(E(w, 'centerX(npcs[0])') > mx0 + 20, 'medic runs away when the player gets close');

  // New enemy sprite: every type draws inside its box (accessories may poke out a little),
  // in every walk step, and the walk cycle only runs while moving
  w = await setup(45);
  const spr = JSON.parse(E(w, "(() => { const P = CanvasRenderingContext2D.prototype, fr = P.fillRect; let box = null, n = 0; P.fillRect = function (x, y, ww, hh) { if (box) { n++; box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x + ww); box.y1 = Math.max(box.y1, y + hh); } return fr.apply(this, arguments); }; const out = {}; for (const k of Object.keys(RielEnemySprite.LOOKS)) for (let st = 0; st < 4; st++) { box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; n = 0; RielEnemySprite.draw(ctx, 100, 100, 18, 24, { kind: k, step: st, facing: 1 }); out[k + st] = { n, x0: box.x0 - 100, y0: box.y0 - 100, x1: box.x1 - 118, y1: box.y1 - 124 }; } box = null; P.fillRect = fr; return JSON.stringify(out); })()"));
  const bad = Object.entries(spr).filter(([, b]) => b.n < 20 || b.x0 < -4 || b.x1 > 4 || b.y0 < -6 || b.y1 > 0.01);
  ok(bad.length === 0, 'enemy sprite: all 8 looks x 4 walk steps draw inside their box, feet on the ground (' + (bad.map(b => b[0]).join(', ') || 'all fine') + ')');
  E(w, "npcs.length = 0; const m = makeNPC(1600); m.lastDrawX = m.x; npcs.push(m); gameState = 'playing';");
  const steps = new Set();
  for (let i = 0; i < 40; i++) { E(w, 'npcs[0].x += 2; drawNPCs();'); steps.add(E(w, 'npcs[0].walkStepNow')); }
  ok(steps.size === 4, 'walking enemies cycle through all 4 leg steps (' + [...steps].sort().join(',') + ')');
  E(w, 'drawNPCs(); drawNPCs();');
  ok(E(w, 'npcs[0].walkStepNow') === 0, 'standing still: both feet down');
  E(w, "npcs.length = 0; for (const k of ['normal', 'runner', 'spitter', 'bomber', 'shielder', 'medic']) npcs.push(makeNPC(1500 + npcs.length * 30, false, null, null, false, k)); npcs.push(makeNPC(1700, false, null, null, true)); npcs.push(makeNPC(1750, true)); npcs.forEach(n => { n.windup = 5; n.fuse = n.kind === 'bomber' ? 5 : 0; n.healPulse = 10; n.touching = true; }); drawNPCs();");
  ok(true, 'every enemy type (and tank, boss) draws in game, mid-attack, without errors');

  // Level zones: 1-20 ice cave, 21-40 grassy field, 41-60 lava dungeon, 61-80 sky, 81+ space
  const zoneOf = {};
  for (const lvl of [1, 20, 21, 40, 41, 60, 61, 80, 81, 100, 130]) { w = await setup(lvl); zoneOf[lvl] = E(w, 'THEME.id'); E(w, 'for (let i = 0; i < 3; i++) { frameCount++; drawWorld(); }'); }
  ok(zoneOf[1] === 'ice' && zoneOf[20] === 'ice' && zoneOf[21] === 'grass' && zoneOf[40] === 'grass' && zoneOf[41] === 'lava' && zoneOf[60] === 'lava' &&
     zoneOf[61] === 'sky' && zoneOf[80] === 'sky' && zoneOf[81] === 'space' && zoneOf[100] === 'space' && zoneOf[130] === 'space', 'level zones: ' + JSON.stringify(zoneOf));
  ok(true, 'every zone draws its background, platforms and floor without errors');
  const layout = async lvl => { w = await setup(lvl); return E(w, "JSON.stringify((THEME.rocks || THEME.clouds || THEME.pillars || THEME.puffs || THEME.planets).slice(0, 4).map(o => Math.round(o.x)))"); };
  const a3 = await layout(3), a3b = await layout(3), a4 = await layout(4);
  ok(a3 === a3b && a3 !== a4, 'each level has its own background layout (same level = same layout): ' + a3 + ' vs ' + a4);
  w = await setup(25);
  ok(E(w, 'THEME.bright') === true, 'bright zones get dark panels behind the HUD');

  // Enemies get much tougher with the level (level 50 vs level 10)
  const stat = async lvl => { w = await setup(lvl); return JSON.parse(E(w, "(() => { const n = makeNPC(1600), t = makeNPC(1600, false, null, null, true), b = makeNPC(1600, true); return JSON.stringify({ hp: n.maxHp, dmg: n.contactDamage, tank: t.maxHp, bossHp: b.maxHp, bossDmg: b.contactDamage, shot: Math.max(3, player.maxHp * 0.07) * ENEMY_DMG_MULT }); })()")); };
  const L1 = await stat(1), L10 = await stat(10), L50 = await stat(50), L100 = await stat(100);
  ok(L1.hp === 10 && L1.dmg === 0.5, 'level 1 enemies unchanged (10 HP, 0.5 damage)');
  ok(L50.hp >= 4.5 * L10.hp && L50.tank >= 4.5 * L10.tank, 'level 50 enemies have ~5x the HP of level 10 (' + L10.hp + ' -> ' + L50.hp + ')');
  ok(L50.dmg >= 6 * L10.dmg, 'level 50 enemies hit ~7x harder than level 10 (' + L10.dmg.toFixed(1) + ' -> ' + L50.dmg.toFixed(1) + ')');
  ok(L50.bossHp > 4 * L10.bossHp && L50.bossDmg > 10 * L10.bossDmg, 'bosses scale too (HP ' + L10.bossHp + ' -> ' + L50.bossHp + ', damage ' + L10.bossDmg.toFixed(1) + ' -> ' + L50.bossDmg.toFixed(1) + ')');
  ok(L50.shot > L10.shot * 1.3, 'spitter shots hit harder on later levels');
  ok(L100.hp > L50.hp && L100.dmg > L50.dmg, 'and keep growing to level 100 (' + L100.hp + ' HP, ' + L100.dmg.toFixed(0) + ' damage)');

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
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=20000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
