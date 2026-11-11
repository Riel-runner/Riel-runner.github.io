// Builds the "how far did this campaign get" summary: a 10-zone progress bar plus
// a stats grid. Shared by the death screen (game.html) and the fallen-campaign
// details popup (level-select.html) so both always show the same thing.
// Styles live in css/run-summary.css.
window.RielRunSummary = (function () {
  const TOTAL_LEVELS = 100;
  const ZONES = 10; // 10 levels per zone, boss on every 10th level

  // Stats added in V6 are missing from older saves: show a dash instead of 0.
  const has = v => typeof v === 'number' && !isNaN(v);
  const num = v => has(v) ? Math.floor(v).toLocaleString('en-US') : '—';

  function formatTime(ms) {
    if (!has(ms)) return '—';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function accuracy(c) {
    if (!has(c.shotsFired) || c.shotsFired === 0) return '—';
    return Math.round((c.shotsHit || 0) / c.shotsFired * 100) + '%';
  }

  function stats(c) {
    const level = c.level || 1;
    const M = window.RielModes, mode = M ? M.get(c) : null;
    const prog = M ? M.progress(c) : { total: TOTAL_LEVELS, done: level - 1 };
    // Stage label/value depend on the campaign type (levels, bosses or waves).
    const reached = !mode || mode.id === 'normal' || mode.id === 'nightmare' || mode.id === 'timeattack'
      ? ['LEVEL REACHED', level + ' / ' + prog.total]
      : mode.id === 'bossrush' ? ['BOSS REACHED', Math.max(1, Math.floor(level / 10)) + ' / 10']
      : ['WAVE REACHED', String(level)];
    return [
      reached,
      [mode && mode.id === 'bossrush' ? 'BOSSES CLEARED' : mode && mode.id === 'endless' ? 'WAVES CLEARED' : 'LEVELS CLEARED', String(prog.done)],
      ['ENEMIES KILLED', num(c.enemiesKilled)],
      ['BOSSES BEATEN',  (c.bossesBeaten || 0) + (mode && mode.id === 'endless' ? '' : ' / ' + ZONES)],
      ['RIELS EARNED',   has(c.rielsEarned) ? num(c.rielsEarned) + ' KHR' : '—'],
      ['UPGRADES',       num(c.upgradeCount || 0)],
      ['GUN DAMAGE',     num(c.gunDamage)],
      ['MAX HP',         num(c.maxHp)],
      ['ACCURACY',       accuracy(c)],
      [mode && mode.timed ? 'TIME' : 'TIME PLAYED', formatTime(c.playTimeMs)],
    ];
  }

  function render(c) {
    const level = c.level || 1;
    const M = window.RielModes, mode = M ? M.get(c) : null;
    const prog = M ? M.progress(c) : { total: TOTAL_LEVELS, done: level - 1 };
    const statsHtml = stats(c).map(([label, value]) =>
      `<div class="rs-stat"><div class="rs-stat-label">${label}</div><div class="rs-stat-value">${value}</div></div>`
    ).join('');
    const typeTag = mode && mode.id !== 'normal'
      ? `<span class="rs-type" style="color:${mode.color}">${mode.name}</span>` : '';

    // Endless has no finish line: show the wave reached and the best wave.
    if (prog.total == null) {
      const best = M.records().endless;
      return `
      <div class="rs-progress">
        <div class="rs-progress-head">
          <span>${c.dead ? 'FELL ON WAVE' : 'ON WAVE'}</span>
          <span class="rs-level">${level}</span>
        </div>
        <div class="rs-progress-foot">${typeTag || '<span></span>'}<span>BEST WAVE: ${best || level}</span></div>
      </div>
      <div class="rs-stats">${statsHtml}</div>`;
    }

    // 10 segments across the whole run (each = a tenth of it); red tick where it ended.
    const total = prog.total, done = prog.done, seg = total / ZONES;
    const percent = Math.round(done / total * 100);
    const at = Math.min(ZONES - 1, Math.floor(done / seg));        // segment where the run is/ended
    let zonesHtml = '';
    for (let i = 0; i < ZONES; i++) {
      const fill = Math.round(Math.max(0, Math.min(1, (done - i * seg) / seg)) * 100);
      const isDeathZone = !c.completed && i === at;
      zonesHtml +=
        `<div class="rs-zone${fill === 100 ? ' rs-cleared' : ''}${isDeathZone ? ' rs-death' : ''}" title="${i + 1} / ${ZONES}">` +
          `<div class="rs-zone-fill" style="width:${fill}%"></div>` +
          (isDeathZone ? `<div class="rs-marker" style="left:${Math.min(95, ((done - at * seg) / seg) * 100 + 5)}%"></div>` : '') +
        `</div>`;
    }
    const bossRush = mode && mode.id === 'bossrush';
    const shown = bossRush ? Math.max(1, Math.floor(level / 10)) : level;
    const head = c.completed ? 'COMPLETED' : (c.dead ? 'FELL ON ' : 'NOW ON ') + (bossRush ? 'BOSS' : 'LEVEL');

    return `
      <div class="rs-progress">
        <div class="rs-progress-head">
          <span>${head}</span>
          <span class="rs-level">${c.completed ? (bossRush ? 10 : total) : shown}<small> / ${bossRush ? 10 : total}</small></span>
        </div>
        <div class="rs-track">${zonesHtml}</div>
        <div class="rs-progress-foot">
          ${typeTag || `<span>ZONE ${Math.min(ZONES, Math.ceil(level / 10))} OF ${ZONES}</span>`}
          <span>${percent}% COMPLETE</span>
        </div>
      </div>
      <div class="rs-stats">${statsHtml}</div>`;
  }

  return { render, stats };
})();
