// Level themes: each zone of 20 levels has its own background, floor and platforms.
//   1-20 ICE CAVE · 21-40 GRASSY FIELD · 41-60 LAVA DUNGEON · 61-80 SKY · 81+ SPACE
// Every level is laid out from its own seed (rock / cloud / torch / planet placement,
// colours), and every platform gets its own details (icicles, grass tufts, bricks,
// cloud puffs, lights) from its position, so nothing looks copy-pasted.
// Used by js/game.js: RielThemes.forLevel(level) -> theme with
//   init(env) · background(ctx, camX, t) · ground(ctx, camX, t) · platform(ctx, p, sx, t)
// env = { W, H, groundY, floorH, levelWidth, level }. t = frame counter.
window.RielThemes = (function () {
  // Seeded random numbers (same level -> same layout)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Deterministic 0..1 value for a number (per tile / per platform details)
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // Pixel-art disc (stacked rows), centre cx,cy, radius r
  function disc(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy += 2) {
      const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, 2);
    }
  }
  // Elements spread across a parallax layer: f = parallax factor.
  function spread(r, env, f, gap, jitter, make) {
    const out = [], span = env.levelWidth * f + env.W + gap;
    for (let x = -gap * r(); x < span; x += gap * (1 - jitter / 2 + r() * jitter)) out.push(make(x, r));
    return out;
  }
  const visible = (sx, w, W) => sx + w > -40 && sx < W + 40;
  let gradCache = {};
  function vgrad(ctx, key, y0, y1, stops) {
    if (!gradCache[key]) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      gradCache[key] = g;
    }
    return gradCache[key];
  }

  // ═══════════════ ICE CAVE (1-20) ═══════════════
  const ice = {
    id: 'ice', name: 'ICE CAVE', bright: false,
    init(env) {
      const r = rng(env.level * 7919 + 11);
      this.env = env;
      this.rocks = spread(r, env, 0.15, 150, 0.8, (x, r) => ({ x, w: 60 + r() * 90, h: 50 + r() * 120, c: r() < 0.5 ? '#163650' : '#1b4061' }));
      this.stalac = spread(r, env, 0.3, 46, 1.2, (x, r) => ({ x, w: 10 + r() * 22, h: 18 + r() * 70 }));
      this.crystals = spread(r, env, 0.22, 110, 1, (x, r) => ({ x, y: 70 + r() * 180, s: 2 + Math.floor(r() * 3), ph: r() * 6 }));
      this.mites = spread(r, env, 0.45, 130, 1, (x, r) => ({ x, w: 14 + r() * 20, h: 16 + r() * 40 }));
    },
    background(ctx, camX, t) {
      const { W, groundY } = this.env;
      ctx.fillStyle = vgrad(ctx, 'ice', 0, groundY, [[0, '#07121f'], [0.6, '#0e2a42'], [1, '#14405e']]);
      ctx.fillRect(0, 0, W, groundY);
      // Far rock formations rising from the ground (stepped like pixel art)
      for (const k of this.rocks) {
        const sx = k.x - camX * 0.15;
        if (!visible(sx, k.w, W)) continue;
        for (let i = 0; i < 4; i++) {
          const inset = (k.w / 8) * i, hh = k.h * (1 - i * 0.22);
          R(ctx, sx + inset, groundY - hh, k.w - inset * 2, hh, k.c);
        }
        R(ctx, sx + k.w * 0.35, groundY - k.h * 0.34, 3, 3, '#3d7fa8');   // frosty glint
      }
      // Glowing ice crystals in the walls
      for (const c of this.crystals) {
        const sx = c.x - camX * 0.22;
        if (!visible(sx, 10, W)) continue;
        const glow = 0.5 + 0.5 * Math.sin(t * 0.04 + c.ph);
        ctx.globalAlpha = 0.25 + glow * 0.4;
        R(ctx, sx - c.s * 2, c.y - c.s * 2, c.s * 5, c.s * 5, '#59c7ff');
        ctx.globalAlpha = 1;
        R(ctx, sx, c.y - c.s * 2, c.s, c.s * 4, '#bff0ff');
        R(ctx, sx - c.s, c.y - c.s, c.s * 3, c.s * 2, '#8fdcff');
      }
      // Stalagmites (nearer layer)
      for (const m of this.mites) {
        const sx = m.x - camX * 0.45;
        if (!visible(sx, m.w, W)) continue;
        for (let i = 0; i < 3; i++) R(ctx, sx + (m.w / 6) * i, groundY - m.h * (1 - i * 0.3), m.w - (m.w / 3) * i, m.h * (1 - i * 0.3), i === 2 ? '#3a7ea3' : '#245a7c');
      }
      // Ceiling and stalactites with icy tips
      R(ctx, 0, 0, W, 10, '#0c2236');
      for (const s of this.stalac) {
        const sx = s.x - camX * 0.3;
        if (!visible(sx, s.w, W)) continue;
        for (let i = 0; i < 4; i++) R(ctx, sx + (s.w / 8) * i, 8, s.w - (s.w / 4) * i, s.h * (0.45 + i * 0.18), i < 2 ? '#1f4d6e' : '#2f6b91');
        R(ctx, sx + s.w / 2 - 1, 8 + s.h * 0.95, 2, 4, '#cdf4ff');
      }
      // Drifting ice dust
      ctx.fillStyle = 'rgba(210,240,255,0.55)';
      for (let i = 0; i < 26; i++) {
        const x = (hash(i) * W * 1.3 - camX * 0.6 + t * 0.15 * (0.5 + hash(i + 50))) % (W + 20);
        const y = (hash(i + 99) * groundY + t * (0.3 + hash(i + 7) * 0.4)) % groundY;
        ctx.fillRect(Math.round(x < 0 ? x + W + 20 : x), Math.round(y), 2, 2);
      }
    },
    ground(ctx, camX) {
      const { W, groundY, floorH } = this.env;
      R(ctx, 0, groundY, W, floorH, '#2f7fae');
      R(ctx, 0, groundY + 10, W, floorH - 10, '#25698f');
      R(ctx, 0, groundY, W, 3, '#e6fbff');
      R(ctx, 0, groundY + 3, W, 3, '#9fe0f7');
      // Ice tiles with cracks and shine, different on each tile
      const off = -camX % 40;
      for (let x = off - 40; x < W + 40; x += 40) {
        const id = Math.round((x + camX) / 40), h = hash(id);
        R(ctx, x, groundY + 6, 1, floorH - 6, 'rgba(10,40,70,0.35)');
        if (h < 0.55) { R(ctx, x + 8 + h * 12, groundY + 12, 10, 1, '#7cc7e8'); R(ctx, x + 14 + h * 12, groundY + 13, 1, 8, '#7cc7e8'); }
        R(ctx, x + 4 + hash(id + 3) * 20, groundY + 8, 6, 2, 'rgba(255,255,255,0.35)');
      }
    },
    platform(ctx, p, sx) {
      const s = hash(p.x);
      R(ctx, sx, p.y, p.w, p.h, '#5fb6dd');
      R(ctx, sx, p.y + p.h - 3, p.w, 3, '#3a8db4');
      R(ctx, sx, p.y, p.w, 3, '#eafcff');
      R(ctx, sx + 4, p.y + 4, p.w * 0.3, 2, 'rgba(255,255,255,0.45)');
      // Snow lumps on top
      for (let x = 4 + s * 10; x < p.w - 8; x += 18 + hash(p.x + x) * 16) R(ctx, sx + x, p.y - 2, 6 + hash(x) * 6, 2, '#f4feff');
      // Icicles hanging underneath, all different lengths
      for (let x = 3 + s * 8; x < p.w - 4; x += 7 + hash(p.x * 3 + x) * 9) {
        const len = 4 + hash(p.x + x * 7) * 12;
        R(ctx, sx + x, p.y + p.h, 4, len * 0.5, '#bdeeff');
        R(ctx, sx + x + 1, p.y + p.h + len * 0.5, 2, len * 0.5, '#e8fbff');
      }
    },
  };

  // ═══════════════ GRASSY FIELD (21-40) ═══════════════
  const grass = {
    id: 'grass', name: 'GRASSY FIELD', bright: true,
    init(env) {
      const r = rng(env.level * 104729 + 3);
      this.env = env;
      this.sunX = env.W * (0.6 + r() * 0.3);
      this.clouds = spread(r, env, 0.08, 190, 1, (x, r) => ({ x, y: 30 + r() * 110, s: 0.7 + r() * 0.8, puffs: 3 + Math.floor(r() * 3), sp: 0.05 + r() * 0.1 }));
      this.hillFar = Array.from({ length: 5 }, () => ({ a: 20 + r() * 30, f: 0.004 + r() * 0.01, p: r() * 6 }));
      this.hillNear = Array.from({ length: 4 }, () => ({ a: 14 + r() * 22, f: 0.008 + r() * 0.012, p: r() * 6 }));
      this.trees = spread(r, env, 0.35, 120, 1.4, (x, r) => ({ x, s: 0.7 + r() * 0.6, dark: r() < 0.5 }));
    },
    hill(layers, x, base) { let h = base; for (const l of layers) h += Math.sin(x * l.f + l.p) * l.a; return h; },
    background(ctx, camX, t) {
      const { W, groundY } = this.env;
      ctx.fillStyle = vgrad(ctx, 'grass', 0, groundY, [[0, '#3d9cff'], [0.7, '#9fd4ff'], [1, '#d4f0ff']]);
      ctx.fillRect(0, 0, W, groundY);
      // Sun with a soft glow
      const sx = this.sunX - camX * 0.02, sy = 64;
      ctx.globalAlpha = 0.25; disc(ctx, sx, sy, 46, '#fff6b0'); ctx.globalAlpha = 1;
      disc(ctx, sx, sy, 28, '#ffe45c'); disc(ctx, sx - 4, sy - 4, 20, '#fff3a3');
      // Drifting clouds
      for (const c of this.clouds) {
        const cx = ((c.x - camX * 0.08 + t * c.sp) % (this.env.levelWidth * 0.08 + W + 200)) - 100;
        if (!visible(cx, 140 * c.s, W)) continue;
        for (let i = 0; i < c.puffs; i++) disc(ctx, cx + i * 22 * c.s, c.y - (i % 2) * 8 * c.s, 16 * c.s, '#ffffff');
        R(ctx, cx - 10 * c.s, c.y + 4 * c.s, (c.puffs * 22 + 4) * c.s, 8 * c.s, '#e3f2ff');
      }
      // Rolling hills (two layers) with trees on the near ones
      for (let x = 0; x < W; x += 4) {
        const hf = this.hill(this.hillFar, x + camX * 0.15, 70);
        R(ctx, x, groundY - hf, 4, hf, '#8fd27a');
      }
      for (const tr of this.trees) {
        const tx = tr.x - camX * 0.35;
        if (!visible(tx, 30, W)) continue;
        const hy = groundY - this.hill(this.hillNear, tx + camX * 0.35, 38);
        R(ctx, tx + 6 * tr.s, hy - 16 * tr.s, 4 * tr.s, 16 * tr.s, '#7a4b25');
        disc(ctx, tx + 8 * tr.s, hy - 22 * tr.s, 11 * tr.s, tr.dark ? '#2e8b3a' : '#3fa646');
      }
      for (let x = 0; x < W; x += 4) {
        const hn = this.hill(this.hillNear, x + camX * 0.35, 38);
        R(ctx, x, groundY - hn, 4, hn, '#5dbb4c');
      }
    },
    ground(ctx, camX) {
      const { W, groundY, floorH } = this.env;
      R(ctx, 0, groundY, W, floorH, '#8a5a2e');
      // Dirt specks and pebbles, different per tile
      const off = -camX % 24;
      for (let x = off - 24; x < W + 24; x += 24) {
        const id = Math.round((x + camX) / 24);
        R(ctx, x + hash(id) * 18, groundY + 18 + hash(id + 1) * 30, 3, 3, '#6b4220');
        R(ctx, x + hash(id + 2) * 18, groundY + 14 + hash(id + 3) * 34, 2, 2, '#a8763f');
        if (hash(id + 4) < 0.3) R(ctx, x + hash(id + 5) * 16, groundY + 26 + hash(id + 6) * 20, 5, 3, '#9b9b9b');
      }
      // Grass top with blades and flowers
      R(ctx, 0, groundY, W, 8, '#4fbf37');
      R(ctx, 0, groundY + 8, W, 3, '#3e9a2b');
      const off2 = -camX % 6;
      for (let x = off2 - 6; x < W + 6; x += 6) {
        const id = Math.round((x + camX) / 6), h = hash(id);
        R(ctx, x, groundY - 2 - Math.floor(h * 3), 2, 3 + Math.floor(h * 3), '#5fd444');
        if (h > 0.93) { R(ctx, x, groundY - 6, 1, 4, '#3e9a2b'); R(ctx, x - 1, groundY - 8, 3, 3, ['#ff5d5d', '#ffd84a', '#ffffff', '#c77dff'][Math.floor(hash(id + 9) * 4)]); }
      }
    },
    platform(ctx, p, sx) {
      const s = hash(p.x);
      // Dirt block with its own speck pattern
      R(ctx, sx, p.y, p.w, p.h, '#8a5a2e');
      for (let x = 2; x < p.w - 2; x += 5) {
        const h = hash(p.x * 0.7 + x);
        if (h < 0.45) R(ctx, sx + x, p.y + 7 + h * 10, 2, 2, h < 0.2 ? '#6b4220' : '#a8763f');
      }
      R(ctx, sx, p.y + p.h - 2, p.w, 2, '#6b4220');
      // Grass on top, dripping a little over the dirt
      R(ctx, sx, p.y, p.w, 5, '#4fbf37');
      for (let x = 0; x < p.w; x += 3) {
        const h = hash(p.x + x * 1.7);
        R(ctx, sx + x, p.y + 5, 3, Math.floor(h * 3), '#4fbf37');
        if (h > 0.55) R(ctx, sx + x, p.y - 2, 1, 2, '#62d84a');
      }
      R(ctx, sx, p.y, p.w, 1, '#7ae85c');
      if (s > 0.5) {  // a flower on some platforms
        const fx = sx + 6 + s * (p.w - 14);
        R(ctx, fx + 1, p.y - 5, 1, 5, '#3e9a2b'); R(ctx, fx, p.y - 7, 3, 3, s > 0.75 ? '#ff5d5d' : '#ffd84a');
      }
    },
  };

  // ═══════════════ LAVA DUNGEON (41-60) ═══════════════
  const lava = {
    id: 'lava', name: 'LAVA DUNGEON', bright: false,
    init(env) {
      const r = rng(env.level * 15485863 + 5);
      this.env = env;
      this.pillars = spread(r, env, 0.25, 230, 0.6, (x, r) => ({ x, torch: r() < 0.8, ph: r() * 10 }));
      this.chains = spread(r, env, 0.35, 260, 1.2, (x, r) => ({ x, len: 30 + r() * 90 }));
      this.tint = r() * 0.12;
    },
    background(ctx, camX, t) {
      const { W, groundY } = this.env;
      R(ctx, 0, 0, W, groundY, '#1c0d0b');
      // Brick wall (parallax), each brick a slightly different shade
      const bw = 32, bh = 16, f = 0.25, wx = camX * f;
      for (let row = 0; row * bh < groundY; row++) {
        const shift = (row % 2) * (bw / 2);
        const first = Math.floor((wx - shift) / bw) - 1;
        for (let col = first; (col * bw + shift) - wx < W + bw; col++) {
          const x = col * bw + shift - wx, h = hash(col * 31 + row * 17);
          const v = 38 + Math.floor(h * 14) + Math.floor(this.tint * 40);
          R(ctx, x + 1, row * bh + 1, bw - 2, bh - 2, `rgb(${v + 12},${Math.floor(v * 0.45)},${Math.floor(v * 0.38)})`);
          if (h > 0.92) R(ctx, x + 6, row * bh + 5, 8, 2, '#140807');                      // cracked brick
        }
      }
      // Lava glow rising from below
      ctx.fillStyle = vgrad(ctx, 'lavaglow', groundY - 140, groundY, [[0, 'rgba(255,80,0,0)'], [1, 'rgba(255,90,10,0.35)']]);
      ctx.fillRect(0, groundY - 140, W, 140);
      // Hanging chains
      for (const c of this.chains) {
        const sx = c.x - camX * 0.35;
        if (!visible(sx, 6, W)) continue;
        for (let y = 0; y < c.len; y += 6) R(ctx, sx + ((y / 6) % 2) * 1, y, 3, 5, '#3d3332');
      }
      // Stone pillars with torches (flickering flames and light)
      for (const pl of this.pillars) {
        const sx = pl.x - camX * 0.25;
        if (!visible(sx, 40, W)) continue;
        R(ctx, sx, 0, 26, groundY, '#2a1714');
        R(ctx, sx + 2, 0, 3, groundY, '#3a221d');
        for (let y = 20; y < groundY; y += 40) R(ctx, sx, y, 26, 2, '#160a08');
        if (!pl.torch) continue;
        const ty = groundY - 150, fl = Math.floor((t + pl.ph * 10) / 6) % 3;
        ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 0.2 + pl.ph);
        disc(ctx, sx + 13, ty - 10, 44, '#ff8c1a');
        ctx.globalAlpha = 1;
        R(ctx, sx + 10, ty, 6, 14, '#5a3a22');                                  // torch handle
        R(ctx, sx + 8, ty - 2, 10, 3, '#3d3332');
        R(ctx, sx + 9, ty - 9 - fl, 8, 8 + fl, '#ff6a00');                     // flame
        R(ctx, sx + 10 + (fl === 1 ? 1 : 0), ty - 13 - fl, 5, 7, '#ffb000');
        R(ctx, sx + 11, ty - 15 - fl * 2, 3, 4, '#fff1a0');
      }
      // Embers floating up
      for (let i = 0; i < 18; i++) {
        const x = ((hash(i + 3) * W * 1.4 - camX * 0.5) % (W + 30) + W + 30) % (W + 30);
        const y = groundY - ((t * (0.4 + hash(i) * 0.6) + hash(i + 40) * groundY) % groundY);
        R(ctx, x, y, 2, 2, hash(i + 8) < 0.5 ? '#ff9a2e' : '#ffd166');
      }
    },
    ground(ctx, camX, t) {
      const { W, groundY, floorH } = this.env;
      R(ctx, 0, groundY, W, floorH, '#2b1d1a');
      // Stone floor bricks with glowing lava cracks between some of them
      const bw = 40, off = -camX % bw;
      for (let row = 0; row < 3; row++) {
        const shift = row % 2 ? bw / 2 : 0;
        for (let x = off - bw + shift; x < W + bw; x += bw) {
          const id = Math.round((x - shift + camX) / bw) * 7 + row, h = hash(id);
          const y = groundY + 6 + row * 18;
          R(ctx, x + 1, y + 1, bw - 2, 16, h < 0.5 ? '#4a3430' : '#423028');
          if (h > 0.85) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.08 + id);
            R(ctx, x + bw - 2, y, 2, 18, '#ff6a00');
            ctx.globalAlpha = 1;
          }
        }
      }
      R(ctx, 0, groundY, W, 3, '#8a5a3c');
      R(ctx, 0, groundY + 3, W, 3, '#5a3a2a');
    },
    platform(ctx, p, sx) {
      R(ctx, sx, p.y, p.w, p.h, '#3a1a12');                         // mortar
      const bw = 16, bh = 7;
      for (let row = 0; row * bh < p.h; row++) {
        const shift = row % 2 ? bw / 2 : 0;
        for (let x = -shift; x < p.w; x += bw) {
          const h = hash(p.x + x * 3 + row * 11);
          const c = h < 0.15 ? '#6e2c1e' : h < 0.6 ? '#8f3a26' : '#a1452d';
          const x0 = Math.max(0, x + 1), x1 = Math.min(p.w, x + bw - 1);
          if (x1 > x0) R(ctx, sx + x0, p.y + row * bh + 1, x1 - x0, Math.min(bh - 1, p.h - row * bh - 1), c);
        }
      }
      R(ctx, sx, p.y, p.w, 2, '#c4603f');                            // worn top edge
    },
  };

  // ═══════════════ SKY (61-80) ═══════════════
  const sky = {
    id: 'sky', name: 'SKY KINGDOM', bright: true,
    init(env) {
      const r = rng(env.level * 2750159 + 9);
      this.env = env;
      this.sunX = env.W * (0.15 + r() * 0.25);
      this.banks = spread(r, env, 0.06, 120, 1, (x, r) => ({ x, s: 0.8 + r() * 1.2 }));
      this.puffs = spread(r, env, 0.18, 210, 1, (x, r) => ({ x, y: 60 + r() * 150, s: 0.5 + r() * 0.7, sp: 0.08 + r() * 0.12 }));
      this.birds = Array.from({ length: 4 }, () => ({ x: r() * env.W, y: 40 + r() * 100, sp: 0.3 + r() * 0.4 }));
    },
    background(ctx, camX, t) {
      const { W, groundY } = this.env;
      ctx.fillStyle = vgrad(ctx, 'sky', 0, groundY, [[0, '#5ab4ff'], [0.65, '#bfe3ff'], [1, '#f2f9ff']]);
      ctx.fillRect(0, 0, W, groundY);
      // Big bright sun
      const sx = this.sunX - camX * 0.01, sy = 70;
      ctx.globalAlpha = 0.2; disc(ctx, sx, sy, 70, '#fff8d0'); ctx.globalAlpha = 0.35; disc(ctx, sx, sy, 50, '#fff3a8'); ctx.globalAlpha = 1;
      disc(ctx, sx, sy, 32, '#ffe36b'); disc(ctx, sx - 5, sy - 5, 22, '#fff6c4');
      // Distant cloud banks along the horizon
      for (const b of this.banks) {
        const bx = b.x - camX * 0.06;
        if (!visible(bx, 80 * b.s, W)) continue;
        disc(ctx, bx, groundY - 30 * b.s, 34 * b.s, '#cfe5fb');
        disc(ctx, bx + 30 * b.s, groundY - 20 * b.s, 26 * b.s, '#c2dcf6');
      }
      // Floating clouds
      for (const c of this.puffs) {
        const cx = ((c.x - camX * 0.18 + t * c.sp) % (this.env.levelWidth * 0.18 + W + 200)) - 100;
        if (!visible(cx, 120 * c.s, W)) continue;
        disc(ctx, cx, c.y, 22 * c.s, '#ffffff'); disc(ctx, cx + 26 * c.s, c.y - 8 * c.s, 26 * c.s, '#ffffff'); disc(ctx, cx + 54 * c.s, c.y, 20 * c.s, '#ffffff');
        R(ctx, cx - 8 * c.s, c.y + 8 * c.s, 80 * c.s, 6 * c.s, '#e1efff');
      }
      // Birds
      for (const b of this.birds) {
        const bx = ((b.x + t * b.sp - camX * 0.1) % (W + 40) + W + 40) % (W + 40) - 20, flap = Math.floor(t / 10) % 2;
        R(ctx, bx, b.y + flap, 4, 2, '#4a5a6a'); R(ctx, bx + 4, b.y + 2, 2, 2, '#4a5a6a'); R(ctx, bx + 6, b.y + flap, 4, 2, '#4a5a6a');
      }
    },
    ground(ctx, camX) {
      const { W, groundY, floorH } = this.env;
      R(ctx, 0, groundY + 6, W, floorH, '#eef6ff');
      R(ctx, 0, groundY + 30, W, floorH, '#d8e9f8');
      R(ctx, 0, groundY + 48, W, floorH, '#c6dcf0');
      // Puffy cloud top, different bumps along the way
      const off = -camX % 26;
      for (let x = off - 26; x < W + 26; x += 26) {
        const id = Math.round((x + camX) / 26), h = hash(id);
        disc(ctx, x + 13, groundY + 8, 12 + Math.floor(h * 6), '#ffffff');
        if (h > 0.6) R(ctx, x + 6, groundY + 22, 14, 3, '#d8e9f8');
      }
      R(ctx, 0, groundY, W, 1, 'rgba(255,255,255,0.9)');
    },
    platform(ctx, p, sx) {
      // Fluffy cloud: flat top to stand on, puffs of different sizes along the sides and bottom.
      // A soft blue outline and shaded underside keep it visible against the pale sky.
      const n = Math.max(3, Math.round(p.w / 22));
      const puffs = [];
      for (let i = 0; i <= n; i++) puffs.push({ x: sx + (p.w * i) / n, r: 6 + Math.floor(hash(p.x + i * 13) * 6) });
      R(ctx, sx - 6, p.y - 1, p.w + 12, p.h + 2, '#8fb4d9');                  // outline
      for (const pf of puffs) disc(ctx, pf.x, p.y + p.h - 2, pf.r + 2, '#8fb4d9');
      for (const pf of puffs) disc(ctx, pf.x, p.y + p.h - 2, pf.r, '#d3e5f7');   // shaded underside
      R(ctx, sx - 4, p.y, p.w + 8, p.h - 2, '#ffffff');
      for (let i = 0; i < puffs.length; i += 2) disc(ctx, puffs[i].x, p.y + p.h - 5, Math.max(3, puffs[i].r - 3), '#ffffff');
      R(ctx, sx - 4, p.y, p.w + 8, 2, '#ffffff');
      R(ctx, sx + 6, p.y + p.h + 8, p.w - 12, 2, 'rgba(110,150,200,0.45)');   // soft shadow underneath
    },
  };

  // ═══════════════ SPACE (81+) ═══════════════
  const space = {
    id: 'space', name: 'DEEP SPACE', bright: false,
    init(env) {
      const r = rng(env.level * 32452843 + 13);
      this.env = env;
      this.stars = [0.05, 0.12, 0.25].map((f, li) => ({ f, list: spread(r, env, f, 14 + li * 10, 1.6, (x, r) => ({ x, y: r() * env.groundY, s: li === 2 ? 2 : 1, ph: r() * 6 })) }));
      const hue = Math.floor(r() * 360);
      this.planets = [
        { x: env.W * (0.55 + r() * 0.3), y: 90 + r() * 60, rad: 40 + r() * 22, c1: `hsl(${hue},55%,55%)`, c2: `hsl(${hue},45%,38%)`, ring: r() < 0.7, f: 0.03 },
        { x: env.W * (0.1 + r() * 0.3), y: 50 + r() * 50, rad: 12 + r() * 10, c1: `hsl(${(hue + 150) % 360},40%,70%)`, c2: `hsl(${(hue + 150) % 360},30%,50%)`, ring: false, f: 0.06 },
      ];
      this.nebula = Array.from({ length: 3 }, () => ({ x: r() * env.W * 1.5, y: r() * env.groundY, rad: 70 + r() * 90, c: r() < 0.5 ? '120,60,200' : '40,140,200' }));
    },
    background(ctx, camX, t) {
      const { W, groundY } = this.env;
      R(ctx, 0, 0, W, groundY, '#04050d');
      for (const n of this.nebula) {
        const nx = ((n.x - camX * 0.04) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25;
        const g = ctx.createRadialGradient(nx, n.y, 0, nx, n.y, n.rad);
        g.addColorStop(0, `rgba(${n.c},0.22)`); g.addColorStop(1, `rgba(${n.c},0)`);
        ctx.fillStyle = g; ctx.fillRect(nx - n.rad, n.y - n.rad, n.rad * 2, n.rad * 2);
      }
      for (const layer of this.stars) {
        for (const s of layer.list) {
          const sx = s.x - camX * layer.f;
          if (sx < -2 || sx > W + 2) continue;
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.05 + s.ph);
          R(ctx, sx, s.y, s.s, s.s, '#ffffff');
        }
      }
      ctx.globalAlpha = 1;
      for (const pl of this.planets) {
        const px = pl.x - camX * pl.f;
        if (pl.ring) R(ctx, px - pl.rad * 1.7, pl.y - 2, pl.rad * 3.4, 4, 'rgba(230,210,170,0.55)');
        disc(ctx, px, pl.y, pl.rad, pl.c2);
        disc(ctx, px - pl.rad * 0.18, pl.y - pl.rad * 0.18, pl.rad * 0.8, pl.c1);
        R(ctx, px - pl.rad * 0.5, pl.y - pl.rad * 0.3, pl.rad * 0.5, 3, 'rgba(255,255,255,0.25)');
        if (pl.ring) R(ctx, px - pl.rad * 1.7, pl.y + 1, pl.rad * 3.4, 2, 'rgba(255,240,200,0.7)');
      }
      // The old grid + pillars, faint, as the space station's frame
      ctx.fillStyle = 'rgba(245,196,0,0.03)';
      const off = (-camX * 0.3) % 32;
      for (let x = off; x < W; x += 32) ctx.fillRect(x, 0, 1, groundY);
    },
    ground(ctx, camX, t) {
      const { W, groundY, floorH } = this.env;
      R(ctx, 0, groundY, W, floorH, '#1a1e30');
      R(ctx, 0, groundY, W, 3, '#f5c400');
      R(ctx, 0, groundY + 3, W, 3, '#b8920a');
      ctx.fillStyle = 'rgba(245,196,0,0.07)';
      const off = (-camX) % 32;
      for (let x = off; x < W; x += 32) ctx.fillRect(x, groundY + 6, 16, floorH - 6);
      // Running lights along the floor
      const off2 = (-camX) % 96;
      for (let x = off2; x < W; x += 96) R(ctx, x + 40, groundY + 10, 4, 2, Math.floor(t / 20 + x) % 3 === 0 ? '#5dade2' : '#25405a');
    },
    platform(ctx, p, sx, t) {
      R(ctx, sx, p.y, p.w, p.h, '#1a2244');
      R(ctx, sx, p.y, p.w, 2, '#f5c400');
      ctx.fillStyle = 'rgba(245,196,0,0.15)';
      for (let tx = sx; tx < sx + p.w; tx += 16) ctx.fillRect(tx, p.y + 2, 8, p.h - 2);
      // A couple of blinking lights, placed differently on every platform
      const s = hash(p.x);
      for (let i = 0; i < 2; i++) {
        const lx = sx + 6 + hash(p.x + i * 9) * (p.w - 12);
        R(ctx, lx, p.y + p.h - 4, 3, 2, Math.floor(t / 15 + i + s * 10) % 4 === 0 ? '#ff5050' : '#5dade2');
      }
    },
  };

  const THEMES = [ice, grass, lava, sky, space];
  // 1-20 ice, 21-40 grass, 41-60 lava, 61-80 sky, 81+ space (Endless keeps space)
  function forLevel(level) {
    const i = Math.min(THEMES.length - 1, Math.max(0, Math.floor((Math.max(1, level) - 1) / 20)));
    return THEMES[i];
  }
  function setup(level, env) {
    gradCache = {};
    const th = forLevel(level);
    th.init({ ...env, level });
    return th;
  }
  return { forLevel, setup, THEMES };
})();
