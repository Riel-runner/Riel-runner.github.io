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
  put({ ...base, level: 5, lives: 3, hp: 170 });
  await go('game.html');
  const w = f.contentWindow, E = js => w.eval(js);
  E("window.measureJump = function (mult) { platforms.length = 0; lasers.length = 0; npcs.length = 0; player.x = 500; player.y = GROUND_Y - PLAYER_H; player.vy = 0; player.onGround = true; player.dead = false; player.jumpMult = mult; player.jumpPowerTimer = mult > 1 ? 999 : 0; keys.ArrowUp = true; let top = player.y; for (let i = 0; i < 120; i++) { updatePlayer(); keys.ArrowUp = false; top = Math.min(top, player.y); } return (GROUND_Y - PLAYER_H) - top; };");
  const h1 = E('measureJump(1)'), h15 = E('measureJump(JUMP_POWER_MULT)');
  ok(h1 > 75 && h1 < 90, 'normal jump is lower: ' + h1.toFixed(1) + 'px (was ~131px)');
  ok(Math.abs(h15 / h1 - 1.5) < 0.08, 'jump boost = 1.5x height: ' + h15.toFixed(1) + 'px (' + (h15 / h1).toFixed(2) + 'x)');
  ok(E('SPEED_POWER_MULT') === 2, 'speed boost is 2x');

  // Enemy jump height (same physics as in updateNPCs)
  const nh = E("(() => { let vy = NPC_JUMP_FORCE, y = 0, top = 0; for (let i = 0; i < 120; i++) { vy += GRAVITY * 0.9; y += vy; top = Math.min(top, y); if (y > 0) break; } return -top; })()");
  ok(nh < h1 && nh > E('PLATFORM_MAX_RISE'), 'enemy jump (' + nh.toFixed(1) + 'px) is lower than the player\'s but still reaches every platform');

  // The highest possible platform is reachable: jump from under its edge and land on top
  const landed = E("(() => { measureJump(1); platforms.length = 0; const p = { x: 520, y: GROUND_Y - PLATFORM_MAX_RISE, w: 120, h: 14 }; platforms.push(p); player.x = 470; player.y = GROUND_Y - PLAYER_H; player.vy = 0; player.onGround = true; player.jumpMult = 1; keys.ArrowUp = true; keys.ArrowRight = true; for (let i = 0; i < 60; i++) { updatePlayer(); keys.ArrowUp = false; if (i === 25) keys.ArrowRight = false; } keys.ArrowRight = false; return player.onGround && Math.abs(player.y + PLAYER_H - p.y) < 1; })()");
  ok(landed, 'player can jump onto the highest possible platform (' + E('PLATFORM_MAX_RISE') + 'px)');

  // Generated levels never contain an unreachable platform
  const worst = E("(() => { let worst = 0; for (let k = 0; k < 50; k++) for (const p of generatePlatforms()) worst = Math.max(worst, GROUND_Y - p.y); return worst; })()");
  ok(worst <= E('PLATFORM_MAX_RISE') && worst < h1 - 8, '50 random levels: highest platform ' + worst.toFixed(1) + 'px < jump ' + h1.toFixed(1) + 'px');

  // Vertical laser beams (platform edge to floor) are low enough to jump over
  const lh = E("(() => { let tallest = 0; for (let k = 0; k < 50; k++) { platforms.length = 0; platforms.push(...generatePlatforms()); generateLasers(); for (const l of lasers) tallest = Math.max(tallest, l.h); } return tallest; })()");
  ok(lh > 0 && lh < h1 - 8, 'tallest laser beam ' + lh.toFixed(0) + 'px < jump height ' + h1.toFixed(1) + 'px (can jump over)');

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
