// Pets (js/pets.js, js/store-pets.js): the pet wheel in the gem shop, fusing copies
// (3 for LV 2, 10 to awaken), equipping, every pet's buffs and awakened effect in game,
// and the pet following you. Usage: node pets-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const f = document.getElementById('f'), log = [];
// Profiles written by hand here get signed with this test page's own save key.
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
const withPet = (id, level = 1, copies = 0) => setProf({ gems: 0, pets: { owned: { [id]: { level, copies } }, equipped: id } });
const E = js => f.contentWindow.eval(js);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Game page with an empty arena: player at x=1500, no event, no hazard.
async function arena(id, level = 1, campaignLevel = 6) {
  if (id) withPet(id, level); else setProf({ gems: 0 });
  put({ ...base, level: campaignLevel });
  await go('game.html');
  E("applyLevelEvent(null); zoneHazard = null; npcs.length = 0; platforms.length = 0; bullets.length = 0; lasers.length = 0; enemyShots.length = 0; powerups.length = 0; player.x = 1500; player.y = GROUND_Y - PLAYER_H; player.vx = 0; player.invuln = 0; player.dashCooldown = 0; camX = player.x - BASE_W / 2; gameState = 'playing'; for (const k in keys) keys[k] = false; mouseDown = false;");
}
const addNPC = (x, extra = '') => E("(() => { const n = makeNPC(" + x + "); n.aware = true; " + extra + " npcs.push(n); return npcs.length - 1; })()");
const hitFor = (i, hp, dmg) => { E("npcs[" + i + "].hp = " + hp + "; hitNPC(npcs[" + i + "], " + dmg + ");"); return hp - E('npcs[' + i + '].hp'); };

(async () => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('rielrunner_store_tab', 'pet');

  // ── Shop tab, wheel, odds ──
  setProf({ gems: 50 });
  await go('store.html');
  let d = f.contentDocument, W = f.contentWindow;
  ok(d.querySelectorAll('.tab').length === 6 && [...d.querySelectorAll('.tab')].some(t => t.dataset.cat === 'pet' && t.classList.contains('active')), 'gem shop has a PETS tab (6 tabs)');
  ok(!d.getElementById('pet-panel').hidden && d.getElementById('ability-panel').hidden && d.getElementById('store-grid').hidden, 'pets tab shows the pet wheel');
  ok(d.getElementById('pet-roll-btn').disabled && /100 GEMS/.test(d.getElementById('pet-roll-btn').textContent), 'a pet spin costs 100 gems; disabled without enough');
  ok(d.querySelectorAll('.pet-card').length === 9 && d.querySelectorAll('.pet-card.locked').length === 9, 'all 9 pets listed, all locked at first');
  ok(W.RielPets.roll().ok === false && prof().gems === 50, 'cannot roll without 100 gems');
  const P = W.RielPets;
  const r = x => P.pick(() => x).rarity;
  ok(r(0) === 'common' && r(0.599) === 'common' && r(0.61) === 'rare' && r(0.88) === 'super' && r(0.975) === 'legendary', 'pet wheel odds: 60% common, 27% rare, 10% super rare, 3% legendary');
  const nBuffs = id => Object.keys(P.byId(id).lv[0]).length;
  ok(P.LIST.filter(p => p.rarity === 'common' || p.rarity === 'rare').every(p => nBuffs(p.id) === 1), 'common and rare pets give one buff');
  ok(P.LIST.filter(p => p.rarity === 'super').every(p => nBuffs(p.id) === 2) && nBuffs('dragon') === 4, 'super rare pets give 2 buffs combined, the legendary dragon 4');
  ok(P.LIST.every(p => p.lv[2][Object.keys(p.lv[2])[0]] > p.lv[0][Object.keys(p.lv[0])[0]] && p.trait), 'every pet gets stronger with level and has an awakened effect');

  // ── Spinning ──
  setProf({ gems: 1000 });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  W.StorePets.SPIN_MS = 60;
  W.StorePets.roll();
  ok(prof().gems === 900 && d.getElementById('pet-roll-btn').disabled, 'spinning takes 100 gems and locks the button while it spins');
  const first = Object.keys(prof().pets.owned)[0];
  ok(first && prof().pets.equipped === first, 'the first pet won is equipped automatically (' + first + ')');
  await until(() => !d.getElementById('pet-roll-result').hidden);
  ok(/NEW PET/.test(d.getElementById('pet-roll-result').textContent), 'result card says NEW PET');
  ok(/FOLLOWING YOU/.test(d.getElementById('pet-bar').textContent) && d.querySelector('.pet-card').dataset.id === first, 'the equipped pet is shown first, and as following you');

  // ── Fusing ──
  setProf({ gems: 0, pets: { owned: { pup: { level: 1, copies: 2 }, owl: { level: 1, copies: 0 } }, equipped: 'owl' } });
  await go('store.html');
  d = f.contentDocument; W = f.contentWindow;
  ok(!W.RielPets.canFuse('pup') && W.RielPets.fuse('pup').ok === false, '2 copies: cannot fuse yet');
  setProf({ gems: 0, pets: { owned: { pup: { level: 1, copies: 3 }, owl: { level: 1, copies: 0 } }, equipped: 'owl' } });
  await go('store.html');
  d = f.contentDocument;
  let pc = d.querySelector('.pet-card[data-id="pup"]');
  ok(pc && !pc.querySelector('.pet-fuse').disabled && /3 \/ 3 COPIES TO FUSE TO LV 2/.test(pc.textContent) && /\+12% DAMAGE/.test(pc.textContent), 'pup card: +12% damage, 3 / 3 copies, FUSE button next to EQUIP');
  pc.querySelector('.pet-fuse').click();
  await wait(1700);
  ok(prof().pets.owned.pup.level === 2 && prof().pets.owned.pup.copies === 0, 'fusing uses 3 copies: now LV 2');
  pc = f.contentDocument.querySelector('.pet-card[data-id="pup"]');
  ok(/\+18% DAMAGE/.test(pc.textContent) && /0 \/ 10 COPIES TO AWAKEN/.test(pc.textContent) && /AWAKEN/.test(pc.querySelector('.pet-fuse').textContent), 'LV 2: +18% damage, 10 more copies to AWAKEN');
  setProf({ gems: 0, pets: { owned: { pup: { level: 2, copies: 11 }, owl: { level: 1, copies: 0 } }, equipped: 'owl' } });
  await go('store.html');
  W = f.contentWindow;
  const fr = W.RielPets.fuse('pup');
  ok(fr.ok && fr.awakened && prof().pets.owned.pup.level === 3 && prof().pets.owned.pup.copies === 1, '10 copies awaken it (1 spare)');
  ok(W.RielPets.fuse('pup').ok === false, 'awakened is the max level');
  W.render();
  pc = f.contentDocument.querySelector('.pet-card[data-id="pup"]');
  ok(pc.classList.contains('awakened') && pc.querySelector('.ab-trait.on') && /BOSS HUNTER/.test(pc.textContent) && !pc.querySelector('.pet-fuse'), 'awakened card shows its effect as active, no fuse button');
  pc.querySelector('.pet-equip').click();
  await wait(1700);
  ok(prof().pets.equipped === 'pup', 'EQUIP switches the pet that follows you');

  // ── In game: buffs ──
  await arena(null);
  ok(E('PET') === null && E('petDamageMult(null)') === 1 && E('petArmorMult()') === 1, 'no pet: no buffs');
  let i0 = addNPC(1600);
  ok(near(hitFor(i0, 100, 10), 10), 'no pet: normal damage');

  await arena('pup', 1);
  i0 = addNPC(1600);
  ok(near(hitFor(i0, 100, 10), 11.2), 'SCRAPPY LV 1: +12% damage');
  await arena('pup', 3, 10);
  i0 = addNPC(1600);
  ok(near(hitFor(i0, 1000, 10), 10 * 1.25 * 1.6), 'awakened SCRAPPY on a boss level: +25% and Boss Hunter +60%');
  await arena('pup', 3, 6);
  i0 = addNPC(1600);
  ok(near(hitFor(i0, 1000, 10), 12.5), 'awakened SCRAPPY on a normal level: just +25%');

  await arena('turtle', 1);
  ok(near(E('damagePlayer(100)'), E('100 * (1 - ARMOR_BLOCK) * 0.88')), 'SHELLY LV 1: 12% less damage taken');
  await arena('turtle', 3);
  const hp0 = E('player.hp');
  ok(E('damagePlayer(50)') === 0 && E('player.hp') === hp0 && E('player.petShell') === false, 'awakened SHELLY: the first hit is blocked (Hard Shell)');
  ok(E('damagePlayer(10)') > 0, 'the next hit gets through (25% less)');
  E('for (let k = 0; k < 600; k++) updatePet();');
  ok(E('player.petShell') === true && E('damagePlayer(50)') === 0, 'the shell grows back after 10s and blocks another whole hit');
  E('player.dead = true; player.deathX = 1500; respawnPlayer(); player.invuln = 0;');
  ok(E('damagePlayer(50)') === 0, 'after a respawn the shell blocks one hit again');

  await arena('bunny', 1);
  E("keys.ArrowRight = true; updatePlayer(); keys.ArrowRight = false;");
  ok(near(E('player.vx'), E('MOVE_SPEED * PLAYER_SPEED_MULT * 1.1')), 'HOPPER LV 1: +10% move speed');
  await arena('bunny', 3);
  i0 = addNPC(1700);
  ok(near(hitFor(i0, 1000, 10), 10), 'awakened HOPPER: no damage boost before dashing');
  E("keys.ArrowDown = true; updatePlayer();");
  ok(E('player.petSpring') === 240 && near(hitFor(i0, 1000, 10), 15), 'awakened HOPPER: +50% damage for 4s after a dash (Spring)');
  E("for (let k = 0; k < 241; k++) updatePet();");
  ok(near(hitFor(i0, 1000, 10), 10), 'Spring wears off after 4s');

  await arena('owl', 1);
  E("player.shootTimer = 0; player.bullets = 20; player.reloadTimer = 0; keys.Space = true; updatePlayer(); keys.Space = false;");
  ok(near(E('player.shootTimer'), E('PLAYER_SHOOT_CD / 1.15')), 'HOOT LV 1: +15% fire rate');
  await arena('owl', 3);
  E("bullets.length = 0; for (let k = 0; k < 5; k++) { player.bullets = 20; player.reloadTimer = 0; firePlayerBullet(); }");
  ok(E('bullets.filter(b => b.sharp).length') === (E('PLAYER_CLASS.pellets || 1')) && E('bullets[bullets.length - 1].sharp') === true, 'awakened HOOT: every 5th shot is a Sharp Eye shot');
  i0 = addNPC(1700);
  E("bullets.length = 0; const n = npcs[" + i0 + "]; n.hp = 1000; n.maxHp = 1000; bullets.push({ x: n.x + n.w / 2, y: n.y + n.h / 2, dx: 1, dy: 0, alive: true, speed: 0, pierce: false, hits: [], life: 0, sharp: true }); window.__h = n.hp; updateNPCs();");
  ok(near(E('__h - npcs[' + i0 + '].hp'), E('classDamage() * 3')), 'a Sharp Eye shot hits for triple damage');

  await arena('frog', 1);
  E('player.hp = 50; for (let k = 0; k < 180; k++) updatePet();');
  ok(near(E('player.hp'), 50 + 170 * 0.02), 'CROAK LV 1: heals 2% max HP every 3s');
  E('player.hp = 170; for (let k = 0; k < 180; k++) updatePet();');
  ok(E('player.hp') === 170, 'regen never heals past max HP');
  await arena('frog', 3);
  addNPC(2200);
  i0 = addNPC(1700);
  E('player.hp = 50; player.petRegen = 0; killNPC(npcs[' + i0 + ']);');
  ok(near(E('player.hp'), 50 + 170 * 0.05), 'awakened CROAK: every kill heals 5% max HP (Feast)');

  await arena('cat', 1);
  addNPC(2200);
  i0 = addNPC(1700, 'n.rielReward = 10;');
  let r0 = E('campaign.riels');
  E('killNPC(npcs[' + i0 + '])');
  ok(E('campaign.riels') - r0 === 13, 'LUCKY LV 1: +25% riels from kills (10 -> 13)');
  await arena('cat', 3, 10);
  addNPC(2200); addNPC(2300);
  i0 = addNPC(1700, 'n.rielReward = 10;');
  r0 = E('campaign.riels');
  E('killNPC(npcs[' + i0 + '])');
  ok(E('campaign.riels') - r0 === 48, 'awakened LUCKY on a boss level: +60% and triple riels (Jackpot)');

  await arena('fox', 1);
  i0 = addNPC(1600);
  E("player.shootTimer = 0; player.bullets = 20; player.reloadTimer = 0; keys.Space = true; updatePlayer(); keys.Space = false;");
  ok(near(hitFor(i0, 1000, 10), 11.2) && near(E('player.shootTimer'), E('PLAYER_SHOOT_CD / 1.12')), 'EMBER LV 1: +12% damage AND +12% fire rate');
  await arena('fox', 3);
  i0 = addNPC(1600);
  E('npcs[' + i0 + '].maxHp = 100;');
  ok(near(hitFor(i0, 50, 10), 12.5) && near(hitFor(i0, 35, 10), 12.5 * 1.8), 'awakened EMBER: +80% damage to enemies under 40% HP (Finisher)');

  await arena('penguin', 1);
  E("keys.ArrowRight = true; updatePlayer(); keys.ArrowRight = false;");
  ok(near(E('damagePlayer(100)'), E('100 * (1 - ARMOR_BLOCK) * 0.88')) && near(E('player.vx'), E('MOVE_SPEED * PLAYER_SPEED_MULT * 1.1')), 'FROSTY LV 1: 12% less damage AND +10% speed');
  await arena('penguin', 3);
  E('player.hp = 150;');
  const full = E('damagePlayer(10)');
  E('player.hp = 40;');
  ok(near(E('damagePlayer(10)'), full * 0.5), 'awakened FROSTY: under 40% HP you take half damage (Last Stand)');

  await arena('dragon', 1);
  i0 = addNPC(1650, 'n.hp = 1000; n.maxHp = 1000;');
  E('for (let k = 0; k < 400; k++) updatePet();');
  ok(E('npcs[' + i0 + '].hp') === 1000 && E('petShots.length') === 0, 'DRACO LV 1: no fireballs before it is awakened');
  ok(near(hitFor(i0, 1000, 10), 12.5) && near(E('damagePlayer(100)'), E('100 * (1 - ARMOR_BLOCK) * 0.9')), 'DRACO LV 1: +25% damage and 10% less damage taken (plus fire rate and regen)');
  await arena('dragon', 3);
  i0 = addNPC(1650, 'n.hp = 1000; n.maxHp = 1000;');
  const i1 = addNPC(1690, 'n.hp = 1000; n.maxHp = 1000;');
  const i2 = addNPC(2600, 'n.hp = 1000; n.maxHp = 1000;');
  E('for (let k = 0; k < 40; k++) updatePet();');
  const burn = 1000 - E('npcs[' + i0 + '].hp');
  ok(near(burn, E('classDamage() * 8 * 1.5')), 'awakened DRACO: breathes a fireball at the nearest enemy for 8x damage (' + Math.round(burn * 10) / 10 + ')');
  ok(near(1000 - E('npcs[' + i1 + '].hp'), burn) && E('npcs[' + i2 + '].hp') === 1000, 'the fireball explodes on the enemy next to it too, not on far ones');
  ok(E('player.petBreath') > 100 && E('PET_BREATH_FRAMES') === 150, 'and breathes again every 2.5s');
  E("npcs.length = 0; petShots.length = 0; player.petBreath = 0; pet.x = player.x; pet.y = player.y - 4;");
  const iD = addNPC(1800, 'n.hp = 1000; n.maxHp = 1000; n.y = GROUND_Y - n.h;');
  E("updatePet();");
  E("(() => { const n = npcs[" + iD + "]; for (let k = 0; k < 140 && petShots.length; k++) { n.x += 3.5; n.y = GROUND_Y - n.h - Math.abs(Math.sin(k / 6)) * 60; updatePet(); } })()");
  ok(E('npcs[' + iD + '].hp') < 1000, 'the fireball homes in: it still hits an enemy that runs away and jumps to dodge it');
  E("npcs.length = 0; petShots.length = 0; player.petBreath = 0;");
  const iA = addNPC(1700, 'n.hp = 1000; n.maxHp = 1000;'), iB = addNPC(1900, 'n.hp = 1000; n.maxHp = 1000;');
  E("updatePet(); npcs[" + iA + "].dead = true; for (let k = 0; k < 120 && petShots.length; k++) updatePet();");
  ok(E('npcs[' + iB + '].hp') < 1000, 'if its target dies first, the fireball turns to the nearest enemy left');

  // ── The pet follows you and is drawn ──
  E("player.x = 2000; for (let k = 0; k < 90; k++) updatePet();");
  ok(Math.abs(E('pet.x') - E('player.x')) < 40, 'the pet follows you around');
  const drew = E("(() => { let n = 0; const fr = ctx.fillRect; ctx.fillStyle = '#000'; ctx.fillRect = function () { if (String(ctx.fillStyle).toLowerCase() === PET.def.color) n++; return fr.apply(this, arguments); }; try { camX = player.x - 300; drawPet(); } finally { ctx.fillRect = fr; } return n; })()");
  ok(drew > 10, 'the pet is drawn next to you (' + drew + ' pixels in its colour)');
  const sh = JSON.parse(E("(() => { const r = []; const fr = ctx.fillRect; ctx.fillRect = function (x, y, w, h) { if (String(ctx.fillStyle).replace(/ /g, '').indexOf('rgba(0,0,0,') === 0) r.push(y + h); return fr.apply(this, arguments); }; try { platforms.length = 0; player.y = GROUND_Y - PLAYER_H; for (let k = 0; k < 60; k++) updatePet(); drawPet(); } finally { ctx.fillRect = fr; } return JSON.stringify({ r, petBottom: pet.y + PET.def.art.length * PET_SCALE / 2, ground: GROUND_Y }); })()"));
  ok(sh.r.length === 1 && Math.abs(sh.r[0] - sh.ground) < 1 && sh.petBottom < sh.ground - 10, 'the flying pet casts its shadow on the floor below it, not in the air under it');

  // ── Saved with the level ──
  await arena('turtle', 3);
  E("damagePlayer(5); saveLevelProgress();");
  await go('game.html');
  ok(E('player.petShell') === false, 'the used-up Hard Shell is saved with the level (no free block from reloading)');

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
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=120000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
