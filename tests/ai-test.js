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
async function go(url) { const tag = url + '?t=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading'); await wait(300); }
const base = { riels: 0, hp: 30, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T' };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };
const active = () => JSON.parse(localStorage.getItem('activeCampaign'));

(async () => {
  localStorage.clear(); sessionStorage.clear();
  const setup = async (level) => {
    put({ ...base, level, lives: 3, hp: 170 });
    await go('game.html');
    const w = f.contentWindow;
    // Clean, controlled arena: no platforms/enemies unless a test adds them; player can't die.
    w.eval("npcs.length = 0; platforms.length = 0; bullets.length = 0; lasers.length = 0; player.maxHp = 1e9; player.hp = 1e9; player.x = 1500; player.y = GROUND_Y - PLAYER_H; player.vx = 0; camX = player.x - BASE_W / 2;");
    return w;
  };
  const step = (w, frames) => { for (let i = 0; i < frames; i++) w.eval('frameCount++; updateNPCs();'); };
  const E = (w, js) => w.eval(js);

  // 1) Speed: enemies slower than the player
  let w = await setup(5);
  ok(E(w, 'NPC_SPEED < MOVE_SPEED && BOSS_SPEED < MOVE_SPEED'), 'enemies and boss are slower than the player');

  // 2) Perching fix: enemy on a platform right above the player drops down to them
  E(w, "platforms.push({ x: 1440, y: GROUND_Y - 80, w: 160, h: 14 }); const n = makeNPC(1500); n.y = GROUND_Y - 80 - n.h; n.onGround = true; npcs.push(n); alertNPC(n, false);");
  step(w, 200);
  ok(E(w, 'npcs[0].y + npcs[0].h') === E(w, 'GROUND_Y') && Math.abs(E(w, 'centerX(npcs[0]) - playerCX()')) < 30,
     'enemy above a camping player walks off the platform and drops onto them');

  // 3) Call for help: an enemy that spots the player alerts a nearby ally, who reacts shortly after
  w = await setup(5);
  E(w, "npcs.push(makeNPC(2400), makeNPC(2600));");
  E(w, 'alertNPC(npcs[0], true)');
  const delayed = E(w, 'npcs[1].alertDelay > 0 && !npcs[1].aware');
  step(w, 40);
  ok(delayed && E(w, 'npcs[1].aware'), 'ally hears the call for help and joins a moment later');

  // 4) Low health with an ally nearby -> retreat behind it and heal
  w = await setup(5);
  E(w, "const a = makeNPC(1600), b = makeNPC(1700); a.hp = a.maxHp * 0.2; npcs.push(a, b); alertNPC(a, false); alertNPC(b, false); aiThink(a);");
  ok(E(w, 'npcs[0].state') === 'retreat', 'hurt enemy with an ally nearby retreats');
  const hp0 = E(w, 'npcs[0].hp'), x0 = E(w, 'centerX(npcs[0])');
  step(w, 120);
  let closest = Infinity; for (let i = 0; i < 120; i++) { step(w, 1); closest = Math.min(closest, E(w, 'Math.abs(centerX(npcs[0]) - playerCX())')); }
  ok(E(w, 'npcs[0].hp') > hp0 && closest >= Math.min(x0 - 1509, 150) - 4, 'retreating enemy heals and never closes in on the player (closest ' + Math.round(closest) + 'px)');

  // 5) Low health and alone -> desperate charge
  w = await setup(5);
  E(w, "const a = makeNPC(1650); a.hp = a.maxHp * 0.2; npcs.push(a); alertNPC(a, false); aiThink(a);");
  ok(E(w, 'npcs[0].state') === 'desperate', 'hurt enemy with no allies goes desperate (charges)');

  // 6) Alone but backup coming -> hold back and wait
  w = await setup(5);
  E(w, "const a = makeNPC(1700), b = makeNPC(2150); npcs.push(a, b); alertNPC(a, false); alertNPC(b, false); aiThink(a);");
  ok(E(w, 'npcs[0].state') === 'regroup', 'lone enemy waits for incoming backup');
  E(w, 'player.reloadTimer = 60; aiThink(npcs[0]);');
  ok(E(w, 'npcs[0].state') === 'attack', '...but attacks immediately when the player is reloading');

  // 7) Flanking: at a mid level, a group coming from one side sends someone around
  w = await setup(30);
  E(w, "npcs.push(makeNPC(1650), makeNPC(1700), makeNPC(1760)); npcs.forEach(n => alertNPC(n, false));");
  step(w, 260);
  ok(E(w, 'npcs.some(n => centerX(n) < playerCX())'), 'flanker gets to the other side of the player (pincer)');

  // 8) No flanking at level 1 unless the player camps
  w = await setup(1);
  E(w, "npcs.push(makeNPC(1650), makeNPC(1700)); npcs.forEach(n => alertNPC(n, false)); updateAIDirector();");
  ok(!E(w, 'npcs.some(n => n.role === "flank")'), 'level 1: no flanking normally');
  E(w, 'ai.campFrames = 999; updateAIDirector();');
  ok(E(w, 'npcs.some(n => n.role === "flank")'), 'level 1: camping triggers flanking');

  // 9) Tank cover: a regular enemy stays behind a tank that's leading the push
  w = await setup(5);
  E(w, "const t = makeNPC(1800, false, null, null, true), a = makeNPC(1900); npcs.push(t, a); alertNPC(t, false); alertNPC(a, false);");
  step(w, 30);
  ok(E(w, 'centerX(npcs[1]) > centerX(npcs[0])'), 'regular enemy stays behind the tank');

  // 10) Dodging: with a lucky roll, an enemy jumps an incoming bullet; tanks never do
  w = await setup(60);
  E(w, "const a = makeNPC(1700); npcs.push(a); alertNPC(a, false); a.onGround = true; a.jumpCooldown = 0; bullets.push({ x: 1640, y: a.y + a.h / 2, dx: 1, dy: 0, alive: true }); const r = Math.random; Math.random = () => 0; aiDodge(a); Math.random = r;");
  ok(E(w, 'npcs[0].vy < 0'), 'enemy jumps over an incoming bullet');
  E(w, "const t = makeNPC(1900, false, null, null, true); npcs.push(t); alertNPC(t, false); t.onGround = true; bullets.push({ x: 1840, y: t.y + t.h / 2, dx: 1, dy: 0, alive: true }); const r = Math.random; Math.random = () => 0; aiDodge(t); Math.random = r;");
  ok(E(w, 'npcs[1].vy') === 0, 'tanks do not dodge');

  // 11) Boss phases: summons minions and winds up charges
  w = await setup(10);
  E(w, "const bz = makeNPC(1800, true, 400, 5); npcs.push(bz); alertNPC(bz, false); bz.hp = bz.maxHp * 0.55;");
  step(w, 2);
  ok(E(w, 'npcs.length') === 3 && E(w, 'npcs[0].phase') === 2, 'boss below 60%: phase 2, calls 2 minions');
  step(w, 70);
  ok(E(w, 'npcs[0].windup > 0 || npcs[0].chargeTimer > 0 || npcs[0].attackTimer > 0'), 'boss winds up a charge attack');
  E(w, 'npcs[0].hp = npcs[0].maxHp * 0.25;'); step(w, 2);
  ok(E(w, 'npcs.length') === 6 && E(w, 'npcs[0].phase') === 3, 'boss below 30%: phase 3, calls 3 more');

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
