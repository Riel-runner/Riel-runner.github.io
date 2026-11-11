// ─── BACKGROUND ANIMATION ───────────────────────────────────────────
// A looping battle behind the title: the player (in their equipped shop skin,
// weapon skin and trail) runs in place and shoots an endless stream of enemies
// that march in close. Everything scales with the screen size.
const bgCanvas = document.getElementById('bg-canvas');
const ctx = bgCanvas.getContext('2d');
const COS = window.RielCosmetics;
const PLAYER_SKIN = COS.equipped('player');
const WEAPON_SKIN = COS.equipped('weapon');
const TRAIL_ID    = COS.equipped('trail').id;
const PLAYER_CLASS = COS.equipped('class');     // gun shape (class weapon)

// Enemy types (same sprite, colours and accessories as the game: js/enemy-sprite.js).
// Each is 6 x 8 cells, so the 12 x 16 pixel art fits exactly.
const ENEMY_TYPES = {
  normal:  { hp: 3, speed: 1.0, size: 1.0 },
  runner:  { hp: 2, speed: 1.6, size: 1.0 },
  spitter: { hp: 3, speed: 0.9, size: 1.0 },
  tank:    { hp: 6, speed: 0.6, size: 1.5 },
};
const ENEMY_COUNT = 4;

let W, H, S, FLOOR_Y;   // S = screen px per sprite pixel; FLOOR_Y = floor surface (px)
const player  = { x: 0, shootTimer: 0, gunFlash: 0, recoil: 0 };
const bullets = [], enemies = [], sparks = [], coins = [], trail = [];

function resize() {
  W = bgCanvas.width = window.innerWidth;
  H = bgCanvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
  S = Math.max(4, Math.min(8, Math.round(H / 100)));          // bigger sprites on bigger screens
  FLOOR_Y = H - Math.max(36, Math.round(H * 0.08));
  player.x = Math.max(12, Math.round(W * 0.06));
  for (const e of enemies) { e.cell = Math.round(S * ENEMY_TYPES[e.type].size); e.y = FLOOR_Y - 8 * e.cell; }
}
resize();
window.addEventListener('resize', resize);

// Closest the enemies get: just in front of the gun.
const frontLine = () => player.x + 15 * S;

function spawnEnemy(x) {
  const r = Math.random();
  const type = r < 0.2 ? 'tank' : r < 0.4 ? 'runner' : r < 0.55 ? 'spitter' : 'normal';
  const t = ENEMY_TYPES[type], cell = Math.round(S * t.size);
  enemies.push({ type, x, y: FLOOR_Y - 8 * cell, cell, step: 0, hp: t.hp, maxHp: t.hp,
                 dead: false, deadTimer: 0, frame: Math.floor(Math.random() * 20), hitFlash: 0, hop: 0 });
}
// Start with a few already close, the rest walking in.
for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy(Math.max(frontLine() + 40, W * 0.45) + i * W * 0.18);

// ─── DRAWING ─────────────────────────────────────────────────────────
let scrollX = 0;

function drawBackground() {
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, W, H);

  // Grid
  const grid = 16 * S;
  ctx.fillStyle = 'rgba(245,196,0,0.04)';
  for (let x = -(scrollX % grid); x < W; x += grid) ctx.fillRect(x, 0, 1, FLOOR_Y);
  for (let y = 0; y < FLOOR_Y; y += grid) ctx.fillRect(0, y, W, 1);

  // Parallax pillars
  const gap = 40 * S, pOff = (scrollX * 0.3) % gap;
  ctx.fillStyle = 'rgba(30,35,60,0.8)';
  for (let x = -pOff; x < W; x += gap) ctx.fillRect(x, 0, 4 * S, FLOOR_Y);

  // Floor
  const edge = Math.max(2, Math.round(S / 2));
  ctx.fillStyle = '#1a1e30';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = '#f5c400'; ctx.fillRect(0, FLOOR_Y, W, edge);
  ctx.fillStyle = '#b8920a'; ctx.fillRect(0, FLOOR_Y + edge, W, edge);
  const tile = 16 * S, tOff = scrollX % (tile * 2);
  ctx.fillStyle = 'rgba(245,196,0,0.07)';
  for (let x = -tOff; x < W; x += tile * 2) ctx.fillRect(x, FLOOR_Y + S, tile, H);
}

function shadow(cx, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(Math.round(cx - w / 2), FLOOR_Y - Math.round(S / 2), Math.round(w), Math.round(S / 2) + 1);
}

const SKULL_FRAMES = 120;       // same as the game: the skull rises and fades over 2 seconds
const SKULL_RISE_CELLS = 13;    // how far it rises, in skull pixels (the game's 40px at its pixel size)
const SKULL = [[1,0],[2,0],[3,0],[0,1],[2,1],[4,1],[0,2],[1,2],[2,2],[3,2],[4,2],[1,3],[3,3],[1,4],[2,4],[3,4]];

function drawEnemy(e) {
  const c = e.cell;
  if (e.dead) {                       // skull floats up and fades away, like in the game
    const t = Math.min(1, e.deadTimer / SKULL_FRAMES);
    const sy = Math.round(FLOOR_Y - 5 * c - t * SKULL_RISE_CELLS * c);
    ctx.globalAlpha = 1 - t * t * (3 - 2 * t);
    ctx.fillStyle = '#e8e8d0';
    for (const [x, y] of SKULL) ctx.fillRect(e.x + x * c, sy + y * c, c, c);
    ctx.fillStyle = '#0a0e1a';
    for (const [x, y] of [[1,1],[3,1],[2,3]]) ctx.fillRect(e.x + x * c, sy + y * c, c, c);
    ctx.globalAlpha = 1;
    return;
  }
  const lift = e.hop > 0 ? Math.round(Math.sin(e.hop / 10 * Math.PI) * 3 * S) : 0;
  const y0 = e.y - lift;
  shadow(e.x + 3 * c, 6 * c);
  window.RielEnemySprite.draw(ctx, e.x, y0, 6 * c, 8 * c, {
    kind: e.type, step: e.step, facing: -1,                 // walking left, toward the player
    body: e.hitFlash > 0 ? '#ffffff' : null,
  });
  // HP bar
  const bw = 6 * c, bh = Math.max(3, Math.round(S / 2)), by = y0 - Math.max(6, S);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(e.x, by, bw, bh);
  ctx.fillStyle = '#2ecc71'; ctx.fillRect(e.x, by, Math.round(bw * e.hp / e.maxHp), bh);
}

const playerTop = () => FLOOR_Y - 8 * S;
const muzzle = () => ({ x: player.x - player.recoil + (PLAYER_CLASS.muzzle + 1) * S, y: playerTop() + 3 * S + Math.floor(S / 4) });

// ─── UPDATE ──────────────────────────────────────────────────────────
function nearestEnemy() {
  let best = null;
  for (const e of enemies) if (!e.dead && e.x < W && (!best || e.x < best.x)) best = e;
  return best;
}

function update(tick) {
  scrollX += S * 0.4;

  // Shoot steadily at whatever is closest on screen
  if (++player.shootTimer >= 14 && nearestEnemy()) {
    player.shootTimer = 0;
    const m = muzzle();
    bullets.push({ x: m.x, y: m.y });
    player.gunFlash = 4;
    player.recoil = Math.round(S / 2);
  }
  if (player.gunFlash > 0) player.gunFlash--;
  if (player.recoil > 0 && tick % 2 === 0) player.recoil--;

  // Bullets and hits
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += 3 * S;
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (b.x + 3 * S > e.x && b.x < e.x + 6 * e.cell && b.y > e.y - 3 * S && b.y < FLOOR_Y) {
        e.hp--; e.hitFlash = 5; hit = true;
        for (let k = 0; k < 4; k++) {
          sparks.push({ x: b.x + 2 * S, y: b.y, vx: -Math.random() * S * 0.6, vy: (Math.random() - 0.5) * S * 0.6, life: 12 });
        }
        if (e.hp <= 0) {
          e.dead = true; e.deadTimer = 0;
          for (let k = 0; k < 6; k++) {
            coins.push({ x: e.x + 3 * e.cell, y: e.y + 2 * e.cell, vx: (Math.random() - 0.5) * S * 0.7,
                         vy: -Math.random() * S * 0.9 - S * 0.3, life: 45 });
          }
        }
        break;
      }
    }
    if (hit || b.x > W) bullets.splice(i, 1);
  }

  // Enemies march in, then hop at the player once they reach the front line
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) {
      if (++e.deadTimer > SKULL_FRAMES) { enemies.splice(i, 1); spawnEnemy(W + 20 + Math.random() * W * 0.25); }
      continue;
    }
    e.frame++;
    if (e.hitFlash > 0) e.hitFlash--;
    const stop = frontLine();
    const x0 = e.x;
    if (e.x > stop) e.x = Math.max(stop, e.x - ENEMY_TYPES[e.type].speed * S * 0.25);
    else if (e.hop > 0) e.hop--;
    else if (Math.random() < 0.02) e.hop = 10;
    e.step = window.RielEnemySprite.walkStep(e, x0 - e.x, S * 0.25);   // walk cycle while marching
  }

  // Trail from the shop (drifts back as the floor scrolls)
  COS.spawnTrail(trail, TRAIL_ID, player.x + S, playerTop(), 5 * S, 8 * S, tick);
  for (const q of trail) q.x -= S * 0.4;
  COS.updateTrail(trail);
}

function drawEffects() {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.x += p.vx; p.y += p.vy;
    ctx.globalAlpha = p.life / 12;
    ctx.fillStyle = WEAPON_SKIN.bullet;
    ctx.fillRect(p.x, p.y, Math.max(2, S / 2), Math.max(2, S / 2));
    if (--p.life <= 0) sparks.splice(i, 1);
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.x += c.vx; c.y += c.vy; c.vy += S * 0.08;
    if (c.y > FLOOR_Y - S) { c.y = FLOOR_Y - S; c.vy *= -0.4; c.vx *= 0.7; }
    ctx.globalAlpha = Math.min(1, c.life / 20);
    ctx.fillStyle = '#f5c400';
    ctx.fillRect(c.x, c.y, S, S);
    ctx.fillStyle = '#b8920a';
    ctx.fillRect(c.x + S / 2, c.y + S / 2, S / 2, S / 2);
    if (--c.life <= 0) coins.splice(i, 1);
  }
  ctx.globalAlpha = 1;
}

// ─── MAIN LOOP ───────────────────────────────────────────────────────
let tick = 0;
function loop() {
  update(tick);
  drawBackground();

  COS.drawTrail(trail, ctx, x => x);
  shadow(player.x + 5 * S, 6 * S);
  COS.drawPlayerSprite(ctx, player.x - player.recoil, playerTop(), S, PLAYER_SKIN, WEAPON_SKIN,
                       { frame: Math.floor(tick / 7) % 3, gunFlash: player.gunFlash > 0, cls: PLAYER_CLASS });

  const bh = Math.max(3, Math.round(S / 2));
  for (const b of bullets) {
    ctx.fillStyle = WEAPON_SKIN.glow;   ctx.fillRect(b.x - 2 * S, b.y, 2 * S, bh);
    ctx.fillStyle = WEAPON_SKIN.bullet; ctx.fillRect(b.x, b.y, 3 * S, bh);
  }
  for (const e of enemies) drawEnemy(e);
  drawEffects();

  tick++;
  requestAnimationFrame(loop);
}
loop();

// ─── BEST RIELS ─────────────────────────────────────────────────────
const bestRiels = localStorage.getItem('bestRiels');
if(bestRiels) document.getElementById('best-riels').textContent = bestRiels + ' KHR';

// Save data edited by hand (e.g. in the browser's Application tab) is caught by the save
// protection in js/cosmetics.js: say what happened, once.
(function () {
  const t = window.RielCosmetics.takeTamperNotice();
  if (!t) return;
  const note = document.createElement('div');
  note.className = 'tamper-note';
  note.textContent = t === 'wipe' ? "SHOP RESET: EVERYONE'S CLASSES, SKINS AND TRAILS WERE CLEARED. YOUR GEMS AND ABILITIES ARE SAFE."
                   : t === 'penalty' ? 'CHEATING DETECTED: SAVE DATA WAS EDITED OUTSIDE THE GAME. ALL YOUR GEMS, ABILITIES AND CLASSES WERE TAKEN AWAY.'
                                     : 'CHEATING DETECTED: SAVE DATA WAS EDITED OUTSIDE THE GAME, SO IT WAS RESET.';
  document.querySelector('.stat-row').after(note);
})();

// Achievements: credit anything earned outside the game (e.g. buying a class), then
// show how many are new since the achievements page was last opened.
window.RielAchievements.sync();
const newAch = window.RielAchievements.unseen();
if (newAch) {
  const badge = document.getElementById('ach-badge');
  badge.textContent = newAch + ' NEW';
  badge.hidden = false;
}

// Gems for the cosmetics shop (shared by all campaigns, see js/cosmetics.js)
window.RielCosmetics.pinGems(document.getElementById('gem-count'));
// Riel Tokens: earned by finishing campaigns, unlock new campaign types (js/modes.js)
window.RielCosmetics.pinTokens(document.getElementById('token-count'));

// Intro video: play once per session (when the game is first opened) and remove
// when finished. No skip. Coming back to the main menu goes straight to the title.
(function(){
  const vid = document.getElementById('intro-video');
  if (!vid) return;
  if (document.documentElement.classList.contains('intro-seen')) {
    // Already played this session: drop the element so it stops loading/playing.
    vid.pause();
    vid.remove();
    return;
  }
  try { sessionStorage.setItem(window.RIEL_INTRO_KEY, '1'); } catch (e) {}
  // attempt autoplay (muted to maximize chance)
  const p = vid.play();
  if (p && p.catch) p.catch(()=>{});
  vid.addEventListener('ended', function onEnd(){
    // remove video element so title becomes visible
    try { vid.parentNode && vid.parentNode.removeChild(vid); } catch(e){}
    vid.removeEventListener('ended', onEnd);
  });
})();
