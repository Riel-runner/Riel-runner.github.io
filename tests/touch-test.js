// Checks touch-control toggle + mouse/pointer input on on-screen buttons and pause menu.
// Usage: node touch-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const harness = `<!doctype html><html><head><style>html,body{margin:0}iframe{border:0;width:960px;height:600px}</style></head>
<body><pre id="out">running</pre><iframe id="f"></iframe><script>
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
