// Abilities: the wheel in the gem shop (odds, gems, repeats), upgrading / awakening,
// equipping, and every ability's effect in game (E key, cooldowns, traits).
// Usage: node abilities-test.js <repoDir> <chromeExe>
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
const withAbility = (id, level = 1, extra = {}) => setProf({ gems: 0, abilities: { owned: { [id]: { level, copies: 0 } }, equipped: id }, ...extra });
const E = js => f.contentWindow.eval(js);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Game page with an empty arena: player at x=1500 in the middle of the screen, no event.
async function arena(id, level = 1, campaignExtra = {}) {
  if (id) withAbility(id, level); else setProf({ gems: 0 });
  put({ ...base, level: 6, ...campaignExtra });
  await go('game.html');
  E("applyLevelEvent(null); npcs.length = 0; platforms.length = 0; bullets.length = 0; lasers.length = 0; enemyShots.length = 0; player.x = 1500; player.y = GROUND_Y - PLAYER_H; player.vx = 0; camX = player.x - BASE_W / 2; gameState = 'playing';");
}
const addNPC = (x, extra = '') => E("(() => { const n = makeNPC(" + x + "); n.aware = true; " + extra + " npcs.push(n); return npcs.length - 1; })()");

(async () => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('rielrunner_store_tab', 'ability');

  // ── Shop tab, wheel, odds ──
  setProf({ gems: 50 });
  await go('store.html');
  let d = f.contentDocument, W = f.contentWindow;
  ok([...d.querySelectorAll('.tab')].some(t => t.dataset.cat === 'ability' && t.classList.contains('active')), 'gem shop has an ABILITIES tab');
  ok(!d.getElementById('ability-panel').hidden && d.getElementById('store-grid').hidden, 'abilities tab shows the wheel panel instead of the item grid');
  ok(d.getElementById('roll-btn').disabled && /100 GEMS/.test(d.getElementById('roll-btn').textContent), 'spin costs 100 gems; disabled without enough');
  ok(d.querySelectorAll('.ability-card').length === 8 && d.querySelectorAll('.ability-card.locked').length === 8, 'all 8 abilities listed, all locked at first');
  ok(W.RielAbilities.roll().ok === false && prof().gems === 50, 'cannot roll without 100 gems');
  const A = W.RielAbilities;
  const r = v => A.pick(() => v).rarity;
  ok(r(0) === 'common' && r(0.599) === 'common' && r(0.61) === 'rare' && r(0.869) === 'rare' && r(0.88) === 'super' && r(0.969) === 'super' && r(0.975) === 'legendary', 'wheel odds: 60% common, 27% rare, 10% super rare, 3% legendary');
  const counts = { common: 0, rare: 0, super: 0, legendary: 0 };
  for (let i = 0; i < 20000; i++) counts[A.pick().rarity]++;
  ok(Math.abs(counts.common / 200 - 60) < 2 && Math.abs(counts.rare / 200 - 27) < 2 && Math.abs(counts.super / 200 - 10) < 1.5 && Math.abs(counts.legendary / 200 - 3) < 1,
    '20,000 random spins match the odds (' + Object.values(counts).map(c => (c / 200).toFixed(1)).join(' / ') + ')');
  const rar = id => A.byId(id).rarity;
  ok(rar('shield') === 'common' && rar('freeze') === 'super' && rar('leech') === 'legendary', 'Shield is common, Freeze super rare, Life Leech legendary');

  // ── Spinning: gems, new ability auto-equipped, result card, list ──
  setProf({ gems: 1000 });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  W.StoreAbilities.SPIN_MS = 60;
  W.StoreAbilities.roll();
  ok(prof().gems === 900 && d.getElementById('roll-btn').disabled, 'spinning takes 100 gems and locks the button while it spins');
  const first = Object.keys(prof().abilities.owned)[0];
  ok(first && prof().abilities.equipped === first, 'first ability won is equipped automatically (' + first + ')');
  await until(() => !d.getElementById('roll-result').hidden);
  ok(/NEW ABILITY UNLOCKED/.test(d.getElementById('roll-result').textContent), 'result card says NEW ABILITY UNLOCKED');
  const card1 = d.querySelector('.ability-card');
  ok(card1.dataset.id === first && card1.classList.contains('equipped') && /EQUIPPED/.test(card1.textContent), 'won ability appears first in the list, equipped');
  // Repeat rolls add copies
  const repeat = A.byId(first);
  const rngFor = def => { const pool = A.LIST.filter(a => a.rarity === def.rarity); const i = pool.indexOf(def);
    let lo = 0; for (const k of A.RARITY_ORDER) { if (k === def.rarity) break; lo += A.RARITIES[k].weight; }
    const seq = [(lo + 0.5) / 100, (i + 0.5) / pool.length]; let j = 0; return () => seq[j++ % 2]; };
  let rr = A.roll(rngFor(repeat));
  ok(rr.ok && !rr.isNew && rr.copies === 1 && prof().gems === 800, 'rolling an owned ability adds a copy (1 copy)');
  const other = A.LIST.find(a => a.id !== first);
  rr = A.roll(rngFor(other));
  ok(rr.isNew && prof().abilities.equipped === first, 'a second new ability does not replace the equipped one');

  // ── Upgrade 3 copies -> LV 2, 10 copies -> AWAKENED ──
  setProf({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 2 } }, equipped: 'shield' } });
  ok(!A.canUpgrade('shield') && A.upgrade('shield').ok === false, '2 copies: cannot upgrade yet');
  setProf({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 3 } }, equipped: 'shield' } });
  await go('store.html');
  d = f.contentDocument;
  let sc = d.querySelector('[data-id="shield"]');
  ok(sc && !sc.querySelector('.ab-upgrade').disabled && /3 \/ 3 COPIES TO LV 2/.test(sc.textContent), 'shield card: 3 / 3 copies, UPGRADE button next to EQUIP enabled');
  sc.querySelector('.ab-upgrade').click();
  await until(() => prof().abilities.owned.shield.level === 2, 4000);
  let o = prof().abilities.owned.shield;
  ok(o.level === 2 && o.copies === 0, 'upgrading uses 3 copies: now LV 2 (' + o.level + ', ' + o.copies + ' left)');
  sc = f.contentDocument.querySelector('[data-id="shield"]');
  ok(/LV 2/.test(sc.textContent) && /0 \/ 10 COPIES TO AWAKEN/.test(sc.textContent) && sc.querySelector('.ab-upgrade').disabled && /AWAKEN/.test(sc.querySelector('.ab-upgrade').textContent), 'LV 2 card: needs 10 copies to AWAKEN');
  ok(/BLOCKS ALL DAMAGE FOR 4.5S/.test(sc.textContent), 'LV 2 shield lasts longer (4.5s)');
  setProf({ gems: 0, abilities: { owned: { shield: { level: 2, copies: 11 } }, equipped: 'shield' } });
  rr = A.upgrade('shield');
  o = prof().abilities.owned.shield;
  ok(rr.ok && rr.awakened && o.level === 3 && o.copies === 1, '10 copies awaken it (level 3, 1 copy spare)');
  ok(A.upgrade('shield').ok === false, 'awakened is the max level');
  await go('store.html');
  sc = f.contentDocument.querySelector('[data-id="shield"]');
  ok(sc.classList.contains('awakened') && /AWAKENED/.test(sc.textContent) && sc.querySelector('.ab-trait.on') && !sc.querySelector('.ab-upgrade'), 'awakened card shows its trait as active, no upgrade button');
  // Equip from the list
  setProf({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 0 }, freeze: { level: 1, copies: 0 } }, equipped: 'shield' } });
  await go('store.html');
  f.contentDocument.querySelector('[data-id="freeze"] .ab-equip').click();
  await until(() => prof().abilities.equipped === 'freeze', 4000);
  ok(prof().abilities.equipped === 'freeze', 'EQUIP switches the equipped ability');

  // ── In game: no ability ──
  await arena(null);
  ok(E('ABILITY') === null && E('useAbility()') === false && /SPIN THE WHEEL/.test(E('toastMsg')), 'no ability: E shows a hint to spin the wheel');

  // ── Shield ──
  await arena('shield');
  E("keys.KeyE = true; updatePlayer();");
  ok(E('player.abilityTime') === 180 && E('player.abilityCd') === 20 * 60 && !E('keys.KeyE'), 'E activates Shield: 3s, 20s cooldown');
  E("player.hp = 100;");
  ok(E('damagePlayer(30)') === 0 && E('player.hp') === 100, 'shield blocks all damage');
  ok(E('useAbility()') === false, 'cannot use it again during the cooldown');
  E("player.abilityTime = 0;"); E("damagePlayer(30);");
  ok(E('player.hp') < 100, 'damage gets through once the shield ends');
  E("for (let i = 0; i < 1200; i++) updateAbilityTimers();");
  ok(E('player.abilityCd') === 0 && E('useAbility()') === true, 'usable again after 20s');
  let i0 = addNPC(1600);
  E("npcs[" + i0 + "].hp = 100; hitNPC(npcs[" + i0 + "], 10);");
  ok(E('npcs[' + i0 + '].hp') === 90, 'LV 1 shield: no damage bonus');
  await arena('shield', 3);
  i0 = addNPC(1600);
  E("useAbility(); npcs[" + i0 + "].hp = 100; hitNPC(npcs[" + i0 + "], 10);");
  ok(E('player.abilityTime') === 360 && E('npcs[' + i0 + '].hp') === 85, 'awakened shield: 6s and +50% damage while shielded (Power Surge)');

  // ── Med Kit ──
  await arena('medkit');
  E("player.hp = 50; useAbility();");
  ok(near(E('player.hp'), 50 + 170 * 0.2) && E('player.regenTime') === 0, 'Med Kit heals 20% of max HP');
  await arena('medkit', 3);
  E("player.hp = 50; useAbility(); for (let i = 0; i < 300; i++) updateAbilityTimers();");
  ok(near(E('player.hp'), 50 + 170 * 0.4 + 170 * 0.1, 1e-3), 'awakened Med Kit: 40% heal, then 2%/s for 5s (Recovery)');

  // ── Quick Draw ──
  await arena('quickdraw');
  E("player.bullets = 0; player.reloadTimer = 100; useAbility();");
  ok(E('player.reloadTimer') === 0 && E('player.bullets') === E('MAG_SIZE') && E('player.abilityTime') === 180, 'Quick Draw: instant reload, active 3s');
  E("player.shootTimer = 0; keys.Space = true; updatePlayer(); keys.Space = false;");
  ok(E('player.shootTimer') === Math.max(4, Math.round(E('PLAYER_SHOOT_CD') / 1.5)), 'fires 50% faster while active');
  const b0 = E('player.bullets');
  ok(b0 === E('MAG_SIZE') - 1, 'LV 1: shots still use ammo');
  await arena('quickdraw', 3);
  E("useAbility(); firePlayerBullet(); firePlayerBullet();");
  ok(E('player.bullets') === E('MAG_SIZE'), 'awakened Quick Draw: shots use no ammo (Bottomless)');

  // ── Shockwave ──
  await arena('shockwave');
  const nearI = addNPC(1560), farI = addNPC(1800);
  E("window.__hn = npcs[" + nearI + "].hp; window.__hf = npcs[" + farI + "].hp; useAbility();");
  ok(near(E('__hn') - E('npcs[' + nearI + '].hp'), E('classDamage()') * 3) || E('npcs[' + nearI + '].dead'), 'Shockwave hits a nearby enemy for 3x gun damage');
  ok(E('npcs[' + farI + '].hp') === E('__hf'), 'enemies outside the radius are not hit');
  ok(E('npcs[' + nearI + '].vx') > 0 && E('npcs[' + nearI + '].vy') < 0 && !E('npcs[' + nearI + '].stun'), 'hit enemies are knocked back (no stun below awakened)');
  await arena('shockwave', 3);
  const sI = addNPC(1560, 'n.hp = n.maxHp = 1000;');
  E("useAbility();");
  ok(E('npcs[' + sI + '].stun') === 90, 'awakened Shockwave stuns for 1.5s (Concussion)');

  // ── Adrenaline ──
  await arena('adrenaline');
  E("useAbility(); keys.ArrowRight = true; updatePlayer(); keys.ArrowRight = false;");
  ok(near(E('player.vx'), E('MOVE_SPEED * PLAYER_SPEED_MULT') * 1.4), 'Adrenaline: +40% move speed');
  E("player.dashCooldown = 0; keys.ArrowDown = true; updatePlayer();");
  ok(E('player.dashCooldown') > 0, 'LV 1: dash still has its cooldown');
  await arena('adrenaline', 3);
  E("useAbility(); player.dashCooldown = 0; keys.ArrowDown = true; updatePlayer();");
  ok(E('player.dashCooldown') === 0, 'awakened Adrenaline: dash has no cooldown (Rush)');

  // ── Freeze ──
  await arena('freeze');
  const fI = addNPC(1530), offI = addNPC(3000), bossI = E("(() => { const n = makeNPC(1650, true); n.aware = true; npcs.push(n); return npcs.length - 1; })()");
  E("useAbility();");
  ok(E('npcs[' + fI + '].frozen') === 150 && !E('npcs[' + offI + '].frozen') && E('npcs[' + bossI + '].frozen') === 75, 'Freeze: on-screen enemies 2.5s, bosses half, off-screen untouched');
  E("player.hp = 100; npcs[" + fI + "].x = player.x; npcs[" + fI + "].attackCooldown = 0; window.__fx = npcs[" + bossI + "].x; for (let i = 0; i < 30; i++) { frameCount++; updateNPCs(); }");
  ok(E('player.hp') === 100 && E('npcs[' + bossI + '].x') === E('__fx'), 'frozen enemies do not move or hurt you');
  E("npcs[" + fI + "].hp = 100; hitNPC(npcs[" + fI + "], 10);");
  ok(E('npcs[' + fI + '].hp') === 90, 'LV 1: no extra damage to frozen enemies');
  await arena('freeze', 3);
  const f3 = addNPC(1530);
  E("useAbility(); npcs[" + f3 + "].hp = 100; hitNPC(npcs[" + f3 + "], 10);");
  ok(E('npcs[' + f3 + '].frozen') === 270 && E('npcs[' + f3 + '].hp') === 85, 'awakened Freeze: 4.5s, frozen enemies take +50% (Shatter)');

  // ── Chain Lightning ──
  await arena('lightning');
  [1520, 1560, 1600, 1700, 1750].forEach(x => addNPC(x, 'n.hp = n.maxHp = 1000;'));
  E("useAbility();");
  const hits = E("npcs.filter(n => n.hp < 1000).length");
  ok(hits === 3 && E("npcs.slice(0, 3).every(n => Math.abs((1000 - n.hp) - classDamage() * 5) < 1e-9)"), 'Chain Lightning zaps the 3 nearest for 5x gun damage (' + hits + ' hit)');
  await arena('lightning', 3);
  addNPC(1520, 'n.hp = 1;'); addNPC(1560, 'n.hp = 1;');
  E("useAbility();");
  ok(E('player.abilityCd') === 22 * 60 - 2 * 4 * 60, 'awakened: each kill cuts the cooldown by 4s (Overload)');

  // ── Life Leech + Overcharge ──
  await arena('leech');
  let lI = addNPC(1560, 'n.hp = 1000;');
  E("player.hp = 50; useAbility(); hitNPC(npcs[" + lI + "], 40);");
  ok(E('player.abilityTime') === 300 && near(E('player.hp'), 70), 'Life Leech: 5s, damage dealt heals 50% of it');
  E("player.hp = 170; hitNPC(npcs[" + lI + "], 100);");
  ok(E('player.hp') === 170 && !E('player.overHp'), 'LV 1: no overcharge past max HP');
  await arena('leech', 3);
  lI = addNPC(1560, 'n.hp = 10000;');
  E("player.hp = 160; useAbility(); hitNPC(npcs[" + lI + "], 100);");
  ok(E('player.hp') === 170 && near(E('player.overHp'), 40), 'awakened: healing past max HP becomes overcharge (+40)');
  E("hitNPC(npcs[" + lI + "], 1000);");
  ok(near(E('player.overHp'), 85), 'overcharge is capped at 50% of max HP (85)');
  E("player.abilityTime = 0; damagePlayer(30);");
  ok(near(E('player.overHp'), 55) && E('player.hp') === 170, 'damage uses up overcharge first, HP untouched; stays after the ability ends');
  E("player.hp = 100; player.regenTime = 60; for (let i = 0; i < 60; i++) updateAbilityTimers();");
  ok(near(E('player.overHp'), 55), 'normal healing never adds overcharge');
  E("player.hp = 170; damagePlayer(70);");
  ok(E('player.overHp') === 0 && near(E('player.hp'), 155), 'once overcharge is gone, damage hits HP');
  E("player.overHp = 40; gameState = 'level_clear'; applyLevelClearRewards();");
  ok(E('campaign.overHp') === 40, 'overcharge is kept when the level is cleared');
  E("drawHUD();");
  ok(true, 'HUD draws overcharge and the ability slot without errors');

  // ── Second slot (Q): buy for 250 gems, equip, use ──
  setProf({ gems: 200, abilities: { owned: { shield: { level: 1, copies: 0 }, freeze: { level: 1, copies: 0 } }, equipped: 'shield' } });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  let buy = d.querySelector('#slot-bar .slot-buy');
  ok(buy && buy.disabled && /250 GEMS/.test(buy.textContent) && !d.querySelector('.ab-equip2'), 'second slot costs 250 gems (locked with 200); no Q buttons yet');
  ok(W.RielAbilities.equip('freeze', 2) === false, 'cannot equip slot 2 before buying it');
  setProf({ ...prof(), gems: 300 });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  d.querySelector('#slot-bar .slot-buy').click();
  await until(() => prof().abilities.slot2, 4000);
  ok(prof().abilities.slot2 && prof().gems === 50, 'buying the second slot takes 250 gems');
  d = f.contentDocument;
  ok(d.querySelector('#slot-bar.owned') && /E\s*SHIELD/.test(d.getElementById('slot-bar').textContent) && /Q\s*EMPTY/.test(d.getElementById('slot-bar').textContent), 'slot bar shows E: SHIELD, Q: EMPTY');
  ok(W.RielAbilities.buySlot2().ok === false, 'the slot can only be bought once');
  const fc = d.querySelector('[data-id="freeze"]');
  ok(fc.querySelector('.ab-equip') && fc.querySelector('.ab-equip2') && fc.querySelector('.ab-upgrade'), 'cards now have EQUIP E, EQUIP Q and UPGRADE buttons');
  fc.querySelector('.ab-equip2').click();
  await until(() => prof().abilities.equipped2 === 'freeze', 4000);
  ok(prof().abilities.equipped === 'shield' && prof().abilities.equipped2 === 'freeze', 'EQUIP Q puts Freeze in slot 2, Shield stays on E');
  W.RielAbilities.equip('shield', 2);
  ok(prof().abilities.equipped === 'freeze' && prof().abilities.equipped2 === 'shield', 'equipping the E ability on Q swaps the two slots');
  W.RielAbilities.equip('shield', 1);
  // In game: E and Q are separate, each with its own cooldown
  put({ ...base, level: 6 });
  await go('game.html');
  E("applyLevelEvent(null); npcs.length = 0; player.x = 1500; camX = player.x - BASE_W / 2; gameState = 'playing';");
  const fq = addNPC(1530);
  ok(E('ABILITY_SLOTS[0].def.id') === 'shield' && E('ABILITY_SLOTS[1].def.id') === 'freeze', 'game loads Shield on E and Freeze on Q');
  E("keys.KeyQ = true; updatePlayer();");
  ok(E('npcs[' + fq + '].frozen') === 150 && E('player.ability2Cd') === 30 * 60 && E('player.abilityCd') === 0, 'Q uses Freeze (its own 30s cooldown); E is still ready');
  E("keys.KeyE = true; updatePlayer();");
  ok(E('player.abilityTime') === 180 && E('player.abilityCd') === 20 * 60, 'E still uses Shield');
  E("drawHUD();");
  ok(true, 'HUD draws both slots');
  setProf({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 0 } }, equipped: 'shield' } });
  await go('game.html');
  E("gameState = 'playing'; toastTimer2 = 0; keys.KeyQ = true; updatePlayer();");
  ok(/BUY IT IN THE SHOP/.test(E('toastMsg')), 'Q without the second slot: hint to buy it');

  // ── Saved mid-level, touch button ──
  await arena('shield', 1, { overHp: 25 });
  ok(E('player.overHp') === 25, 'overcharge carries into the next level');
  E("useAbility(); saveLevelProgress();");
  await go('game.html');
  ok(E('player.abilityCd') === 1200 && E('player.abilityTime') === 180 && E('player.overHp') === 25, 'a saved level keeps the ability cooldown, active time and overcharge');
  localStorage.setItem('rielrunner_settings', JSON.stringify({ touchControls: true, autoAim: true, hpBars: true, damageNumbers: true }));
  await go('game.html');
  const tb = f.contentDocument.getElementById('btn-ability');
  ok(tb && !tb.hidden, 'touch controls show the ability button when one is equipped');
  ok(f.contentDocument.getElementById('btn-ability2').hidden, 'no second slot: no Q touch button');
  setProf({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 0 }, freeze: { level: 1, copies: 0 } }, equipped: 'shield', slot2: true, equipped2: 'freeze' } });
  await go('game.html');
  ok(!f.contentDocument.getElementById('btn-ability2').hidden, 'second slot equipped: Q touch button shown');
  setProf({ gems: 0 });
  await go('game.html');
  ok(f.contentDocument.getElementById('btn-ability').hidden, 'no ability: no touch ability button');

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
