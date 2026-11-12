// Checks touch-control toggle + mouse/pointer input on on-screen buttons and pause menu.
// Usage: node touch-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const harness = `<!doctype html><html><head><style>html,body{margin:0}iframe{border:0;width:960px;height:600px}</style></head>
<body><pre id="out">running</pre><iframe id="f"></iframe><script src="js/cosmetics.js"></script><script>
const _rawSet = Storage.prototype.setItem;
const _seal = window.RielCosmetics.withKey(window.RielCosmetics.claim());
let _sealing = false;
Storage.prototype.setItem = function (k, v) { if (k === 'rielrunner_profile' && !_sealing) { let o = null; try { o = JSON.parse(v); } catch {} if (o && typeof o === 'object') { _sealing = true; try { _seal.save(Object.assign({ wipe: 1 }, o)); } finally { _sealing = false; } return; } } _rawSet.call(this, k, v); };
const f = document.getElementById('f'), log = [];
const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + m);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }
async function go(url) { const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); const snap = Object.assign({}, localStorage); f.src = 'about:blank'; await wait(150); localStorage.clear(); for (const k in snap) localStorage.setItem(k, snap[k]); f.src = tag;
  await until(() => f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading'); await wait(300); }
function ptr(el, type, x, y, pointerType = 'mouse') {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new f.contentWindow.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType,
    clientX: x ?? r.left + r.width / 2, clientY: y ?? r.top + r.height / 2, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
}
function setTouch(on) {
  localStorage.setItem('rielrunner_settings', JSON.stringify({ autoAim: true, hpBars: true, damageNumbers: true, touchControls: on, musicVolume: 0, sfxVolume: 0 }));
}
(async () => {
  localStorage.clear();
  localStorage.setItem('activeCampaign', JSON.stringify({ level: 1, riels: 0, hp: 150, maxHp: 150, lives: 3, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'T' }));

  // Setting OFF -> no on-screen buttons
  setTouch(false); await go('game.html');
  let d = f.contentDocument, w = f.contentWindow;
  ok(!d.getElementById('touch-overlay').classList.contains('active'), 'touch controls OFF: buttons hidden');

  // Pause menu works with the mouse even with touch controls off
  w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  ok(w.eval('gameState') === 'paused', 'Escape pauses');
  const cv = d.getElementById('game-canvas'), r = cv.getBoundingClientRect();
  const toClient = (x, y) => [r.left + x * r.width / w.eval('BASE_W'), r.top + y * r.height / w.eval('BASE_H')];
  const [rx, ry] = toClient(w.eval('BASE_W') / 2, w.eval('BASE_H') / 2 - 160 + w.eval('PAUSE_ITEM_Y0'));  // RESUME row
  ptr(cv, 'pointermove', rx, ry + 38 * r.height / w.eval('BASE_H'));
  ok(w.eval('pauseMenuIndex') === 1, 'mouse hover highlights pause menu item');
  ptr(cv, 'pointerdown', rx, ry);
  ok(w.eval('gameState') === 'playing', 'clicking RESUME in pause menu (touch OFF) resumes');
  { const PB0 = JSON.parse(w.eval('JSON.stringify(PAUSE_BTN)')); const [bx, by] = toClient(PB0.x + PB0.w / 2, PB0.y + PB0.h / 2);
    ptr(cv, 'pointerdown', bx, by); ok(w.eval('gameState') === 'paused', 'pause button works with touch controls OFF (desktop)'); ptr(cv, 'pointerdown', bx, by); }

  // Setting ON -> buttons shown and work with a mouse
  setTouch(true); await go('game.html');
  d = f.contentDocument; w = f.contentWindow;
  ok(d.getElementById('touch-overlay').classList.contains('active'), 'touch controls ON: buttons shown');
  const cv2 = d.getElementById('game-canvas'), r2 = cv2.getBoundingClientRect();
  const BW = w.eval('BASE_W'), BH = w.eval('BASE_H'), PB = JSON.parse(w.eval('JSON.stringify(PAUSE_BTN)'));
  const pbx = r2.left + (PB.x + PB.w / 2) * r2.width / BW, pby = r2.top + (PB.y + PB.h / 2) * r2.height / BH;
  ok(d.getElementById('btn-pause') === null, 'old touch-only pause button removed');
  ptr(cv2, 'pointerdown', pbx, pby); ptr(cv2, 'pointerup', pbx, pby);
  ok(w.eval('gameState') === 'paused', 'mouse click on top-right pause button pauses');
  ptr(cv2, 'pointerdown', pbx, pby); ptr(cv2, 'pointerup', pbx, pby);
  ok(w.eval('gameState') === 'playing', 'clicking it again (shows resume) resumes');
  ok(w.eval('mouseDown') === false, 'clicking the pause button does not fire a shot');

  for (const [id, key] of [['btn-left','ArrowLeft'],['btn-right','ArrowRight'],['btn-jump','ArrowUp'],['btn-shoot','Space'],['btn-dash','ArrowDown']]) {
    const b = d.getElementById(id);
    ptr(b, 'pointerdown');
    const down = w.eval('keys')[key] === true && b.classList.contains('pressed');
    ptr(b, 'pointerup');
    ok(down && w.eval('keys')[key] === false && !b.classList.contains('pressed'), id + ' (mouse) holds ' + key + ' while pressed, releases on up');
  }
  const left = d.getElementById('btn-left');
  ptr(left, 'pointerdown', undefined, undefined, 'touch');
  ok(w.eval('keys').ArrowLeft === true, 'btn-left still works with touch');
  left.dispatchEvent(new w.PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'touch' }));
  ok(w.eval('keys').ArrowLeft === false, 'cancelled touch releases the key');

  // Tap a pause menu item on a touchscreen
  ptr(cv2, 'pointerdown', pbx, pby, 'touch'); ptr(cv2, 'pointerup', pbx, pby, 'touch');
  ok(w.eval('gameState') === 'paused', 'tapping the pause button pauses');
  ptr(cv2, 'pointerdown', rx, ry, 'touch');
  ok(w.eval('gameState') === 'playing', 'tapping RESUME on touchscreen resumes');

  // Abilities on touch: E and Q buttons show for equipped slots and a quick tap uses them
  localStorage.setItem('rielrunner_profile', JSON.stringify({ gems: 0, abilities: { owned: { shield: { level: 1, copies: 0 }, quickdraw: { level: 1, copies: 0 } }, equipped: 'shield', slot2: true, equipped2: 'quickdraw' } }));
  setTouch(true); await go('game.html');
  d = f.contentDocument; w = f.contentWindow;
  w.eval('applyLevelEvent(null); zoneHazard = null');
  const bE = d.getElementById('btn-ability'), bQ = d.getElementById('btn-ability2');
  ok(!bE.hidden && !bQ.hidden && bE.getBoundingClientRect().width > 0 && bQ.getBoundingClientRect().width > 0, 'touch: E and Q ability buttons are shown when abilities are equipped');
  ok(w.eval('gameState') === 'playing', 'touch ability test: game is playing (' + w.eval('gameState') + ')');
  ptr(bE, 'pointerdown', undefined, undefined, 'touch'); ptr(bE, 'pointerup', undefined, undefined, 'touch');
  w.eval('updatePlayer()');
  ok(w.eval('player.abilityCd') > 0, 'touch: a quick tap on E uses the ability (cooldown ' + w.eval('player.abilityCd') + ')');
  ptr(bQ, 'pointerdown', undefined, undefined, 'touch'); ptr(bQ, 'pointerup', undefined, undefined, 'touch');
  w.eval('updatePlayer()');
  ok(w.eval('player.ability2Cd') > 0, 'touch: a quick tap on Q uses the 2nd ability (cooldown ' + w.eval('player.ability2Cd') + ')');
  const vis = [...d.querySelectorAll('#touch-overlay .t-btn')].filter(b => !b.hidden).map(b => [b.id, b.getBoundingClientRect()]);
  const hit = [];
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) { const a = vis[i][1], b = vis[j][1]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(vis[i][0] + '/' + vis[j][0]); }
  ok(!hit.length, 'touch: no buttons overlap ' + hit.join(' '));
  ok(vis.every(([, r]) => r.left >= 0 && r.top >= 0 && r.right <= w.innerWidth && r.bottom <= w.innerHeight), 'touch: every button is on screen');
  for (const [pw, ph] of [[740, 360], [667, 375], [568, 320]]) {
    f.style.width = pw + 'px'; f.style.height = ph + 'px'; await wait(300);
    const v2 = [...d.querySelectorAll('#touch-overlay .t-btn')].filter(b => !b.hidden).map(b => [b.id, b.getBoundingClientRect()]);
    const h2 = [];
    for (let i = 0; i < v2.length; i++) for (let j = i + 1; j < v2.length; j++) { const a = v2[i][1], b = v2[j][1]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) h2.push(v2[i][0] + '/' + v2[j][0]); }
    ok(!h2.length && v2.every(([, r]) => r.left >= 0 && r.top >= 0 && r.right <= pw && r.bottom <= ph), 'touch: phone sideways ' + pw + 'x' + ph + ': all buttons on screen, none overlap ' + h2.join(' '));
  }
  f.style.width = ''; f.style.height = '';

  document.getElementById('out').textContent = log.join('\\n');
})().catch(e => { document.getElementById('out').textContent = log.join('\\n') + '\\nERROR ' + e.stack; });
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/h.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(harness); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {}); res.end(d);
  });
});
server.listen(0, () => execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1000,700',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=20000', '--dump-dom',
  `http://127.0.0.1:${server.address().port}/h.html`], { maxBuffer: 1 << 24 }, (e, o) => {
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1] : 'no result'); server.close(); }));
