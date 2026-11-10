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
  const counts = {};
  for (const level of [1, 25, 45, 99]) {
    put({ ...base, level, lives: 3, hp: 170 });
    await go('game.html');
    const w = f.contentWindow;
    const r = JSON.parse(w.eval("(() => { let bad = [], counts = []; for (let k = 0; k < 30; k++) { platforms.length = 0; platforms.push(...generatePlatforms()); generateLasers(); counts.push(lasers.length); const xs = lasers.map(l => l.x).sort((a, b) => a - b); for (const l of lasers) { if (l.x < 600) bad.push('too close to start ' + Math.round(l.x)); if (l.kind === 'ground' && (l.w !== GROUND_LASER_W || l.y !== GROUND_Y - 20)) bad.push('ground laser size'); if (l.kind === 'platform') { const p = platforms.find(p => Math.abs(p.y - 12 - l.y) < 0.01 && l.x >= p.x - 0.5 && l.x + l.w <= p.x + p.w + 0.5); if (!p) bad.push('platform laser not on a platform'); else if (l.w > p.w * 0.41 || (Math.abs(l.x - p.x) > 0.5 && Math.abs(l.x + l.w - p.x - p.w) > 0.5)) bad.push('platform laser not at one end / too wide'); } } for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 250) bad.push('lasers bunched ' + Math.round(xs[i] - xs[i - 1])); const phases = new Set(lasers.map(l => l.t)); if (phases.size !== lasers.length) bad.push('not staggered'); } return JSON.stringify({ bad: [...new Set(bad)].slice(0, 4), min: Math.min(...counts), max: Math.max(...counts) }); })()"));
    ok(r.bad.length === 0, 'level ' + level + ': 30 layouts follow the placement rules' + (r.bad.length ? ' — ' + r.bad.join('; ') : ''));
    counts[level] = r.min + '-' + r.max;
  }
  ok(counts[1] === '2-2' && counts[99] === '5-5', 'laser count grows with the stage: lvl1 ' + counts[1] + ', lvl25 ' + counts[25] + ', lvl45 ' + counts[45] + ', lvl99 ' + counts[99]);

  // Timing + damage
  put({ ...base, level: 5, lives: 3, hp: 170 });
  await go('game.html');
  const w = f.contentWindow, E = js => w.eval(js);
  const tl = JSON.parse(E("(() => { npcs.length = 0; lasers.length = 0; player.maxHp = 1000; player.hp = 1000; const l = { kind: 'ground', x: 1000, y: GROUND_Y - 20, w: GROUND_LASER_W, h: 6, t: 0, lastDamageFrame: -999 }; lasers.push(l); const states = []; for (let f = 0; f < LASER_CYCLE; f++) { states.push(laserOn(l) ? 'on' : laserWarn(l) ? 'warn' : 'off'); updateLasers(); } const on = states.filter(s => s === 'on').length, warn = states.filter(s => s === 'warn').length, off = states.length - on; player.x = 1010; player.y = GROUND_Y - PLAYER_H; player.dead = false; l.t = LASER_ON_FRAMES + 10; let hp0 = player.hp; for (let f = 0; f < 60; f++) { frameCount++; updateLasers(); } const offDmg = hp0 - player.hp; l.t = 0; hp0 = player.hp; for (let f = 0; f < 60; f++) { frameCount++; updateLasers(); } const onDmg = hp0 - player.hp; return JSON.stringify({ on, off, warn, offDmg, onDmg, src: typeof drawWorld === 'function' && !drawWorld.toString().includes(\"'END'\") }); })()"));
  ok(tl.on === 300 && tl.off === 180, 'cycle: ON 5s (' + tl.on + ' frames), OFF 3s (' + tl.off + ' frames)');
  ok(tl.warn === 45, 'flickers as a warning for the last 0.75s before switching back on');
  ok(tl.offDmg === 0 && tl.onDmg > 0, 'no damage while off (' + tl.offDmg + '), damage while on (' + Math.round(tl.onDmg) + ')');
  ok(tl.src, 'green END marker removed from the level');

  // Timers survive save/resume
  E("lasers[0].t = 123; saveLevelProgress();");
  await go('game.html');
  ok(f.contentWindow.eval('lasers[0].t') === 123, 'laser timing is saved with the level and resumes in step');

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
