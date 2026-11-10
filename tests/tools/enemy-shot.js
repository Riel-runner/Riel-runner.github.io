// Screenshot of the game with one of each enemy type lined up in view.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome, out] = process.argv.slice(2);
const page = `<!doctype html><html><head><style>html,body{margin:0;background:#000;overflow:hidden}iframe{border:0;width:960px;height:540px}</style></head><body>
<iframe id="f"></iframe><script>
localStorage.clear(); sessionStorage.clear();
const c = { name: 'SHOT', level: 60, riels: 120, hp: 300, maxHp: 300, lives: 3, gunDamage: 20, upgradeCount: 10, npcCount: 9, bossesBeaten: 5,
  seenKinds: ['runner','spitter','bomber','shielder','medic'] };
localStorage.setItem('activeCampaign', JSON.stringify(c));
localStorage.setItem('rielrunner_settings', JSON.stringify({ autoAim: true, hpBars: true, damageNumbers: true, touchControls: false, musicVolume: 0, sfxVolume: 0 }));
const f = document.getElementById('f');
f.onload = () => setTimeout(() => {
  const w = f.contentWindow;
  w.eval("npcs.length = 0; lasers.length = 0; platforms.length = 0; player.x = 150; player.y = GROUND_Y - PLAYER_H; camX = 0; gameState = 'paused';" +
    "const kinds = ['normal','runner','spitter','bomber','shielder','medic']; kinds.forEach((k, i) => { const n = makeNPC(260 + i * 85, false, null, null, false, k); n.aware = true; n.facing = -1; npcs.push(n); });" +
    "const t = makeNPC(780, false, null, null, true); npcs.push(t);" +
    "npcs[2].windup = 10; npcs[3].fuse = 20; npcs[5].healPulse = 12; npcs[3].hp *= 0.6;" +
    "enemyShots.push({ x: 360, y: GROUND_Y - 18, vx: -3, vy: 0, life: 99, dmg: 1 });" +
    "toastMsg = ''; toastTimer2 = 0; gameState = 'you_win_hold';" +
    "drawWorld(); drawNPCs(); drawEnemyShots(); drawPlayer(); drawHUD();" +
    "ctx.font = '7px \\"Public Pixel\\", monospace'; ctx.fillStyle = '#e8e8d0'; ctx.textAlign = 'center';" +
    "['NORMAL','RUNNER','SPITTER','BOMBER','SHIELDER','MEDIC'].forEach((s, i) => ctx.fillText(s, wp(260 + i * 85) + 9, GROUND_Y + 18)); ctx.fillText('TANK', wp(780) + 13, GROUND_Y + 18);" +
    "loop = function(){};");
}, 500);
f.src = 'game.html';
</script></body></html>`;
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/shot.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {}); res.end(d);
  });
});
server.listen(0, () => execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--window-size=960,540',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, '--virtual-time-budget=5000', `--screenshot=${out}`,
  `http://127.0.0.1:${server.address().port}/shot.html`], () => { console.log('saved'); server.close(); }));
