// Campaign types and Riel Tokens: unlocking, finishing a campaign (token once, complete screen,
// no replay), Time Attack, Endless, Boss Rush, Nightmare. Usage: node modes-test.js <repoDir> <chromeExe>
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
  sessionStorage.setItem('rielrunner_intro_played', '1');
  const prof = () => JSON.parse(localStorage.getItem('rielrunner_profile') || '{}');
  const slot = () => JSON.parse(localStorage.getItem('rielrunner_campaigns'))[0];
  const E = js => f.contentWindow.eval(js);

  // Locked types with 0 tokens
  await go('level-select.html');
  let d = f.contentDocument;
  f.contentWindow.openNewModal();
  let btns = [...d.querySelectorAll('.mode-btn')];
  ok(btns.length === 5 && btns.map(b => b.querySelector('span').textContent).join('|') === 'CAMPAIGN|TIME ATTACK|ENDLESS|BOSS RUSH|NIGHTMARE', 'new campaign offers 5 types in order');
  ok(!btns[0].disabled && btns.slice(1).every(b => b.disabled) && /1 TOKEN/.test(btns[1].textContent) && /4 TOKENS/.test(btns[4].textContent), '0 tokens: only CAMPAIGN open; others need 1-4 tokens');
  ok(d.getElementById('token-count').textContent === '0', 'level select shows the token count');

  // Finish a normal campaign at level 100
  put({ ...base, name: 'WIN', level: 100, lives: 2, hp: 170, riels: 10 });
  await go('game.html');
  E("npcs.forEach(n => { n.dead = true; n.hp = 0; }); gameState = 'playing'; checkLevelClear();");
  ok(E('gameState') === 'you_win' && slot().completed === true && prof().tokens === 1, 'beating level 100 completes the campaign and gives 1 Riel Token');
  E('for (let i = 0; i < 75; i++) drawOverlay();');
  const reward = f.contentDocument.getElementById('death-reward').textContent;
  ok(!f.contentDocument.getElementById('death-screen').hidden && /CAMPAIGN COMPLETE/.test(f.contentDocument.getElementById('death-title').textContent), 'shows the CAMPAIGN COMPLETE screen');
  ok(/\+1 RIEL TOKEN/.test(reward) && /UNLOCKED: TIME ATTACK/.test(reward), 'complete screen: +1 RIEL TOKEN and TIME ATTACK unlocked');
  E('completionResult = null; completeCampaign();');
  ok(prof().tokens === 1, 'a campaign can only give its token once');
  await go('level-select.html');
  d = f.contentDocument;
  const card = d.querySelector('.slot-card.completed');
  ok(card && /COMPLETED/.test(card.textContent), 'level select shows it as COMPLETED');
  card.click(); await wait(300);
  ok(d.getElementById('details-modal').classList.contains('active') && /level-select/.test(f.contentWindow.location.href), 'completed campaign opens details, not the game');
  await go('game.html');
  ok(await until(() => /level-select/.test(f.contentWindow.location.href)), 'completed campaign cannot be replayed');

  // Time Attack: unlocked at 1 token, 25 levels, best time saved, next unlock
  await go('level-select.html');
  d = f.contentDocument; f.contentWindow.openNewModal();
  ok(!d.querySelector('.mode-btn[data-mode="timeattack"]').disabled && d.querySelector('.mode-btn[data-mode="endless"]').disabled, '1 token: TIME ATTACK unlocked, ENDLESS still locked');
  const ta = E('getDefaultCampaignState("TA", "timeattack")');
  ok(ta.mode === 'timeattack' && ta.level === 1, 'time attack campaign starts at level 1');
  put({ ...base, ...ta, level: 25, playTimeMs: 754000 });
  await go('game.html');
  ok(/LVL 25 \/ 25/.test(E('window.RielModes.stageLabel(campaign, true)')), 'HUD label: LVL 25 / 25');
  E("npcs.forEach(n => { n.dead = true; n.hp = 0; }); gameState = 'playing'; checkLevelClear(); for (let i = 0; i < 75; i++) drawOverlay();");
  const r2 = f.contentDocument.getElementById('death-reward').textContent;
  ok(slot().completed && prof().tokens === 2 && prof().records.timeattack >= 754000 && prof().records.timeattack < 760000, 'finishing level 25 completes Time Attack, +1 token, best time saved');
  ok(/UNLOCKED: ENDLESS/.test(r2) && /BEST TIME: 12:3/.test(r2), 'complete screen: ENDLESS unlocked, new best time');

  // Endless: never completes, best wave saved on death
  put({ ...base, name: 'E', mode: 'endless', level: 100, lives: 3, hp: 170 });
  await go('game.html');
  E("npcs.forEach(n => { n.dead = true; n.hp = 0; }); gameState = 'playing'; checkLevelClear();");
  ok(E('gameState') === 'boss_slayed' && !slot().completed, 'endless: wave 100 is just another wave (no ending)');
  put({ ...base, name: 'E2', mode: 'endless', level: 37, lives: 1, hp: 1 });
  await go('game.html');
  E('killPlayer();');
  ok(prof().records.endless === 37, 'endless: best wave saved when you fall (37)');

  // Boss Rush: starts at boss 1 with riels, jumps boss to boss, big boss payouts
  localStorage.setItem('rielrunner_profile', JSON.stringify({ ...prof(), tokens: 3 }));
  await go('level-select.html');
  const br = f.contentWindow.eval('getDefaultCampaignState("BR", "bossrush")');
  ok(br.level === 10 && br.riels === 50, 'boss rush starts at the first boss with 50 KHR');
  put({ ...base, ...br, riels: 0 });
  await go('shop.html');
  f.contentWindow.continueToGame();
  ok(JSON.parse(localStorage.getItem('activeCampaign')).level === 20, 'shop CONTINUE goes to the next boss (level 20)');
  put({ ...base, ...br, level: 30, riels: 0 });
  await go('game.html');
  ok(E('npcs.length === 1 && npcs[0].isBoss') && E('npcs[0].rielReward') === 90, 'boss 3 pays 90 KHR in boss rush');
  ok(E('window.RielModes.stageLabel(campaign, true)') === 'BOSS 3 / 10', 'HUD label: BOSS 3 / 10');

  // Nightmare: 1 life, tougher, every enemy type at level 1, double gems
  put({ ...base, name: 'N', mode: 'nightmare', level: 1, lives: 1, hp: 170 });
  await go('game.html');
  ok(E('MAX_LIVES') === 1 && E('player.lives') === 1, 'nightmare: 1 life');
  ok(E('makeNPC(1000).maxHp') === 15, 'nightmare: enemies 50% tougher (10 -> 15 HP at level 1)');
  ok(E('(() => { const s = new Set(); for (let i = 0; i < 400; i++) s.add(pickEnemyKind(1)); return s.size; })()') >= 5, 'nightmare: special enemy types from level 1');
  ok(E('gemsForThisLevel()') === 20, 'nightmare: double gems (20 per level)');

  // Title shows tokens
  await go('index.html');
  ok(f.contentDocument.getElementById('token-count').textContent === '3', 'title screen shows the token count');

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
