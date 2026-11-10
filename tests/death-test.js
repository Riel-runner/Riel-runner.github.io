// End-to-end check of the death screen + fallen campaigns, in headless Chrome.
// Usage: node death-test.js <repoDir> <chromeExe> [shotDir]
//   - no shotDir: runs assertions, prints results
//   - shotDir:    also saves screenshots of the death screen and the details popup
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const [repo, chrome, shotDir] = process.argv.slice(2);

// Shared harness: seeds two campaigns, plays slot 1 and loses the last life.
const harness = (mode) => `<!doctype html><html><head><style>
html,body{margin:0;height:100%;background:#000} iframe{border:0;width:100vw;height:100vh;display:block}
#out{position:fixed;left:-9999px}</style></head><body><pre id="out">running</pre><iframe id="f"></iframe>
<script>
const f = document.getElementById('f'), log = [];
const ok = (cond, msg) => log.push((cond ? 'PASS ' : 'FAIL ') + msg);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function go(url) {
  const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random();
  const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading', 8000);
  await wait(400);
}
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }

(async () => {
  localStorage.clear(); sessionStorage.clear();
  const base = { level: 23, riels: 40, hp: 1, maxHp: 170, lives: 1, gunDamage: 6, upgradeCount: 4,
    upgradeCost: 14, npcCount: 9, bossesBeaten: 2, createdAt: 1, lastPlayed: 1,
    enemiesKilled: 187, rielsEarned: 512, shotsFired: 900, shotsHit: 612, playTimeMs: 1534000 };
  const camps = [ { ...base, id: 1, name: 'DOOMED' }, { ...base, id: 2, name: 'ALIVE', level: 5, lives: 3 } ];
  localStorage.setItem('rielrunner_campaigns', JSON.stringify(camps));
  localStorage.setItem('activeCampaignIdx', '0');
  localStorage.setItem('activeCampaign', JSON.stringify(camps[0]));

  // 1) Play slot 1 and lose the last life.
  await go('game.html');
  const w = f.contentWindow, d = () => f.contentDocument;
  ok(d().getElementById('death-screen').hidden, 'death screen hidden while playing');
  w.killPlayer();
  // Headless Chrome doesn't run animation frames here, so step the real overlay code by hand.
  ok(w.eval('gameState') === 'game_over', 'game state is game_over after last life');
  for (let i = 0; i < 59; i++) w.drawOverlay();
  ok(d().getElementById('death-screen').hidden, 'death screen waits ~1s (still hidden after 59 frames)');
  for (let i = 0; i < 5; i++) w.drawOverlay();
  ok(await until(() => !d().getElementById('death-screen').hidden), 'death screen appears after last life');
  await wait(800);
  const ds = d().getElementById('death-screen');
  ok(d().querySelectorAll('#death-screen a, #death-screen button').length === 1, 'death screen has exactly one button');
  ok(/RETURN TO TITLE SCREEN/.test(ds.textContent) && d().getElementById('death-title-btn').getAttribute('href') === 'index.html', 'button returns to title (index.html)');
  ok(d().getElementById('death-campaign').textContent === 'DOOMED', 'shows campaign name');
  const txt = ds.textContent;
  ok(/LEVEL REACHED\\s*23 \\/ 100/.test(txt), 'level reached counter = 23');
  ok(/ENEMIES KILLED\\s*187/.test(txt), 'enemies killed = 187');
  ok(/ACCURACY\\s*68%/.test(txt) && /TIME PLAYED\\s*25:3\\d/.test(txt), 'accuracy + time played shown');
  ok(d().querySelectorAll('.rs-zone').length === 10 && d().querySelectorAll('.rs-zone.rs-cleared').length === 2 && d().querySelector('.rs-zone.rs-death .rs-marker'), 'progress bar: 10 zones, 2 cleared, marker in zone 3');
  const saved = JSON.parse(localStorage.getItem('rielrunner_campaigns'));
  ok(saved[0].dead === true && saved[0].level === 23 && saved[0].lives === 0, 'campaign saved as fallen at level 23');
  ok(!saved[1].dead, 'other campaign untouched');
  ${mode === 'death' ? 'document.getElementById("out").textContent = "SHOT"; return;' : ''}

  // 2) Level select: fallen card is grayed out with only DETAILS / DELETE.
  await go('level-select.html');
  const cards = d().querySelectorAll('.slot-card:not(.empty)');
  ok(cards[0].classList.contains('fallen') && !cards[1].classList.contains('fallen'), 'slot 1 fallen, slot 2 normal');
  const labels = [...cards[0].querySelectorAll('button')].map(b => b.textContent.trim());
  ok(labels.length === 2 && /DETAILS/.test(labels[0]) && /DELETE/.test(labels[1]), 'fallen card buttons: DETAILS + DELETE only');
  ok(f.contentWindow.getComputedStyle(cards[0].querySelector('.slot-fallen-body')).filter.includes('grayscale'), 'fallen card info is grayscale');
  cards[0].click(); await wait(300);
  ok(d().getElementById('details-modal').classList.contains('active') && /187/.test(d().getElementById('details-summary').textContent), 'clicking fallen card opens details (not the game)');
  ok(/level-select\\.html/.test(f.contentWindow.location.href), 'still on level select after click');
  ${mode === 'details' ? 'document.getElementById("out").textContent = "SHOT"; return;' : ''}
  d().getElementById('details-delete').click(); await wait(1500);
  ok(d().getElementById('delete-modal').classList.contains('active') && d().getElementById('delete-name-display').textContent === 'DOOMED', 'DELETE from details opens delete confirm');
  d().getElementById('delete-cancel').click();

  // 3) Opening game.html with a fallen active campaign bounces to level select.
  await go('game.html');
  ok(await until(() => /level-select\\.html/.test(f.contentWindow.location.href)), 'fallen campaign cannot be replayed (redirects)');

  document.getElementById('out').textContent = log.join('\\n');
})().catch(e => { document.getElementById('out').textContent = log.join('\\n') + '\\nERROR ' + e; });
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const m = url.match(/^\/harness-(\w+)\.html$/);
  if (m) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(harness(m[1])); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {});
    res.end(data);
  });
});

function chromeRun(args) {
  return new Promise(r => execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, ...args],
    { maxBuffer: 1 << 24 }, (e, out) => r(out || '')));
}

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  if (!shotDir) {
    const out = await chromeRun(['--virtual-time-budget=20000', '--dump-dom', `${base}/harness-all.html`]);
    const m = out.match(/<pre id="out">([\s\S]*?)<\/pre>/);
    console.log(m ? m[1] : 'no result');
  } else {
    for (const [mode, size] of [['death', '960,820'], ['details', '960,860']]) {
      await chromeRun([`--window-size=${size}`, '--virtual-time-budget=15000',
        `--screenshot=${path.join(shotDir, mode + '.png')}`, `${base}/harness-${mode}.html`]);
      console.log('saved ' + mode + '.png');
    }
  }
  server.close();
});
