// Enemy sprite (shared by the game and the title-screen battle): a round blob on two
// legs. The body is 12 x 16 pixels and fills the enemy's hitbox, so the same art
// scales to every size (regular, tank 1.5x, boss 2x). Each type gets its own colours
// and accessory. Walking: a 4-step leg cycle (left foot up, both down, right foot up,
// both down).
window.RielEnemySprite = (function () {
  // B = body, E = eye, 1-3 = body fading toward pink/white (bottom rim), L = leg/foot.
  const BODY = [
    '...BBBBBB...',
    '..BBBBBBBB..',
    '.BBBBBBBBBB.',
    'BBBEEBBEEBBB',
    'BBBEEBBEEBBB',
    'BBBBBBBBBBBB',
    'BBBBBBBBBBBB',
    'BBBBBBBBBBBB',
    'BBBBBBBBBBBB',
    '1BBBBBBBBBB1',
    '211111111112',
    '322222222223',
    '.3333333333.',
  ];
  // Legs (rows 13-15) for each walk step. 0 = standing (both feet down).
  const LEGS = [
    ['...L....L...', '...L....L...', '..LL....LL..'],   // both down
    ['...L....L...', '..LL....L...', '........LL..'],   // left foot up
    ['...L....L...', '...L....L...', '..LL....LL..'],   // both down
    ['...L....L...', '...L....LL..', '..LL........'],   // right foot up
  ];
  const ROWS = 16, COLS = 12;
  // Legs: dark grey rather than black so they still show on the game's dark navy background.
  const LEG = '#4a4a5e';

  // Mix a #rrggbb colour toward white by t (0..1).
  function tint(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const ch = s => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  const shadeCache = {};
  function shades(body) {
    return shadeCache[body] || (shadeCache[body] = { 1: tint(body, 0.08), 2: tint(body, 0.2), 3: tint(body, 0.6) });
  }

  // Looks per enemy type. acc = accessory drawn on top (see ACCESSORIES).
  const LOOKS = {
    normal:   { body: '#ed1c24', eye: '#fff200' },
    runner:   { body: '#f39c12', eye: '#ffffff', acc: 'headband' },
    spitter:  { body: '#27ae60', eye: '#fff200', acc: 'mouth' },
    bomber:   { body: '#3b3b48', eye: '#ff4136', acc: 'fuse' },
    shielder: { body: '#7f8c8d', eye: '#5dade2', acc: 'helmet' },
    medic:    { body: '#dfe6e9', eye: '#2e86de', acc: 'cross' },
    tank:     { body: '#6c2eb9', eye: '#fff200', acc: 'brute' },
    boss:     { body: '#2e86de', eye: '#ffffff', acc: 'crown' },
  };

  // Accessories: lists of [col, row, colour] in the same 12x16 grid (rows < 0 sit above
  // the head). opts: { facing, glow, spark } for animated bits.
  const ACCESSORIES = {
    headband: o => {
      const px = [];
      for (let c = 1; c <= 10; c++) px.push([c, 2, '#c0392b']);    // red sweatband
      const tail = o.facing > 0 ? -1 : 12;           // tails flow out behind
      px.push([tail, 2, '#c0392b'], [tail + (o.facing > 0 ? -1 : 1), 3, '#c0392b']);
      return px;
    },
    mouth: o => {
      const col = o.glow ? '#c8ffd8' : '#145a32';
      return [[4, 6, col], [5, 6, col], [6, 6, col], [7, 6, col], [5, 7, col], [6, 7, col]];
    },
    fuse: o => [[6, -1, '#888870'], [7, -2, '#888870'], [7, -3, o.spark ? '#f5c400' : '#e74c3c']],
    helmet: () => {
      const px = [];
      for (let c = 3; c <= 8; c++) px.push([c, 0, '#bdc3c7']);
      for (let c = 2; c <= 9; c++) px.push([c, 1, '#bdc3c7']);
      for (let c = 1; c <= 10; c++) px.push([c, 2, '#95a5a6']);     // visor rim over the eyes
      return px;
    },
    cross: () => [[5, 6, '#e74c3c'], [6, 6, '#e74c3c'], [4, 7, '#e74c3c'], [5, 7, '#e74c3c'], [6, 7, '#e74c3c'], [7, 7, '#e74c3c'], [5, 8, '#e74c3c'], [6, 8, '#e74c3c']],
    brute: () => {
      const px = [[2, 2, '#2a0f4a'], [3, 2, '#2a0f4a'], [4, 2, '#2a0f4a'], [7, 2, '#2a0f4a'], [8, 2, '#2a0f4a'], [9, 2, '#2a0f4a']]; // angry brows
      px.push([-1, 4, '#bdc3c7'], [-1, 5, '#bdc3c7'], [12, 4, '#bdc3c7'], [12, 5, '#bdc3c7']);                                  // shoulder spikes
      return px;
    },
    crown: () => {
      const g = '#f5c400', r = '#e74c3c';
      const px = [];
      for (let c = 3; c <= 8; c++) px.push([c, -1, g]);
      px.push([3, -2, g], [5, -2, r], [6, -2, r], [8, -2, g], [3, -3, g], [8, -3, g], [5, -3, g], [6, -3, g]);
      px.push([2, 2, '#1b4f72'], [3, 2, '#1b4f72'], [8, 2, '#1b4f72'], [9, 2, '#1b4f72']);   // brows
      return px;
    },
  };

  // Draw an enemy filling the box (x, y, w, h). opts:
  //   kind, step (0-3 walk step), facing (1 right / -1 left), body (override colour,
  //   e.g. white flash), glow (spitter mouth), spark (bomber fuse)
  function draw(ctx, x, y, w, h, opts = {}) {
    const look = LOOKS[opts.kind] || LOOKS.normal;
    const body = opts.body || look.body;
    const sh = shades(body);
    const sx = w / COLS, sy = h / ROWS;
    // Pixel edges are rounded so neighbouring pixels never leave seams.
    const X = c => Math.round(x + c * sx), Y = r => Math.round(y + r * sy);
    const cell = (c, r, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(X(c), Y(r), X(c + 1) - X(c), Y(r + 1) - Y(r));
    };
    const look2 = opts.facing > 0 ? 1 : opts.facing < 0 ? -1 : 0;   // eyes look toward the player
    BODY.forEach((row, r) => {
      // Draw runs of the same colour as one rectangle
      let c = 0;
      while (c < COLS) {
        const ch = row[c];
        if (ch === '.' || ch === 'E') { c++; continue; }
        let end = c;
        while (end + 1 < COLS && (row[end + 1] === ch || (ch === 'B' && row[end + 1] === 'E'))) end++;
        ctx.fillStyle = ch === 'B' ? body : sh[ch];
        ctx.fillRect(X(c), Y(r), X(end + 1) - X(c), Y(r + 1) - Y(r));
        c = end + 1;
      }
      for (let k = 0; k < COLS; k++) if (row[k] === 'E') cell(Math.min(COLS - 1, Math.max(0, k + look2)), r, look.eye);
    });
    const legs = LEGS[(opts.step || 0) % 4];
    legs.forEach((row, i) => {
      for (let c = 0; c < COLS; c++) if (row[c] === 'L') cell(c, 13 + i, LEG);
    });
    if (look.acc) for (const [c, r, color] of ACCESSORIES[look.acc]({ facing: opts.facing || 1, glow: opts.glow, spark: opts.spark })) cell(c, r, color);
  }

  // Advance a walk cycle: call once per frame with how far the enemy moved (px).
  // Faster movers step faster. Returns the step to draw (0 = standing when still).
  function walkStep(state, moved, speedRef = 3) {
    if (Math.abs(moved) < 0.05) { state.walk = 0; return 0; }
    state.walk = (state.walk || 0) + Math.abs(moved) / speedRef;
    return Math.floor(state.walk / 6) % 4;       // a new step every ~6 frames at normal speed
  }

  return { draw, walkStep, LOOKS, tint };
})();
