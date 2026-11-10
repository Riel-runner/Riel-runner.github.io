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
  for (const level of [1, 30, 50, 20, 25, 55, 85]) {
    localStorage.clear(); sessionStorage.clear();
    put({ ...base, level, lives: 3, hp: 170, gunDamage: 12 });
    await go('game.html');
    const w = f.contentWindow, E = js => w.eval(js);
    E('player.maxHp = 1e9; player.hp = 1e9; mouseDown = true;');
    let err = '';
    try {
      E("for (let i = 0; i < 2000; i++) { frameCount++; if (gameState === 'playing') { updatePlayer(); updateBullets(); updateNPCs(); updateLasers(); } if (i % 300 === 0) player.x = Math.min(LEVEL_WIDTH - 200, player.x + 600); camX = Math.max(0, player.x - BASE_W / 2); }");
    } catch (e) { err = e.message; }
    const r = JSON.parse(E("JSON.stringify({ n: npcs.length, dead: npcs.filter(n => n.dead).length, aware: npcs.filter(n => n.aware).length, states: [...new Set(npcs.filter(n => !n.dead).map(n => n.state))].join('/'), bad: npcs.filter(n => !isFinite(n.x) || !isFinite(n.y) || n.y > GROUND_Y || n.x < 0 || n.x > LEVEL_WIDTH).length, gs: gameState })"));
    ok(!err && r.bad === 0, 'level ' + level + ': 2000 frames OK' + (err ? ' ERROR ' + err : '') + ' | enemies ' + r.n + ', killed ' + r.dead + ', aware ' + r.aware + ', states [' + r.states + '], state ' + r.gs);
  }
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
