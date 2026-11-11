// Revive for 150 gems on the death screen, and buying extra lives in the upgrade shop
// (cap, rising price, boss refill keeps them). Usage: node revive-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const f = document.getElementById('f'), log = [];
// Profiles written by hand here get signed with this test page's own save key, so the save
// protection (js/cosmetics.js) accepts them.
const _rawSet = Storage.prototype.setItem;
const _seal = window.RielCosmetics.withKey(window.RielCosmetics.claim());   // claimed while this test page loads
let _sealing = false;
Storage.prototype.setItem = function (k, v) { if (k === 'rielrunner_profile' && !_sealing) { let o = null; try { o = JSON.parse(v); } catch {} if (o && typeof o === 'object') { _sealing = true; try { _seal.save(o); } finally { _sealing = false; } return; } } _rawSet.call(this, k, v); };
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
  const prof = () => JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
  const setProf = p => localStorage.setItem('rielrunner_profile', JSON.stringify(p));
  const slot = () => JSON.parse(localStorage.getItem('rielrunner_campaigns'))[0];
  const E = js => f.contentWindow.eval(js);
  const die = () => E('player.lives = 1; killPlayer(); for (let i = 0; i < 65; i++) drawOverlay();');

  // Not enough gems: revive shown but disabled
  setProf({ gems: 100 });
  put({ ...base, name: 'R', level: 6, lives: 1, hp: 170 });
  await go('game.html');
  die();
  let btn = f.contentDocument.getElementById('death-revive-btn');
  ok(!btn.hidden && btn.disabled && /150 GEMS/.test(btn.textContent) && /NOT ENOUGH/.test(btn.textContent), 'death screen offers REVIVE (150 GEMS), disabled with 100 gems');

  // Enough gems: revive brings you back in the same level
  setProf({ gems: 200 });
  put({ ...base, name: 'R', level: 6, lives: 1, hp: 170 });
  await go('game.html');
  E('npcs[0].hp = 1; npcs[0].dead = true; player.x = 1500;');
  die();
  btn = f.contentDocument.getElementById('death-revive-btn');
  ok(!btn.disabled && slot().dead === true, 'with 200 gems the button works; campaign was marked fallen');
  btn.click(); await wait(1500);   // click sounds delay buttons
  ok(prof().gems === 50, 'reviving costs 150 gems (200 -> 50)');
  ok(E('gameState') === 'playing' && f.contentDocument.getElementById('death-screen').hidden, 'death screen closes and the level carries on');
  ok(E('player.lives') === 1 && E('player.hp') === E('player.maxHp') && !E('player.dead'), 'back with 1 life and full HP');
  ok(E('npcs[0].dead') === true && E('campaign.level') === 6 && Math.abs(E('player.x') - 1420) < 2, 'same level, same enemies, near where you fell');
  ok(E('damagePlayer(50)') === 0 && E('player.hp') === E('player.maxHp'), '2 seconds of invulnerability after reviving');
  ok(slot().dead === false && slot().levelState && slot().revives === 1, 'saved as alive again (with the level)');

  // Dying again: revive again only if you can pay
  E('player.invuln = 0;');
  die();
  btn = f.contentDocument.getElementById('death-revive-btn');
  ok(!f.contentDocument.getElementById('death-screen').hidden && btn.disabled, 'dying again shows the death screen; 50 gems is not enough to revive');

  // Extra life in the upgrade shop
  put({ ...base, name: 'L', level: 4, lives: 2, hp: 170, riels: 400 });
  await go('shop.html');
  let d = f.contentDocument;
  const card = () => d.querySelector('.life-card');
  ok(card() && card().querySelector('.dmg-current').textContent === '♥♥♡' && card().querySelector('.dmg-next').textContent === '♥♥♥', 'EXTRA LIFE card: hearts 2 -> 3');
  ok(card().querySelector('.cost-amount').textContent === '40', 'first extra life costs 40 KHR');
  card().querySelector('.btn-buy').click(); await wait(1500);
  let a = JSON.parse(localStorage.getItem('activeCampaign'));
  ok(a.lives === 3 && a.riels === 360 && card().querySelector('.cost-amount').textContent === '60', 'bought: 3 lives, -40 KHR, next one costs 60');
  card().querySelector('.btn-buy').click(); await wait(1500);
  card().querySelector('.btn-buy').click(); await wait(1500);
  a = JSON.parse(localStorage.getItem('activeCampaign'));
  ok(a.lives === 5 && a.riels === 360 - 60 - 90, 'can go above 3 (now 5 lives, prices 60 then 90)');
  ok(card().querySelector('.btn-buy').disabled && /FULL/.test(card().querySelector('.btn-buy').textContent) && /MAX LIVES/.test(card().textContent), 'capped at 5 lives (FULL)');
  ok(d.getElementById('upgrades-display').textContent === '0 / 70', 'extra lives do not count as upgrade levels');

  // Nightmare cap is 3
  put({ ...base, name: 'N', mode: 'nightmare', level: 4, lives: 3, hp: 170, riels: 400 });
  await go('shop.html');
  d = f.contentDocument;
  ok(card().querySelector('.btn-buy').disabled && /3 \/ 3|MAX LIVES/.test(card().textContent), 'nightmare: extra lives capped at 3');

  // Boss refill keeps bought lives
  put({ ...base, name: 'B', level: 10, lives: 5, hp: 170 });
  await go('game.html');
  E("player.lives = 5; npcs.forEach(n => { n.dead = true; }); gameState = 'boss_slayed'; applyLevelClearRewards();");
  ok(E('campaign.lives') === 5, 'boss refill keeps 5 bought lives (does not drop to 3)');
  E("player.lives = 1; campaign.gemsForLevel = 0; applyLevelClearRewards();");
  ok(E('campaign.lives') === 3, 'boss refill still tops 1 life up to 3');

  document.getElementById('out').textContent = log.join('\n');
})().catch(e => { document.getElementById('out').textContent = log.join('\n') + '\nERROR ' + e.stack; });
`;
const harness = `<!doctype html><html><body><pre id="out">running</pre><iframe id="f" width="960" height="600"></iframe><script src="js/cosmetics.js"></script><script>${testScript}</script></body></html>`;

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
