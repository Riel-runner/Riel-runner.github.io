// Gem upgrades (js/perks.js, js/store-perks.js): the two-row category tabs in the gem shop,
// buying tiers with gems (5 max), and their effect in every campaign (dash cooldown /
// distance / speed, jump and speed power-ups). Usage: node perks-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const f = document.getElementById('f'), log = [];
const _rawSet = Storage.prototype.setItem;
const _seal = window.RielCosmetics.withKey(window.RielCosmetics.claim());   // claimed while this test page loads
let _sealing = false;
Storage.prototype.setItem = function (k, v) { if (k === 'rielrunner_profile' && !_sealing) { let o = null; try { o = JSON.parse(v); } catch {} if (o && typeof o === 'object') { _sealing = true; try { _seal.save(Object.assign({ wipe: 1 }, o)); } finally { _sealing = false; } return; } } _rawSet.call(this, k, v); };
const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + m);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }
async function go(url) { const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading'); await wait(300); }
const base = { riels: 0, hp: 170, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T', lives: 3 };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };
const prof = () => JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
const setProf = p => localStorage.setItem('rielrunner_profile', JSON.stringify(p));
const E = js => f.contentWindow.eval(js);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const MAXED = { dashCd: 5, dashDist: 5, dashSpeed: 5, jumpBoost: 5, speedBoost: 5 };

(async () => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('rielrunner_store_tab', 'perk');

  // ── Two rows of tabs: looks on top, gameplay below ──
  setProf({ gems: 50 });
  await go('store.html');
  let d = f.contentDocument, W = f.contentWindow;
  const cats = sel => [...d.querySelectorAll(sel + ' .tab')].map(t => t.dataset.cat).join(',');
  ok(cats('.tabs-looks') === 'weapon,player,trail', 'top row: the looks-only tabs (weapon skins, player skins, trails)');
  ok(cats('.tabs-play') === 'class,ability,pet,perk', 'bottom row: the gameplay tabs (classes, abilities, pets, upgrades)');
  ok(d.querySelector('.tabs-looks').getBoundingClientRect().bottom <= d.querySelector('.tabs-play').getBoundingClientRect().top, 'the looks row sits above the gameplay row');
  ok(/LOOKS/.test(d.querySelector('.tab-rows').textContent) && /GAMEPLAY/.test(d.querySelector('.tab-rows').textContent), 'each row is labelled');

  // ── UPGRADES tab ──
  ok(!d.getElementById('perk-panel').hidden && d.getElementById('store-grid').hidden && d.querySelector('.tab[data-cat="perk"]').classList.contains('active'), 'UPGRADES tab shows the gem upgrades');
  const names = [...d.querySelectorAll('.perk-card .ab-name')].map(e => e.textContent).join(',');
  ok(d.querySelectorAll('.perk-card').length === 5 && /DASH COOLDOWN/.test(names) && /DASH DISTANCE/.test(names) && /DASH SPEED/.test(names) && /JUMP BOOST/.test(names) && /SPEED BOOST/.test(names), '5 upgrades: dash cooldown, dash distance, dash speed, jump boost, speed boost');
  const b0 = d.querySelector('.perk-card[data-id="dashCd"] .perk-buy');
  ok(b0.disabled && /TIER 1/.test(b0.textContent) && /100 GEMS/.test(b0.textContent), 'tier 1 costs 100 gems (locked with 50)');
  ok(W.RielPerks.buy('dashCd').ok === false && prof().gems === 50, 'cannot buy without enough gems');

  setProf({ gems: 5000 });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  d.querySelector('.perk-card[data-id="dashCd"] .perk-buy').click();
  await wait(1700);
  let card = f.contentDocument.querySelector('.perk-card[data-id="dashCd"]');
  ok(prof().perks.dashCd === 1 && prof().gems === 4900, 'buying tier 1 takes 100 gems');
  ok(/TIER 1 \/ 5/.test(card.textContent) && /NOW: DASH EVERY 9S/.test(card.textContent) && /NEXT: DASH EVERY 8S/.test(card.textContent) && card.querySelectorAll('.perk-pips i.on').length === 1, 'card shows tier 1 / 5, now and next, 1 pip filled');
  for (let k = 0; k < 4; k++) W.RielPerks.buy('dashCd');
  ok(prof().perks.dashCd === 5 && prof().gems === 5000 - 100 - 200 - 350 - 550 - 800, 'tiers cost 100 / 200 / 350 / 550 / 800 gems');
  const r6 = W.RielPerks.buy('dashCd');
  ok(r6.ok === false && r6.reason === 'MAXED OUT' && prof().perks.dashCd === 5, 'max 5 tiers: a 6th cannot be bought');
  W.render();
  card = f.contentDocument.querySelector('.perk-card[data-id="dashCd"]');
  ok(/MAXED/.test(card.querySelector('.perk-buy').textContent) && card.querySelector('.perk-buy').disabled && card.querySelectorAll('.perk-pips i.on').length === 5, 'maxed card: all 5 pips, MAXED button');

  // ── In game ──
  setProf({ gems: 0 });
  put({ ...base, level: 6 });
  await go('game.html');
  ok(E('DASH_COOLDOWN') === 600 && E('DASH_DISTANCE') === 400 && E('DASH_DURATION') === 10 && E('JUMP_POWER_MULT') === 1.5 && E('SPEED_POWER_MULT') === 2, 'no upgrades: dash 10s cooldown, 400px in 10 frames; power-ups 1.5x jump, 2x speed');

  setProf({ gems: 0, perks: MAXED });
  await go('game.html');
  ok(E('DASH_COOLDOWN') === 300 && E('DASH_DISTANCE') === 640 && E('DASH_DURATION') === 5, 'all tier 5: dash every 5s, 640px, in 5 frames (twice as fast)');
  ok(near(E('JUMP_POWER_MULT'), 2) && near(E('SPEED_POWER_MULT'), 2.75), 'all tier 5: power-ups give 2x jump height and 2.75x speed');
  const dash = JSON.parse(E("(() => { applyLevelEvent(null); zoneHazard = null; npcs.length = 0; platforms.length = 0; lasers.length = 0; for (const k in keys) keys[k] = false; player.x = 1000; player.y = GROUND_Y - PLAYER_H; player.facingRight = true; player.dashCooldown = 0; keys.ArrowDown = true; let frames = 0; updatePlayer(); frames++; while (player.isDashing && frames < 50) { updatePlayer(); frames++; } return JSON.stringify({ moved: Math.round(player.x - 1000), frames, cd: player.dashCooldown }); })()"));
  ok(Math.abs(dash.moved - 640) <= 2 && dash.frames <= 6 && dash.cd >= 290, 'a real dash moves ' + dash.moved + 'px in ' + dash.frames + ' frames, then waits ~5s');
  E("powerups.length = 0; powerups.push({ x: player.x, y: player.y + 4, w: 12, h: 10, type: 'speed', collected: false }); updatePowerups();");
  ok(near(E('player.speedMult'), 2.75), 'picking up a speed power-up uses the upgraded 2.75x');

  put({ ...base, name: 'OTHER', level: 41 });
  await go('game.html');
  ok(E('DASH_COOLDOWN') === 300 && E('DASH_DISTANCE') === 640, 'the upgrades count in every campaign (another campaign, level 41)');

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
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=60000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
