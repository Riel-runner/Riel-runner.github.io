// Layout: no overlapping text, text crossed by lines, touch buttons over HUD text,
// text off the game screen, or sideways scrolling, across the game and every page.
// Canvas: records every fillText / thin fillRect drawn by the HUD + overlays for one frame.
// HTML pages: compares the boxes of every visible text line.
// Usage: node layout-test.js <repoDir> <chromeExe>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome] = process.argv.slice(2);

const testScript = String.raw`
const out = [];
const say = s => out.push(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await wait(50); } return false; }
let f;
async function go(url, w, h) {
  if (f) f.remove();
  f = document.createElement('iframe'); f.width = w; f.height = h; document.body.appendChild(f);
  const tag = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random();
  f.src = tag;
  await until(() => f.contentDocument && f.contentDocument.URL.endsWith(tag) && f.contentDocument.readyState !== 'loading');
  await wait(500);
}
const base = { riels: 300, hp: 120, maxHp: 170, gunDamage: 2, upgradeCount: 0, upgradeCost: 4, npcCount: 5, bossesBeaten: 3, name: 'AUDIT', lives: 3 };
const put = c => { localStorage.setItem('rielrunner_campaigns', JSON.stringify([c, { ...c, name: 'FALLEN ONE', dead: true }, { ...c, name: 'DONE', completed: true, mode: 'timeattack', level: 25 }])); localStorage.setItem('activeCampaignIdx', '0'); localStorage.setItem('activeCampaign', JSON.stringify(c)); };
const inter = (a, b, pad = 0.5) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

// ── Canvas recorder ──
function instrument(W) {
  const P = W.CanvasRenderingContext2D.prototype;
  const ft = P.fillText, fr = P.fillRect;
  W.__rec = null;
  P.fillText = function (t, x, y) {
    if (W.__rec && this.canvas.id === 'game-canvas' && this.globalAlpha > 0.05) {
      const m = this.measureText(t), al = this.textAlign;
      const w = m.width, x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
      W.__rec.push({ kind: 'text', t: String(t), x: x0, y: y - m.actualBoundingBoxAscent, w, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, fn: W.__fn });
    }
    return ft.apply(this, arguments);
  };
  P.fillRect = function (x, y, w, h) {
    if (W.__rec && this.canvas.id === 'game-canvas' && this.globalAlpha > 0.05 && (Math.abs(w) <= 4 || Math.abs(h) <= 4) && Math.abs(w) * Math.abs(h) > 0)
      W.__rec.push({ kind: 'line', x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h), fn: W.__fn });
    return fr.apply(this, arguments);
  };
}
function frame(W, fns) {
  W.__rec = [];
  for (const fn of fns) { W.__fn = fn; W.eval(fn + '()'); }
  const rec = W.__rec; W.__rec = null;
  return rec;
}
function report(label, rec, W) {
  const texts = rec.filter(r => r.kind === 'text' && r.t.trim()), lines = rec.filter(r => r.kind === 'line');
  const probs = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.t === b.t && Math.abs(a.x - b.x) <= 4 && Math.abs(a.y - b.y) <= 4) continue;   // drop shadow
    if (inter(a, b)) probs.push('TEXT/TEXT "' + a.t + '" [' + a.fn + '] x "' + b.t + '" [' + b.fn + ']');
  }
  for (const t of texts) for (const l of lines) if (inter(t, l, 0.5)) probs.push('LINE/TEXT "' + t.t + '" [' + t.fn + '] crossed by line at ' + Math.round(l.x) + ',' + Math.round(l.y) + ' ' + Math.round(l.w) + 'x' + Math.round(l.h) + ' [' + l.fn + ']');
  // Touch buttons (HTML) over canvas text
  const d = W.document, cv = d.getElementById('game-canvas').getBoundingClientRect(), k = cv.width / 800;
  for (const btn of d.querySelectorAll('#touch-overlay.active .t-btn:not([hidden])')) {
    const r = btn.getBoundingClientRect();
    const bb = { x: (r.left - cv.left) / k, y: (r.top - cv.top) / k, w: r.width / k, h: r.height / k };
    for (const t of texts) if (inter(t, bb)) probs.push('BUTTON/TEXT #' + btn.id + ' covers "' + t.t + '" [' + t.fn + ']');
  }
  // Off-canvas text
  for (const t of texts) if (t.x < 0 || t.x + t.w > 800 || t.y < 0 || t.y + t.h > 450) probs.push('OFFSCREEN "' + t.t + '" [' + t.fn + '] at ' + Math.round(t.x) + ',' + Math.round(t.y) + ' w' + Math.round(t.w));
  say((probs.length ? 'FAIL ' : 'PASS ') + label + (probs.length ? ': ' + [...new Set(probs)].join(' | ') : ''));
}
const HUD = ['drawHUD', 'drawEventHUDBadge', 'drawToast', 'drawEventBanner', 'drawOverlay', 'drawPauseMenu', 'drawPauseButton'];

// ── HTML text overlap ──
function domReport(label, W, root) {
  const d = W.document, items = [];
  const walker = d.createTreeWalker(root || d.body, W.NodeFilter.SHOW_TEXT);
  let n, id = 0;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement, cs = W.getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('#intro-video')) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= parseFloat(W.getComputedStyle(e).opacity);
    if (op < 0.05) continue;
    const range = d.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) items.push({ id, el, t: n.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height });
    id++;
  }
  const probs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.id === b.id) continue;
    // shrink vertically a little: line boxes of stacked lines touch
    const A = { x: a.x, y: a.y + a.h * 0.2, w: a.w, h: a.h * 0.6 }, B = { x: b.x, y: b.y + b.h * 0.2, w: b.w, h: b.h * 0.6 };
    if (inter(A, B, 1)) probs.push('"' + a.t + '" x "' + b.t + '"');
  }
  const vw = W.innerWidth;
  const wide = [...d.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1 && W.getComputedStyle(e).position !== 'fixed'; }).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : ''));
  if (d.documentElement.scrollWidth > vw + 1) probs.push('HORIZONTAL SCROLL: page ' + d.documentElement.scrollWidth + 'px wide in ' + vw + 'px; too wide: ' + [...new Set(wide)].slice(0, 6).join(', '));
  say((probs.length ? 'FAIL ' : 'PASS ') + label + (probs.length ? ': ' + [...new Set(probs)].slice(0, 10).join(' | ') : ''));
}

(async () => {
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('rielrunner_intro_played', '1');
  const busyProfile = { gems: 1234, tokens: 4, owned: { class: ['gunner', 'smg'] }, equipped: { class: 'smg' },
    abilities: { owned: { leech: { level: 3, copies: 0 }, lightning: { level: 1, copies: 2 } }, equipped: 'leech', slot2: true, equipped2: 'lightning' } };

  for (const touch of [false, true]) {
    for (const mode of ['normal', 'timeattack', 'endless', 'bossrush']) {
      localStorage.setItem('rielrunner_profile', JSON.stringify(busyProfile));
      localStorage.setItem('rielrunner_settings', JSON.stringify({ autoAim: true, hpBars: true, damageNumbers: true, touchControls: touch }));
      for (const [w, h] of [[960, 540], [667, 375]]) {
        put({ ...base, mode, level: mode === 'bossrush' ? 30 : 46, lives: 5, overHp: 70, playTimeMs: 3723000 });
        await go('game.html', w, h);
        const W = f.contentWindow; instrument(W);
        const tag = mode + (mode === 'endless' || mode === 'bossrush' ? ' (double event)' : '') + (touch ? ' +touch' : '') + ' ' + w + 'x' + h;
        W.eval("gameState = 'playing'; " + (mode === 'endless' || mode === 'bossrush' ? "applyLevelEvent(['glass_cannon', 'enemy_glass'].map(id => LEVEL_EVENTS.find(e => e.id === id)));" : "applyLevelEvent(LEVEL_EVENTS.find(e => e.id === 'bonus_enemies'));") + " player.reloadTimer = 0; player.bullets = 3; player.jumpPowerTimer = 900; player.jumpMult = 1.5; player.speedPowerTimer = 600; player.speedMult = 2; player.dashCooldown = 100; player.ability2Cd = 600; player.abilityTime = 200; eventBannerTimer = 0; toastTimer2 = 0;");
        report('HUD ' + tag, frame(W, HUD), W);
        W.eval("player.reloadTimer = 60; eventBannerTimer = 120; showToast('ACHIEVEMENT: NO SECOND CHANCES  +500 GEMS', 120);");
        report('HUD+banner+toast+reload ' + tag, frame(W, HUD), W);
        if (mode !== 'normal' || touch || w !== 960) continue;
        W.eval("eventBannerTimer = 0; toastTimer2 = 0; clearAchievements = ['ACHIEVEMENT: SPEEDY  +100 GEMS', 'ACHIEVEMENT: LIGHTNING  +250 GEMS', 'ACHIEVEMENT: UNTOUCHABLE  +150 GEMS', 'ACHIEVEMENT: SHARPSHOOTER  +150 GEMS']; gameState = 'level_clear'; stateTimer = 80; window.proceedToShop = () => {};");
        report('LEVEL COMPLETE overlay', frame(W, HUD), W);
        W.eval("gameState = 'boss_slayed'; stateTimer = 110;");
        report('BOSS SLAYED overlay', frame(W, HUD), W);
        W.eval("applyLevelEvent(['glass_cannon', 'enemy_glass'].map(id => LEVEL_EVENTS.find(e => e.id === id))); gameState = 'paused'; stateTimer = 40;");
        report('PAUSE menu (double event)', frame(W, HUD), W);
        W.eval("gameState = 'you_win'; stateTimer = 40;");
        report('CAMPAIGN COMPLETE overlay', frame(W, HUD), W);
        W.eval("gameState = 'playing'; handleCampaignOver(); showDeathScreen();");
        await wait(300);
        domReport('DEATH screen 960', W, W.document.getElementById('death-screen'));
      }
    }
  }

  // ── HTML pages ──
  localStorage.setItem('rielrunner_profile', JSON.stringify(busyProfile));
  put({ ...base, mode: 'normal', level: 46, upgrades: { firerate: 6, damage: 3 } });
  const pages = [['index.html'], ['level-select.html'], ['shop.html'], ['settings.html'], ['credits.html'], ['achievements.html'],
    ['store.html', 'class'], ['store.html', 'weapon'], ['store.html', 'player'], ['store.html', 'trail'], ['store.html', 'ability']];
  for (const [w, h] of [[1280, 800], [375, 740]]) {
    for (const [pg, tab] of pages) {
      if (tab) localStorage.setItem('rielrunner_store_tab', tab);
      await go(pg, w, h);
      domReport(pg + (tab ? ' [' + tab + ']' : '') + ' ' + w + 'px', f.contentWindow);
    }
  }
  document.getElementById('out').textContent = out.join('\n');
})().catch(e => { document.getElementById('out').textContent = out.join('\n') + '\nERROR ' + e.stack; });
`;
const harness = `<!doctype html><html><body><pre id="out">running</pre><script>${testScript}</script></body></html>`;
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
  const m = (o || '').match(/<pre id="out">([\s\S]*?)<\/pre>/); console.log(m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : 'no result'); server.close(); }));
