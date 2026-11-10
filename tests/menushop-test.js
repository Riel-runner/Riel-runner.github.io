// Title-screen SHOP button and the shop in menu mode (no level skip, closed without a campaign,
// upgrades carry into a resumed level). Usage: node menushop-test.js <repoDir> <chromeExe>
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
  sessionStorage.setItem('rielrunner_intro_played', '1');

  // Title screen: SHOP button between PLAY and SETTINGS, icons all the same size
  await go('index.html');
  let d = f.contentDocument;
  const btns = [...d.querySelectorAll('.btn-group .btn')];
  ok(btns.map(b => b.textContent.trim()).join('|') === 'PLAY|SHOP|SETTINGS|CREDITS', 'title buttons: PLAY, SHOP, SETTINGS, CREDITS');
  ok(btns[1].getAttribute('href') === 'shop.html?from=menu', 'SHOP opens the shop (from the menu)');
  const sizes = btns.map(b => { const r = b.querySelector('svg.btn-icon').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); });
  ok(new Set(sizes).size === 1, 'all four icons are the same size (' + sizes[0] + ')');

  // From the menu with a live campaign: shop for it, back goes to title, no level skip
  put({ ...base, name: 'HERO', level: 7, lives: 2, hp: 170, riels: 100 });
  await go('shop.html?from=menu');
  d = f.contentDocument;
  ok(d.querySelector('.level-badge').textContent === 'HERO \u00b7 LEVEL 7', 'badge shows the campaign instead of LEVEL COMPLETE');
  ok(/BACK TO TITLE/.test(d.querySelector('.btn-continue').textContent), 'CONTINUE is replaced by BACK TO TITLE');
  d.querySelector('.btn-buy[data-key="damage"]').click(); await wait(1500);
  ok(active().riels === 94 && JSON.parse(localStorage.getItem('rielrunner_campaigns'))[0].upgrades.damage === 1, 'buying from the menu works and saves to the campaign');
  ok(/shop-music/.test(f.contentWindow.eval('shopMusic.src')), 'shop page plays shop-music');
  f.contentWindow.continueToGame();
  await until(() => /index\.html/.test(f.contentWindow.location.href));
  ok(active().level === 7 && /index\.html/.test(f.contentWindow.location.href), 'BACK goes to the title and does not skip a level');

  // No campaign: buying disabled, nothing created
  localStorage.removeItem('activeCampaign'); localStorage.removeItem('rielrunner_campaigns');
  await go('shop.html?from=menu');
  d = f.contentDocument;
  ok(d.querySelector('.level-badge').textContent === 'NO ACTIVE CAMPAIGN' && [...d.querySelectorAll('.btn-buy')].every(b => b.disabled), 'no campaign: buying disabled, says so');
  f.contentWindow.buyUpgrade('damage');
  ok(localStorage.getItem('activeCampaign') === null, 'no fake campaign gets created');

  // Fallen campaign: also closed
  put({ ...base, name: 'GONE', level: 12, lives: 0, hp: 0, riels: 500, dead: true });
  await go('shop.html?from=menu');
  ok([...f.contentDocument.querySelectorAll('.btn-buy')].every(b => b.disabled), 'fallen campaign: buying disabled');

  // Mid-level save + upgrades bought from the menu shop carry into the resumed level
  put({ ...base, name: 'MID', level: 4, lives: 3, hp: 170, maxHp: 170, gunDamage: 2, riels: 100 });
  await go('game.html');
  f.contentWindow.eval('player.hp = 90; saveLevelProgress();');
  await go('shop.html?from=menu');
  d = f.contentDocument;
  d.querySelector('.btn-buy[data-key="damage"]').click(); await wait(1500);
  d.querySelector('.btn-buy[data-key="maxhp"]').click(); await wait(1500);
  await go('game.html');
  const r = JSON.parse(f.contentWindow.eval('JSON.stringify({ g: player.gunDamage, m: player.maxHp, hp: player.hp, gs: gameState })'));
  ok(r.g === 4 && r.m === 185 && r.hp === 105 && r.gs === 'paused', 'resumed level keeps menu-shop upgrades (dmg ' + r.g + ', max HP ' + r.m + ', HP 90+15=' + r.hp + ')');

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
