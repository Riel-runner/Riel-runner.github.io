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
  put({ ...base, level: 6, lives: 3, hp: 170 });
  await go('game.html');
  let w = f.contentWindow, E = js => w.eval(js);
  const before = JSON.parse(E("(() => { player.x = 1234; player.y = GROUND_Y - PLAYER_H; player.hp = 77; player.lives = 2; player.bullets = 7; player.dashCooldown = 200; player.speedMult = 2; player.speedPowerTimer = 400; npcs[0].hp = 0; npcs[0].dead = true; npcs[1].x = 2222; npcs[1].hp = 3; npcs[1].aware = true; npcs[1].state = 'retreat'; powerups.forEach(p => p.collected = true); return JSON.stringify({ plats: platforms.map(p => Math.round(p.x) + ':' + Math.round(p.y)).join(','), lasers: lasers.length, n: npcs.length }); })()"));
  E('PAUSE_ITEMS[2].action()'); // QUIT TO MENU
  await until(() => /index\.html/.test(f.contentWindow.location.href));
  const active = JSON.parse(localStorage.getItem('activeCampaign'));
  const slot = JSON.parse(localStorage.getItem('rielrunner_campaigns'))[0];
  ok(active.levelState && slot.levelState && slot.levelState.player.x === 1234, 'quitting saves the level to the active save and the campaign slot');

  // Load it again like level select does
  localStorage.setItem('activeCampaign', JSON.stringify(slot));
  await go('game.html');
  w = f.contentWindow;
  const after = JSON.parse(w.eval("JSON.stringify({ x: player.x, hp: player.hp, lives: player.lives, bullets: player.bullets, dash: player.dashCooldown, spd: player.speedMult + '/' + player.speedPowerTimer, n0dead: npcs[0].dead, n1: Math.round(npcs[1].x) + '/' + npcs[1].hp + '/' + npcs[1].state, plats: platforms.map(p => Math.round(p.x) + ':' + Math.round(p.y)).join(','), lasers: lasers.length, n: npcs.length, pw: powerups.every(p => p.collected), gs: gameState, toast: toastMsg })"));
  ok(after.x === 1234 && after.hp === 77 && after.lives === 2 && after.bullets === 7 && after.dash === slot.levelState.player.dashCooldown && after.spd === '2/' + slot.levelState.player.speedPowerTimer, 'player restored: position, HP, lives, ammo, dash cooldown, speed boost');
  ok(after.n0dead && after.n1 === Math.round(slot.levelState.npcs[1].x) + '/3/' + slot.levelState.npcs[1].state && after.n === before.n, 'enemies restored: killed stay dead, others keep position, HP and AI state');
  ok(after.plats === before.plats && after.lasers === before.lasers && after.pw, 'same platforms, lasers and collected power-ups');
  ok(after.gs === 'paused' && after.toast === 'PROGRESS RESTORED', 'resumes paused with a PROGRESS RESTORED message');

  // Settings round trip also keeps the level
  w.eval("player.x = 1500; PAUSE_ITEMS[1].action();");
  await until(() => /settings\.html/.test(f.contentWindow.location.href));
  await go('game.html');
  ok(f.contentWindow.eval('player.x') === 1500, 'opening Settings and coming back keeps the level');

  // Autosave every 5 seconds while playing
  w = f.contentWindow;
  w.eval("gameState = 'playing'; player.x = 1777; frameCount = AUTOSAVE_FRAMES - 1; loop();");
  ok(JSON.parse(localStorage.getItem('activeCampaign')).levelState.player.x === 1777, 'autosaves while playing');

  // Finishing the level clears the saved state everywhere
  w.eval("npcs.forEach(n => { n.dead = true; n.hp = 0; }); gameState = 'level_clear'; proceedToShop();");
  const a2 = JSON.parse(localStorage.getItem('activeCampaign')), s2 = JSON.parse(localStorage.getItem('rielrunner_campaigns'))[0];
  ok(a2.levelState === null && s2.levelState === null, 'clearing the level wipes the saved level (active + slot)');

  // A saved level from a different level number is ignored (fresh level)
  put({ ...base, level: 8, lives: 3, hp: 170, levelState: { ...slot.levelState, level: 7 } });
  await go('game.html');
  ok(f.contentWindow.eval('player.x') !== 1234 && f.contentWindow.eval('gameState') === 'playing', 'stale save from another level is ignored');

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
