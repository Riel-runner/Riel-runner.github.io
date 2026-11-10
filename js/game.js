'use strict';

// ═══════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const BASE_W = 800;
const BASE_H = 450;

function resizeCanvas() {
  const scaleX = window.innerWidth  / BASE_W;
  const scaleY = window.innerHeight / BASE_H;
  const scale  = Math.min(scaleX, scaleY);
  canvas.width  = BASE_W;
  canvas.height = BASE_H;
  canvas.style.width  = (BASE_W * scale) + 'px';
  canvas.style.height = (BASE_H * scale) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Canvas text doesn't trigger a web-font download by itself, so load the game
// font up front (the HUD switches to it on the next frame once it's ready).
if (document.fonts) document.fonts.load('16px "Public Pixel"').catch(() => {});

// ═══════════════════════════════════════════════════════════════
//  LOAD CAMPAIGN + SETTINGS
// ═══════════════════════════════════════════════════════════════
let campaign;
try { campaign = JSON.parse(localStorage.getItem('activeCampaign')); } catch {}
if (!campaign) {
  campaign = {
    level: 1, riels: 0, hp: 150, maxHp: 150,
    lives: 3, gunDamage: 2, upgradeCount: 0,
    upgradeCost: 4, npcCount: 5, bossesBeaten: 0, name: 'DEBUG'
  };
}
// A fallen campaign can't be played again (e.g. via the browser Back button).
if (campaign.dead) window.location.replace('level-select.html');

// Shop upgrades (definitions in js/upgrades.js). Old saves get migrated here.
window.RielUpgrades.ensure(campaign);
const ARMOR_BLOCK       = window.RielUpgrades.effect(campaign, 'armor');    // fraction of damage blocked
const PLAYER_SPEED_MULT = window.RielUpgrades.effect(campaign, 'speed');    // move speed multiplier
const PLAYER_SHOOT_CD   = window.RielUpgrades.effect(campaign, 'firerate'); // frames between shots

// Run stats shown on the death screen / campaign details. Older saves won't
// have these yet, so they start counting from 0 the first time they're used.
function addStat(name, amount = 1) {
  campaign[name] = (campaign[name] || 0) + amount;
}

let settings;
try { settings = JSON.parse(localStorage.getItem('rielrunner_settings')); } catch {}
if (!settings) settings = { autoAim: true, hpBars: true, damageNumbers: true };

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const GRAVITY        = 0.55;
const JUMP_FORCE     = -12;
const MOVE_SPEED     = 3.5;
const GROUND_Y       = BASE_H - 60;   // y where ground surface is
const FLOOR_H        = 60;
const LEVEL_WIDTH    = 4000;          // total corridor width in px
const NPC_DETECT_R   = 275;          // px — when NPC starts walking
const CONTACT_DAMAGE = 0.5;          // hp per frame while touching NPC
const LASER_TICK_PC  = 0.10;         // 10% max hp per 0.5s from lasers (chunk 5)
const LASER_TICK_INT = 30;           // frames between laser ticks
const SHOOT_COOLDOWN = 18;           // frames (~0.3s at 60fps)
const BULLET_SPEED   = 10;
const PIXEL          = 3;            // sprite pixel scale
const DASH_DISTANCE  = 400;          // px — half screen dash
const DASH_COOLDOWN  = 600;          // frames — 10 seconds at 60fps
const DASH_DURATION  = 10;           // frames the dash lasts
const GAME_VERSION   = 'V6';

// ═══════════════════════════════════════════════════════════════
//  WORLD / CAMERA
// ═══════════════════════════════════════════════════════════════
let camX = 0;   // camera left edge in world coords

// ═══════════════════════════════════════════════════════════════
//  PLAYER
// ═══════════════════════════════════════════════════════════════
const PLAYER_W = 18;
const PLAYER_H = 28;

const player = {
  x: 80,           // world x
  y: GROUND_Y - PLAYER_H,
  vx: 0,
  vy: 0,
  onGround: false,
  hp: campaign.hp,
  maxHp: campaign.maxHp,
  lives: campaign.lives,
  gunDamage: campaign.gunDamage,
  // Magazine: infinite ammo, but reload when the mag is empty (or on R)
  bullets: 20,
  reloadTimer: 0,
  shootTimer: 0,
  gunFlash: 0,
  animFrame: 0,
  animTick: 0,
  facingRight: true,
  // death / respawn
  dead: false,
  deathX: 80,
  respawnTimer: 0,
  // damage flash
  hitFlash: 0,
  // dash
  dashCooldown: 0,
  dashTimer: 0,
  dashVx: 0,
  isDashing: false,
};

// ═══════════════════════════════════════════════════════════════
//  GAME STATE + FRAME COUNTER (declared early — used by input handlers)
// ═══════════════════════════════════════════════════════════════
let gameState      = new URLSearchParams(window.location.search).get('resumePaused') === '1' ? 'paused' : 'playing';
let stateTimer     = 0;
let frameCount     = 0;
let pauseMenuIndex = 0;

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════
const keys = {};
// WASD mirrors the arrow keys: W = jump, A = left, S = dash, D = right.
const WASD_MAP = { KeyW: 'ArrowUp', KeyA: 'ArrowLeft', KeyS: 'ArrowDown', KeyD: 'ArrowRight' };
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (WASD_MAP[e.code]) keys[WASD_MAP[e.code]] = true;
  if (e.code === 'Space')      e.preventDefault();
  if (e.code === 'ArrowUp')    e.preventDefault();
  if (e.code === 'ArrowDown')  e.preventDefault();
  if (e.code === 'KeyR' && gameState === 'playing') startReload();
  if (e.code === 'Escape') {
    e.preventDefault();
    togglePause();
  }
});
window.addEventListener('keyup',  e => {
  keys[e.code] = false;
  if (WASD_MAP[e.code]) keys[WASD_MAP[e.code]] = false;
});

let mouseX = 0, mouseY = 0;
canvas.addEventListener('mousemove', e => {
  const rect  = canvas.getBoundingClientRect();
  const scaleX = BASE_W / rect.width;
  const scaleY = BASE_H / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top)  * scaleY;
});

let mouseDown = false;
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });

// ═══════════════════════════════════════════════════════════════
//  LASERS (obstacles)
// ═══════════════════════════════════════════════════════════════
const lasers = [];
const LASER_DAMAGE_PCT = 0.10;     // 10% of max HP per tick
const LASER_TICK_FRAMES = 30;      // every 0.5s at 60fps

function generateLasers() {
  lasers.length = 0;
  // Spawn 2-4 lasers per level on platforms or above ground
  const laserCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < laserCount; i++) {
    let x, y;
    // 70% chance on a platform, 30% at ground level
    if (platforms.length > 0 && Math.random() < 0.7) {
      const p = platforms[Math.floor(Math.random() * platforms.length)];
      x = p.x;
      y = p.y - 12; // slightly above platform
    } else {
      x = 600 + Math.random() * (LEVEL_WIDTH - 1200);
      y = GROUND_Y - 20;
    }
    const w = 100 + Math.random() * 150; // variable width
    lasers.push({ x, y, w, h: 6, lastDamageFrame: -LASER_TICK_FRAMES });
  }
}

function updateLasers() {
  for (const laser of lasers) {
    if (player.dead) continue;
    const overlap =
      player.x < laser.x + laser.w &&
      player.x + PLAYER_W > laser.x &&
      player.y < laser.y + laser.h &&
      player.y + PLAYER_H > laser.y;
    if (overlap) {
      // 0.5 contact damage per frame
      damagePlayer(0.5);
      // 10% max HP tick every 0.5s
      if (frameCount - laser.lastDamageFrame >= LASER_TICK_FRAMES) {
        const dmg = damagePlayer(player.maxHp * LASER_DAMAGE_PCT); // after armor
        spawnDmgNumber(player.x, player.y - 12, dmg, '#e74c3c');
        laser.lastDamageFrame = frameCount;
      }
    }
  }
}

function drawLasers() {
  for (const laser of lasers) {
    const sx = wp(laser.x);
    if (sx > BASE_W + 40 || sx < -40) continue;
    const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
    // Outer glow
    ctx.fillStyle = `rgba(255,50,50,${pulse * 0.5})`;
    ctx.fillRect(sx - 2, laser.y - 2, laser.w + 4, laser.h + 4);
    // Core beam
    ctx.fillStyle = `rgba(255,80,80,${pulse * 0.9})`;
    ctx.fillRect(sx, laser.y, laser.w, laser.h);
    // Bright centre line
    ctx.fillStyle = `rgba(255,220,220,${pulse})`;
    ctx.fillRect(sx, laser.y + 2, laser.w, laser.h - 4);
    // End caps (pixel art style)
    ctx.fillStyle = '#ff3232';
    ctx.fillRect(sx - 3, laser.y - 1, 5, laser.h + 2);
    ctx.fillRect(sx + laser.w - 2, laser.y - 1, 5, laser.h + 2);
  }
}

function generatePlatforms() {
  const plats = [];
  const spacing = 320;
  for (let i = 1; i * spacing < LEVEL_WIDTH - 400; i++) {
    const x = i * spacing + Math.random() * 80 - 40;
    const y = GROUND_Y - 70 - Math.random() * 60;
    const w = 80 + Math.random() * 60;
    plats.push({ x, y, w, h: 14 });
  }
  return plats;
}
const platforms = generatePlatforms();

// ═══════════════════════════════════════════════════════════════
//  PLAYER PHYSICS + MOVEMENT
// ═══════════════════════════════════════════════════════════════
function updatePlayer() {
  if (player.dead) {
    player.respawnTimer--;
    if (player.respawnTimer <= 0) respawnPlayer();
    return;
  }

  // Horizontal
  let moving = false;
  if (keys['ArrowLeft']) {
    player.vx = -MOVE_SPEED * PLAYER_SPEED_MULT * (player.speedMult || 1);
    player.facingRight = false;
    moving = true;
  } else if (keys['ArrowRight']) {
    player.vx = MOVE_SPEED * PLAYER_SPEED_MULT * (player.speedMult || 1);
    player.facingRight = true;
    moving = true;
  } else {
    player.vx = 0;
  }

  // Jump — ArrowUp only, Space is shoot
  if (keys['ArrowUp'] && player.onGround) {
    player.vy = JUMP_FORCE * (player.jumpMult || 1);
    player.onGround = false;
  }

  // Dash — ArrowDown triggers dash in facing direction
  if (keys['ArrowDown'] && player.dashCooldown <= 0 && !player.isDashing) {
    player.isDashing = true;
    player.dashTimer  = DASH_DURATION;
    player.dashVx     = player.facingRight ? DASH_DISTANCE / DASH_DURATION : -DASH_DISTANCE / DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
    keys['ArrowDown'] = false; // consume key so it doesn't retrigger
  }

  // Handle active dash
  if (player.isDashing) {
    player.dashTimer--;
    player.vx = player.dashVx;
    if (player.dashTimer <= 0) {
      player.isDashing = false;
      player.vx = 0;
    }
  }

  // Dash cooldown tick
  if (player.dashCooldown > 0) player.dashCooldown--;

  // Gravity
  player.vy += GRAVITY;
  player.x  += player.vx;
  player.y  += player.vy;

  // World bounds (can't go left of start, can't go past end)
  if (player.x < 0) player.x = 0;
  if (player.x + PLAYER_W > LEVEL_WIDTH) player.x = LEVEL_WIDTH - PLAYER_W;

  // Ground collision
  player.onGround = false;
  if (player.y + PLAYER_H >= GROUND_Y) {
    player.y = GROUND_Y - PLAYER_H;
    player.vy = 0;
    player.onGround = true;
  }

  // Platform collision (top only)
  for (const p of platforms) {
    if (
      player.vx >= 0 || true // check all platforms
    ) {
      const prevBottom = player.y + PLAYER_H - player.vy;
      const curBottom  = player.y + PLAYER_H;
      const inX = player.x + PLAYER_W > p.x && player.x < p.x + p.w;
      const crossTop = prevBottom <= p.y && curBottom >= p.y;
      if (inX && crossTop && player.vy >= 0) {
        player.y = p.y - PLAYER_H;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  // Animate legs
  if (moving && player.onGround) {
    player.animTick++;
    if (player.animTick >= 8) { player.animTick = 0; player.animFrame = (player.animFrame + 1) % 3; }
  } else if (!moving) {
    player.animFrame = 0;
  }

  // Timers
  if (player.shootTimer > 0) player.shootTimer--;
  if (player.gunFlash   > 0) player.gunFlash--;
  if (player.hitFlash   > 0) player.hitFlash--;

  // Reloading — refill the magazine when the timer finishes
  if (player.reloadTimer > 0) {
    player.reloadTimer--;
    if (player.reloadTimer <= 0) {
      player.bullets = MAG_SIZE;
      player.gunFlash = 0;
      playReloadSound(true);
    }
  }

  // Shooting
  const wantShoot = keys['Space'] || mouseDown;
  if (wantShoot && player.shootTimer <= 0) {
    firePlayerBullet();
    player.shootTimer = PLAYER_SHOOT_CD; // SHOOT_COOLDOWN reduced by the Fire Rate upgrade
  }

  // Camera: keep player centred-ish
  camX = player.x - BASE_W * 0.35;
  camX = Math.max(0, Math.min(LEVEL_WIDTH - BASE_W, camX));

  // Power timers tick
  if (player.jumpPowerTimer > 0) {
    player.jumpPowerTimer--;
    if (player.jumpPowerTimer <= 0) player.jumpMult = 1;
  }
  if (player.speedPowerTimer > 0) {
    player.speedPowerTimer--;
    if (player.speedPowerTimer <= 0) player.speedMult = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
//  BULLETS
// ═══════════════════════════════════════════════════════════════
const bullets = [];

// Ammo: infinite magazines. Reload takes 3 seconds, less with the Reload Speed upgrade.
const MAG_SIZE      = 20;
const RELOAD_FRAMES = window.RielUpgrades.effect(campaign, 'reload'); // frames (180 = 3s at 60fps)
const droppedMags   = [];     // empty magazines falling out during reload (visual only)

function startReload() {
  if (player.dead || player.reloadTimer > 0 || player.bullets >= MAG_SIZE) return;
  player.reloadTimer = RELOAD_FRAMES;
  // Spent magazine drops out of the gun
  const gunX = player.facingRight ? player.x + 7 * PIXEL : player.x + 1 * PIXEL;
  droppedMags.push({ x: gunX, y: player.y + 4 * PIXEL, vy: -1.2, vx: player.facingRight ? 0.4 : -0.4, life: 90 });
  playReloadSound(false);
}

function updateDrawDroppedMags() {
  for (let i = droppedMags.length - 1; i >= 0; i--) {
    const m = droppedMags[i];
    if (gameState === 'playing') {
      m.vy += 0.25;
      m.x  += m.vx;
      m.y  += m.vy;
      if (m.y > GROUND_Y - 6) { m.y = GROUND_Y - 6; m.vy = 0; m.vx = 0; }
      m.life--;
    }
    if (m.life <= 0) { droppedMags.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, m.life / 30);
    ctx.fillStyle = '#444450';
    ctx.fillRect(wp(m.x), m.y, PIXEL, PIXEL * 2);
    ctx.globalAlpha = 1;
  }
}

// Short synthesized "clack" for reload start / finish
let reloadAudioCtx = null;
function playReloadSound(finished) {
  try {
    if (!reloadAudioCtx) reloadAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ac = reloadAudioCtx;
    if (ac.state === 'suspended') ac.resume();
    const vol = 0.25 * window.RielVolume.sfx();
    if (vol <= 0) return;
    const clicks = finished ? [0, 0.09] : [0];
    for (const offset of clicks) {
      const t0   = ac.currentTime + offset;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(finished ? 900 : 320, t0);
      osc.frequency.exponentialRampToValueAtTime(finished ? 300 : 120, t0 + 0.06);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(t0); osc.stop(t0 + 0.08);
    }
  } catch {}
}

// Powerups: jump double-height and speed boost
const powerups = []; // each: {x,y,w,h,type:'jump'|'speed',collected:false}
const JUMP_POWER_MULT = 2;
const JUMP_POWER_DURATION_FRAMES = 30 * 60; // 30s
const SPEED_POWER_MULT = 3;
const SPEED_POWER_DURATION_FRAMES = 15 * 60; // 15s

// Player power timers
player.jumpMult = 1;
player.jumpPowerTimer = 0; // frames
player.speedMult = 1;
player.speedPowerTimer = 0; // frames


function firePlayerBullet() {
  // Can't fire while reloading; an empty mag starts a reload
  if (player.reloadTimer > 0) return;
  if (!player.bullets || player.bullets <= 0) {
    startReload();
    return;
  }

  // Consume one bullet
  player.bullets = Math.max(0, player.bullets - 1);

  const startX = player.facingRight
    ? player.x + PLAYER_W + 2
    : player.x - 6;
  const startY = player.y + 10;

  let dx = 1, dy = 0;

  if (settings.autoAim) {
    // Find closest NPC
    let closest = null, bestDist = Infinity;
    for (const n of npcs) {
      if (n.dead) continue;
      const d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < bestDist) { bestDist = d; closest = n; }
    }
    if (closest) {
      const tx = closest.x + 10 - startX;
      const ty = closest.y + 12 - startY;
      const len = Math.hypot(tx, ty) || 1;
      dx = tx / len; dy = ty / len;
    } else {
      dx = player.facingRight ? 1 : -1;
    }
  } else {
    // Mouse aim — convert mouse to world coords
    const worldMouseX = mouseX + camX;
    const worldMouseY = mouseY;
    const tx = worldMouseX - startX;
    const ty = worldMouseY - startY;
    const len = Math.hypot(tx, ty) || 1;
    dx = tx / len; dy = ty / len;
  }

  bullets.push({ x: startX, y: startY, dx, dy, alive: true });
  addStat('shotsFired');
  player.gunFlash = 5;

  // Gunshot sound
  playGunshot();

  // Mag just emptied — reload automatically
  if (player.bullets <= 0) startReload();
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    const prevX = b.x;
    const prevY = b.y;
    const stepX = b.dx * BULLET_SPEED;
    const stepY = b.dy * BULLET_SPEED;
    const steps = Math.max(1, Math.ceil(Math.hypot(stepX, stepY) / PIXEL));

    let removed = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const nx = prevX + stepX * t;
      const ny = prevY + stepY * t;

      // Check platform collision (solid blocks)
      let hitPlatform = false;
      for (const p of platforms) {
        if (nx > p.x && nx < p.x + p.w && ny > p.y && ny < p.y + p.h) {
          hitPlatform = true;
          break;
        }
      }

      if (hitPlatform) {
        // spawn small impact effect
        rielParticles.push({ x: nx, y: ny, vx: (Math.random()-0.5)*1.5, vy: -Math.random()*1.5, life: 18 });
        bullets.splice(i, 1);
        removed = true;
        break;
      }

      // Advance bullet
      b.x = nx;
      b.y = ny;
    }

    if (removed) continue;

    // Remove bullets as soon as they leave the viewport (prevent camping)
    const leftBound = camX - 10;
    const rightBound = camX + BASE_W + 10;
    if (b.x < leftBound || b.x > rightBound || b.y < 0 || b.y > BASE_H || !b.alive) {
      bullets.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  NPC STATS (scale with level)
// ═══════════════════════════════════════════════════════════════
const LVL         = campaign.level || 1;
// NPC scaling per request:
// HP: +1 per level (cleaner). Level 1 => 10 HP, Level 99 => ~108 HP
const NPC_HP      = 10 + Math.max(0, LVL - 1) * 1;
// Damage: +0.5 per level. Level 1 => 0.5 dmg, Level 99 => ~49.5 dmg
const NPC_DMG_CONTACT = 0.5 * LVL; // per-frame contact damage (scales with level)
// Slightly slower NPCs for more player reaction time
const NPC_SPEED   = MOVE_SPEED * 1.1; // NPCs 10% faster than player
// Attack cooldowns (frames; assuming ~60fps)
const NPC_ATTACK_COOLDOWN_FRAMES = Math.round(0.2 * 60); // ~12 frames (0.2s)
const BOSS_ATTACK_COOLDOWN_FRAMES = Math.round(0.1 * 60); // ~6 frames (0.1s)
// Cap NPC count to avoid extreme overcrowding at very late levels
const NPC_COUNT   = Math.min(Math.max(5, campaign.npcCount), 23);
// Boss scaling constants
const BOSS_BASE_HP = 200;
const BOSS_HP_PER  = 75;
const BOSS_BASE_DMG = 5;
const BOSS_DMG_PER  = 8;

// ═══════════════════════════════════════════════════════════════
//  NPC ARRAY + SPAWN
// ═══════════════════════════════════════════════════════════════
const npcs = [];
const NPC_W = 18, NPC_H = 24;

function spawnNPCs() {
  npcs.length = 0;
  player.bullets = MAG_SIZE;
  player.reloadTimer = 0;

  // If this is a boss level (10,20,...,100), spawn a single boss
  if (campaign.level > 0 && campaign.level % 10 === 0) {
    const bossIndex = Math.floor(campaign.level / 10);
    const bossHp = BOSS_BASE_HP + (bossIndex - 1) * BOSS_HP_PER;
    const bossDmg = BOSS_BASE_DMG + (bossIndex - 1) * BOSS_DMG_PER;
    const wx = LEVEL_WIDTH - 400 + (Math.random() * 80 - 40);
    npcs.push(makeNPC(wx, true, bossHp, bossDmg));
    return;
  }

  // Spread NPCs evenly — roughly 1 tank per 4 normal NPCs
  const zone = (LEVEL_WIDTH - 400) / NPC_COUNT;
  for (let i = 0; i < NPC_COUNT; i++) {
    const wx = 500 + i * zone + Math.random() * (zone * 0.6);
    const isTank = (i % 4 === 3); // every 4th NPC is a tank
    npcs.push(makeNPC(wx, false, null, null, isTank));
  }
}

function makeNPC(wx, isBoss = false, customHp = null, customDmg = null, isTank = false) {
  const lvlNow = campaign.level || 1;
  const dynamicNpcHp = 10 + Math.max(0, lvlNow - 1) * 1;
  const tankHp       = dynamicNpcHp * 3;  // 3x normal HP
  const hpBase = isBoss
    ? (customHp || (BOSS_BASE_HP + (Math.floor(lvlNow / 10) - 1) * BOSS_HP_PER))
    : isTank ? tankHp : dynamicNpcHp;
  const dmgBase = isBoss
    ? (customDmg || (BOSS_BASE_DMG + (Math.floor(lvlNow / 10) - 1) * BOSS_DMG_PER))
    : (0.5 * lvlNow); // tanks deal same contact damage as normals

  const w = isBoss ? NPC_W * 2 : isTank ? Math.round(NPC_W * 1.5) : NPC_W;
  const h = isBoss ? NPC_H * 2 : isTank ? Math.round(NPC_H * 1.5) : NPC_H;
  const y = GROUND_Y - h;

  return {
    x: wx,
    y: y,
    vy: 0,
    onGround: true,
    hp: hpBase,
    maxHp: hpBase,
    dead: false,
    deadTimer: 0,
    animTick: 0,
    animFrame: 0,
    touching: false,
    jumpCooldown: 0,
    attackCooldown: 0,
    attackCooldownFrames: isBoss ? BOSS_ATTACK_COOLDOWN_FRAMES : NPC_ATTACK_COOLDOWN_FRAMES,
    isBoss: !!isBoss,
    isTank: !!isTank,
    contactDamage: dmgBase,
    rielReward: isTank ? 5 : 2,  // tanks worth 5 Riels
    w: w,
    h: h
  };
}

spawnNPCs();

// ═══════════════════════════════════════════════════════════════
//  DAMAGE NUMBERS
// ═══════════════════════════════════════════════════════════════
const dmgNumbers = [];

function spawnDmgNumber(wx, y, amount, color) {
  if (!settings.damageNumbers) return;
  dmgNumbers.push({ x: wx, y, amount: Math.ceil(amount), color, life: 45, vy: -1.2 });
}

function updateDrawDmgNumbers() {
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.y  += d.vy;
    d.vy *= 0.94;
    d.life--;
    const alpha = Math.min(1, d.life / 20);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = d.color;
    ctx.font        = '6px "Public Pixel", monospace';
    // isText = riel gain label, otherwise show damage
    const label = d.isText ? ('+' + d.amount) : ('-' + d.amount);
    ctx.fillText(label, wp(d.x), d.y);
    ctx.globalAlpha = 1;
    if (d.life <= 0) dmgNumbers.splice(i, 1);
  }
}

// ═══════════════════════════════════════════════════════════════
//  RIEL PARTICLES
// ═══════════════════════════════════════════════════════════════
const rielParticles = [];

function spawnRielParticles(wx, y) {
  for (let i = 0; i < 5; i++) {
    rielParticles.push({
      x: wx + Math.random() * 12,
      y: y  + Math.random() * 8,
      vx: (Math.random() - 0.5) * 2.5,
      vy: -Math.random() * 3 - 1,
      life: 50,
    });
  }
}

function updateDrawRielParticles() {
  for (let i = rielParticles.length - 1; i >= 0; i--) {
    const p = rielParticles[i];
    p.x  += p.vx; p.y += p.vy; p.vy += 0.18;
    p.life--;
    ctx.globalAlpha = p.life / 50;
    ctx.fillStyle   = '#f5c400';
    ctx.fillRect(wp(p.x), p.y, PIXEL, PIXEL);
    ctx.globalAlpha = 1;
    if (p.life <= 0) rielParticles.splice(i, 1);
  }
}

// ═══════════════════════════════════════════════════════════════
//  NPC UPDATE
// ═══════════════════════════════════════════════════════════════
function updateNPCs() {
  for (const n of npcs) {
    if (n.dead) {
      n.deadTimer++;
      continue;
    }

    // Decrement attack cooldown
    if (n.attackCooldown > 0) n.attackCooldown--;

    // Active when on-screen — pursue immediately
    const screenX = wp(n.x);
    if (screenX < BASE_W + 40 && screenX > -80) {
      const dir = (player.x + PLAYER_W / 2) < (n.x + n.w / 2) ? -1 : 1;
      const gap = (player.x + PLAYER_W / 2) - (n.x + n.w / 2);
      const speed = n.isBoss ? MOVE_SPEED : n.isTank ? NPC_SPEED * 0.45 : NPC_SPEED;
      if (Math.abs(gap) > n.w * 0.6) {
        n.x += dir * speed;
      }

      // Attempt to jump toward player or onto a platform in front
      if (n.onGround && n.jumpCooldown <= 0) {
        // If player is noticeably higher, try a jump
        // Jump with same force as the player when needed
        if (player.y + 2 < n.y - 12 && Math.abs(gap) < 220) {
          n.vy = JUMP_FORCE; // match player's jump height
          n.onGround = false;
          n.jumpCooldown = 40;
        } else {
          // Look for a platform slightly ahead to jump onto
          const aheadX = n.x + dir * 48;
          // Compute NPC maximum reachable rise from a jump (kinematic)
          const jumpApex = (Math.abs(JUMP_FORCE) * Math.abs(JUMP_FORCE)) / (2 * GRAVITY);
          for (const p of platforms) {
            if (aheadX + n.w > p.x && aheadX < p.x + p.w) {
              const heightDiff = n.y - p.y; // positive if platform is above NPC
              if (p.y < n.y && heightDiff <= jumpApex + 8) {
                // Platform is reachable — perform full player jump
                n.vy = JUMP_FORCE;
                n.onGround = false;
                n.jumpCooldown = 40;
                break;
              }
            }
          }
        }
      }
    }

    // Vertical physics
    if (!n.onGround) {
      n.vy += GRAVITY * 0.9; // slightly lighter gravity for NPCs
      n.y += n.vy;
    }

    // Platform / ground collision for NPCs
    n.onGround = false;
    if (n.y + n.h >= GROUND_Y) {
      n.y = GROUND_Y - n.h;
      n.vy = 0;
      n.onGround = true;
    }
    for (const p of platforms) {
      const prevBottom = n.y + n.h - n.vy;
      const curBottom = n.y + n.h;
      const inX = n.x + n.w > p.x && n.x < p.x + p.w;
      const crossTop = prevBottom <= p.y && curBottom >= p.y;
      if (inX && crossTop && n.vy >= 0) {
        n.y = p.y - n.h;
        n.vy = 0;
        n.onGround = true;
      }
    }

    // Timers
    if (n.jumpCooldown > 0) n.jumpCooldown--;

    // Animate
    n.animTick++;
    if (n.animTick >= 12) { n.animTick = 0; n.animFrame = (n.animFrame + 1) % 2; }

    // ── Collision with player — contact damage (with per-NPC cooldown) ──
    n.touching = false;
    if (!player.dead) {
      const overlap =
        player.x < n.x + n.w &&
        player.x + PLAYER_W > n.x &&
        player.y < n.y + n.h &&
        player.y + PLAYER_H > n.y;

      if (overlap) {
        n.touching = true;
        if (n.attackCooldown <= 0) {
          damagePlayer(n.contactDamage);
          n.attackCooldown = n.attackCooldownFrames;
        }
      }
    }

    // ── Bullet collision ──
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      const hit =
        b.x > n.x && b.x < n.x + n.w &&
        b.y > n.y && b.y < n.y + n.h;
      if (hit) {
        bullets.splice(bi, 1);
        addStat('shotsHit');
        n.hp -= player.gunDamage;
        spawnDmgNumber(n.x, n.y - 4, player.gunDamage, '#f5c400');
        if (n.hp <= 0) killNPC(n);
        break;
      }
    }
  }
}

function killNPC(n) {
  n.dead      = true;
  n.deadTimer = 0;
  const reward = n.rielReward || 2;
  campaign.riels += reward;
  addStat('enemiesKilled');
  addStat('rielsEarned', reward);
  spawnRielParticles(n.x, n.y);
  if (settings.damageNumbers) {
    dmgNumbers.push({ x: n.x, y: n.y - 14, amount: reward + ' KHR', color: '#2ecc71', life: 55, vy: -1.0, isText: true });
  }

  playDeathSound();

  // Boss-specific rewards/effects
  if (n.isBoss) {
    campaign.bossesBeaten = (campaign.bossesBeaten || 0) + 1;
    campaign.npcCount = (campaign.npcCount || 5) + 2;      // +2 NPCs per boss beaten
    // Random max HP bonus between 5 and 10
    const hpBonus = Math.floor(Math.random() * 6) + 5;
    campaign.maxHp = (campaign.maxHp || player.maxHp) + hpBonus;
    player.maxHp += hpBonus;
    player.hp = Math.min(player.maxHp, player.hp + hpBonus);
  }

  checkLevelClear();
}

function checkLevelClear() {
  const allDead = npcs.every(n => n.dead);
  if (!allDead) return;
  if (gameState !== 'playing') return;

  if (campaign.level >= 100) {
    gameState  = 'you_win';
    stateTimer = 0;
  } else if (campaign.level % 10 === 0) {
    gameState  = 'boss_slayed';
    stateTimer = 0;
  } else {
    gameState  = 'level_clear';
    stateTimer = 0;
  }
}

// Handle powerup pickups
function updatePowerups() {
  if (!powerups || powerups.length === 0) return;
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (p.collected) continue;
    if (
      player.x < p.x + p.w &&
      player.x + PLAYER_W > p.x &&
      player.y < p.y + p.h &&
      player.y + PLAYER_H > p.y
    ) {
      p.collected = true;
      if (p.type === 'jump') {
        player.jumpMult = JUMP_POWER_MULT;
        player.jumpPowerTimer = JUMP_POWER_DURATION_FRAMES;
        dmgNumbers.push({ x: p.x, y: p.y - 8, amount: 'JUMP x2', color: '#8e44ad', life: 60, vy: -1.2, isText: true });
      } else {
        player.speedMult = SPEED_POWER_MULT;
        player.speedPowerTimer = SPEED_POWER_DURATION_FRAMES;
        dmgNumbers.push({ x: p.x, y: p.y - 8, amount: 'SPD x3', color: '#27ae60', life: 60, vy: -1.2, isText: true });
      }
      playPickupSound && playPickupSound();
    }
  }
}

// After clearing a level: HP is fully healed, and beating a boss level
// (every 10th) also restores lives to the max of 3. Otherwise lost lives stay lost.
const MAX_LIVES = 3;
function isBossLevel() { return campaign.level % 10 === 0; }
function applyLevelClearRewards() {
  campaign.maxHp = player.maxHp;
  campaign.hp    = player.maxHp;
  campaign.lives = isBossLevel() ? MAX_LIVES : player.lives;
}

function goToShop() {
  // Sync campaign state
  applyLevelClearRewards();
  campaign.gunDamage  = player.gunDamage;
  // upgrade levels/prices live in campaign.upgrades (see js/upgrades.js)
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));
  // Sync best riels
  const best = parseInt(localStorage.getItem('bestRiels') || '0');
  if (campaign.riels > best) localStorage.setItem('bestRiels', campaign.riels);
  window.location.href = 'shop.html';
}

function goToVictory() {
  gameState  = 'you_win';
  stateTimer = 0;
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER DAMAGE
// ═══════════════════════════════════════════════════════════════
// Returns the damage actually taken (after the Armor upgrade).
function damagePlayer(amount, isTick) {
  if (player.dead) return 0;
  amount *= 1 - ARMOR_BLOCK;
  player.hp -= amount;
  player.hitFlash = 20;
  if (player.hp <= 0) {
    player.hp = 0;
    killPlayer();
  }
  return amount;
}

// ═══════════════════════════════════════════════════════════════
//  DRAW NPCs
// ═══════════════════════════════════════════════════════════════
function drawNPCs() {
  for (const n of npcs) {
    const sx = wp(n.x);
    if (sx > BASE_W + 40 || sx < -40) continue;

    if (n.dead) {
      // Show skull for 2 seconds (120 frames)
      if (n.deadTimer < 120) {
        drawSkull(n.x, n.y);
      }
      continue;
    }

    const by = n.y;

    if (n.isBoss) {
      // Boss: draw scaled-up pixel art (2x the NPC pixels)
      const S = PIXEL * 2; // scale per-pixel for boss
      const body = n.touching ? '#e74c3c' : '#2e86de'; // blue boss, flash red when touching
      const eye  = '#ffffff';
      const boot = '#11131a';

      // Helper: draw a boss pixel at (col,row) in the 6x7 layout scaled by S
      function bep(col, row, color) {
        ctx.fillStyle = color;
        ctx.fillRect(sx + col * S, by + row * S, S, S);
      }

      // Simple 6x7 boss sprite (based on NPC but larger)
      // Row 0
      bep(1,0,body); bep(2,0,body); bep(3,0,body); bep(4,0,body);
      // Row 1
      bep(0,1,body); bep(1,1,eye);  bep(2,1,body); bep(3,1,eye);  bep(4,1,body); bep(5,1,body);
      // Row 2
      bep(0,2,body); bep(1,2,body); bep(2,2,body); bep(3,2,body); bep(4,2,body); bep(5,2,body);
      // Row 3-4 body
      for (let c = 0; c <= 5; c++) { bep(c,3,body); bep(c,4,body); }
      // Row 5-6 legs (bigger boots)
      if (n.animFrame === 0) {
        bep(1,5,boot); bep(3,5,boot); bep(1,6,boot); bep(3,6,boot);
      } else {
        bep(0,5,boot); bep(2,5,boot); bep(1,6,boot); bep(4,6,boot);
      }

      // Draw a simple eye highlight
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + Math.round((2 * S)), by + Math.round(1 * S), Math.max(1, S/2), Math.max(1, S/2));

      // Boss HP bar larger and centered
      if (settings.hpBars) {
        const bw = n.w + 8;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(sx - 4, by - 12, bw, 6);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(sx - 4, by - 12, Math.max(0, bw * (n.hp / n.maxHp)), 6);
      }

      continue;
    }

    // ── TANK sprite (dark purple, 1.5x scale) ──
    if (n.isTank) {
      const S = Math.round(PIXEL * 1.5);
      const body = n.touching ? '#e74c3c' : '#6c2eb9';
      const eye  = '#f5c400';
      const boot = '#111122';
      function tp(col, row, color) {
        ctx.fillStyle = color;
        ctx.fillRect(sx + col * S, by + row * S, S, S);
      }
      // Head
      tp(1,0,body); tp(2,0,body); tp(3,0,body); tp(4,0,body);
      tp(0,1,body); tp(1,1,eye);  tp(2,1,body); tp(3,1,eye);  tp(4,1,body); tp(5,1,body);
      tp(0,2,body); tp(1,2,body); tp(2,2,body); tp(3,2,body); tp(4,2,body); tp(5,2,body);
      // Body (extra thick — 3 rows instead of 2)
      for(let c=0;c<=5;c++){ tp(c,3,body); tp(c,4,body); tp(c,5,body); }
      // Legs
      if (n.animFrame === 0) {
        tp(1,6,boot); tp(3,6,boot); tp(1,7,boot); tp(3,7,boot);
      } else {
        tp(0,6,boot); tp(2,6,boot); tp(1,7,boot); tp(4,7,boot);
      }
      // HP bar
      if (settings.hpBars) {
        const bw = n.w + 4;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(sx - 2, by - 7, bw, 4);
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(sx - 2, by - 7, Math.max(0, bw * (n.hp / n.maxHp)), 4);
      }
      continue;
    }

    // Flash red briefly when hit (hitFlash stored on npc)
    const S  = PIXEL;

    function ep(col, row, color) {
      ctx.fillStyle = color;
      ctx.fillRect(sx + col * S, by + row * S, S, S);
    }

    const body = n.touching ? '#e74c3c' : '#c0392b';
    const eye  = '#f5c400';
    const boot = '#222233';

    // Head
    ep(1,0,body); ep(2,0,body); ep(3,0,body); ep(4,0,body);
    ep(0,1,body); ep(1,1,eye);  ep(2,1,body); ep(3,1,eye);  ep(4,1,body); ep(5,1,body);
    ep(0,2,body); ep(1,2,body); ep(2,2,body); ep(3,2,body); ep(4,2,body); ep(5,2,body);
    // Body
    for(let c=0;c<=5;c++){ ep(c,3,body); ep(c,4,body); }
    // Legs animated
    if (n.animFrame === 0) {
      ep(1,5,boot); ep(3,5,boot); ep(1,6,boot); ep(3,6,boot);
    } else {
      ep(0,5,boot); ep(2,5,boot); ep(1,6,boot); ep(4,6,boot);
    }

    // HP bar (respects settings)
    if (settings.hpBars) {
      const bw = n.w + 4;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(sx - 2, by - 7, bw, 4);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(sx - 2, by - 7, Math.max(0, bw * (n.hp / n.maxHp)), 4);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  DEATH / RESPAWN
// ═══════════════════════════════════════════════════════════════
function killPlayer() {
  if (player.dead) return;
  player.dead    = true;
  player.deathX  = player.x;
  player.lives--;
  player.respawnTimer = 120; // 2 seconds

  if (player.lives <= 0) {
    // Out of lives: the campaign is over for good.
    handleCampaignOver();
  }
}

function respawnPlayer() {
  player.dead         = false;
  player.hp           = player.maxHp;
  player.bullets      = MAG_SIZE;
  player.reloadTimer  = 0;
  player.isDashing    = false;
  player.dashTimer    = 0;
  player.dashCooldown = 0; // reset cooldown on respawn as a small mercy
  player.x            = Math.max(0, player.deathX - 80);
  player.y            = GROUND_Y - PLAYER_H;
  player.vx           = 0;
  player.vy           = 0;
  player.hitFlash     = 0;
}

function handleCampaignOver() {
  // Mark the campaign as fallen (permanent) and record where it ended.
  campaign.dead      = true;
  campaign.diedAt    = Date.now();
  campaign.lives     = 0;
  campaign.hp        = 0;
  campaign.maxHp     = player.maxHp;
  campaign.gunDamage = player.gunDamage;

  const best = parseInt(localStorage.getItem('bestRiels') || '0');
  if (campaign.riels > best) localStorage.setItem('bestRiels', campaign.riels);

  // Save into the campaign list too, so level select shows it as fallen.
  try {
    const idx = parseInt(localStorage.getItem('activeCampaignIdx'));
    const all = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || [];
    if (!isNaN(idx) && all[idx]) {
      all[idx] = { ...all[idx], ...campaign, lastPlayed: Date.now() };
      localStorage.setItem('rielrunner_campaigns', JSON.stringify(all));
    }
  } catch {}
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));

  // Dim the game, then the death screen appears (see drawOverlay).
  gameState = 'game_over';
  stateTimer = 0;
}

// Fill in and reveal the death screen (HTML panel in game.html).
let deathScreenShown = false;
function showDeathScreen() {
  if (deathScreenShown) return;
  deathScreenShown = true;
  document.getElementById('death-campaign').textContent = campaign.name || 'UNKNOWN';
  document.getElementById('death-summary').innerHTML = window.RielRunSummary.render(campaign);
  const touch = document.getElementById('touch-overlay');
  if (touch) touch.style.display = 'none';
  const screen = document.getElementById('death-screen');
  screen.hidden = false;
  void screen.offsetWidth;          // apply the un-hidden state first so the fade-in runs
  screen.classList.add('show');
  document.getElementById('death-title-btn').focus({ preventScroll: true });
}

// ═══════════════════════════════════════════════════════════════
//  SOUND
// ═══════════════════════════════════════════════════════════════
const shootSound = new Audio('assets/audio/sfx/shoot.ogg');

function playGunshot() {
  // Clone the audio so rapid shots can overlap without cutting each other off.
  const shot = shootSound.cloneNode();
  shot.volume = 0.55 * window.RielVolume.sfx();
  shot.play().catch(() => {});
}

function playDeathSound() {
  try {
    const ac  = getAudio();
    const buf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.6 * Math.sin(t * 8);
    }
    const src  = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(Math.max(0.0011, 0.22 * window.RielVolume.sfx()), ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    src.connect(gain); gain.connect(ac.destination);
    src.start();
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════
function wp(x) { return Math.round(x - camX); }  // world → screen x

function drawRect(wx, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(wp(wx), y, w, h);
}

// Pixel sprite helper (draws PIXEL-scaled blocks)
function sp(wx, y, px2, py, color) {
  ctx.fillStyle = color;
  ctx.fillRect(wp(wx) + px2 * PIXEL, y + py * PIXEL, PIXEL, PIXEL);
}

// ═══════════════════════════════════════════════════════════════
//  DRAW PLAYER SPRITE
// ═══════════════════════════════════════════════════════════════
function drawPlayer() {
  if (player.dead) {
    // Skull at death position
    drawSkull(player.deathX, player.y);
    return;
  }

  // Dash trail — ghost images behind player
  if (player.isDashing) {
    for (let t = 1; t <= 3; t++) {
      const trailX = player.x - player.dashVx * t * 2;
      ctx.globalAlpha = 0.15 * (4 - t);
      ctx.fillStyle = '#2255cc';
      ctx.fillRect(wp(trailX), player.y, PLAYER_W, PLAYER_H);
    }
    ctx.globalAlpha = 1;
  }

  // Hit flash — alternate transparency
  if (player.hitFlash > 0 && Math.floor(player.hitFlash / 3) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  const bx = player.x;
  const by = player.y;
  const S  = PIXEL;
  const f  = player.facingRight;

  function p(col, row, color) {
    // Mirror horizontally if facing left
    const drawCol = f ? col : (8 - col);
    ctx.fillStyle = color;
    ctx.fillRect(wp(bx) + drawCol * S, by + row * S, S, S);
  }

  const skin    = '#f5c89a';
  const hair    = '#222222';
  const jacket  = '#2255cc';
  const boot    = '#3d2b1f';
  const gunC    = '#888870';
  const barrel  = '#ccccaa';
  const flash   = '#f5c400';

  // Head
  p(2,0,hair); p(3,0,hair); p(4,0,hair);
  p(1,1,skin); p(2,1,skin); p(3,1,skin); p(4,1,skin); p(5,1,hair);
  p(1,2,skin); p(2,2,skin); p(3,2,'#111'); p(4,2,skin); p(5,2,skin);

  // Body
  for(let c=1;c<=5;c++){ p(c,3,jacket); p(c,4,jacket); }

  // Gun arm (always on right side of body = col 6+)
  if (player.reloadTimer > 0) {
    // Reload animation: gun tips down, new magazine slides up into it,
    // then the gun snaps back level for the final moment.
    const t = 1 - player.reloadTimer / RELOAD_FRAMES; // 0 → 1
    const magC = '#444450';
    if (t < 0.9) {
      p(6,3,skin); p(7,4,gunC); p(8,5,gunC);          // gun angled down
      if (t > 0.3) {
        // Off-hand brings the new mag from the belt up to the gun
        const k = Math.min(1, (t - 0.3) / 0.45);
        const magRow = 7 - Math.round(k * 2);           // rows 7 → 5
        p(6, magRow, magC); p(6, magRow + 1, magC);
        if (k < 1) p(5, magRow + 1, skin);              // hand under the mag
      }
    } else {
      p(6,3,skin); p(7,3,gunC); p(8,3,gunC);
      p(7,4,magC);                                      // mag seated
    }
  } else {
    p(6,3,skin); p(7,3,gunC); p(8,3,gunC);
    if (player.gunFlash > 0) { p(9,3,flash); p(9,2,flash); }
  }

  // Legs
  const lf = player.animFrame;
  if (lf === 0) {
    p(2,5,jacket); p(3,5,jacket); p(4,5,jacket);
    p(2,6,boot);   p(4,6,boot);
    p(2,7,boot);   p(4,7,boot);
  } else if (lf === 1) {
    p(2,5,jacket); p(3,5,jacket); p(4,5,jacket);
    p(1,6,boot);   p(3,6,boot);
    p(1,7,boot);   p(4,7,boot);
  } else {
    p(2,5,jacket); p(3,5,jacket); p(4,5,jacket);
    p(2,6,boot);   p(4,6,boot);
    p(3,7,boot);   p(5,7,boot);
  }

  ctx.globalAlpha = 1;

  // Reload progress bar above the player's head
  if (player.reloadTimer > 0) {
    const t    = 1 - player.reloadTimer / RELOAD_FRAMES;
    const barW = 30, barH = 4;
    const barX = wp(bx) + PLAYER_W / 2 - barW / 2;
    const barY = by - 12;
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#2a2e44';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#f5c400';
    ctx.fillRect(barX, barY, Math.round(barW * t), barH);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SKULL SPRITE
// ═══════════════════════════════════════════════════════════════
function drawSkull(wx, y) {
  const S = PIXEL;
  function p(col, row, color) {
    ctx.fillStyle = color;
    ctx.fillRect(wp(wx) + col * S, y + row * S, S, S);
  }
  const w = '#e8e8d0', d = '#0a0e1a';
  p(1,0,w);p(2,0,w);p(3,0,w);
  p(0,1,w);p(1,1,d);p(2,1,w);p(3,1,d);p(4,1,w);
  p(0,2,w);p(1,2,w);p(2,2,w);p(3,2,w);p(4,2,w);
  p(1,3,w);p(2,3,d);p(3,3,w);
  p(1,4,w);p(2,4,w);p(3,4,w);
}

// ═══════════════════════════════════════════════════════════════
//  DRAW BACKGROUND + GROUND
// ═══════════════════════════════════════════════════════════════
function drawWorld() {
  // Sky
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Pixel grid (parallax slow)
  ctx.fillStyle = 'rgba(245,196,0,0.04)';
  const gridSize = 32;
  const offX = (-camX * 0.3) % gridSize;
  for (let x = offX % gridSize; x < BASE_W; x += gridSize) ctx.fillRect(x, 0, 1, GROUND_Y);
  for (let y = 0; y < GROUND_Y; y += gridSize) ctx.fillRect(0, y, BASE_W, 1);

  // Far background pillars (parallax)
  ctx.fillStyle = 'rgba(20,26,50,0.9)';
  const pillarOff = (-camX * 0.2) % 120;
  for (let x = pillarOff % 120; x < BASE_W; x += 120) {
    ctx.fillRect(x, 0, 12, GROUND_Y);
  }

  // Platforms
  for (const p of platforms) {
    const sx = wp(p.x);
    if (sx > BASE_W || sx + p.w < 0) continue;
    ctx.fillStyle = '#1a2244';
    ctx.fillRect(sx, p.y, p.w, p.h);
    ctx.fillStyle = '#f5c400';
    ctx.fillRect(sx, p.y, p.w, 2);
    // pixel tile detail
    ctx.fillStyle = 'rgba(245,196,0,0.15)';
    for (let tx = sx; tx < sx + p.w; tx += 16) ctx.fillRect(tx, p.y + 2, 8, p.h - 2);
  }

  // Ground
  ctx.fillStyle = '#1a1e30';
  ctx.fillRect(0, GROUND_Y, BASE_W, FLOOR_H);
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(0, GROUND_Y, BASE_W, 3);
  ctx.fillStyle = '#b8920a';
  ctx.fillRect(0, GROUND_Y + 3, BASE_W, 3);
  // Ground tile detail
  ctx.fillStyle = 'rgba(245,196,0,0.07)';
  const tOff = (-camX) % 32;
  for (let x = tOff % 32; x < BASE_W; x += 32) ctx.fillRect(x, GROUND_Y + 6, 16, FLOOR_H - 6);

  // Level end marker (right side of corridor)
  const endX = wp(LEVEL_WIDTH - 30);
  if (endX < BASE_W && endX > -30) {
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(endX, 0, 6, GROUND_Y);
    ctx.fillStyle = '#fff';
    ctx.font = '7px monospace';
    ctx.fillText('END', endX - 10, GROUND_Y - 10);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW BULLETS
// ═══════════════════════════════════════════════════════════════
function drawBullets() {
  for (const b of bullets) {
    const sx = wp(b.x);
    // Trail
    ctx.fillStyle = 'rgba(245,196,0,0.3)';
    ctx.fillRect(sx - b.dx * 8, b.y - b.dy * 8, 8, 3);
    // Bullet
    ctx.fillStyle = '#f5c400';
    ctx.fillRect(sx, b.y, 10, 3);
  }
}

function drawPowerups() {
  for (const p of powerups) {
    if (p.collected) continue;
    const sx = wp(p.x);
    if (sx < -40 || sx > BASE_W + 40) continue;
    if (p.type === 'jump') {
      ctx.fillStyle = '#8e44ad'; // purple
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = '#f5c400';
      ctx.fillRect(sx + 2, p.y + 2, p.w - 4, p.h - 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = '6px "Public Pixel", monospace';
      ctx.fillText('J', sx + 3, p.y + 8);
    } else {
      ctx.fillStyle = '#27ae60'; // green
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = '#f5c400';
      ctx.fillRect(sx + 2, p.y + 2, p.w - 4, p.h - 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = '6px "Public Pixel", monospace';
      ctx.fillText('S', sx + 3, p.y + 8);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  PAUSE MENU ITEMS
// ═══════════════════════════════════════════════════════════════

const PAUSE_ITEMS = [
  { label: 'RESUME',        action: () => { gameState = 'playing'; } },
  { label: 'SETTINGS',      action: () => { window.location.href = 'settings.html?returnTo=game.html'; } },
  { label: 'QUIT TO MENU',  action: () => {
    campaign.hp = Math.ceil(player.hp);
    campaign.maxHp = player.maxHp;
    campaign.lives = player.lives;
    campaign.gunDamage = player.gunDamage;
    localStorage.setItem('activeCampaign', JSON.stringify(campaign));
    window.location.href = 'index.html';
  }},
];

// Pause/unpause (Escape key and the on-screen pause button).
function togglePause() {
  if (gameState === 'playing')     { gameState = 'paused'; pauseMenuIndex = 0; }
  else if (gameState === 'paused') { gameState = 'playing'; }
}

// Which pause menu item (if any) is at canvas point (x, y)? Mirrors drawPauseMenu's layout.
function pauseItemAt(x, y) {
  const panelW = 380, panelH = 320;
  const panelX = BASE_W / 2 - panelW / 2;
  const panelY = BASE_H / 2 - panelH / 2;
  for (let i = 0; i < PAUSE_ITEMS.length; i++) {
    const itemY = panelY + 188 + i * 38;
    if (x >= panelX + 16 && x <= panelX + panelW - 16 && y >= itemY - 14 && y <= itemY + 10) return i;
  }
  return -1;
}

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * BASE_W / rect.width, y: (e.clientY - rect.top) * BASE_H / rect.height };
}

// Click or tap a pause menu item to choose it; hovering with a mouse highlights it.
canvas.addEventListener('pointerdown', e => {
  if (gameState !== 'paused') return;
  const p = canvasPoint(e);
  const i = pauseItemAt(p.x, p.y);
  if (i < 0) return;
  e.preventDefault();
  pauseMenuIndex = i;
  PAUSE_ITEMS[i].action();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  if (gameState !== 'paused') { canvas.style.cursor = ''; return; } // back to the crosshair
  const p = canvasPoint(e);
  const i = pauseItemAt(p.x, p.y);
  if (i >= 0) pauseMenuIndex = i;
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
});

// Navigate pause menu with arrow keys or W/S, confirm with Space/Enter
window.addEventListener('keydown', e => {
  if (gameState !== 'paused') return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { pauseMenuIndex = (pauseMenuIndex - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length; e.preventDefault(); }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { pauseMenuIndex = (pauseMenuIndex + 1) % PAUSE_ITEMS.length; e.preventDefault(); }
  if (e.code === 'Enter' || e.code === 'Space') { PAUSE_ITEMS[pauseMenuIndex].action(); e.preventDefault(); }
});

function drawPauseMenu() {
  if (gameState !== 'paused') return;

  // Dim backdrop
  ctx.fillStyle = 'rgba(10,14,26,0.82)';
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  const cx = BASE_W / 2;
  const panelW = 380, panelH = 320;
  const panelX = cx - panelW / 2;
  const panelY = BASE_H / 2 - panelH / 2;

  // Panel background
  ctx.fillStyle = '#0f1526';
  ctx.fillRect(panelX, panelY, panelW, panelH);

  // Gold pixel border
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(panelX, panelY, panelW, 3);
  ctx.fillRect(panelX, panelY + panelH - 3, panelW, 3);
  ctx.fillRect(panelX, panelY, 3, panelH);
  ctx.fillRect(panelX + panelW - 3, panelY, 3, panelH);

  // Title
  ctx.textAlign = 'center';
  ctx.font = '14px "Public Pixel", monospace';
  ctx.fillStyle = '#f5c400';
  ctx.fillText('PAUSED', cx, panelY + 30);

  // Version badge
  ctx.font = '7px "Public Pixel", monospace';
  ctx.fillStyle = '#444460';
  ctx.fillText(GAME_VERSION, cx, panelY + 46);

  // Divider
  ctx.fillStyle = 'rgba(245,196,0,0.2)';
  ctx.fillRect(panelX + 20, panelY + 54, panelW - 40, 2);

  // Stats block
  ctx.textAlign = 'left';
  ctx.font = '6px "Public Pixel", monospace';
  const stats = [
    ['CAMPAIGN',  campaign.name || 'UNKNOWN'],
    ['LEVEL',     campaign.level + ' / 100'],
    ['HP',        Math.ceil(player.hp) + ' / ' + player.maxHp],
    ['LIVES',     '♥'.repeat(player.lives) + '♡'.repeat(Math.max(0, 3 - player.lives))],
    ['RIELS',     campaign.riels + ' KHR'],
    ['GUN DMG',   player.gunDamage],
    ['UPGRADES',  campaign.upgradeCount || 0],
    ['BOSSES',    (campaign.bossesBeaten || 0) + ' / 10'],
  ];
  const colL = panelX + 24;
  const colR = panelX + panelW / 2 + 10;
  stats.forEach((s, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2 === 0 ? colL : colR;
    const y   = panelY + 74 + row * 20;
    ctx.fillStyle = '#555566';
    ctx.fillText(s[0], col, y);
    ctx.fillStyle = '#e8e8d0';
    ctx.fillText(s[1], col, y + 11);
  });

  // Divider
  ctx.fillStyle = 'rgba(245,196,0,0.2)';
  ctx.fillRect(panelX + 20, panelY + 162, panelW - 40, 2);

  // Menu items
  PAUSE_ITEMS.forEach((item, i) => {
    const itemY = panelY + 188 + i * 38;
    const selected = i === pauseMenuIndex;

    if (selected) {
      ctx.fillStyle = '#f5c400';
      ctx.fillRect(panelX + 16, itemY - 14, panelW - 32, 24);
    }

    ctx.textAlign = 'center';
    ctx.font = '9px "Public Pixel", monospace';
    ctx.fillStyle = selected ? '#0a0e1a' : '#888870';
    ctx.fillText((selected ? '▶ ' : '  ') + item.label, cx, itemY);
  });

  // Hint
  ctx.font = '5px "Public Pixel", monospace';
  ctx.fillStyle = '#333344';
  ctx.fillText('↑↓ NAVIGATE   SPACE/ENTER CONFIRM   ESC RESUME   TAP TO SELECT', cx, panelY + panelH - 10);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════
const toastQueue = [];
let toastTimer2 = 0;
let toastMsg    = '';

function showToast(msg) {
  toastMsg    = msg;
  toastTimer2 = 120;
}

function drawToast() {
  if (toastTimer2 <= 0) return;
  toastTimer2--;
  const alpha = Math.min(1, toastTimer2 / 20);
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = '#0f1526';
  ctx.fillRect(BASE_W / 2 - 140, BASE_H - 40, 280, 22);
  ctx.fillStyle   = '#f5c400';
  ctx.font        = '7px "Public Pixel", monospace';
  ctx.textAlign   = 'center';
  ctx.fillText(toastMsg, BASE_W / 2, BASE_H - 24);
  ctx.textAlign   = 'left';
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════════
function drawHUD() {
  if (gameState !== 'playing') return;

  // HP bar
  const barX = 10, barY = 10, barW = 180, barH = 14;
  ctx.fillStyle = '#1a1e30';
  ctx.fillRect(barX, barY, barW, barH);
  const hpFrac = Math.max(0, player.hp / player.maxHp);
  ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f5c400' : '#e74c3c';
  ctx.fillRect(barX, barY, barW * hpFrac, barH);
  ctx.fillStyle = '#e8e8d0';
  ctx.font = '6px "Public Pixel", monospace';
  ctx.fillText('HP ' + Math.ceil(player.hp) + ' / ' + player.maxHp, barX + 4, barY + 10);

  // Lives (3 hearts, grey when lost)
  ctx.font = '11px "Public Pixel", monospace';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < player.lives ? '#c0392b' : '#2a2e44';
    ctx.fillText('♥', barX + i * 18, barY + 30);
  }

  // Ammo: magazine count, or a blinking RELOADING with a countdown
  ctx.font = '6px "Public Pixel", monospace';
  if (player.reloadTimer > 0) {
    const secs = (player.reloadTimer / 60).toFixed(1);
    ctx.fillStyle = Math.floor(frameCount / 15) % 2 === 0 ? '#f5c400' : '#b8920a';
    ctx.fillText('RELOADING ' + secs + 's', barX, barY + 46);
  } else {
    ctx.fillStyle = (player.bullets || 0) > 5 ? '#e8e8d0' : '#e74c3c';
    ctx.fillText('AMMO ' + (player.bullets || 0) + ' / ∞', barX, barY + 46);
    if ((player.bullets || 0) <= 5) {
      ctx.fillStyle = '#888870';
      ctx.fillText('[R] RELOAD', barX + 96, barY + 46);
    }
  }

  // Powerup indicators
  ctx.font = '6px "Public Pixel", monospace';
  if (player.jumpPowerTimer > 0) {
    const secs = Math.ceil(player.jumpPowerTimer / 60);
    ctx.fillStyle = '#f5c400';
    ctx.fillText('JUMP x' + (player.jumpMult || 1) + ' ' + secs + 's', barX, barY + 60);
  }
  if (player.speedPowerTimer > 0) {
    const secs = Math.ceil(player.speedPowerTimer / 60);
    ctx.fillStyle = '#f5c400';
    ctx.fillText('SPD x' + (player.speedMult || 1) + ' ' + secs + 's', barX + 86, barY + 60);
  }

  // Dash cooldown indicator
  const dashReady = player.dashCooldown <= 0;
  ctx.fillStyle = '#1a1e30';
  ctx.fillRect(barX, barY + 52, 80, 6);
  ctx.fillStyle = dashReady ? '#2ecc71' : '#2255cc';
  const dashFrac = dashReady ? 1 : 1 - (player.dashCooldown / DASH_COOLDOWN);
  ctx.fillRect(barX, barY + 52, 80 * dashFrac, 6);
  ctx.font = '5px "Public Pixel", monospace';
  ctx.fillStyle = dashReady ? '#2ecc71' : '#888870';
  ctx.fillText(dashReady ? 'DASH RDY' : 'DASH ' + Math.ceil(player.dashCooldown / 60) + 'S', barX, barY + 68);

  // Right panel
  ctx.font = '7px "Public Pixel", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5c400';
  ctx.fillText('LVL ' + campaign.level, BASE_W - 10, 18);
  ctx.fillStyle = '#e8e8d0';
  ctx.fillText(campaign.riels + ' KHR', BASE_W - 10, 30);
  ctx.fillStyle = '#888870';
  ctx.fillText('DMG ' + player.gunDamage, BASE_W - 10, 42);
  const alive = npcs.filter(n => !n.dead).length;
  ctx.fillStyle = alive > 0 ? '#e8e8d0' : '#2ecc71';
  ctx.fillText(alive + ' LEFT', BASE_W - 10, 54);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════════════
//  OVERLAY SCREENS
// ═══════════════════════════════════════════════════════════════
function drawOverlay() {
  if (gameState === 'playing') return;
  stateTimer++;

  const dimAlpha = Math.min(stateTimer / 30, 0.78);
  ctx.fillStyle  = `rgba(10,14,26,${dimAlpha})`;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  if (stateTimer < 20) return;

  const cx = BASE_W / 2;
  const cy = BASE_H / 2;
  ctx.textAlign = 'center';

  if (gameState === 'level_clear') {
    drawBanner('LEVEL COMPLETE!', '#2ecc71', cx, cy);
    if (stateTimer > 35) {
      ctx.font      = '7px "Public Pixel", monospace';
      ctx.fillStyle = '#2ecc71';
      ctx.fillText('HP RESTORED', cx, cy + 50);
    }
    if (stateTimer > 90) proceedToShop();

  } else if (gameState === 'boss_slayed') {
    drawBanner('BOSS SLAYED!', '#f5c400', cx, cy);
    if (stateTimer > 35) {
      ctx.font      = '7px "Public Pixel", monospace';
      ctx.fillStyle = '#2ecc71';
      ctx.fillText('MAX HP UP! NOW ' + player.maxHp, cx, cy + 50);
    }
    if (stateTimer > 60) {
      ctx.fillStyle = '#e74c3c';
      ctx.fillText('LIVES RESTORED  ' + '♥'.repeat(MAX_LIVES) + '  HP RESTORED', cx, cy + 66);
    }
    if (stateTimer > 120) proceedToShop();

  } else if (gameState === 'game_over') {
    // Brief pause on the dimmed game (skull visible), then the death screen.
    if (stateTimer > 60) showDeathScreen();

  } else if (gameState === 'you_win') {
    drawBanner('YOU BEAT THE GAME!', '#f5c400', cx, cy - 20);
    if (stateTimer > 35) {
      ctx.font = '7px "Public Pixel", monospace';
      ctx.fillStyle = '#e8e8d0';
      ctx.fillText('CONGRATULATIONS!', cx, cy + 24);
      ctx.fillStyle = '#888870';
      ctx.fillText('TOTAL RIELS: ' + campaign.riels + ' KHR', cx, cy + 44);
    }
    if (stateTimer > 220) {
      localStorage.setItem('activeCampaign', JSON.stringify(campaign));
      window.location.href = 'index.html';
    }
  }

  ctx.textAlign = 'left';
}

function drawBanner(text, color, cx, cy) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - 230, cy - 38, 460, 54);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 230, cy - 40, 460, 4);
  ctx.fillRect(cx - 230, cy + 16, 460, 4);
  const size = text.length > 14 ? '13px' : '17px';
  ctx.font      = `${size} "Public Pixel", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, cx + 3, cy + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

function proceedToShop() {
  if (gameState === '_transitioning') return;
  gameState = '_transitioning';
  applyLevelClearRewards();
  campaign.gunDamage = player.gunDamage;
  // NOTE: level increment happens in shop.html when player clicks Continue
  const best = parseInt(localStorage.getItem('bestRiels') || '0');
  if (campaign.riels > best) localStorage.setItem('bestRiels', campaign.riels);
  try {
    const idx = parseInt(localStorage.getItem('activeCampaignIdx'));
    const all = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || [];
    if (!isNaN(idx) && all[idx]) {
      all[idx] = { ...all[idx], ...campaign, lastPlayed: Date.now() };
      localStorage.setItem('rielrunner_campaigns', JSON.stringify(all));
    }
  } catch {}
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));
  window.location.href = 'shop.html';
}

// ═══════════════════════════════════════════════════════════════
//  INIT LASERS after platforms exist
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  TOUCH CONTROLS
// ═══════════════════════════════════════════════════════════════
(function initTouch() {
  // Read saved setting (if any). If the user explicitly set touchControls to true/false,
  // respect that. Otherwise enable on touch-capable devices only.
  const s = (() => {
    try { return JSON.parse(localStorage.getItem('rielrunner_settings')) || {}; }
    catch { return {}; }
  })();

  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  let touchEnabled;
  if (Object.prototype.hasOwnProperty.call(s, 'touchControls')) {
    touchEnabled = !!s.touchControls; // respect explicit user preference
  } else {
    touchEnabled = isTouchDevice;     // default: enable on touch devices
  }
  if (!touchEnabled) return;

  // Force auto-aim on touch
  settings.autoAim = true;

  const overlay = document.getElementById('touch-overlay');
  overlay.classList.add('active');

  // Map button id → key code it simulates
  const BTN_KEY_MAP = {
    'btn-left':  'ArrowLeft',
    'btn-right': 'ArrowRight',
    'btn-jump':  'ArrowUp',
    'btn-shoot': 'Space',
    'btn-dash':  'ArrowDown',
  };

  function setKey(code, down) { keys[code] = down; }

  // Pointer events cover mouse, touch and pen with one code path. Capturing the
  // pointer means the button still gets the "up" even if the finger/cursor slides off.
  Object.entries(BTN_KEY_MAP).forEach(([id, code]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const press = e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch {}
      setKey(code, true);
      el.classList.add('pressed');
    };
    const release = () => { setKey(code, false); el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  });

  // Pause button: works with a mouse click as well as a tap.
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      pauseBtn.classList.add('pressed');
      togglePause();
    });
    const unpress = () => pauseBtn.classList.remove('pressed');
    pauseBtn.addEventListener('pointerup', unpress);
    pauseBtn.addEventListener('pointercancel', unpress);
    pauseBtn.addEventListener('pointerleave', unpress);
  }

  // Dash button — live cooldown countdown
  const dashBtn = document.getElementById('btn-dash');
  function updateDashBtn() {
    if (!dashBtn) return;
    if (player.dashCooldown > 0) {
      dashBtn.classList.add('cooldown');
      dashBtn.textContent = Math.ceil(player.dashCooldown / 60) + 'S';
    } else {
      dashBtn.classList.remove('cooldown');
      dashBtn.textContent = 'DASH';
    }
    requestAnimationFrame(updateDashBtn);
  }
  requestAnimationFrame(updateDashBtn);

  // Prevent scroll/zoom on canvas during touch
  const cv = document.getElementById('game-canvas');
  cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  cv.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
})();

generateLasers();
// Generate powerups for this level
function generatePowerups() {
  powerups.length = 0;
  // spawn 1-3 powerups per level (avoid boss levels)
  if (campaign.level > 0 && campaign.level % 10 === 0) return; // no powerups during boss levels
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    let x, y;
    if (platforms.length > 0 && Math.random() < 0.7) {
      const p = platforms[Math.floor(Math.random() * platforms.length)];
      x = p.x + 8 + Math.random() * Math.max(0, p.w - 24);
      y = p.y - 10;
    } else {
      x = 400 + Math.random() * (LEVEL_WIDTH - 800);
      y = GROUND_Y - 16;
    }
    const type = Math.random() < 0.5 ? 'jump' : 'speed';
    powerups.push({ x, y, w: 12, h: 10, type, collected: false });
  }
}

// call now
generatePowerups();

// ═══════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════
let lastLoopTime = performance.now();
function loop() {
  requestAnimationFrame(loop);
  frameCount++;

  // Real time played (not frames, so high-refresh screens don't inflate it).
  // Capped per frame so time in a background tab doesn't count.
  const now = performance.now();
  if (gameState === 'playing') addStat('playTimeMs', Math.min(now - lastLoopTime, 100));
  lastLoopTime = now;

  if (gameState === 'playing') {
    updatePlayer();
    updateBullets();
    updateNPCs();
    updateLasers();
    updatePowerups && updatePowerups();
  }

  drawWorld();
  drawLasers();
  drawBullets();
  updateDrawDroppedMags();
  drawPowerups();
  drawNPCs();
  drawPlayer();
  updateDrawRielParticles();
  updateDrawDmgNumbers();
  drawHUD();
  drawToast();
  drawOverlay();
  drawPauseMenu();
}

requestAnimationFrame(loop);

// Game music starts from the beginning on every level and loops continuously.
const gameMusic = new Audio('assets/audio/music/game-music.flac');
gameMusic.loop = true;
window.RielVolume.bindMusic(gameMusic, 0.50); // Sound effects use 0.55, so they sit slightly above the music.
gameMusic.play().catch(() => {});
window.addEventListener('pointerdown', () => gameMusic.play().catch(() => {}), { once: true });
window.addEventListener('keydown', () => gameMusic.play().catch(() => {}), { once: true });
