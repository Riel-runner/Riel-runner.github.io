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

  // Normal level 5, cleared with 2 lives and 30 HP
  put({ ...base, level: 5, lives: 2 });
  await go('game.html');
  f.contentWindow.eval("player.hp = 30; player.lives = 2; gameState = 'level_clear'; proceedToShop();");
  let a = active();
  ok(a.hp === 170 && a.lives === 2, 'normal level clear: HP healed to max (' + a.hp + '), lives kept (' + a.lives + ')');
  await until(() => /shop\.html/.test(f.contentWindow.location.href) && f.contentDocument.readyState !== 'loading'); await wait(400);
  const hearts = f.contentDocument.getElementById('lives-display').textContent;
  ok(hearts === '♥♥♡', 'shop shows 2 full + 1 empty heart (' + hearts + ')');
  ok(f.contentDocument.getElementById('hp-display').textContent === '170 / 170', 'shop shows full HP');
  f.contentWindow.continueToGame(); a = active();
  ok(a.level === 6 && a.lives === 2 && a.hp === 170, 'continue: level 6, still 2 lives (not reset), full HP');

  // Boss level 10, cleared with 1 life
  put({ ...base, level: 10, lives: 1 });
  await go('game.html');
  f.contentWindow.eval("player.hp = 12; player.lives = 1; gameState = 'boss_slayed'; proceedToShop();");
  a = active();
  ok(a.lives === 3 && a.hp === a.maxHp, 'boss level clear: lives restored to 3 (' + a.lives + '), HP full');

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
