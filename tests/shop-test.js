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
  // Older save: 3 gun upgrades bought the old way, no upgrades object.
  put({ ...base, level: 7, lives: 3, hp: 170, riels: 200, gunDamage: 8, upgradeCount: 3 });
  localStorage.setItem('rielrunner_profile', JSON.stringify({ gems: 1234 }));
  await go('shop.html');
  let d = f.contentDocument, w = f.contentWindow;
  ok(d.getElementById('gems-display').textContent === '1,234' && /MAIN MENU SHOP/.test(d.querySelector('.gem-strip').textContent), 'upgrade shop shows your gems (1,234), spent in the main menu shop');
  localStorage.removeItem('rielrunner_profile');
  const card = k => d.querySelector('.btn-buy[data-key="' + k + '"]').closest('.upg-card');
  ok(d.querySelectorAll('.upg-card:not(.life-card)').length === 7 && d.querySelectorAll('.life-card').length === 1, '7 upgrade cards + the EXTRA LIFE card');
  ok(/LV 3 \/ 10/.test(card('damage').textContent) && card('damage').querySelector('.dmg-current').textContent === '8 DMG' && card('damage').querySelector('.dmg-next').textContent === '10 DMG', 'old save: 3 gun upgrades carried over (LV 3, 8 -> 10 DMG)');
  ok(card('damage').querySelector('.cost-amount').textContent === '16', 'damage LV3 costs 16 (6 x 1.4^3)');
  ok(card('armor').querySelector('.cost-amount').textContent === '8' && /LV 0/.test(card('armor').textContent), 'armor starts at LV 0 for 8');
  d.querySelector('.btn-buy[data-key="damage"]').click(); await wait(1500);   // click sounds delay buttons
  let a = active();
  ok(a.riels === 184 && a.gunDamage === 10 && a.upgrades.damage === 4, 'buying damage: -16 riels, 10 DMG, LV 4');
  ok(card('damage').querySelector('.cost-amount').textContent === '23', 'next damage level is pricier (23)');
  d.querySelector('.btn-buy[data-key="maxhp"]').click(); await wait(1500);
  a = active();
  ok(a.maxHp === 185 && a.hp === 185 && a.upgrades.maxhp === 1, 'buying max HP: +15 max HP (185)');
  ok(d.getElementById('upgrades-display').textContent === '5 / 70', 'upgrade total shows 5 / 70');

  // Mag size upgrade
  ok(/20 ROUNDS/.test(card('ammo').querySelector('.dmg-current').textContent) && /25 ROUNDS/.test(card('ammo').querySelector('.dmg-next').textContent), 'mag size card: 20 -> 25 rounds');
  d.querySelector('.btn-buy[data-key="ammo"]').click(); await wait(1500);
  ok(active().upgrades.ammo === 1, 'buying mag size raises it to level 1');

  // Maxed upgrade
  put({ ...active(), upgrades: { ...active().upgrades, speed: 10 }, riels: 9999 });
  await go('shop.html'); d = f.contentDocument;
  const sb = d.querySelector('.btn-buy[data-key="speed"]');
  ok(sb.disabled && sb.textContent === 'MAXED' && /MAX LEVEL/.test(sb.closest('.upg-card').textContent), 'speed at LV 10 shows MAXED and cannot be bought');
  f.contentWindow.buyUpgrade('speed');
  ok(active().upgrades.speed === 10, 'cannot go past level 10 even when calling buy directly');
  const prices = []; for (let l = 0; l < 10; l++) prices.push(f.contentWindow.RielUpgrades.cost('damage', l));
  ok(prices.every((p, i) => i === 0 || p > prices[i - 1]), 'damage prices strictly increase: ' + prices.join(','));

  // Effects in the game
  put({ ...base, level: 3, lives: 3, hp: 170, upgrades: { armor: 10, speed: 10, firerate: 10, reload: 10, ammo: 10 } });
  await go('game.html'); w = f.contentWindow;
  ok(w.eval('ARMOR_BLOCK') === 0.5 && w.eval('PLAYER_SPEED_MULT') === 1.5, 'max armor blocks 50%, max speed = 1.5x');
  ok(w.eval('MAG_SIZE') === 70 && w.eval('player.bullets') === 70, 'max mag size: 70 rounds, level starts with a full 70-round mag');
  ok(w.eval('PLAYER_SHOOT_CD') === 9 && w.eval('RELOAD_FRAMES') === 54, 'max fire rate: 9 frames/shot (was 18); max reload: 0.9s (was 3s)');
  w.eval('applyLevelEvent(null); player.hp = 100; window.__dmg = damagePlayer(20);'); // no random event (Glass Cannon adds damage)
  ok(w.eval('player.hp') === 90 && w.__dmg === 10, 'armor halves a 20-damage hit to 10');
  put({ ...base, level: 3, lives: 3, hp: 170 });
  await go('game.html'); w = f.contentWindow;
  ok(w.eval('ARMOR_BLOCK') === 0 && w.eval('PLAYER_SHOOT_CD') === 18 && w.eval('RELOAD_FRAMES') === 180 && w.eval('MAG_SIZE') === 20, 'no upgrades: unchanged base values');

  // ── No hidden caps: every Fire Rate level is faster, for every class (was "15 -> 15") ──
  const UPG = w.RielUpgrades, CLS = w.RielCosmetics.CLASSES, fr = UPG.BY_KEY.firerate;
  const stuck = [];
  for (const c of CLS) {
    const p = JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
    localStorage.setItem('rielrunner_profile', JSON.stringify({ ...p, owned: { class: CLS.map(x => x.id) }, equipped: { class: c.id } }));
    for (let l = 0; l < UPG.MAX_LEVEL; l++) {
      if (!(fr.value(l + 1) < fr.value(l)) || fr.format(fr.value(l + 1)) === fr.format(fr.value(l))) stuck.push(c.id + ' ' + l + '->' + (l + 1) + ' ' + fr.format(fr.value(l)));
    }
  }
  ok(stuck.length === 0, 'fire rate: every level of every class shoots faster and shows a new number (' + (stuck.join(', ') || 'none stuck') + ')');
  localStorage.setItem('rielrunner_profile', JSON.stringify({ gems: 0, owned: { class: CLS.map(x => x.id) }, equipped: { class: 'smg' } }));
  put({ ...base, level: 3, lives: 3, hp: 170, upgrades: { firerate: 7 } });
  await go('game.html');
  w = f.contentWindow;
  const cd = w.eval('PLAYER_SHOOT_CD');
  ok(Math.abs(cd - 6 * 0.65) < 1e-9, 'SMG fire rate 7: 3.9 frames per shot (no rounding, no 4-frame cap)');
  w.eval("applyLevelEvent(null); npcs.length = 0; campaign.shotsFired = 0; player.shootTimer = 0; keys.Space = true; for (let i = 0; i < 780; i++) { player.bullets = 999; player.reloadTimer = 0; updatePlayer(); } keys.Space = false;");
  ok(w.eval('campaign.shotsFired') === 200, 'it really fires at 15.4 shots/s in game (' + w.eval('campaign.shotsFired') + ' shots in 13s, want 200)');

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
