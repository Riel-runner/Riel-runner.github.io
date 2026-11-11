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
// A fallen or completed campaign can't be played again (e.g. via the browser Back button).
if (campaign.dead || campaign.completed) window.location.replace('level-select.html');

// Campaign type (js/modes.js): Normal, Time Attack, Endless, Boss Rush or Nightmare.
const MODE = window.RielModes.get(campaign);

// Shop upgrades (definitions in js/upgrades.js). Old saves get migrated here.
window.RielUpgrades.ensure(campaign);
const ARMOR_BLOCK       = window.RielUpgrades.effect(campaign, 'armor');    // fraction of damage blocked
const PLAYER_SPEED_MULT = window.RielUpgrades.effect(campaign, 'speed');    // move speed multiplier
const PLAYER_SHOOT_CD   = window.RielUpgrades.effect(campaign, 'firerate'); // frames between shots

// Cosmetics bought with gems in the shop (js/cosmetics.js): look only, no gameplay effect.
const PLAYER_SKIN = window.RielCosmetics.equipped('player');
const WEAPON_SKIN = window.RielCosmetics.equipped('weapon');
const TRAIL_ID    = window.RielCosmetics.equipped('trail').id;
// Class (gem shop): its weapon sets damage multiplier, magazine, fire rate, reload,
// move speed, bullet speed, shotgun pellets and sniper piercing. Upgrade effects
// (js/upgrades.js) are based on these numbers too.
const PLAYER_CLASS = window.RielCosmetics.equipped('class');
const classDamage  = () => player.gunDamage * PLAYER_CLASS.dmg;          // per bullet / pellet
// Ability won on the gem shop wheel (js/abilities.js): { def, level, awakened, s } or null.
// Used with E (or the touch button); see the ABILITIES section.
const ABILITY = window.RielAbilities.equippedInfo();
const trailParticles = [];

// Run stats shown on the death screen / campaign details. Older saves won't
// have these yet, so they start counting from 0 the first time they're used.
function addStat(name, amount = 1) {
  campaign[name] = (campaign[name] || 0) + amount;
}

// ── Achievements (js/achievements.js) ──
// This level's numbers for the speed / no-damage / accuracy achievements. Saved with
// the level so a resumed level keeps its clock.
const levelStats = { timeMs: 0, damage: 0, shots0: campaign.shotsFired || 0, hits0: campaign.shotsHit || 0 };
const ACH = window.RielAchievements;
const achToasts = [];        // unlocked mid-level, shown one at a time (see drawToast)
let clearAchievements = [];  // unlocked by clearing this level, listed on the banner
const achText = a => 'ACHIEVEMENT: ' + a.name + '  +' + a.gems + ' GEMS';
function announceAchievements(list) {
  for (const a of list) achToasts.push(achText(a));
}

// Report the clear once per level (a restored "level complete" save clears again).
function reportLevelClear() {
  if (campaign.achLevel === campaign.level) return;
  campaign.achLevel = campaign.level;
  const shots = (campaign.shotsFired || 0) - levelStats.shots0;
  const hits  = (campaign.shotsHit || 0) - levelStats.hits0;
  clearAchievements = achToasts.splice(0).concat(ACH.levelCleared({
    level: campaign.level, boss: isBossLevel(), timeMs: levelStats.timeMs,
    damage: levelStats.damage, shots, hits,
  }).map(achText));
  if (MODE.id === 'endless') clearAchievements.push(...ACH.max('bestWave', campaign.level).map(achText));
  persistCampaign();
}

let settings;
try { settings = JSON.parse(localStorage.getItem('rielrunner_settings')); } catch {}
if (!settings) settings = { autoAim: true, hpBars: true, damageNumbers: true };

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const GRAVITY        = 0.55;
const JUMP_FORCE     = -9.5;          // lower, more natural jump (~82px high; was -12, ~131px)
const JUMP_HEIGHT    = (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY); // how high a normal jump rises
// Enemies jump a bit lower than the player (they also fall with 0.9x gravity).
const NPC_JUMP_FORCE = -Math.sqrt((JUMP_HEIGHT - 6) * 2 * GRAVITY * 0.9);
// Platforms are always reachable with a normal jump. The per-frame physics peaks ~5px
// below the formula, so this leaves ~11px of real headroom at the highest platform.
const PLATFORM_MIN_RISE = 42;
const PLATFORM_MAX_RISE = Math.floor(JUMP_HEIGHT - 16);
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
const GAME_VERSION   = 'V7';

// ═══════════════════════════════════════════════════════════════
//  LEVEL EVENTS
//  One random modifier is rolled each level and shown to the player
//  as a banner before they start moving. Events hook into existing
//  multipliers wherever possible so they play nicely with upgrades.
// ═══════════════════════════════════════════════════════════════
const LEVEL_EVENTS = [
  {
    id:    'double_riels',
    label: '💰 RIEL RUSH',
    desc:  'ALL ENEMY KILLS PAY DOUBLE THIS LEVEL!',
    color: '#f5c400',
    apply() { levelEvent.rielMult = 2; },
  },
  {
    id:    'enemy_speed',
    label: '⚡ FRENZY',
    desc:  'ENEMIES MOVE 50% FASTER. STAY SHARP!',
    color: '#e74c3c',
    apply() { levelEvent.enemySpeedMult = 1.5; },
  },
  {
    id:    'low_gravity',
    label: '🌙 LOW GRAVITY',
    desc:  'GRAVITY REDUCED. JUMP FAR, FALL SLOW.',
    color: '#8e44ad',
    apply() { levelEvent.gravityMult = 0.45; },
  },
  {
    id:    'glass_cannon',
    label: '💥 GLASS CANNON',
    desc:  'YOUR SHOTS HIT TWICE AS HARD, BUT YOU TAKE 40% MORE DAMAGE!',
    color: '#e67e22',
    apply() { levelEvent.playerDmgMult = 2; levelEvent.playerDamageTakenMult = 1.4; },
  },
  {
    id:    'enemy_glass',
    label: '🔪 PAPER ENEMIES',
    desc:  'ENEMIES HAVE HALF HEALTH THIS LEVEL!',
    color: '#2ecc71',
    apply() { levelEvent.enemyHpMult = 0.5; },
  },
  {
    id:    'no_auto_aim',
    label: '🎯 MANUAL AIM',
    desc:  'AUTO-AIM IS OFF. USE YOUR MOUSE TO AIM.',
    color: '#5dade2',
    apply() { levelEvent.forceManualAim = true; },
  },
  {
    id:    'bonus_enemies',
    label: '🌊 HORDE',
    desc:  'DOUBLE THE ENEMIES — DOUBLE THE RIELS!',
    color: '#c0392b',
    apply() { levelEvent.extraEnemyMult = 2; levelEvent.rielMult = (levelEvent.rielMult || 1) * 2; },
  },
  {
    id:    'fast_fire',
    label: '🔥 RAPID FIRE',
    desc:  'YOUR FIRE RATE IS DOUBLED THIS LEVEL!',
    color: '#27ae60',
    apply() { levelEvent.fireRateMult = 0.5; },   // multiplies shoot cooldown (lower = faster)
  },
];

// Active event state (filled by pickLevelEvent, read throughout the loop)
const levelEvent = {
  id:                   'none',
  label:                '',
  desc:                 '',
  color:                '#e8e8d0',
  rielMult:             1,
  enemySpeedMult:       1,
  gravityMult:          1,
  playerDmgMult:        1,
  playerDamageTakenMult:1,
  enemyHpMult:          1,
  extraEnemyMult:       1,
  fireRateMult:         1,
  forceManualAim:       false,
};

// Banner shown at level start
let eventBannerTimer = 0;
const EVENT_BANNER_FRAMES = 220; // ~3.6s

const LEVEL_EVENT_DEFAULTS = { ...levelEvent };

function pickLevelEvent() {
  // No event on tutorial levels (1-2) or boss levels
  if (campaign.level <= 2 || campaign.level % 10 === 0) return;
  applyLevelEvent(LEVEL_EVENTS[Math.floor(Math.random() * LEVEL_EVENTS.length)]);
  eventBannerTimer = EVENT_BANNER_FRAMES;
}

// Make ev the active event (starting from no event, so effects never stack).
function applyLevelEvent(ev) {
  Object.assign(levelEvent, LEVEL_EVENT_DEFAULTS);
  if (!ev) return;
  levelEvent.id    = ev.id;
  levelEvent.label = ev.label;
  levelEvent.desc  = ev.desc;
  levelEvent.color = ev.color;
  ev.apply();
}

function drawEventBanner() {
  if (eventBannerTimer <= 0 || levelEvent.id === 'none') return;
  eventBannerTimer--;
  const alpha = Math.min(1, eventBannerTimer / 30) * Math.min(1, (EVENT_BANNER_FRAMES - eventBannerTimer + 1) / 20);
  const cx = BASE_W / 2;
  const by = 60;

  ctx.globalAlpha = alpha;
  // Backing panel
  ctx.fillStyle = '#0f1526';
  ctx.fillRect(cx - 230, by, 460, 52);
  // Accent bar on top
  ctx.fillStyle = levelEvent.color;
  ctx.fillRect(cx - 230, by, 460, 3);
  ctx.fillRect(cx - 230, by + 49, 460, 3);
  // Label
  ctx.textAlign = 'center';
  ctx.font = '9px "Public Pixel", monospace';
  ctx.fillStyle = levelEvent.color;
  ctx.fillText(levelEvent.label, cx, by + 18);
  // Description
  ctx.font = '6px "Public Pixel", monospace';
  ctx.fillStyle = '#e8e8d0';
  ctx.fillText(levelEvent.desc, cx, by + 36);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

// Show active event as a small badge in the HUD (top-right, below level/riels)
function drawEventHUDBadge() {
  if (levelEvent.id === 'none' || gameState !== 'playing') return;
  ctx.font = '5px "Public Pixel", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = levelEvent.color;
  ctx.fillText(levelEvent.label, BASE_W - 10, PAUSE_BTN.y + PAUSE_BTN.h + 90);
  ctx.textAlign = 'left';
}

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
  // ability (frames): cooldown left, active effect left, Med Kit regen left
  abilityCd: 0,
  abilityTime: 0,
  regenTime: 0,
  // Overcharge: extra HP above max from awakened Life Leech. Normal healing can't
  // add to it; damage uses it up first. Carried between levels until it's gone.
  overHp: campaign.overHp || 0,
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

// Vertical laser barriers are anchored directly to platform edges.
// Their horizontal position is never picked independently: each beam sits on the
// left or right edge of a selected platform and extends down to the ground.
// Each laser is ON for 5s then OFF for 3s, flickering for the last 0.75s before it
// comes back on. Their timers are staggered so there is always a gap to time.
const LASER_ON_FRAMES   = 5 * 60;
const LASER_OFF_FRAMES  = 3 * 60;
const LASER_CYCLE       = LASER_ON_FRAMES + LASER_OFF_FRAMES;
const LASER_WARN_FRAMES = 45;
const LASER_BEAM_W      = 6;

function generateLasers() {
  lasers.length = 0;
  const level = campaign.level || 1;
  const count = Math.min(5, 2 + Math.floor(level / 20)); // 2 early on, up to 5 in later stages
  const usable = platforms
    .filter(p => p.x > 500 && p.x + p.w < LEVEL_WIDTH - 300)
    .slice()
    .sort((a, b) => a.x - b.x);
  const used = new Set();

  for (let i = 0; i < count && used.size < usable.length; i++) {
    // Choose a platform near an even interval through the level, not a free-floating X.
    const targetX = 650 + (i + 0.5) * (LEVEL_WIDTH - 1000) / count;
    const plat = usable
      .filter(p => !used.has(p))
      .sort((a, b) => Math.abs((a.x + a.w / 2) - targetX) - Math.abs((b.x + b.w / 2) - targetX))[0];
    if (!plat) continue;

    used.add(plat);
    const edge = i % 2 === 0 ? 'left' : 'right';
    const x = Math.round(
      (edge === 'left' ? plat.x : plat.x + plat.w) - LASER_BEAM_W / 2
    );
    const y = plat.y;
    const h = Math.max(1, GROUND_Y - plat.y);
    const t = Math.floor(i * LASER_CYCLE / count);

    lasers.push({
      kind: 'platform-edge',
      orientation: 'vertical',
      edge,
      x, y,
      w: LASER_BEAM_W,
      h,
      t,
      lastDamageFrame: -LASER_TICK_FRAMES
    });
  }
}

const laserPhase = l => (l.t || 0) % LASER_CYCLE;
const laserOn    = l => laserPhase(l) < LASER_ON_FRAMES;
const laserWarn  = l => !laserOn(l) && LASER_CYCLE - laserPhase(l) <= LASER_WARN_FRAMES;

function updateLasers() {
  for (const laser of lasers) {
    laser.t = (laser.t || 0) + 1;  // only advances while playing (paused = frozen)
    if (player.dead || !laserOn(laser)) continue;
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
    if (sx > BASE_W + 40 || sx + laser.w < -40) continue;
    const on = laserOn(laser);
    if (on) {
      const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
      // Vertical beam glow and core.
      ctx.fillStyle = `rgba(255,50,50,${pulse * 0.5})`;
      ctx.fillRect(sx - 2, laser.y - 2, laser.w + 4, laser.h + 4);
      ctx.fillStyle = `rgba(255,80,80,${pulse * 0.9})`;
      ctx.fillRect(sx, laser.y, laser.w, laser.h);
      ctx.fillStyle = `rgba(255,220,220,${pulse})`;
      ctx.fillRect(sx + 2, laser.y, Math.max(1, laser.w - 4), laser.h);
    } else if (laserWarn(laser) && frameCount % 8 < 4) {
      // About to switch back on: thin flickering vertical warning beam.
      ctx.fillStyle = 'rgba(255,80,80,0.45)';
      ctx.fillRect(sx + 2, laser.y, Math.max(1, laser.w - 4), laser.h);
    } else {
      // Off: faint dotted vertical guide so the beam location remains visible.
      ctx.fillStyle = 'rgba(255,80,80,0.18)';
      for (let y = 0; y < laser.h; y += 6) {
        ctx.fillRect(sx + 2, laser.y + y, Math.max(1, laser.w - 4), 3);
      }
    }
    // Emitters sit at the top and bottom of each vertical beam.
    ctx.fillStyle = on ? '#ff3232' : '#5a2020';
    ctx.fillRect(sx - 1, laser.y - 3, laser.w + 2, 5);
    ctx.fillRect(sx - 1, laser.y + laser.h - 2, laser.w + 2, 5);
  }
}

function generatePlatforms() {
  const plats = [];
  const spacing = 320;
  for (let i = 1; i * spacing < LEVEL_WIDTH - 400; i++) {
    const x = i * spacing + Math.random() * 80 - 40;
    // Never higher than a normal jump can reach (see PLATFORM_MAX_RISE).
    const y = GROUND_Y - PLATFORM_MIN_RISE - Math.random() * (PLATFORM_MAX_RISE - PLATFORM_MIN_RISE);
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

  // Ability: E (or the touch button) uses it; timers tick here
  updateAbilityTimers();
  if (keys['KeyE']) { keys['KeyE'] = false; useAbility(); }

  // Horizontal
  let moving = false;
  const runSpeed = MOVE_SPEED * PLAYER_SPEED_MULT * (player.speedMult || 1) * (abilityOn('adrenaline') ? ADRENALINE_SPEED : 1);
  if (keys['ArrowLeft']) {
    player.vx = -runSpeed;
    player.facingRight = false;
    moving = true;
  } else if (keys['ArrowRight']) {
    player.vx = runSpeed;
    player.facingRight = true;
    moving = true;
  } else {
    player.vx = 0;
  }

  // Jump — ArrowUp only, Space is shoot
  if (keys['ArrowUp'] && player.onGround) {
    player.vy = JUMP_FORCE * Math.sqrt(player.jumpMult || 1); // jumpMult scales height, so force scales by its square root
    player.onGround = false;
  }

  // Dash — ArrowDown triggers dash in facing direction
  if (keys['ArrowDown'] && player.dashCooldown <= 0 && !player.isDashing) {
    player.isDashing = true;
    player.dashTimer  = DASH_DURATION;
    player.dashVx     = player.facingRight ? DASH_DISTANCE / DASH_DURATION : -DASH_DISTANCE / DASH_DURATION;
    player.dashCooldown = abilityOn('adrenaline') && ABILITY.awakened ? 0 : DASH_COOLDOWN; // Rush trait: no cooldown
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

  // Gravity (modified by low-gravity event)
  player.vy += GRAVITY * (levelEvent.gravityMult || 1);
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
  if (player.invuln     > 0) player.invuln--;

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
    player.shootTimer = Math.max(4, Math.round(PLAYER_SHOOT_CD * (levelEvent.fireRateMult || 1) / (abilityOn('quickdraw') ? QUICKDRAW_FIRE : 1))); // SHOOT_COOLDOWN reduced by the Fire Rate upgrade, fast-fire event and Quick Draw
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
const MAG_SIZE      = window.RielUpgrades.effect(campaign, 'ammo'); // 20, +5 per Mag Size upgrade level
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
const JUMP_POWER_MULT = 1.5;   // jump boost: 1.5x jump HEIGHT (was 2x force = 4x height)
const JUMP_POWER_DURATION_FRAMES = 30 * 60; // 30s
const SPEED_POWER_MULT = 2;    // speed boost: 2x move speed (was 3x)
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

  // Consume one bullet (not during awakened Quick Draw: Bottomless trait)
  if (!(abilityOn('quickdraw') && ABILITY.awakened)) player.bullets = Math.max(0, player.bullets - 1);

  const startX = player.facingRight
    ? player.x + PLAYER_W + 2
    : player.x - 6;
  const startY = player.y + 10;

  let dx = 1, dy = 0;

  if (settings.autoAim && !levelEvent.forceManualAim) {
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

  const pellets = PLAYER_CLASS.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    // Shotgun: fan the pellets evenly across the spread angle around the aim direction.
    const a = pellets > 1 ? (i / (pellets - 1) - 0.5) * 2 * (PLAYER_CLASS.spread || 0) : 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    bullets.push({ x: startX, y: startY, dx: dx * ca - dy * sa, dy: dx * sa + dy * ca, alive: true,
                   speed: PLAYER_CLASS.bulletSpeed || BULLET_SPEED,   // sniper bullets fly faster
                   pierce: !!PLAYER_CLASS.pierce, hits: [],          // sniper: goes through enemies
                   life: PLAYER_CLASS.range || 0 });                 // shotgun: short range
  }
  addStat('shotsFired', pellets);
  player.gunFlash = 5;

  // Gunshot sound
  playGunshot();

  // Mag just emptied — reload automatically
  if (player.bullets <= 0) startReload();
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.life && --b.life <= 0) { bullets.splice(i, 1); continue; } // shotgun range

    const prevX = b.x;
    const prevY = b.y;
    const stepX = b.dx * (b.speed || BULLET_SPEED);
    const stepY = b.dy * (b.speed || BULLET_SPEED);
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
// Enemies are slightly slower than the player so you can always outrun them
// (the Speed upgrade widens the gap further).
const NPC_SPEED   = MOVE_SPEED * 0.9;  // 10% slower than the player
const BOSS_SPEED  = MOVE_SPEED * 0.95; // bosses 5% slower than the player
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

  // Spread NPCs evenly — roughly 1 tank per 4 normal NPCs.
  // Once runners unlock at level 11, guarantee one in every regular (non-boss) level.
  // Other unlocked special types continue to be selected randomly for the remaining slots.
  // The HORDE event can multiply the spawn count (capped at 30 to keep it playable).
  const spawnCount = Math.min(Math.round(NPC_COUNT * (levelEvent.extraEnemyMult || 1)), 30);
  const zone = (LEVEL_WIDTH - 400) / spawnCount;
  for (let i = 0; i < spawnCount; i++) {
    const wx = 500 + i * zone + Math.random() * (zone * 0.6);
    const isTank = (i % 4 === 3); // every 4th NPC is a tank
    const kind = isTank ? 'normal'
      : (i === 0 && campaign.level >= 11 ? 'runner' : pickEnemyKind(campaign.level));
    npcs.push(makeNPC(wx, false, null, null, isTank, kind));
  }

  // First time a special type shows up in this campaign: say what it does.
  campaign.seenKinds = campaign.seenKinds || [];
  const fresh = npcs.map(n => n.kind).find(k => ENEMY_KINDS[k] && !campaign.seenKinds.includes(k));
  if (fresh) {
    campaign.seenKinds.push(fresh);
    showToast('NEW ENEMY: ' + ENEMY_KINDS[fresh].name + ' - ' + ENEMY_KINDS[fresh].tip, 300);
  }
}

// Special enemy types that join in later stages (abilities: see ENEMY TYPES section).
// hp/speed are multipliers on a regular enemy; speed stays below the player's.
const ENEMY_KINDS = {
  runner:   { unlock: 11, hp: 0.6, speed: 0.97 / 0.9, reward: 3, name: 'RUNNER',   tip: 'FAST - LUNGES AT YOU WHEN IT FLASHES' },
  spitter:  { unlock: 21, hp: 0.8, speed: 0.85,       reward: 4, name: 'SPITTER',  tip: 'SHOOTS FROM RANGE - JUMP THE BLOBS' },
  bomber:   { unlock: 31, hp: 0.7, speed: 1.0,        reward: 3, name: 'BOMBER',   tip: 'EXPLODES UP CLOSE - SHOOT IT FIRST' },
  shielder: { unlock: 41, hp: 2.0, speed: 0.6,        reward: 6, name: 'SHIELDER', tip: 'BLOCKS SHOTS FROM THE FRONT - GET BEHIND IT' },
  medic:    { unlock: 51, hp: 1.2, speed: 0.9,        reward: 5, name: 'MEDIC',    tip: 'HEALS NEARBY ENEMIES - TAKE IT OUT FIRST' },
};

// Pick a type for a regular enemy slot: specials get more common deeper into the campaign.
function pickEnemyKind(level) {
  if (MODE.allEnemies) level = Math.max(level, 95); // Nightmare: every type, at the late-game mix
  const unlocked = Object.keys(ENEMY_KINDS).filter(k => level >= ENEMY_KINDS[k].unlock);
  if (!unlocked.length) return 'normal';
  const chance = Math.min(0.6, 0.15 + (level - 11) * 0.006);
  return Math.random() < chance ? unlocked[Math.floor(Math.random() * unlocked.length)] : 'normal';
}

function makeNPC(wx, isBoss = false, customHp = null, customDmg = null, isTank = false, kind = 'normal') {
  const lvlNow = campaign.level || 1;
  const k = (!isBoss && !isTank && ENEMY_KINDS[kind]) || null;
  const dynamicNpcHp = 10 + Math.max(0, lvlNow - 1) * 1;
  const tankHp       = dynamicNpcHp * 3;  // 3x normal HP
  const hpBase = isBoss
    ? (customHp || (BOSS_BASE_HP + (Math.floor(lvlNow / 10) - 1) * BOSS_HP_PER))
    : isTank ? Math.round(tankHp * (levelEvent.enemyHpMult || 1)) : Math.round(dynamicNpcHp * (k ? k.hp : 1) * (levelEvent.enemyHpMult || 1));
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
    hp: Math.round(hpBase * MODE.enemyMult),    // Nightmare: 1.5x tougher
    maxHp: Math.round(hpBase * MODE.enemyMult),
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
    contactDamage: dmgBase * MODE.enemyMult,
    rielReward: isBoss && MODE.bossRiels ? MODE.bossRiels * Math.max(1, Math.floor(lvlNow / 10)) // Boss Rush: big payouts
              : isTank ? 5 : k ? k.reward : 2,  // tanks worth 5 Riels, specials 3-6
    w: w,
    h: h,
    // Enemy type + ability state (see ENEMY TYPES section)
    kind: isBoss ? 'boss' : isTank ? 'tank' : (k ? kind : 'normal'),
    speedMult: isTank ? 0.45 : k ? k.speed : 1,
    facing: -1,
    abilityTimer: 60 + Math.floor(Math.random() * 60),
    lungeTimer: 0, lungeDir: 0, fuse: 0, turnTimer: 0, healPulse: 0, shieldFlash: 0,
    // AI (see ENEMY AI section)
    vx: 0,
    aware: false,        // has noticed the player
    alertDelay: 0,       // frames until reacting to an ally's call for help
    calledForHelp: false,
    state: 'idle',       // idle | attack | regroup | flank | retreat | desperate
    role: null,          // 'flank' when sent around the player
    thinkTimer: 0,
    waited: 0,
    phase: 1,            // boss phase
    windup: 0, chargeTimer: 0, attackTimer: 0
  };
}

// Pick a random level event first: Horde and Paper Enemies change the spawns.
pickLevelEvent();
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
  updateAIDirector();
  for (const n of npcs) {
    if (n.dead) {
      n.deadTimer++;
      continue;
    }

    // Decrement attack cooldown
    if (n.attackCooldown > 0) n.attackCooldown--;

    // Frozen (Freeze ability) or stunned (awakened Shockwave): no thinking, moving or attacking
    const frozen = n.frozen > 0 || n.stun > 0;
    if (n.frozen > 0) n.frozen--;
    if (n.stun > 0) n.stun--;

    // ── Awareness: notice the player when on screen, or when called by an ally ──
    const screenX = wp(n.x);
    if (!n.aware) {
      if (screenX < BASE_W + 40 && screenX > -80) alertNPC(n, true);
      else if (n.alertDelay > 0 && --n.alertDelay === 0) alertNPC(n, false);
    }

    // ── Decide (every few frames, like a reaction time) and move ──
    if (n.aware && !player.dead && !frozen) {
      if (n.isBoss) {
        bossAI(n);
      } else {
        if (--n.thinkTimer <= 0) { n.thinkTimer = AI_THINK_FRAMES + Math.floor(Math.random() * 6); aiThink(n); }
        if (!enemyAbility(n)) aiMove(n); // abilities can take over movement (runner lunge, bomber fuse)
        if (n.kind !== 'bomber' || !n.fuse) aiDodge(n);
      }
    }

    // Vertical physics (plus horizontal momentum for committed jumps: vaults, leaps)
    if (!n.onGround) {
      n.vy += GRAVITY * 0.9 * (levelEvent.gravityMult || 1); // slightly lighter gravity for NPCs
      n.y += n.vy;
      n.x += n.vx || 0;
    }
    n.x = Math.max(0, Math.min(LEVEL_WIDTH - n.w, n.x));

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
    if (n.onGround) n.vx = 0; // landed: committed jump is over

    // Timers
    if (n.jumpCooldown > 0) n.jumpCooldown--;

    // Animate
    n.animTick++;
    if (n.animTick >= 12) { n.animTick = 0; n.animFrame = (n.animFrame + 1) % 2; }

    // ── Collision with player — contact damage (with per-NPC cooldown) ──
    n.touching = false;
    if (!player.dead && !frozen) {
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
        if (b.pierce && b.hits.includes(n)) continue;              // already went through this one
        const shielded = n.kind === 'shielder' && Math.sign(b.dx) === -n.facing;
        if (b.pierce && !shielded) b.hits.push(n); else bullets.splice(bi, 1);
        if (shielded) { // flew into the shield's face
          n.shieldFlash = 6;
          rielParticles.push({ x: b.x, y: b.y, vx: -Math.sign(b.dx) * 1.2, vy: -1, life: 14 });
          alertNPC(n, true);
          break;
        }
        addStat('shotsHit');
        hitNPC(n, classDamage() * (levelEvent.playerDmgMult || 1)); // class weapon x level event
        break;
      }
    }
  }

  separateNPCs();
  // Boss minions are added after the loop so the array isn't changed mid-iteration.
  while (pendingSpawns.length) npcs.push(pendingSpawns.shift());
}

// ═══════════════════════════════════════════════════════════════
//  ENEMY AI
// ═══════════════════════════════════════════════════════════════
// Enemies notice the player, call for help, wait for backup, flank, hide behind
// tanks, retreat to heal when hurt (or charge recklessly when alone), dodge bullets,
// and won't sit on a platform above a camping player. Their "IQ" rises with the
// level: faster reactions, more dodging, wider calls for help, flanking from level ~15.
const AI_IQ            = Math.min(1, 0.25 + (LVL - 1) / 99 * 0.75); // 0.25 at level 1 → 1.0 at level 100
const AI_THINK_FRAMES  = Math.round(28 - 16 * AI_IQ);  // frames between decisions (reaction time)
const AI_DODGE_CHANCE  = 0.08 + 0.4 * AI_IQ;           // chance to jump over an incoming bullet
const AI_ALERT_RADIUS  = 180 + 260 * AI_IQ;            // how far a call for help reaches
const AI_ALLY_RADIUS   = 260;                          // allies this close count as "with me"
const AI_LOW_HP        = 0.35;                         // below this, retreat (or go desperate)
const AI_RECOVERED_HP  = 0.7;                          // retreaters return to the fight at this HP
const AI_REGEN_PER_SEC = 0.04;                         // retreaters heal 4% max HP per second
const AI_MAX_WAIT      = 150;                          // frames a lone enemy waits for backup
const AI_CAMP_FRAMES   = 180;                          // player in one spot this long = camping
const ai = { campX: 0, campFrames: 0, camping: false };
const pendingSpawns = [];

const centerX  = o => o.x + o.w / 2;
const playerCX = () => player.x + PLAYER_W / 2;

function npcJump(n, vx = 0, force = NPC_JUMP_FORCE) {
  n.vy = force;
  n.vx = vx;
  n.onGround = false;
  n.jumpCooldown = 40;
}

// The platform this enemy is standing on (null when on the ground or in the air).
function platformUnder(n) {
  if (!n.onGround) return null;
  return platforms.find(p => Math.abs(n.y + n.h - p.y) < 2 && n.x + n.w > p.x && n.x < p.x + p.w) || null;
}

// Become aware of the player. Enemies that spot the player themselves (or get shot)
// call nearby allies, who react a moment later; called allies don't call further.
function alertNPC(n, callForHelp) {
  if (!n.aware) {
    n.aware = true;
    n.state = 'attack';
    n.thinkTimer = Math.floor(Math.random() * AI_THINK_FRAMES);
    if (settings.damageNumbers) {
      dmgNumbers.push({ x: n.x + n.w / 2 - 3, y: n.y - 12, amount: '!', color: '#f5c400', life: 40, vy: -0.6, isText: true });
    }
  }
  if (!callForHelp || n.calledForHelp) return;
  n.calledForHelp = true;
  for (const o of npcs) {
    if (o !== n && !o.dead && !o.aware && !o.alertDelay && Math.abs(centerX(o) - centerX(n)) < AI_ALERT_RADIUS) {
      o.alertDelay = 10 + Math.floor(Math.random() * 25);
    }
  }
}

// Once per frame: spot camping, and organise pincer attacks.
function updateAIDirector() {
  if (Math.abs(player.x - ai.campX) > 70) { ai.campX = player.x; ai.campFrames = 0; }
  else ai.campFrames++;
  ai.camping = ai.campFrames > AI_CAMP_FRAMES && !player.dead;

  const px = playerCX();
  const fighters = npcs.filter(n => !n.dead && n.aware && !n.isBoss && n.state !== 'retreat');
  const flankers = fighters.filter(n => n.role === 'flank').length;
  const leftCount = fighters.filter(n => centerX(n) < px).length;
  const oneSided = leftCount === 0 || leftCount === fighters.length;
  const maxFlankers = ai.camping ? 2 : 1;
  // If everyone is coming from one side, send the nearest quick enemy around the other side.
  if ((AI_IQ >= 0.35 || ai.camping) && fighters.length >= 2 && oneSided && flankers < maxFlankers) {
    const pick = fighters
      .filter(n => (n.kind === 'normal' || n.kind === 'runner') && n.role !== 'flank' && Math.abs(centerX(n) - px) < 420)
      .sort((a, b) => (Math.abs(centerX(a) - px) - (a.kind === 'runner' ? 200 : 0)) - (Math.abs(centerX(b) - px) - (b.kind === 'runner' ? 200 : 0)))[0];
    if (pick) {
      pick.role = 'flank';
      pick.flankSide = centerX(pick) < px ? 1 : -1; // the side of the player to get to
      pick.flankTimer = 0;
    }
  }
}

// Decide what to do, based on own health, nearby allies and what the player is doing.
function aiThink(n) {
  const px = playerCX(), cx = centerX(n);
  const hpFrac = n.hp / n.maxHp;
  const allies = npcs.filter(o => o !== n && !o.dead && o.aware && Math.abs(centerX(o) - cx) < AI_ALLY_RADIUS).length;

  if (n.kind === 'medic') { n.state = 'support'; return; } // medics hang back and heal
  if (n.state === 'retreat') {
    if (hpFrac >= AI_RECOVERED_HP) n.state = 'attack';   // patched up: back in
    else if (allies === 0) n.state = 'desperate';        // friends are gone: nowhere to hide
    return;
  }
  if (hpFrac < AI_LOW_HP && !n.isTank && n.kind !== 'bomber' && n.kind !== 'shielder') {
    n.state = allies > 0 ? 'retreat' : 'desperate';
    n.role = null;
    return;
  }
  if (n.role === 'flank') { n.state = 'flank'; return; }

  // Alone, but backup is on its way from behind? Hold back and attack together
  // (unless the player is reloading or camping: then press the advantage).
  const side = Math.sign(cx - px) || 1;
  const backupComing = npcs.some(o => o !== n && !o.dead && o.aware && !o.isBoss &&
    Math.sign(centerX(o) - px) === side && Math.abs(centerX(o) - px) > Math.abs(cx - px) &&
    Math.abs(centerX(o) - cx) < 520);
  if (!n.isTank && allies === 0 && backupComing && player.reloadTimer <= 0 && !ai.camping && (n.waited || 0) < AI_MAX_WAIT) {
    n.state = 'regroup';
    return;
  }
  n.state = (hpFrac < AI_LOW_HP) ? 'desperate' : 'attack';
}

// Move according to the current state (runs every frame).
function aiMove(n) {
  const px = playerCX(), cx = centerX(n);
  const side = cx < px ? -1 : 1; // which side of the player this enemy is on
  let targetX = px;
  let speed = NPC_SPEED * (n.speedMult || (n.isTank ? 0.45 : 1)) * (levelEvent.enemySpeedMult || 1); // per enemy type
  let stopDist = n.w * 0.6;      // close enough to touch the player
  let chasing = true;            // false while keeping away (no jumping at the player)

  switch (n.state) {
    case 'regroup':              // keep a safe distance until backup arrives
      targetX = px + side * 170; speed *= 0.7; stopDist = 6; chasing = false;
      n.waited = (n.waited || 0) + 1;
      break;

    case 'retreat': {            // fall back behind the nearest ally (preferably a tank) and heal
      let cover = null, best = Infinity;
      for (const o of npcs) {
        if (o === n || o.dead || !o.aware) continue;
        const score = Math.abs(centerX(o) - cx) - (o.isTank ? 150 : 0);
        if (score < best) { best = score; cover = o; }
      }
      targetX = cover ? centerX(cover) + side * 60 : px + side * 320;
      // Never step toward the player while retreating: if the ally has already pushed
      // past, just hold back (at least 150px away).
      if ((targetX - cx) * side < 0) targetX = Math.abs(cx - px) < 150 ? px + side * 150 : cx;
      stopDist = 6; chasing = false;
      const before = Math.ceil(n.hp);
      n.hp = Math.min(n.maxHp, n.hp + n.maxHp * AI_REGEN_PER_SEC / 60);
      if (settings.damageNumbers && frameCount % 60 === 0 && Math.ceil(n.hp) > before - 1) {
        dmgNumbers.push({ x: n.x, y: n.y - 10, amount: '+' + Math.round(n.maxHp * AI_REGEN_PER_SEC), color: '#2ecc71', life: 35, vy: -0.8, isText: true });
      }
      break;
    }

    case 'flank':                // get to the other side of the player, vaulting over them
      targetX = px + n.flankSide * 50; stopDist = 4;
      n.flankTimer++;
      if ((cx - px) * n.flankSide > 20 || n.flankTimer > 300) {
        n.role = null; n.state = 'attack';
      } else if (n.onGround && n.jumpCooldown <= 0 && Math.abs(cx - px) < 90 && (cx - px) * n.flankSide < 0) {
        npcJump(n, n.flankSide * NPC_SPEED * 1.5);
      }
      break;

    case 'desperate':            // hurt and alone: reckless, unpredictable charge
      if (n.onGround && n.jumpCooldown <= 0 && Math.abs(cx - px) < 170 && Math.random() < 0.04) {
        npcJump(n, -side * NPC_SPEED);
      }
      break;

    case 'support': {            // medic: stay behind the nearest ally, run if the player gets close
      let ally = null, best = Infinity;
      for (const o of npcs) {
        if (o === n || o.dead || !o.aware || o.kind === 'medic') continue;
        const d = Math.abs(centerX(o) - cx);
        if (d < best) { best = d; ally = o; }
      }
      if (Math.abs(cx - px) < 130) targetX = cx + side * 200;          // too close: flee
      else targetX = ally ? centerX(ally) + side * 110 : px + side * 260;
      stopDist = 6; chasing = false;
      break;
    }

    default: {                   // 'attack': if a tank ally is leading the push, stay behind it
      if (!n.isTank) {
        const tank = npcs.find(o => o.isTank && !o.dead && o.aware &&
          Math.sign(centerX(o) - px) === side &&
          Math.abs(centerX(o) - px) < Math.abs(cx - px) &&   // tank is in front of me
          Math.abs(centerX(o) - px) > 90 &&                  // and hasn't reached the player yet
          Math.abs(centerX(o) - cx) < 240);
        if (tank) { targetX = centerX(tank) + side * 34; stopDist = 4; }
      }
    }
  }

  // Spitters keep shooting range (~170-260px) instead of closing to contact range.
  if (n.kind === 'spitter' && n.state !== 'retreat') {
    const d = Math.abs(cx - px);
    targetX = d > 260 ? px + side * 230 : d < 170 ? cx + side * 60 : cx;
    stopDist = 4; chasing = false;
  }

  // Never perch on a platform right above the player: walk off the nearest edge and drop on them.
  // The drop is committed for a few frames so it doesn't step back onto the edge.
  const plat = platformUnder(n);
  if (plat && n.state !== 'retreat' && player.y > n.y + n.h - 4 && Math.abs(cx - px) < 170) {
    n.dropTarget = (cx - plat.x < plat.x + plat.w - cx) ? plat.x - n.w : plat.x + plat.w + n.w;
    n.dropTimer = 14;
  }
  if (n.dropTimer > 0) {
    n.dropTimer--;
    targetX = n.dropTarget;
    stopDist = 0;
    chasing = false;
  }

  // Walk toward the target (a committed jump carries its own momentum instead).
  if (!n.vx) {
    const dx = targetX - centerX(n);
    if (Math.abs(dx) > stopDist) n.x += Math.sign(dx) * Math.min(speed, Math.abs(dx));
  }

  // Jumping: up to a player who is above, or onto a platform ahead only if the player is up there.
  if (chasing && n.onGround && n.jumpCooldown <= 0) {
    const gap = px - centerX(n);
    if (player.y + 2 < n.y - 12 && Math.abs(gap) < 220) {
      npcJump(n);
    } else {
      const dir = Math.sign(targetX - centerX(n)) || 1;
      const aheadX = n.x + dir * 48;
      const jumpApex = (NPC_JUMP_FORCE * NPC_JUMP_FORCE) / (2 * GRAVITY * 0.9);
      for (const p of platforms) {
        const playerUpThere = player.y + PLAYER_H <= p.y + 12;
        if (playerUpThere && aheadX + n.w > p.x && aheadX < p.x + p.w && p.y < n.y && n.y - p.y <= jumpApex + 8) {
          npcJump(n);
          break;
        }
      }
    }
  }
}

// Sometimes jump over a bullet that is about to hit (tanks are too heavy to bother).
function aiDodge(n) {
  if (n.isTank || !n.onGround || n.jumpCooldown > 0 || frameCount < (n.nextDodgeRoll || 0)) return;
  const cx = centerX(n), cy = n.y + n.h / 2;
  for (const b of bullets) {
    const incoming = (cx - b.x) * b.dx > 0;   // flying toward this enemy
    if (incoming && Math.abs(cx - b.x) < 110 && Math.abs(b.y - cy) < n.h) {
      n.nextDodgeRoll = frameCount + 20;      // one roll per volley, not per frame
      const chance = AI_DODGE_CHANCE * (n.state === 'desperate' ? 1.4 : 1);
      if (Math.random() < chance) npcJump(n);
      return;
    }
  }
}

// Boss: three phases by health. Below 60% it calls 2 minions and starts telegraphed
// charges; below 30% it calls 3 more and adds leaps. Camping players get leapt on.
function bossAI(n) {
  const px = playerCX(), cx = centerX(n);
  const dx = px - cx;
  const hpFrac = n.hp / n.maxHp;
  const phase = hpFrac > 0.6 ? 1 : hpFrac > 0.3 ? 2 : 3;
  if (phase > (n.phase || 1)) {
    n.phase = phase;
    summonMinions(n, phase === 2 ? 2 : 3);
    showToast(phase === 2 ? 'THE BOSS CALLS FOR BACKUP!' : 'THE BOSS IS ENRAGED!');
    n.attackTimer = 60;
  }

  // Charge attack: flash as a warning, then rush.
  if (n.windup > 0) {
    if (--n.windup === 0) { n.chargeTimer = 28; n.chargeDir = Math.sign(dx) || 1; }
    return;
  }
  if (n.chargeTimer > 0) {
    n.chargeTimer--;
    n.x += n.chargeDir * MOVE_SPEED * 2.2;
    return;
  }

  n.attackTimer = (n.attackTimer || 0) - 1;
  const canAct = n.onGround && Math.abs(dx) < 380 && n.attackTimer <= 0;
  if (canAct && (phase >= 2 || ai.camping)) {
    if (phase === 3 || ai.camping) {
      if (Math.random() < 0.5 || ai.camping) npcJump(n, Math.max(-7, Math.min(7, dx / 40)), NPC_JUMP_FORCE * 1.15); // leap at the player
      else n.windup = 36;
    } else {
      n.windup = 36;
    }
    n.attackTimer = phase === 3 ? 140 : 210;
    return;
  }

  // Otherwise chase (slightly slower than the player), jumping up to them if needed.
  if (!n.vx && Math.abs(dx) > n.w * 0.6) n.x += Math.sign(dx) * BOSS_SPEED;
  if (n.onGround && n.jumpCooldown <= 0 && player.y + 2 < n.y - 12 && Math.abs(dx) < 220) npcJump(n);
}

function summonMinions(boss, count) {
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const wx = Math.max(0, Math.min(LEVEL_WIDTH - NPC_W, centerX(boss) + side * (70 + 30 * i)));
    const m = makeNPC(wx);
    m.aware = true; m.state = 'attack'; m.calledForHelp = true; m.thinkTimer = 20 + i * 5;
    pendingSpawns.push(m);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENEMY TYPES (special abilities; types are defined in ENEMY_KINDS)
// ═══════════════════════════════════════════════════════════════
const enemyShots = [];   // spitter blobs
const blasts     = [];   // bomber explosion effects (visual)
const SPIT_SPEED      = 3.2;   // slower than the player: outrun it or jump it
const BOMB_RADIUS     = 60;
const BOMB_PLAYER_DMG = 0.30;  // of the player's max HP (before armor)
const BOMB_ALLY_DMG   = 0.40;  // of each caught enemy's max HP
const HEAL_RADIUS     = 130;
const HEAL_AMOUNT     = 0.20;  // of each ally's max HP

// Runs every frame for special enemies. Returns true when the ability is
// controlling movement this frame (so the normal AI doesn't walk).
function enemyAbility(n) {
  const px = playerCX(), cx = centerX(n);
  const dist = Math.abs(px - cx);
  const vert = Math.abs((player.y + PLAYER_H / 2) - (n.y + n.h / 2));
  if (n.shieldFlash > 0) n.shieldFlash--;
  if (n.healPulse > 0) n.healPulse--;

  switch (n.kind) {
    case 'runner':     // flash, then a short fast lunge
      if (n.lungeTimer > 0) { n.lungeTimer--; n.x += n.lungeDir * 7; return true; }
      if (n.windup > 0) {
        if (--n.windup === 0) { n.lungeTimer = 12; n.lungeDir = Math.sign(px - cx) || 1; }
        return true;
      }
      if (n.abilityTimer > 0) n.abilityTimer--;
      if (n.abilityTimer <= 0 && n.onGround && dist > 30 && dist < 120 && vert < 40 && n.state !== 'retreat') {
        n.windup = 18; n.abilityTimer = 150;
        return true;
      }
      return false;

    case 'spitter':    // glow, then spit a slow blob at the player
      if (n.windup > 0) { if (--n.windup === 0) fireEnemyShot(n); return false; }
      if (n.abilityTimer > 0) n.abilityTimer--;
      if (n.abilityTimer <= 0 && dist < 430 && n.state !== 'retreat') {
        n.windup = 24; n.abilityTimer = 120 + Math.floor(Math.random() * 30);
      }
      return false;

    case 'bomber':     // reach the player, stop and flash, then explode
      if (n.fuse > 0) { if (--n.fuse === 0) explodeBomber(n); return true; }
      if (dist < 34 && vert < 30) { n.fuse = 36; return true; }
      return false;

    case 'medic':      // heal everyone nearby every 3 seconds
      if (n.abilityTimer > 0) n.abilityTimer--;
      if (n.abilityTimer <= 0) { n.abilityTimer = 180; healAllies(n); }
      return false;

    case 'shielder': { // turns slowly to keep the shield toward the player
      const want = Math.sign(px - cx) || 1;
      if (want !== n.facing) { if (++n.turnTimer > 40) { n.facing = want; n.turnTimer = 0; } }
      else n.turnTimer = 0;
      return false;
    }
  }
  return false;
}

function fireEnemyShot(n) {
  const sx = centerX(n) + (player.x > n.x ? 6 : -6), sy = n.y + 8;
  const tx = playerCX() - sx, ty = (player.y + PLAYER_H / 2) - sy;
  const len = Math.hypot(tx, ty) || 1;
  enemyShots.push({ x: sx, y: sy, vx: tx / len * SPIT_SPEED, vy: ty / len * SPIT_SPEED, life: 200,
                    dmg: Math.max(3, player.maxHp * 0.07) });
}

function updateEnemyShots() {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.x += s.vx; s.y += s.vy; s.life--;
    const hitPlayer = !player.dead && s.x > player.x && s.x < player.x + PLAYER_W && s.y > player.y && s.y < player.y + PLAYER_H;
    if (hitPlayer) {
      const dmg = damagePlayer(s.dmg);
      if (settings.damageNumbers) spawnDmgNumber(player.x, player.y - 12, dmg, '#2ecc71');
      enemyShots.splice(i, 1);
      continue;
    }
    const hitWall = s.y > GROUND_Y || platforms.some(p => s.x > p.x && s.x < p.x + p.w && s.y > p.y && s.y < p.y + p.h);
    if (hitWall || s.life <= 0 || s.x < 0 || s.x > LEVEL_WIDTH) enemyShots.splice(i, 1);
  }
}

function drawEnemyShots() {
  for (const s of enemyShots) {
    const sx = wp(s.x);
    if (sx < -10 || sx > BASE_W + 10) continue;
    ctx.fillStyle = 'rgba(46,204,113,0.35)';
    ctx.fillRect(sx - 5, s.y - 5, 10, 10);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(sx - 3, s.y - 3, 6, 6);
    ctx.fillStyle = '#c8ffd8';
    ctx.fillRect(sx - 1, s.y - 2, 2, 2);
  }
}

function explodeBomber(n) {
  const cx = centerX(n), cy = n.y + n.h / 2;
  blasts.push({ x: cx, y: cy, t: 0 });
  playDeathSound();
  if (!player.dead && Math.hypot(playerCX() - cx, (player.y + PLAYER_H / 2) - cy) < BOMB_RADIUS) {
    const dmg = damagePlayer(player.maxHp * BOMB_PLAYER_DMG);
    spawnDmgNumber(player.x, player.y - 12, dmg, '#e67e22');
  }
  n.dead = true; n.deadTimer = 120; n.hp = 0; // blown up: no skull, no reward
  // The blast hurts other enemies too: lure bombers into a crowd.
  for (const o of npcs) {
    if (o === n || o.dead || o.isBoss) continue;
    if (Math.hypot(centerX(o) - cx, (o.y + o.h / 2) - cy) < BOMB_RADIUS) {
      o.hp -= o.maxHp * BOMB_ALLY_DMG;
      spawnDmgNumber(o.x, o.y - 4, o.maxHp * BOMB_ALLY_DMG, '#e67e22');
      if (o.hp <= 0) killNPC(o);
    }
  }
  checkLevelClear();
}

function healAllies(m) {
  m.healPulse = 24;
  for (const o of npcs) {
    if (o.dead || o.isBoss || Math.abs(centerX(o) - centerX(m)) > HEAL_RADIUS || Math.abs(o.y - m.y) > 80) continue;
    if (o.hp >= o.maxHp) continue;
    const amount = o.maxHp * (o === m ? HEAL_AMOUNT / 2 : HEAL_AMOUNT);
    o.hp = Math.min(o.maxHp, o.hp + amount);
    if (settings.damageNumbers) dmgNumbers.push({ x: o.x, y: o.y - 10, amount: '+' + Math.round(amount), color: '#2ecc71', life: 40, vy: -0.8, isText: true });
  }
}

function drawBlasts() {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t++;
    const r = BOMB_RADIUS * Math.min(1, b.t / 8), a = Math.max(0, 1 - b.t / 22);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(wp(b.x), b.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c400';
    ctx.beginPath(); ctx.arc(wp(b.x), b.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (b.t > 22) blasts.splice(i, 1);
  }
}

// Keep enemies from stacking into one blob, so a group spreads out and surrounds.
function separateNPCs() {
  for (let i = 0; i < npcs.length; i++) {
    const a = npcs[i];
    if (a.dead || a.isBoss || !a.onGround) continue;
    for (let j = i + 1; j < npcs.length; j++) {
      const b = npcs[j];
      if (b.dead || b.isBoss || !b.onGround || Math.abs(a.y - b.y) > 6) continue;
      const d = centerX(b) - centerX(a);
      if (Math.abs(d) < 10) {
        const push = d >= 0 ? 0.4 : -0.4;
        a.x -= push; b.x += push;
      }
    }
  }
}

function killNPC(n) {
  n.dead      = true;
  n.deadTimer = 0;
  const reward = Math.round((n.rielReward || 2) * (levelEvent.rielMult || 1));
  campaign.riels += reward;
  addStat('enemiesKilled');
  addStat('rielsEarned', reward);
  announceAchievements(ACH.add('kills'));
  if (n.isBoss) announceAchievements(ACH.add('bossesBeaten'));
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
  reportLevelClear();

  if (window.RielModes.isFinal(campaign)) {
    completeCampaign();          // last level of this campaign type: it's finished
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
        dmgNumbers.push({ x: p.x, y: p.y - 8, amount: 'JUMP x' + JUMP_POWER_MULT, color: '#8e44ad', life: 60, vy: -1.2, isText: true });
      } else {
        player.speedMult = SPEED_POWER_MULT;
        player.speedPowerTimer = SPEED_POWER_DURATION_FRAMES;
        dmgNumbers.push({ x: p.x, y: p.y - 8, amount: 'SPD x' + SPEED_POWER_MULT, color: '#27ae60', life: 60, vy: -1.2, isText: true });
      }
      playPickupSound && playPickupSound();
    }
  }
}

// After clearing a level: HP is fully healed, and beating a boss level
// (every 10th) also restores lives to the max of 3. Otherwise lost lives stay lost.
const MAX_LIVES = MODE.lives; // 3 (Nightmare: 1)
function isBossLevel() { return campaign.level % 10 === 0; }
// Gems for clearing this level, added to the profile shared by every campaign.
// Recorded on the campaign so a level can never pay out twice (e.g. after a resume).
function gemsForThisLevel() { return window.RielCosmetics.levelReward(campaign.level) * MODE.gemMult; } // Nightmare: x2

function awardLevelGems() {
  if (campaign.gemsForLevel === campaign.level) return 0;
  campaign.gemsForLevel = campaign.level;
  const n = gemsForThisLevel();
  window.RielCosmetics.addGems(n);
  return n;
}

function applyLevelClearRewards() {
  awardLevelGems();
  if (MODE.id === 'endless') window.RielModes.saveRecord('endless', campaign.level, false); // best wave
  campaign.levelState = null; // level finished: nothing to resume (null, not delete, so saves overwrite it)
  campaign.maxHp = player.maxHp;
  campaign.hp    = player.maxHp;
  campaign.overHp = Math.round(player.overHp || 0); // overcharge stays until damage uses it up
  campaign.lives = isBossLevel() ? Math.max(MAX_LIVES, player.lives) : player.lives; // keep bought extra lives
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
//  ABILITIES (won on the gem shop wheel, js/abilities.js)
// ═══════════════════════════════════════════════════════════════
// One equipped ability, used with E. Numbers per level come from ABILITY.s; the
// awakened trait (level 3) adds an extra effect. Cooldowns reset each level.
const ADRENALINE_SPEED = 1.4;  // move speed while Adrenaline is active
const QUICKDRAW_FIRE   = 1.5;  // fire rate while Quick Draw is active
const AWAKEN_DMG_MULT  = 1.5;  // Shield (Power Surge) and Freeze (Shatter) traits
const OVERCHARGE_MAX   = 0.5;  // Life Leech (Overcharge): extra HP up to 50% of max HP
const abilityFx = [];          // visuals: { type: 'ring' | 'bolt', ... , life, max }
let noAbilityToastAt = -999;

const abilityOn = id => !!ABILITY && ABILITY.def.id === id && player.abilityTime > 0;
const onScreen = n => wp(n.x) > -n.w && wp(n.x) < BASE_W;
const aliveNPCs = () => npcs.filter(n => !n.dead);

function useAbility() {
  if (gameState !== 'playing' || player.dead) return false;
  if (!ABILITY) {
    if (frameCount - noAbilityToastAt > 180) { noAbilityToastAt = frameCount; showToast('NO ABILITY: SPIN THE WHEEL IN THE SHOP'); }
    return false;
  }
  if (player.abilityCd > 0) return false;
  const { def, s, awakened } = ABILITY;
  const cx = playerCX(), cy = player.y + PLAYER_H / 2;
  player.abilityCd = def.cd * 60;
  switch (def.id) {
    case 'shield':
    case 'adrenaline':
    case 'leech':
      player.abilityTime = Math.round(s.dur * 60);
      break;
    case 'quickdraw':
      player.reloadTimer = 0;
      player.bullets = MAG_SIZE;
      player.abilityTime = Math.round(s.dur * 60);
      break;
    case 'medkit': {
      const heal = player.maxHp * s.heal / 100;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      if (awakened) player.regenTime = 5 * 60;           // Recovery trait
      dmgNumbers.push({ x: player.x, y: player.y - 10, amount: '+' + Math.round(heal) + ' HP', color: '#2ecc71', life: 60, vy: -1.2, isText: true });
      abilityFx.push({ type: 'ring', x: cx, y: cy, r: 40, color: def.color, life: 20, max: 20 });
      break;
    }
    case 'shockwave':
      for (const n of aliveNPCs()) {
        const dx = centerX(n) - cx, dy = (n.y + n.h / 2) - cy;
        if (Math.hypot(dx, dy) > s.radius) continue;
        hitNPC(n, classDamage() * s.dmg, def.color);
        if (n.dead) continue;
        n.vx = (Math.sign(dx) || 1) * (n.isBoss ? 2 : 5);   // knocked back
        n.vy = n.isBoss ? -2 : -4;
        n.onGround = false;
        if (awakened) n.stun = 90;                        // Concussion trait
      }
      abilityFx.push({ type: 'ring', x: cx, y: cy, r: s.radius, color: def.color, life: 24, max: 24 });
      break;
    case 'freeze':
      for (const n of aliveNPCs()) {
        if (onScreen(n)) n.frozen = Math.round(s.dur * 60 * (n.isBoss ? 0.5 : 1));
      }
      abilityFx.push({ type: 'ring', x: cx, y: cy, r: BASE_W, color: def.color, life: 30, max: 30 });
      break;
    case 'lightning': {
      const targets = aliveNPCs().filter(onScreen)
        .sort((a, b) => Math.abs(centerX(a) - cx) - Math.abs(centerX(b) - cx)).slice(0, s.targets);
      let from = { x: cx, y: cy };
      for (const n of targets) {
        const to = { x: centerX(n), y: n.y + n.h / 2 };
        abilityFx.push({ type: 'bolt', x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: def.color, life: 16, max: 16 });
        hitNPC(n, classDamage() * s.dmg, def.color);
        if (n.dead && awakened) player.abilityCd = Math.max(0, player.abilityCd - 4 * 60); // Overload trait
        from = to;
      }
      break;
    }
  }
  if (typeof playPickupSound === 'function') playPickupSound();
  return true;
}

function updateAbilityTimers() {
  if (player.abilityCd > 0) player.abilityCd--;
  if (player.abilityTime > 0) player.abilityTime--;
  if (player.shieldHit > 0) player.shieldHit--;
  if (player.regenTime > 0) {
    player.regenTime--;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.02 / 60);  // 2% max HP per second
  }
}

// Every hit the player lands goes through here (bullets and abilities), so damage
// traits and Life Leech apply to all of it.
function hitNPC(n, dmg, color = '#f5c400') {
  if (n.dead) return;
  if (ABILITY && ABILITY.awakened) {
    if (abilityOn('shield')) dmg *= AWAKEN_DMG_MULT;                              // Power Surge
    if (ABILITY.def.id === 'freeze' && n.frozen > 0) dmg *= AWAKEN_DMG_MULT;       // Shatter
  }
  n.hp -= dmg;
  spawnDmgNumber(n.x, n.y - 4, dmg, color);
  if (abilityOn('leech')) leechHeal(dmg * ABILITY.s.pct / 100);
  alertNPC(n, true); // getting hit always gets their attention (and their friends')
  if (n.hp <= 0) killNPC(n);
}

// Life Leech healing. Awakened (Overcharge): what goes past max HP becomes overcharge.
function leechHeal(amount) {
  const room = player.maxHp - player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  if (ABILITY.awakened && amount > room) {
    player.overHp = Math.min(player.maxHp * OVERCHARGE_MAX, (player.overHp || 0) + amount - Math.max(0, room));
  }
}

// Frozen / stunned enemies, the active ability around the player, rings and bolts.
function drawAbilityFx() {
  for (const n of npcs) {
    if (n.dead) continue;
    if (n.frozen > 0) {
      ctx.fillStyle = 'rgba(155,231,255,0.45)';
      ctx.fillRect(wp(n.x) - 2, n.y - 2, n.w + 4, n.h + 4);
      ctx.fillStyle = '#e8fbff';
      ctx.fillRect(wp(n.x) - 2, n.y - 2, n.w + 4, 2);
    } else if (n.stun > 0) {
      ctx.fillStyle = '#f5c400';
      const t = frameCount / 6;
      for (let i = 0; i < 3; i++) {
        const a = t + i * 2.1;
        ctx.fillRect(Math.round(wp(n.x) + n.w / 2 + Math.cos(a) * 9) - 1, n.y - 8 + Math.round(Math.sin(a) * 3), 3, 3);
      }
    }
  }
  if (ABILITY && player.abilityTime > 0 && !player.dead) {
    const x = wp(playerCX()), y = player.y + PLAYER_H / 2;
    const pulse = 0.35 + 0.2 * Math.sin(frameCount / 5);
    ctx.globalAlpha = player.shieldHit > 0 ? 0.9 : pulse;
    ctx.strokeStyle = ABILITY.def.color;
    ctx.lineWidth = ABILITY.def.id === 'shield' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, ABILITY.def.id === 'shield' ? 22 : 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (let i = abilityFx.length - 1; i >= 0; i--) {
    const f = abilityFx[i];
    const k = f.life / f.max;
    ctx.globalAlpha = k;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (f.type === 'ring') {
      ctx.arc(wp(f.x), f.y, Math.max(1, f.r * (1 - k * 0.7)), 0, Math.PI * 2);
    } else {                                  // zig-zag lightning bolt
      const steps = 6;
      ctx.moveTo(wp(f.x1), f.y1);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        ctx.lineTo(wp(f.x1 + (f.x2 - f.x1) * t) + (Math.random() - 0.5) * 10, f.y1 + (f.y2 - f.y1) * t + (Math.random() - 0.5) * 10);
      }
      ctx.lineTo(wp(f.x2), f.y2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (gameState === 'playing' && --f.life <= 0) abilityFx.splice(i, 1);
  }
}

// HUD slot under the dash bar: icon, name, cooldown / time left, [E].
function drawAbilityHUD(barX, y) {
  if (!ABILITY) return;
  const { def } = ABILITY;
  ctx.fillStyle = 'rgba(15,21,38,0.75)';
  ctx.fillRect(barX, y, 20, 20);
  window.RielAbilities.drawIcon(ctx, def, barX + 2, y + 2, 2, player.abilityCd > 0 && player.abilityTime <= 0);
  const ready = player.abilityCd <= 0;
  const barW = 58, bx = barX + 24;
  ctx.fillStyle = '#1a1e30';
  ctx.fillRect(bx, y + 12, barW, 6);
  if (player.abilityTime > 0) {               // active: time left
    ctx.fillStyle = def.color;
    ctx.fillRect(bx, y + 12, barW * player.abilityTime / Math.round(ABILITY.s.dur * 60), 6);
  } else {
    ctx.fillStyle = ready ? '#2ecc71' : '#555577';
    ctx.fillRect(bx, y + 12, barW * (ready ? 1 : 1 - player.abilityCd / (def.cd * 60)), 6);
  }
  ctx.font = '5px "Public Pixel", monospace';
  ctx.fillStyle = ready ? def.color : '#888870';
  ctx.fillText(def.name + (ABILITY.awakened ? ' *' : ''), bx, y + 7);
  ctx.fillStyle = ready ? '#2ecc71' : '#888870';
  ctx.fillText(ready ? '[E] READY' : Math.ceil(player.abilityCd / 60) + 'S', bx + barW + 4, y + 18);
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER DAMAGE
// ═══════════════════════════════════════════════════════════════
// Returns the damage actually taken (after the Armor upgrade).
function damagePlayer(amount, isTick) {
  if (player.dead) return 0;
  if (player.invuln > 0) return 0;  // just revived: a moment of safety
  if (abilityOn('shield')) { player.shieldHit = 8; return 0; } // Shield ability blocks everything
  amount *= (1 - ARMOR_BLOCK) * (levelEvent.playerDamageTakenMult || 1);
  // Overcharge soaks damage before HP does
  const soaked = Math.min(player.overHp || 0, amount);
  player.overHp = (player.overHp || 0) - soaked;
  player.hp -= amount - soaked;
  levelStats.damage += amount;
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
// Body/eye colours for each enemy type (regular enemies stay red).
const ENEMY_STYLE = {
  normal:   { body: '#c0392b', eye: '#f5c400' },
  runner:   { body: '#e67e22', eye: '#ffffff' },
  spitter:  { body: '#27ae60', eye: '#f5c400' },
  bomber:   { body: '#2c2c34', eye: '#e74c3c' },
  shielder: { body: '#7f8c8d', eye: '#5dade2' },
  medic:    { body: '#dfe6e9', eye: '#2e86de' },
};

// Small details that show what each special enemy does.
function drawEnemyExtras(n, sx, by, S, ep) {
  const facingRight = player.x > n.x;
  switch (n.kind) {
    case 'runner':   // speed streaks behind it while moving
      if (n.animFrame === 1 || n.lungeTimer > 0) {
        ctx.fillStyle = 'rgba(230,126,34,0.5)';
        const bx = facingRight ? sx - 8 : sx + n.w + 2;
        ctx.fillRect(bx, by + 9, 6, 2); ctx.fillRect(bx + (facingRight ? -3 : 3), by + 13, 6, 2);
      }
      break;
    case 'spitter':  // mouth that glows before it spits
      ep(facingRight ? 5 : 0, 2, n.windup > 0 && frameCount % 6 < 3 ? '#c8ffd8' : '#145a32');
      if (n.windup > 0) { ctx.fillStyle = 'rgba(46,204,113,0.35)'; ctx.fillRect(sx + (facingRight ? n.w : -6), by + 3, 6, 9); }
      break;
    case 'bomber':   // fuse with a spark (fast flashing once armed)
      ep(3, -1, '#888870');
      ctx.fillStyle = (n.fuse > 0 ? frameCount % 4 < 2 : frameCount % 20 < 10) ? '#f5c400' : '#e74c3c';
      ctx.fillRect(sx + 3 * S, by - 2 * S, S, S);
      break;
    case 'shielder': { // shield on the side it faces
      const shx = n.facing > 0 ? sx + n.w : sx - 5;
      ctx.fillStyle = n.shieldFlash > 0 ? '#ffffff' : '#bdc3c7';
      ctx.fillRect(shx, by + 1, 5, n.h - 4);
      ctx.fillStyle = '#5dade2';
      ctx.fillRect(shx + 1, by + 4, 3, n.h - 10);
      break;
    }
    case 'medic':    // red cross, and a green ring when it heals
      ep(2, 3, '#e74c3c'); ep(3, 3, '#e74c3c'); ep(2, 4, '#e74c3c'); ep(3, 4, '#e74c3c');
      if (n.healPulse > 0) {
        ctx.strokeStyle = `rgba(46,204,113,${n.healPulse / 24})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx + n.w / 2, by + n.h / 2, HEAL_RADIUS * (1 - n.healPulse / 24), 0, Math.PI * 2); ctx.stroke();
      }
      break;
  }
}

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
      // blue boss, flash red when touching, flash white while winding up a charge (warning)
      const body = (n.windup > 0 && frameCount % 6 < 3) ? '#ffffff' : n.touching ? '#e74c3c' : '#2e86de';
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

    // Colours per enemy type; flash white while winding up an attack (runner lunge, bomber fuse)
    const style = ENEMY_STYLE[n.kind] || ENEMY_STYLE.normal;
    const warning = (n.windup > 0 && n.kind === 'runner') || n.fuse > 0;
    const body = warning && frameCount % 6 < 3 ? '#ffffff' : n.touching ? '#e74c3c' : style.body;
    const eye  = style.eye;
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
    drawEnemyExtras(n, sx, by, S, ep);

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
  if (MODE.id === 'endless') {
    window.RielModes.saveRecord('endless', campaign.level, false); // best wave
    ACH.max('bestWave', campaign.level);                           // shown on the achievements page
  }
  campaign.levelState = null;
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

// The final level of this campaign type was cleared: mark it complete (it can't be
// replayed), award gems, a Riel Token (once) and records, then save everywhere.
let completionResult = null;
function completeCampaign() {
  if (completionResult) return completionResult;
  awardLevelGems();
  campaign.completed   = true;
  campaign.completedAt = Date.now();
  campaign.levelState  = null;
  campaign.hp          = Math.ceil(player.hp);
  campaign.lives       = player.lives;
  campaign.maxHp       = player.maxHp;
  campaign.gunDamage   = player.gunDamage;
  const result = { token: false, unlocked: null, newBest: false };
  if (MODE.givesToken && !campaign.tokenAwarded) {
    campaign.tokenAwarded = true;
    const total = window.RielModes.addToken();
    result.token = true;
    result.tokens = total;
    const m = window.RielModes.ORDER.map(window.RielModes.get).find(x => x.tokens === total);
    if (m) result.unlocked = m.name;
  }
  if (MODE.timed) result.newBest = window.RielModes.saveRecord('timeattack', campaign.playTimeMs || 0, true);
  result.achievements = clearAchievements.concat(ACH.campaignFinished(MODE.id, campaign.revives).map(achText));
  const best = parseInt(localStorage.getItem('bestRiels') || '0');
  if (campaign.riels > best) localStorage.setItem('bestRiels', campaign.riels);
  persistCampaign();
  return (completionResult = result);
}

// Fill in and reveal the death screen (HTML panel in game.html).
let deathScreenShown = false;
function showDeathScreen() { showEndScreen(false); }

// ── Revive: spend gems on the death screen to keep going ──
// Back in the same level where you fell, with 1 life, full HP and 2s of safety.
const REVIVE_COST = 150;
const REVIVE_INVULN_FRAMES = 120;
function setupReviveButton() {
  const btn = document.getElementById('death-revive-btn');
  const gems = window.RielCosmetics.gems();
  btn.hidden = false;
  btn.disabled = gems < REVIVE_COST;
  btn.innerHTML = '&#10084; REVIVE &middot; ' + REVIVE_COST + ' GEMS' +
    '<small>' + (gems < REVIVE_COST ? 'NOT ENOUGH GEMS (YOU HAVE ' + gems + ')' : 'YOU HAVE ' + gems + ' GEMS') + '</small>';
  btn.onclick = reviveWithGems;
}

function reviveWithGems() {
  if (!campaign.dead || !window.RielCosmetics.spendGems(REVIVE_COST)) return;
  // Undo the fall
  campaign.dead = false;
  campaign.diedAt = null;
  campaign.revives = (campaign.revives || 0) + 1;
  player.lives = 1;
  respawnPlayer();                     // full HP, back near where you fell
  player.respawnTimer = 0;
  player.invuln = REVIVE_INVULN_FRAMES;
  player.hitFlash = REVIVE_INVULN_FRAMES; // blink while invulnerable
  campaign.lives = 1;
  campaign.hp = player.maxHp;
  // Close the death screen and carry on
  const screen = document.getElementById('death-screen');
  screen.classList.remove('show');
  screen.hidden = true;
  document.getElementById('death-revive-btn').hidden = true;
  deathScreenShown = false;
  const touch = document.getElementById('touch-overlay');
  if (touch) touch.style.display = '';
  gameState = 'playing';
  stateTimer = 0;
  saveLevelProgress();                 // saves the campaign as alive again (with the level)
  showToast('REVIVED! -' + REVIVE_COST + ' GEMS');
}
// Death screen, or (victory) the campaign-complete screen with its rewards.
function showEndScreen(victory) {
  if (deathScreenShown) return;
  deathScreenShown = true;
  document.getElementById('death-campaign').textContent = campaign.name || 'UNKNOWN';
  if (victory) {
    const r = completeCampaign();
    document.getElementById('death-screen').classList.add('victory');
    document.getElementById('death-title').textContent = 'CAMPAIGN COMPLETE';
    document.getElementById('death-sub-end').textContent = 'IS COMPLETE';
    const reward = document.getElementById('death-reward');
    const lines = [];
    if (r.token) lines.push('+1 RIEL TOKEN &middot; ' + r.tokens + ' TOTAL');
    if (r.unlocked) lines.push('NEW CAMPAIGN TYPE UNLOCKED: ' + r.unlocked);
    if (MODE.timed) lines.push((r.newBest ? 'NEW BEST TIME: ' : 'TIME: ') + window.RielModes.formatTime(campaign.playTimeMs));
    lines.push(...r.achievements);
    reward.innerHTML = lines.map(l => '<div>' + l + '</div>').join('');
    reward.hidden = lines.length === 0;
  }
  document.getElementById('death-summary').innerHTML = window.RielRunSummary.render(campaign);
  if (!victory) setupReviveButton();
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

  // Cosmetic trail (shop): particles left behind while moving
  if (gameState === 'playing') {
    if (Math.abs(player.vx) > 0.2 || !player.onGround) {
      window.RielCosmetics.spawnTrail(trailParticles, TRAIL_ID, player.x, player.y, PLAYER_W, PLAYER_H, frameCount);
    }
    window.RielCosmetics.updateTrail(trailParticles);
  }
  window.RielCosmetics.drawTrail(trailParticles, ctx, wp);

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

  // Colours come from the equipped player skin and weapon skin.
  const skin    = PLAYER_SKIN.skin;
  const hair    = PLAYER_SKIN.hair;
  const jacket  = PLAYER_SKIN.jacket;
  const belt    = PLAYER_SKIN.belt || PLAYER_SKIN.jacket;
  const boot    = PLAYER_SKIN.boot;
  const eye     = PLAYER_SKIN.eye;
  const gunC    = WEAPON_SKIN.gun;
  const flash   = WEAPON_SKIN.bullet;

  // Head
  p(2,0,hair); p(3,0,hair); p(4,0,hair);
  p(1,1,skin); p(2,1,skin); p(3,1,skin); p(4,1,skin); p(5,1,hair);
  p(1,2,skin); p(2,2,skin); p(3,2,eye); p(4,2,skin); p(5,2,skin);

  // Body
  for(let c=1;c<=5;c++){ p(c,3,jacket); p(c,4,belt); }

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
    p(6,3,skin);
    window.RielCosmetics.drawGun(p, PLAYER_CLASS, WEAPON_SKIN, player.gunFlash > 0); // class weapon
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
}

// ═══════════════════════════════════════════════════════════════
//  DRAW BULLETS
// ═══════════════════════════════════════════════════════════════
function drawBullets() {
  for (const b of bullets) {
    const sx = wp(b.x);
    // Trail
    ctx.fillStyle = WEAPON_SKIN.glow;
    ctx.fillRect(sx - b.dx * 8, b.y - b.dy * 8, 8, 3);
    // Bullet
    ctx.fillStyle = WEAPON_SKIN.bullet;
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
  // Both save the whole level first, so coming back resumes exactly here.
  { label: 'SETTINGS',      action: () => { saveLevelProgress(); window.location.href = 'settings.html?returnTo=game.html'; } },
  { label: 'QUIT TO MENU',  action: () => { saveLevelProgress(); window.location.href = 'index.html'; } },
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
  const p = canvasPoint(e);
  // The pause button (top-right) toggles pause; preventDefault stops the click from also firing a shot.
  if (pauseButtonVisible() && inPauseButton(p.x, p.y)) {
    e.preventDefault();
    togglePause();
    return;
  }
  if (gameState !== 'paused') return;
  const i = pauseItemAt(p.x, p.y);
  if (i < 0) return;
  e.preventDefault();
  pauseMenuIndex = i;
  PAUSE_ITEMS[i].action();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const p = canvasPoint(e);
  pauseBtnHover = pauseButtonVisible() && inPauseButton(p.x, p.y);
  if (gameState !== 'paused') { canvas.style.cursor = pauseBtnHover ? 'pointer' : ''; return; } // else crosshair
  const i = pauseItemAt(p.x, p.y);
  if (i >= 0) pauseMenuIndex = i;
  canvas.style.cursor = i >= 0 || pauseBtnHover ? 'pointer' : '';
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
    ['LEVEL',     window.RielModes.stageLabel(campaign).replace(/^LEVEL /, '')],
    ['HP',        Math.ceil(player.hp) + ' / ' + player.maxHp],
    ['LIVES',     '♥'.repeat(player.lives) + '♡'.repeat(Math.max(0, MAX_LIVES - player.lives))],
    ['RIELS',     campaign.riels + ' KHR'],
    ['GUN DMG',   (Math.round(classDamage() * 10) / 10) + (PLAYER_CLASS.pellets ? ' x' + PLAYER_CLASS.pellets : '') + ' ' + PLAYER_CLASS.weapon],
    ['UPGRADES',  campaign.upgradeCount || 0],
    ['BOSSES',    (campaign.bossesBeaten || 0) + ' / 10'],
    ['EVENT',     levelEvent.id === 'none' ? 'NONE' : levelEvent.label],
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
// var (not let), and keep any value already set: showToast can be called while the
// level is still being set up at load (e.g. the "NEW ENEMY" message), before this line runs.
var toastTimer2 = toastTimer2 || 0;
var toastMsg    = toastMsg || '';

function showToast(msg, frames = 120) {
  toastMsg    = msg;
  toastTimer2 = frames;
}

function drawToast() {
  if (toastTimer2 <= 0 && achToasts.length && gameState === 'playing') showToast(achToasts.shift(), 180);
  if (toastTimer2 <= 0) return;
  toastTimer2--;
  const alpha = Math.min(1, toastTimer2 / 20);
  ctx.globalAlpha = alpha;
  ctx.font        = '7px "Public Pixel", monospace';
  const boxW = Math.max(280, Math.ceil(ctx.measureText(toastMsg).width) + 24); // fit longer messages
  ctx.fillStyle   = '#0f1526';
  ctx.fillRect(BASE_W / 2 - boxW / 2, BASE_H - 40, boxW, 22);
  ctx.fillStyle   = '#f5c400';
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
  // Overcharge (awakened Life Leech): extra HP drawn as a pink layer over the bar
  if (player.overHp > 0) {
    ctx.fillStyle = 'rgba(255,77,109,0.85)';
    ctx.fillRect(barX, barY, barW * Math.min(1, player.overHp / player.maxHp), 4);
    ctx.fillRect(barX, barY + barH - 3, barW * Math.min(1, player.overHp / player.maxHp), 3);
  }
  ctx.fillStyle = '#e8e8d0';
  ctx.font = '6px "Public Pixel", monospace';
  ctx.fillText('HP ' + Math.ceil(player.hp) + ' / ' + player.maxHp, barX + 4, barY + 10);
  if (player.overHp > 0) {
    ctx.fillStyle = '#ff4d6d';
    ctx.fillText('+' + Math.ceil(player.overHp) + ' OVERCHARGE', barX + barW + 6, barY + 10);
  }

  // Lives (3 hearts, grey when lost)
  ctx.font = '11px "Public Pixel", monospace';
  for (let i = 0; i < Math.max(MAX_LIVES, player.lives); i++) {   // extra lives bought in the shop add hearts
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
  drawAbilityHUD(barX, barY + 74);

  // Right panel (below the pause button)
  const rightY = PAUSE_BTN.y + PAUSE_BTN.h + 14;
  ctx.font = '7px "Public Pixel", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5c400';
  ctx.fillText(window.RielModes.stageLabel(campaign, true), BASE_W - 10, rightY);
  if (MODE.id !== 'normal') {                         // campaign type badge (and Time Attack clock)
    ctx.fillStyle = MODE.color;
    ctx.fillText(MODE.timed ? MODE.name + ' ' + window.RielModes.formatTime(campaign.playTimeMs) : MODE.name, BASE_W - 10, rightY + 48);
  }
  ctx.fillStyle = '#e8e8d0';
  ctx.fillText(campaign.riels + ' KHR', BASE_W - 10, rightY + 12);
  ctx.fillStyle = '#888870';
  ctx.fillText('DMG ' + (Math.round(classDamage() * 10) / 10) + (PLAYER_CLASS.pellets ? 'x' + PLAYER_CLASS.pellets : ''), BASE_W - 10, rightY + 24);
  const alive = npcs.filter(n => !n.dead).length;
  ctx.fillStyle = alive > 0 ? '#e8e8d0' : '#2ecc71';
  ctx.fillText(alive + ' LEFT', BASE_W - 10, rightY + 36);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════════════
//  PAUSE BUTTON (top-right of the game screen; click or tap)
// ═══════════════════════════════════════════════════════════════
const PAUSE_BTN = { x: BASE_W - 38, y: 6, w: 30, h: 22 };
let pauseBtnHover = false;

function pauseButtonVisible() { return gameState === 'playing' || gameState === 'paused'; }
function inPauseButton(x, y) {
  const b = PAUSE_BTN;
  return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4; // a little extra hit area
}

function drawPauseButton() {
  if (!pauseButtonVisible()) return;
  const b = PAUSE_BTN, paused = gameState === 'paused';
  ctx.fillStyle = pauseBtnHover ? 'rgba(245,196,0,0.25)' : 'rgba(15,21,38,0.75)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = pauseBtnHover || paused ? '#f5c400' : 'rgba(245,196,0,0.6)';
  ctx.fillRect(b.x, b.y, b.w, 2); ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
  ctx.fillRect(b.x, b.y, 2, b.h); ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);
  ctx.fillStyle = '#e8e8d0';
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (paused) {
    // ▶ resume (pixel triangle)
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - 4 + i * 2, cy - 6 + i * 1.5, 2, 12 - i * 3);
  } else {
    // ❚❚ pause
    ctx.fillRect(cx - 6, cy - 6, 4, 12);
    ctx.fillRect(cx + 2, cy - 6, 4, 12);
  }
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
      ctx.fillStyle = '#5dade2';
      ctx.fillText('+' + gemsForThisLevel() + ' ' + window.RielCosmetics.CURRENCY, cx, cy + 66);
    }
    drawClearAchievements(cx, cy + 88);
    if (stateTimer > 90 + achBannerExtra()) proceedToShop();

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
      ctx.fillStyle = '#5dade2';
      ctx.fillText('+' + gemsForThisLevel() + ' ' + window.RielCosmetics.CURRENCY, cx, cy + 82);
    }
    drawClearAchievements(cx, cy + 104);
    if (stateTimer > 120 + achBannerExtra()) proceedToShop();

  } else if (gameState === 'game_over') {
    // Brief pause on the dimmed game (skull visible), then the death screen.
    if (stateTimer > 60) showDeathScreen();

  } else if (gameState === 'you_win') {
    drawBanner('CAMPAIGN COMPLETE!', '#f5c400', cx, cy - 20);
    if (stateTimer > 70) showEndScreen(true);
  }

  ctx.textAlign = 'left';
}

// Achievements earned by this clear, under the banner text (with extra time to read them).
const achBannerExtra = () => (clearAchievements.length ? 60 + 30 * Math.min(3, clearAchievements.length) : 0);
function drawClearAchievements(cx, y) {
  if (stateTimer <= 45 || !clearAchievements.length) return;
  ctx.font = '7px "Public Pixel", monospace';
  ctx.fillStyle = '#f5c400';
  const shown = clearAchievements.slice(0, 3);
  if (clearAchievements.length > 3) shown.push('+' + (clearAchievements.length - 3) + ' MORE ACHIEVEMENTS');
  shown.forEach((t, i) => ctx.fillText(t, cx, y + i * 14));
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
    'btn-ability': 'KeyE',
  };
  const abilityBtn = document.getElementById('btn-ability');
  if (abilityBtn && ABILITY) { abilityBtn.hidden = false; abilityBtn.style.borderColor = ABILITY.def.color; }

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

  // (The pause button is drawn on the game canvas, top-right, for everyone: see drawPauseButton.)

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
    if (abilityBtn && ABILITY) {             // ability button: E, or seconds left on its cooldown
      abilityBtn.classList.toggle('cooldown', player.abilityCd > 0);
      abilityBtn.textContent = player.abilityCd > 0 ? Math.ceil(player.abilityCd / 60) + 'S' : 'E';
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
//  MID-LEVEL SAVE / RESUME
// ═══════════════════════════════════════════════════════════════
// The whole level (player, enemies, platforms, lasers, power-ups) is saved into the
// campaign, so quitting, closing the tab or opening Settings resumes exactly where you
// were. Saved on quit/settings/tab close and every 5 seconds; cleared when the level
// is cleared or the campaign falls.
const PLAYER_SAVE_KEYS = ['x', 'y', 'vy', 'onGround', 'hp', 'maxHp', 'lives', 'gunDamage', 'bullets',
  'reloadTimer', 'facingRight', 'dead', 'deathX', 'respawnTimer', 'dashCooldown',
  'jumpMult', 'jumpPowerTimer', 'speedMult', 'speedPowerTimer', 'abilityCd', 'abilityTime', 'regenTime', 'overHp'];
const AUTOSAVE_FRAMES = 5 * 60;

// Write the campaign to the active save and to its slot in the campaign list.
function persistCampaign() {
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));
  try {
    const idx = parseInt(localStorage.getItem('activeCampaignIdx'));
    const all = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || [];
    if (!isNaN(idx) && all[idx]) {
      all[idx] = { ...all[idx], ...campaign, lastPlayed: Date.now() };
      localStorage.setItem('rielrunner_campaigns', JSON.stringify(all));
    }
  } catch {}
}

function saveLevelProgress() {
  if (campaign.dead || (gameState !== 'playing' && gameState !== 'paused')) return;
  const p = {};
  for (const k of PLAYER_SAVE_KEYS) p[k] = player[k];
  campaign.levelState = {
    level: campaign.level, savedAt: Date.now(), camX, player: p,
    npcs: npcs.map(n => ({ ...n })), platforms, lasers, powerups, stats: levelStats,
    eventId: levelEvent.id,
  };
  campaign.hp = Math.ceil(player.hp);
  campaign.maxHp = player.maxHp;
  campaign.lives = player.lives;
  campaign.gunDamage = player.gunDamage;
  persistCampaign();
}

// Put a saved level back exactly as it was (paused, so the player can get ready).
function restoreLevelState() {
  const s = campaign.levelState;
  if (!s || s.level !== campaign.level || !Array.isArray(s.npcs) || !s.player) return false;
  platforms.length = 0; platforms.push(...s.platforms);
  // Keep saved vertical lasers as-is. Older saves used horizontal beams, so
  // regenerate those from the restored platforms using the new edge placement.
  lasers.length = 0;
  if (Array.isArray(s.lasers) && s.lasers.length && s.lasers.every(l => l.orientation === 'vertical')) {
    lasers.push(...s.lasers.map(l => ({ ...l, t: l.t || 0, lastDamageFrame: -LASER_TICK_FRAMES })));
  } else {
    generateLasers();
  }
  powerups.length = 0;  powerups.push(...s.powerups);
  npcs.length = 0;      npcs.push(...s.npcs.map(n => ({ ...n, nextDodgeRoll: 0 })));
  Object.assign(player, s.player);
  player.vx = 0;
  // Keep the level's event (it was re-rolled when the page loaded). Old saves don't
  // have one, so they keep the new roll.
  if (s.eventId) {
    applyLevelEvent(LEVEL_EVENTS.find(e => e.id === s.eventId));
    eventBannerTimer = 0;   // already seen when the level started
  }
  // Older saves have no level clock: that level can't earn speed/no-damage achievements.
  // (Big finite numbers, not Infinity, which JSON would save as null.)
  Object.assign(levelStats, s.stats || { timeMs: 1e12, damage: 1e12 });
  // Upgrades bought in the shop (from the title screen) since this save win over
  // the saved values; a Max HP upgrade also adds that HP now.
  const hpGain = (campaign.maxHp || 0) - (s.player.maxHp || 0);
  player.maxHp = Math.max(player.maxHp, campaign.maxHp || 0);
  player.gunDamage = Math.max(player.gunDamage, campaign.gunDamage || 0);
  if (hpGain > 0) player.hp = Math.min(player.maxHp, player.hp + hpGain);
  camX = s.camX || 0;
  gameState = 'paused';
  pauseMenuIndex = 0;
  // Saved during the "level complete" banner? Finish the level instead.
  if (npcs.length && npcs.every(n => n.dead)) { gameState = 'playing'; checkLevelClear(); }
  else showToast('PROGRESS RESTORED');
  return true;
}
restoreLevelState();

// Save when leaving the page (closing the tab, switching apps on mobile).
window.addEventListener('pagehide', saveLevelProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveLevelProgress(); });

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
  if (gameState === 'playing') {
    const dt = Math.min(now - lastLoopTime, 100);
    addStat('playTimeMs', dt);
    levelStats.timeMs += dt;
  }
  lastLoopTime = now;
  if (gameState === 'playing' && frameCount % AUTOSAVE_FRAMES === 0) saveLevelProgress(); // backup autosave

  if (gameState === 'playing') {
    updatePlayer();
    updateBullets();
    updateNPCs();
    updateEnemyShots();
    updateLasers();
    updatePowerups && updatePowerups();
  }

  drawWorld();
  drawLasers();
  drawBullets();
  updateDrawDroppedMags();
  drawPowerups();
  drawNPCs();
  drawAbilityFx();
  drawEnemyShots();
  drawBlasts();
  drawPlayer();
  updateDrawRielParticles();
  updateDrawDmgNumbers();
  drawHUD();
  drawEventHUDBadge();
  drawToast();
  drawEventBanner();
  drawOverlay();
  drawPauseMenu();
  drawPauseButton(); // on top, so it can also be clicked to resume
}

requestAnimationFrame(loop);

// Game music starts from the beginning on every level and loops continuously.
const gameMusic = new Audio('assets/audio/music/game-music.flac');
gameMusic.loop = true;
window.RielVolume.bindMusic(gameMusic, 0.50); // Sound effects use 0.55, so they sit slightly above the music.
gameMusic.play().catch(() => {});
window.addEventListener('pointerdown', () => gameMusic.play().catch(() => {}), { once: true });
window.addEventListener('keydown', () => gameMusic.play().catch(() => {}), { once: true });
