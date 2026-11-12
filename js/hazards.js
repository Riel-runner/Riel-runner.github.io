// ═══════════════════════════════════════════════════════════════
//  ZONE HAZARDS
//  Each level (not levels 1-2 or boss levels) has a 50% chance of its zone's hazard:
//    ice 1-20     SLIPPERY ICE    you slide when you stop or turn on the ground
//    grass 21-40  THORN BUSHES    bushes on the ground hurt: jump over them
//    lava 41-60   LAVA GEYSERS    vents bubble for ~1.2s, then erupt
//    sky 61-80    WIND GUSTS      streaks warn for 1s, then a gust pushes you sideways
//    space 81+    METEOR SHOWER   a red marker flashes for ~1.1s where each meteor lands
//  Everything is warned and avoidable (design rule, like the lasers).
//  Loaded before js/game.js; these functions use the game's globals (player, platforms,
//  lasers, ctx, wp, damagePlayer...) only when they're called, after the game has set up.
// ═══════════════════════════════════════════════════════════════
const HAZARD_CHANCE = 0.5;

// Thorn bushes
const THORN_H          = 16;     // low enough for any jump to clear
const THORN_DAMAGE_PCT = 0.06;   // of max HP per tick while touching
const THORN_TICK       = 30;     // frames between ticks
// Lava geysers
const GEYSER_W         = 24;
const GEYSER_H         = 120;    // column height when erupting
const GEYSER_IDLE      = 240;    // frames quiet
const GEYSER_WARN      = 70;     // frames bubbling before it erupts (~1.2s)
const GEYSER_ERUPT     = 75;     // frames erupting (~1.25s)
const GEYSER_CYCLE     = GEYSER_IDLE + GEYSER_WARN + GEYSER_ERUPT;
const GEYSER_DAMAGE_PCT = 0.12;
const GEYSER_TICK      = 30;
// Wind gusts
const WIND_CALM        = 300;    // frames between gusts
const WIND_WARN        = 60;     // streaks show the coming gust's direction for 1s
const WIND_GUST        = 150;    // frames a gust lasts
const WIND_CYCLE       = WIND_CALM + WIND_WARN + WIND_GUST;
const WIND_PUSH        = 1.3;    // px per frame (you run 3.5, so you can always walk into it)
// Meteors
const METEOR_WARN      = 66;     // frames the landing marker flashes before impact (~1.1s)
const METEOR_FALL      = 18;     // last frames of the warning: the meteor is seen falling
const METEOR_RADIUS    = 36;     // blast radius
const METEOR_DAMAGE_PCT = 0.14;
const METEOR_GAP_MIN   = 70, METEOR_GAP_MAX = 130;   // frames between meteors
const METEOR_MAX       = 3;      // at most this many on the way at once
// Slippery ice
const ICE_ACCEL        = 0.10;   // share of the speed difference made up per frame
const ICE_STOP         = 0.05;   // slower when letting go or turning: you slide (~70px)

const ZONE_HAZARDS = {
  ice:   { id: 'slippery', label: '❄ SLIPPERY ICE',  color: '#9fe8ff', desc: 'THE GROUND IS ICY: YOU SLIDE WHEN YOU STOP OR TURN.' },
  grass: { id: 'thorns',   label: '🌿 THORN BUSHES',  color: '#7bd66b', desc: 'THORNY BUSHES HURT. JUMP OVER THEM!' },
  lava:  { id: 'geysers',  label: '🌋 LAVA GEYSERS',  color: '#ff8a1a', desc: 'VENTS BUBBLE, THEN ERUPT. MOVE AWAY WHEN THEY GLOW!' },
  sky:   { id: 'wind',     label: '🌬 WIND GUSTS',    color: '#d6f0ff', desc: 'STREAKS SHOW WHERE THE NEXT GUST WILL PUSH YOU.' },
  space: { id: 'meteors',  label: '☄ METEOR SHOWER', color: '#ff6b5a', desc: 'METEORS LAND WHERE THE RED MARKERS FLASH.' },
};
const hazardDef = id => Object.values(ZONE_HAZARDS).find(h => h.id === id) || null;

let zoneHazard = null;   // { id, label, desc, color, t, items, ... } or null
const hazardOn = id => !!zoneHazard && zoneHazard.id === id;

// Roll this level's hazard (50%). No hazard on the first two levels or boss levels.
function pickZoneHazard(rng = Math.random) {
  zoneHazard = null;
  const level = campaign.level || 1;
  if (level <= 2 || level % 10 === 0) return null;
  if (rng() >= HAZARD_CHANCE) return null;
  setZoneHazard(ZONE_HAZARDS[window.RielThemes.forLevel(level).id].id);
  eventBannerTimer = EVENT_BANNER_FRAMES;
  return zoneHazard;
}

// Make hazard `id` active with a fresh layout (null / unknown id: no hazard).
function setZoneHazard(id) {
  const def = hazardDef(id);
  if (!def) { zoneHazard = null; return null; }
  zoneHazard = { id: def.id, label: def.label, desc: def.desc, color: def.color, t: 0, items: [] };
  if (id === 'thorns')  zoneHazard.items = spreadOnGround(3 + Math.floor(Math.random() * 3), 350)
    .map(x => ({ x, w: 34 + Math.round(Math.random() * 16), lastHit: -999 }));
  if (id === 'geysers') {
    const xs = spreadOnGround(3 + Math.floor(Math.random() * 2), 420);
    zoneHazard.items = xs.map((x, i) => ({ x, t: Math.floor(i * GEYSER_CYCLE / xs.length), lastHit: -999 }));
  }
  if (id === 'wind')    { zoneHazard.dir = 1; }
  if (id === 'meteors') { zoneHazard.next = 120; }
  return zoneHazard;
}

// `count` x positions on the ground, at least `gap` apart, away from the start, the end
// and the lasers (so two dangers never stack on one spot).
function spreadOnGround(count, gap) {
  const xs = [];
  for (let tries = 0; xs.length < count && tries < 400; tries++) {
    const x = 600 + Math.random() * (LEVEL_WIDTH - 950);
    if (xs.some(o => Math.abs(o - x) < gap)) continue;
    if (lasers.some(l => Math.abs(l.x - x) < 70)) continue;
    xs.push(Math.round(x));
  }
  return xs.sort((a, b) => a - b);
}

// ── Timing helpers (also used by the tests) ──
const geyserPhase = g => g.t % GEYSER_CYCLE;
const geyserWarn  = g => geyserPhase(g) >= GEYSER_IDLE && geyserPhase(g) < GEYSER_IDLE + GEYSER_WARN;
const geyserErupt = g => geyserPhase(g) >= GEYSER_IDLE + GEYSER_WARN;
const windPhase   = () => zoneHazard.t % WIND_CYCLE;
const windWarn    = () => windPhase() >= WIND_CALM && windPhase() < WIND_CALM + WIND_WARN;
const windGust    = () => windPhase() >= WIND_CALM + WIND_WARN;
// Gust strength 0..1: eases in and out over 20 frames
function windStrength() {
  if (!hazardOn('wind') || !windGust()) return 0;
  const k = windPhase() - WIND_CALM - WIND_WARN;
  return Math.min(1, k / 20, (WIND_GUST - k) / 20);
}

// Player's horizontal speed this frame. On slippery ice (on the ground) you speed up and
// slow down gradually instead of instantly. Top speed is unchanged.
function hazardMoveVx(cur, target, onGround) {
  if (!hazardOn('slippery') || !onGround) return target;
  const v = cur + (target - cur) * (target === 0 || (cur !== 0 && Math.sign(target) !== Math.sign(cur)) ? ICE_STOP : ICE_ACCEL);
  return target === 0 && Math.abs(v) < 0.05 ? 0 : v;
}

const playerTouches = (x, y, w, h) =>
  player.x < x + w && player.x + PLAYER_W > x && player.y < y + h && player.y + PLAYER_H > y;

function hazardHit(item, pct, tick, color) {
  if (frameCount - item.lastHit < tick) return;
  item.lastHit = frameCount;
  const dmg = damagePlayer(player.maxHp * pct);
  if (dmg > 0) spawnDmgNumber(player.x, player.y - 12, dmg, color);
}

// Top of whatever a meteor falling at x hits first: a platform, or the ground.
function surfaceAt(x) {
  let y = GROUND_Y;
  for (const p of platforms) if (x >= p.x && x <= p.x + p.w && p.y < y) y = p.y;
  return y;
}

// ── Update (only runs while playing) ──
function updateHazards() {
  if (!zoneHazard) return;
  const z = zoneHazard;
  z.t++;
  const alive = !player.dead;

  if (z.id === 'thorns' && alive) {
    for (const b of z.items) if (playerTouches(b.x, GROUND_Y - THORN_H, b.w, THORN_H)) hazardHit(b, THORN_DAMAGE_PCT, THORN_TICK, '#7bd66b');
  }

  if (z.id === 'geysers') {
    for (const g of z.items) {
      g.t++;
      if (alive && geyserErupt(g) && playerTouches(g.x, GROUND_Y - GEYSER_H, GEYSER_W, GEYSER_H)) hazardHit(g, GEYSER_DAMAGE_PCT, GEYSER_TICK, '#ff8a1a');
    }
  }

  if (z.id === 'wind') {
    if (windPhase() === WIND_CALM) z.dir = Math.random() < 0.5 ? -1 : 1;   // new gust: pick its direction as the warning starts
    const push = windStrength() * WIND_PUSH * z.dir;
    if (alive && push && !player.isDashing) {
      player.x = Math.max(0, Math.min(LEVEL_WIDTH - PLAYER_W, player.x + push));
    }
  }

  if (z.id === 'meteors') {
    if (alive && --z.next <= 0 && z.items.filter(m => !m.boom).length < METEOR_MAX) {
      z.next = METEOR_GAP_MIN + Math.floor(Math.random() * (METEOR_GAP_MAX - METEOR_GAP_MIN));
      const px = player.x + PLAYER_W / 2;
      const x = Math.random() < 0.5 ? px + (Math.random() * 80 - 40)                       // right where you are
                                    : px + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 220);
      const mx = Math.round(Math.max(300, Math.min(LEVEL_WIDTH - 40, x)));
      z.items.push({ x: mx, y: surfaceAt(mx), t: 0, boom: 0 });
    }
    for (const m of z.items) {
      if (m.boom) { m.boom++; continue; }
      if (++m.t < METEOR_WARN) continue;
      m.boom = 1;                                        // impact
      const cx = player.x + PLAYER_W / 2, feet = player.y + PLAYER_H;
      if (alive && Math.abs(cx - m.x) < METEOR_RADIUS + PLAYER_W / 2 && feet > m.y - 40 && player.y < m.y + 4) {
        const dmg = damagePlayer(player.maxHp * METEOR_DAMAGE_PCT);
        if (dmg > 0) spawnDmgNumber(player.x, player.y - 12, dmg, '#ff6b5a');
      }
    }
    z.items = z.items.filter(m => m.boom < 24);
  }
}

// ── Draw (world layer, right after the lasers) ──
function drawHazards() {
  if (!zoneHazard) return;
  const z = zoneHazard;
  if (z.id === 'thorns')  for (const b of z.items) drawThornBush(b);
  if (z.id === 'geysers') for (const g of z.items) drawGeyser(g);
  if (z.id === 'meteors') for (const m of z.items) drawMeteor(m);
  if (z.id === 'wind') drawWind(z);
  if (z.id === 'slippery') drawIceSlide();
}

function drawThornBush(b) {
  const sx = Math.round(wp(b.x));
  if (sx > BASE_W + 20 || sx + b.w < -20) return;
  const y = GROUND_Y - THORN_H;
  ctx.fillStyle = '#1f5a24';
  ctx.fillRect(sx + 2, y + 4, b.w - 4, THORN_H - 4);
  ctx.fillRect(sx + 5, y + 1, b.w - 10, 4);
  ctx.fillStyle = '#2f7d32';
  for (let i = 4; i < b.w - 6; i += 8) ctx.fillRect(sx + i, y + 3, 5, 4);
  ctx.fillStyle = '#d9e8c8';                            // thorns poking out
  for (let i = 3; i < b.w - 2; i += 6) {
    ctx.fillRect(sx + i, y - 1 - (i % 4 === 1 ? 1 : 0), 1, 3);
  }
  ctx.fillRect(sx, y + 6, 2, 1); ctx.fillRect(sx + b.w - 2, y + 7, 2, 1);
  ctx.fillStyle = '#c0392b';                            // berries
  ctx.fillRect(sx + 6, y + 6, 2, 2); ctx.fillRect(sx + b.w - 10, y + 5, 2, 2);
}

function drawGeyser(g) {
  const sx = Math.round(wp(g.x));
  if (sx > BASE_W + 30 || sx + GEYSER_W < -30) return;
  const warn = geyserWarn(g), erupt = geyserErupt(g);
  // Vent: a rock mound with a crack that glows when it's about to blow
  ctx.fillStyle = '#3a2a24';
  ctx.fillRect(sx - 4, GROUND_Y - 5, GEYSER_W + 8, 5);
  ctx.fillRect(sx, GROUND_Y - 8, GEYSER_W, 3);
  const flash = warn && frameCount % 10 < 5;
  ctx.fillStyle = erupt ? '#ffd23f' : warn ? (flash ? '#ffef9a' : '#ff8a1a') : '#7a2e10';
  ctx.fillRect(sx + 6, GROUND_Y - 7, GEYSER_W - 12, 2);
  if (warn) {                                            // bubbles hopping out of the vent
    const k = geyserPhase(g) - GEYSER_IDLE;
    ctx.fillStyle = '#ff8a1a';
    for (let i = 0; i < 4; i++) {
      const hop = ((k * 2 + i * 9) % 18);
      ctx.fillRect(sx + 3 + i * 6, GROUND_Y - 9 - hop, 3, 3);
    }
  }
  if (erupt) {
    const k = geyserPhase(g) - GEYSER_IDLE - GEYSER_WARN;
    const h = Math.round(GEYSER_H * Math.min(1, k / 10, (GEYSER_ERUPT - k) / 10));
    const top = GROUND_Y - 8 - h;
    ctx.fillStyle = 'rgba(255,90,20,0.35)';               // glow
    ctx.fillRect(sx - 4, top - 4, GEYSER_W + 8, h + 4);
    ctx.fillStyle = '#ff6a10';
    ctx.fillRect(sx, top, GEYSER_W, h);
    ctx.fillStyle = '#ffb02e';
    for (let yy = 0; yy < h; yy += 8) {                  // wobbly bright core
      const wob = Math.round(Math.sin((yy + frameCount * 3) * 0.2) * 3);
      ctx.fillRect(sx + 6 + wob, top + yy, GEYSER_W - 12, 6);
    }
    ctx.fillStyle = '#ffe680';                            // splash on top
    ctx.fillRect(sx - 2, top - 3, GEYSER_W + 4, 4);
  }
}

function drawMeteor(m) {
  const sx = Math.round(wp(m.x));
  if (sx > BASE_W + 60 || sx < -60) return;
  if (!m.boom) {
    // Landing marker: blast width + a flashing X, flashing faster as it gets close
    const fast = m.t > METEOR_WARN - 24;
    const on = frameCount % (fast ? 6 : 12) < (fast ? 3 : 6);
    ctx.fillStyle = on ? 'rgba(255,60,60,0.22)' : 'rgba(255,60,60,0.1)';            // glow over the blast area
    ctx.fillRect(sx - METEOR_RADIUS, m.y - 8, METEOR_RADIUS * 2, 8);
    ctx.fillStyle = on ? 'rgba(255,60,60,0.95)' : 'rgba(255,60,60,0.45)';
    ctx.fillRect(sx - METEOR_RADIUS, m.y - 2, METEOR_RADIUS * 2, 2);
    for (let i = -3; i <= 3; i++) { ctx.fillRect(sx + i * 2 - 1, m.y - 10 + (i + 3) * 2, 2, 2); ctx.fillRect(sx - i * 2 - 1, m.y - 10 + (i + 3) * 2, 2, 2); }
    if (m.t >= METEOR_WARN - METEOR_FALL) {               // falling
      const k = (m.t - (METEOR_WARN - METEOR_FALL)) / METEOR_FALL;
      const y = Math.round(-30 + (m.y + 30) * k);
      ctx.fillStyle = 'rgba(255,140,40,0.55)';            // flame trail
      ctx.fillRect(sx - 4, y - 34, 8, 30);
      ctx.fillStyle = 'rgba(255,220,120,0.7)';
      ctx.fillRect(sx - 2, y - 22, 4, 18);
      ctx.fillStyle = '#6b5a50';                           // rock
      ctx.fillRect(sx - 6, y - 8, 12, 10);
      ctx.fillStyle = '#9a8678';
      ctx.fillRect(sx - 4, y - 7, 5, 4);
    }
  } else {
    const r = METEOR_RADIUS * Math.min(1, m.boom / 8);
    ctx.globalAlpha = Math.max(0, 1 - m.boom / 24);
    ctx.fillStyle = '#ff6a10';
    ctx.beginPath(); ctx.arc(sx, m.y - 4, r, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(sx, m.y - 4, r * 0.55, Math.PI, 0); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Streaks across the screen: a few faint ones while a gust is coming (showing its
// direction), lots of bright ones while it blows.
function drawWind(z) {
  const warn = windWarn(), s = windStrength();
  if (!warn && s <= 0) return;
  const n = warn ? 10 : Math.round(26 * s);
  const speed = warn ? 4 : 12;
  for (let i = 0; i < n; i++) {
    const len = 18 + (i * 37) % 34;
    const y = 40 + (i * 53) % (GROUND_Y - 60);
    let x = ((i * 97) + frameCount * speed * (0.7 + (i % 3) * 0.2)) % (BASE_W + 80) - 40;
    if (z.dir < 0) x = BASE_W - x;
    const x0 = Math.round(x - (z.dir < 0 ? 0 : len));
    ctx.fillStyle = warn ? 'rgba(60,110,170,0.35)' : 'rgba(60,110,170,0.55)';   // blue edge: shows on the bright sky too
    ctx.fillRect(x0, y, len, 3);
    ctx.fillStyle = warn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0, y, len, 1);
    if (warn) {                                          // arrow head on the warning streaks
      const hx = Math.round(z.dir > 0 ? x : x - 2);
      ctx.fillRect(hx - z.dir * 3, y - 2, 2, 2);
      ctx.fillRect(hx - z.dir * 3, y + 2, 2, 2);
    }
  }
}

// Little ice sparkles at your feet while sliding
function drawIceSlide() {
  if (player.dead || !player.onGround || Math.abs(player.vx) < 0.6) return;
  const target = keys['ArrowLeft'] ? -1 : keys['ArrowRight'] ? 1 : 0;
  if (target === Math.sign(player.vx)) return;          // only when sliding, not running
  ctx.fillStyle = 'rgba(220,250,255,0.9)';
  const sx = Math.round(wp(player.x + PLAYER_W / 2));
  for (let i = 0; i < 3; i++) ctx.fillRect(sx - Math.sign(player.vx) * (6 + i * 5) + ((frameCount + i) % 3), GROUND_Y - 2 - (i % 2) * 2, 2, 2);
}

// ── Save / restore with the level ──
const hazardSave = () => (zoneHazard ? JSON.parse(JSON.stringify(zoneHazard)) : null);
function hazardLoad(saved) {
  if (!saved || !hazardDef(saved.id)) { zoneHazard = null; return; }
  const def = hazardDef(saved.id);
  zoneHazard = { ...saved, label: def.label, desc: def.desc, color: def.color };
}
