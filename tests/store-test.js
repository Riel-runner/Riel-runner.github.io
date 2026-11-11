// Cosmetics shop (store.html) and gems: title button, buying/equipping, gems per level
// (shared, once per level), cosmetics applied in game. Usage: node store-test.js <repoDir> <chromeExe>
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
async function go(url) { const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) _rawSet.call(localStorage, k, snap[k]); f.src = tag;
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
  ok(btns.map(b => b.textContent.trim()).join('|') === 'PLAY|SHOP|ACHIEVEMENTS|SETTINGS|CREDITS' && btns[1].getAttribute('href') === 'store.html', 'title SHOP button opens the cosmetics shop (store.html)');
  ok(d.getElementById('gem-count').textContent === '123', 'title screen shows the gem total');

  // Shop page: tabs, items, defaults
  localStorage.removeItem('rielrunner_profile');
  await go('store.html');
  d = f.contentDocument;
  ok(d.querySelectorAll('.tab').length === 5 && d.querySelectorAll('.store-card').length === 6, '5 tabs (classes / weapon / player / trail / abilities), 6 classes');
  ok(d.getElementById('gem-count').textContent === '0' && /EQUIPPED/.test(d.querySelector('.store-card').textContent), 'new profile: 0 gems, free GUNNER class equipped');
  ok([...d.querySelectorAll('.store-btn.is-buy')].every(b => b.disabled), 'cannot buy (or spin) anything with 0 gems');
  ok(!/RIELS|LEVEL COMPLETE|AVAILABLE UPGRADES/.test(d.body.textContent), 'shows none of the upgrade-shop stuff');

  // Buy and equip
  setProfile({ gems: 400 });
  await go('store.html');
  d = f.contentDocument;
  d.querySelector('.tab[data-cat="weapon"]').click(); await wait(1500);
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

  // ── Save protection: editing the profile by hand (Application tab) doesn't stick ──
  const raw = () => JSON.parse(localStorage.getItem('rielrunner_profile'));
  const edit = (key, change) => { const p = JSON.parse(localStorage.getItem(key)); change(p); _rawSet.call(localStorage, key, JSON.stringify(p)); };
  // Old save from before the protection (no signature, nothing else stored): accepted only
  // until the cut-off date, so nobody can delete the signature to get in that way later.
  localStorage.clear();
  _rawSet.call(localStorage, 'rielrunner_profile', JSON.stringify({ gems: 100 }));
  await go('store.html');
  const legacyOpen = f.contentWindow.RielCosmetics.legacyOpen();
  ok(f.contentDocument.getElementById('gem-count').textContent === (legacyOpen ? '100' : '0'),
    legacyOpen ? 'old unsigned save is accepted until the cut-off (100 gems)' : 'after the cut-off, an unsigned save is not accepted');
  localStorage.clear();
  setProfile({ gems: 100 });                                   // a real (signed) save
  await go('store.html');
  ok(typeof raw()._s === 'string' && localStorage.getItem('rielrunner_profile_b') && localStorage.getItem('rielrunner_pg') && f.contentDocument.getElementById('gem-count').textContent === '100', 'saves are signed, with a signed backup');
  edit('rielrunner_profile', p => { p.gems = 999999; });      // edit the number, keep the signature
  await go('store.html');
  ok(f.contentDocument.getElementById('gem-count').textContent === '0' && raw().gems === 0, 'gems edited in storage: caught, and as a penalty ALL gems are taken away (0)');
  await go('index.html');
  ok(/CHEATING DETECTED.*ALL YOUR GEMS, ABILITIES AND CLASSES WERE TAKEN AWAY/.test((f.contentDocument.querySelector('.tamper-note') || {}).textContent || ''), 'title screen says cheating was detected and gems, abilities and classes were taken');
  await go('index.html');
  ok(!f.contentDocument.querySelector('.tamper-note'), 'that notice only shows once');
  setProfile({ gems: 100, owned: { class: ['gunner', 'smg', 'sniper'], weapon: ['standard', 'gold'] }, equipped: { class: 'smg', weapon: 'gold' }, abilities: { owned: { shield: { level: 1, copies: 0 }, leech: { level: 2, copies: 3 } }, equipped: 'leech', slot2: true, equipped2: 'shield' } });   // a real save with bought classes, a skin and abilities
  await go('store.html');
  edit('rielrunner_profile', p => { delete p._s; p.gems = 50000; });   // remove the signature too
  await go('store.html');
  ok(raw().gems === 0, 'removing the signature does not work either: gems gone');
  ok(!f.contentWindow.RielCosmetics.owns('class', 'smg') && !f.contentWindow.RielCosmetics.owns('class', 'sniper') && f.contentWindow.RielCosmetics.owns('class', 'gunner') && f.contentWindow.RielCosmetics.equipped('class').id === 'gunner', 'cheat penalty: every bought class is deleted, only the free GUNNER is left (and equipped)');
  ok(!Object.keys((raw().abilities || {}).owned || {}).length && !f.contentWindow.RielAbilities.hasSlot2() && !f.contentWindow.RielAbilities.equippedInfo(1), 'cheat penalty: every ability and the 2nd ability slot are deleted');
  ok(f.contentWindow.RielCosmetics.owns('weapon', 'gold'), 'cheat penalty: skins are kept');
  edit('rielrunner_profile', p => { p.gems = 77777; });
  edit('rielrunner_profile_b', p => { p.gems = 77777; });      // edit the backup as well
  await go('store.html');
  ok(!raw().gems && f.contentDocument.getElementById('gem-count').textContent === '0', 'both copies edited: the profile resets (0 gems)');
  edit('rielrunner_profile', p => { p.owned = { class: ['gunner', 'sniper'] }; p.equipped = { class: 'sniper' }; });
  await go('store.html');
  ok(!f.contentWindow.RielCosmetics.owns('class', 'sniper'), 'unlocking a class by editing storage does not work');
  setProfile({ gems: 40 });
  await go('store.html');
  ok(f.contentDocument.getElementById('gem-count').textContent === '40', 'real saves still load normally');
  f.contentDocument.getElementById('gem-count').textContent = 'lol';
  await wait(50);
  ok(f.contentDocument.getElementById('gem-count').textContent === '40' && profile().gems === 40, 'console: typing junk into the gem counter just snaps back to the real 40 (no penalty)');
  ok(f.contentWindow.RielCosmetics.buy('class', 'sniper').ok === false && f.contentWindow.RielAbilities.roll().ok === false && profile().gems === 40, 'buying and spinning use the real 40 gems, never the number on screen');
  const Wc = f.contentWindow;
  ok(Wc.RielCosmetics.save === undefined && Wc.RielCosmetics.addGems === undefined, 'console: no save() / addGems() to call');
  ok(Wc.RielCosmetics.claim() === null && Wc.RielCosmetics.withKey({}) === null && Wc.RielCosmetics.withKey(null) === null, 'console: the save key is not handed out after the page has loaded');
  await go('index.html');
  ok(f.contentWindow.RielModes.addToken === undefined && f.contentWindow.RielModes.withKey(null) === null, 'console: cannot give Riel Tokens');
  ok(f.contentWindow.RielAchievements.unlock === undefined && f.contentWindow.RielAchievements.withKey(undefined) === null, 'console: cannot unlock achievements for their gems');
  ok(f.contentDocument.getElementById('gem-count').textContent === '40', 'gems unchanged by all of that (40)');
  const reloaded = async d0 => { for (let i = 0; i < 100 && (f.contentDocument === d0 || f.contentDocument.readyState !== 'complete'); i++) await wait(100); await wait(400); };
  setProfile({ gems: 40, owned: { class: ['gunner', 'smg'], weapon: ['standard', 'gold'] }, equipped: { class: 'smg', weapon: 'gold' }, abilities: { owned: { shield: { level: 1, copies: 0 } }, equipped: 'shield', slot2: true } });
  await go('store.html');
  let d0 = f.contentDocument;
  d0.getElementById('gem-count').textContent = 99999999999999999999999999999999999999;
  await reloaded(d0);
  const Wp = f.contentWindow;
  ok(f.contentDocument.getElementById('gem-count').textContent === '0' && profile().gems === 0, 'console: typing a BIGGER number into the gem counter counts as cheating: all gems taken');
  ok(!Wp.RielCosmetics.owns('class', 'smg') && Wp.RielCosmetics.equipped('class').id === 'gunner' && !Object.keys((profile().abilities || {}).owned || {}).length && !Wp.RielAbilities.hasSlot2(), 'console counter cheat: bought classes, abilities and the 2nd slot deleted');
  ok(Wp.RielCosmetics.owns('weapon', 'gold'), 'console counter cheat: skins kept');
  await go('index.html');
  ok(/CHEATING DETECTED/.test((f.contentDocument.querySelector('.tamper-note') || {}).textContent || ''), 'title screen then says cheating was detected');
  setProfile({ gems: 40, owned: { class: ['gunner', 'smg'] }, equipped: { class: 'smg' } });
  await go('index.html');
  d0 = f.contentDocument;
  d0.getElementById('token-count').textContent = '999';
  await reloaded(d0);
  ok(profile().gems === 0 && !(profile().owned.class || []).includes('smg') && /CHEATING DETECTED/.test((f.contentDocument.querySelector('.tamper-note') || {}).textContent || ''), 'console: typing a bigger number into the token counter is cheating too (penalty + notice)');

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
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=90000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
