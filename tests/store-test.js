// Cosmetics shop (store.html) and gems: title button, buying/equipping, gems per level
// (shared, once per level), cosmetics applied in game. Usage: node store-test.js <repoDir> <chromeExe>
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
  const profile = () => JSON.parse(localStorage.getItem('rielrunner_profile') || 'null');
  const setProfile = p => localStorage.setItem('rielrunner_profile', JSON.stringify(p));

  // Title: SHOP goes to the cosmetics shop; gem total shown
  setProfile({ gems: 123 });
  await go('index.html');
  let d = f.contentDocument;
  const btns = [...d.querySelectorAll('.btn-group .btn')];
  ok(btns.map(b => b.textContent.trim()).join('|') === 'PLAY|SHOP|SETTINGS|CREDITS' && btns[1].getAttribute('href') === 'store.html', 'title SHOP button opens the cosmetics shop (store.html)');
  ok(d.getElementById('gem-count').textContent === '123', 'title screen shows the gem total');

  // Shop page: tabs, items, defaults
  localStorage.removeItem('rielrunner_profile');
  await go('store.html');
  d = f.contentDocument;
  ok(d.querySelectorAll('.tab').length === 3 && d.querySelectorAll('.store-card').length === 5, '3 tabs (weapon / player / trail), 5 items each');
  ok(d.getElementById('gem-count').textContent === '0' && /EQUIPPED/.test(d.querySelector('.store-card').textContent), 'new profile: 0 gems, free STANDARD skin equipped');
  ok([...d.querySelectorAll('.store-btn.is-buy')].every(b => b.disabled), 'cannot buy anything with 0 gems');
  ok(!/RIELS|LEVEL COMPLETE|UPGRADE/.test(d.body.textContent), 'shows none of the upgrade-shop stuff');

  // Buy and equip
  setProfile({ gems: 400 });
  await go('store.html');
  d = f.contentDocument;
  d.querySelector('.store-btn[data-id="ruby"]').click(); await wait(1500);
  let p = profile();
  ok(p.gems === 200 && p.owned.weapon.includes('ruby') && p.equipped.weapon === 'ruby', 'buying RUBY (200): gems 400 -> 200, owned and equipped');
  ok(f.contentDocument.querySelector('.store-btn[data-id="void"]').disabled, 'VOID (450) is locked with 200 gems');
  f.contentDocument.querySelector('.store-btn[data-id="standard"]').click(); await wait(1500);
  ok(profile().equipped.weapon === 'standard' && profile().gems === 200, 'equipping an owned skin is free');
  f.contentDocument.querySelector('.tab[data-cat="trail"]').click(); await wait(1500);
  ok(/SPARKS/.test(f.contentDocument.getElementById('store-grid').textContent), 'TRAILS tab lists the trails');
  ok(f.contentWindow.RielCosmetics.buy('trail', 'rainbow').ok === false && profile().gems === 200, 'buying without enough gems is refused');

  // Gems from clearing levels, once per level, shared across campaigns
  setProfile({ gems: 0 });
  put({ ...base, name: 'A', level: 5, lives: 3, hp: 170 });
  await go('game.html');
  f.contentWindow.eval("gameState = 'level_clear'; applyLevelClearRewards(); applyLevelClearRewards();");
  ok(profile().gems === 10, 'clearing a level gives +10 gems, and only once');
  put({ ...base, name: 'B', level: 10, lives: 3, hp: 170 });
  await go('game.html');
  f.contentWindow.eval("npcs.forEach(n => { n.dead = true; }); gameState = 'boss_slayed'; proceedToShop();");
  await until(() => /shop\.html/.test(f.contentWindow.location.href));
  ok(profile().gems === 60, 'a boss level in another campaign adds +50 (gems are shared): ' + profile().gems);
  put({ ...base, name: 'C', level: 3, lives: 1, hp: 1 });
  await go('game.html');
  f.contentWindow.eval('killPlayer();');
  ok(profile().gems === 60, 'a campaign falling does not take gems away');

  // Equipped cosmetics show up in the game
  setProfile({ gems: 0, owned: { weapon: ['standard', 'neon'], player: ['runner', 'robot'], trail: ['none', 'rainbow'] },
               equipped: { weapon: 'neon', player: 'robot', trail: 'rainbow' } });
  put({ ...base, name: 'D', level: 2, lives: 3, hp: 170 });
  await go('game.html');
  const w = f.contentWindow;
  ok(w.eval('WEAPON_SKIN.id') === 'neon' && w.eval('PLAYER_SKIN.id') === 'robot', 'game uses the equipped weapon and player skins');
  w.eval("gameState = 'playing'; player.vx = 3; for (let i = 0; i < 10; i++) { frameCount++; drawPlayer(); }");
  ok(w.eval('trailParticles.length') > 0, 'equipped trail appears behind the moving player');

  // Old menu mode is gone: the upgrade shop is only the between-levels shop
  put({ ...base, name: 'E', level: 4, lives: 3, hp: 170, riels: 20 });
  await go('shop.html?from=menu');
  ok(/COMPLETE/.test(f.contentDocument.querySelector('.level-badge').textContent) && /CONTINUE/.test(f.contentDocument.querySelector('.btn-continue').textContent), 'upgrade shop is back to the normal between-levels shop');

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
