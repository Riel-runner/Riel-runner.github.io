// Classes (gem shop): buying/equipping, upgrade numbers that follow the class, weapon behaviour
// in game (AK, sniper pierce, shotgun pellets). Usage: node classes-test.js <repoDir> <chromeExe>
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
  const prof = () => JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
  const setProf = p => localStorage.setItem('rielrunner_profile', JSON.stringify(p));
  const E = js => f.contentWindow.eval(js);

  // Gem shop: CLASSES tab
  setProf({ gems: 950 });
  await go('store.html');
  let d = f.contentDocument;
  ok(d.querySelector('.tab.active').dataset.cat === 'class', 'shop opens on the CLASSES tab');
  const names = [...d.querySelectorAll('.store-card .store-name')].map(e => e.textContent).join('|');
  ok(names === 'GUNNER|SPEEDSTER|ASSAULT|BREACHER|RIFLEMAN|SNIPER', '6 classes: ' + names);
  ok(/PISTOL/.test(d.querySelector('.store-card').textContent) && /EQUIPPED/.test(d.querySelector('.store-card').textContent), 'GUNNER (pistol) is free and equipped');
  ok(/AK-47/.test(d.getElementById('store-grid').textContent) && /SMG/.test(d.getElementById('store-grid').textContent) && /RIFLE/.test(d.getElementById('store-grid').textContent), 'cards show their weapons (AK-47, SMG, RIFLE...)');
  d.querySelector('.store-btn[data-id="assault"]').click(); await wait(1500);
  ok(prof().gems === 150 && prof().equipped.class === 'assault', 'buying ASSAULT (800 gems) equips it');
  ok(f.contentDocument.querySelector('.store-btn[data-id="sniper"]').disabled, 'SNIPER (1400) locked with 150 gems');

  // Upgrade shop with the AK: numbers follow the class
  put({ ...base, name: 'AK', level: 3, lives: 3, hp: 170, gunDamage: 2, riels: 0 });
  await go('shop.html');
  d = f.contentDocument;
  const card = k => d.querySelector('.btn-buy[data-key="' + k + '"]').closest('.upg-card');
  ok(d.getElementById('class-badge').textContent === 'CLASS: ASSAULT · AK-47', 'upgrade shop names the class');
  ok(card('ammo').querySelector('.dmg-current').textContent === '30 ROUNDS' && card('ammo').querySelector('.dmg-next').textContent === '38 ROUNDS', 'mag size with AK: 30 -> 38 (not 20 -> 25)');
  ok(/HOLD 8 MORE/.test(card('ammo').textContent), 'mag size text: +8 per level for the AK');
  ok(card('damage').querySelector('.dmg-current').textContent === '1.6 DMG' && card('damage').querySelector('.dmg-next').textContent === '3.2 DMG', 'damage preview uses the AK multiplier (1.6 -> 3.2)');
  ok(card('firerate').querySelector('.dmg-current').textContent === '6.7 SHOTS/S', 'fire rate preview starts at the AK rate (6.7/s)');
  ok(card('reload').querySelector('.dmg-current').textContent === '2.5S RELOAD', 'reload preview starts at the AK reload (2.5s)');

  // In game with the AK
  await go('game.html');
  ok(E('MAG_SIZE') === 30 && E('PLAYER_SHOOT_CD') === 9 && E('RELOAD_FRAMES') === 150, 'AK in game: 30-round mag, 9-frame fire rate, 2.5s reload');
  ok(Math.abs(E('PLAYER_SPEED_MULT') - 1.08) < 1e-9 && Math.abs(E('classDamage()') - 1.6) < 1e-9, 'AK in game: 108% speed, 1.6 damage per bullet');
  E("applyLevelEvent(null); npcs.length = 0; const n = makeNPC(1000); n.nextDodgeRoll = 1e9; npcs.push(n); window.__h = n.hp; bullets.push({ x: n.x + 3, y: n.y + 10, dx: 1, dy: 0, alive: true, hits: [] }); levelEvent.playerDmgMult = 1; updateNPCs();");
  ok(Math.abs((E('__h') - E('npcs[0].hp')) - 1.6) < 1e-9, 'an AK bullet deals 1.6 damage');

  // Sniper: tiny mag (+1 per level), fast piercing bullets
  setProf({ gems: 0, owned: { class: ['gunner', 'sniper'] }, equipped: { class: 'sniper' } });
  put({ ...base, name: 'SN', level: 3, lives: 3, hp: 170, gunDamage: 2, upgrades: { ammo: 10 } });
  await go('game.html');
  ok(E('MAG_SIZE') === 15, 'sniper: 5 + 1 per Mag Size level (max 15)');
  E("applyLevelEvent(null); npcs.length = 0; bullets.length = 0; const a = makeNPC(1000), b = makeNPC(1030); npcs.push(a, b); a.aware = b.aware = true; a.nextDodgeRoll = b.nextDodgeRoll = 1e9; window.__ha = a.hp; window.__hb = b.hp; levelEvent.playerDmgMult = 1;");
  E("bullets.push({ x: 1003, y: npcs[0].y + 10, dx: 1, dy: 0, alive: true, speed: 16, pierce: true, hits: [] }); updateNPCs(); bullets[0].x = 1033; updateNPCs();");
  ok(E('npcs[0].hp < __ha') && E('npcs[1].hp < __hb'), 'sniper bullet pierces and hits both enemies');
  E("player.reloadTimer = 0; player.bullets = 5; bullets.length = 0; firePlayerBullet();");
  ok(E('bullets.length') === 1 && E('bullets[0].speed') === 16 && E('bullets[0].pierce') === true, 'sniper fires one fast piercing bullet');

  // Shotgun: 5 pellets that fade after a short range
  setProf({ gems: 0, owned: { class: ['gunner', 'shotgun'] }, equipped: { class: 'shotgun' } });
  put({ ...base, name: 'SG', level: 3, lives: 3, hp: 170, gunDamage: 2 });
  await go('game.html');
  E("npcs.length = 0; bullets.length = 0; player.reloadTimer = 0; player.bullets = 6; firePlayerBullet();");
  ok(E('bullets.length') === 5 && E('new Set(bullets.map(b => b.dy.toFixed(3))).size') === 5, 'shotgun fires 5 pellets in a spread');
  E('for (let i = 0; i < 30; i++) updateBullets();');
  ok(E('bullets.length') === 0, 'pellets disappear after their short range');

  // Each class has its own gun sprite
  ok(E("new Set(window.RielCosmetics.CLASSES.map(c => c.gun.length + ':' + c.muzzle)).size") === 6, 'every class has a different gun sprite');

  // Bullets point the way they fly (aiming up tilts them), not always forward
  setProf({ gems: 0 });
  put({ ...base, name: 'BD', level: 3, lives: 3, hp: 170, gunDamage: 2 });
  await go('game.html');
  E("applyLevelEvent(null); npcs.length = 0; bullets.length = 0; levelEvent.forceManualAim = true; player.reloadTimer = 0; player.bullets = 5; mouseX = wp(player.x) + 10; mouseY = player.y - 300; firePlayerBullet();");
  ok(E('bullets[0].dy') < -0.9 && Math.abs(E('bulletAngle(bullets[0]) + Math.PI / 2')) < 0.2, 'aiming straight up: the bullet flies up and is turned to point up');
  // Draw one bullet flying straight up and look at the pixels
  const px = js => E("(() => { const d = ctx.getImageData(" + js + ", 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; })()");
  E("bullets.length = 0; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, BASE_W, BASE_H); bullets.push({ x: camX + 400, y: 200, dx: 0, dy: -1 }); drawBullets();");
  const col = E("(() => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = WEAPON_SKIN.bullet; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; })()");
  ok(px('400, 197') === col && px('406, 201') === '0,0,0', 'an upward bullet is drawn vertically (bullet colour above it, nothing to its side)');
  ok(E("(() => { const t = ctx.getTransform(); return t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0; })()"), 'drawing rotated bullets leaves the canvas un-rotated');
  E("bullets.length = 0; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, BASE_W, BASE_H); bullets.push({ x: camX + 400, y: 200, dx: 1, dy: 0 }); drawBullets();");
  ok(px('404, 201') === col && px('400, 196') === '0,0,0', 'a bullet flying right is still drawn flat');

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
