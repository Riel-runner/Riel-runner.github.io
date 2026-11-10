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
    return [
      ['LEVEL REACHED',  level + ' / ' + TOTAL_LEVELS],
      ['LEVELS CLEARED', String(level - 1)],
      ['ENEMIES KILLED', num(c.enemiesKilled)],
      ['BOSSES BEATEN',  (c.bossesBeaten || 0) + ' / ' + ZONES],
      ['RIELS EARNED',   has(c.rielsEarned) ? num(c.rielsEarned) + ' KHR' : '—'],
      ['UPGRADES',       num(c.upgradeCount || 0)],
      ['GUN DAMAGE',     num(c.gunDamage)],
      ['MAX HP',         num(c.maxHp)],
      ['ACCURACY',       accuracy(c)],
      ['TIME PLAYED',    formatTime(c.playTimeMs)],
    ];
  }

  function render(c) {
    const level   = c.level || 1;
    const cleared = level - 1;                       // died on `level`, so it wasn't cleared
    const zone    = Math.min(ZONES, Math.ceil(level / 10));
    const percent = Math.round(cleared / TOTAL_LEVELS * 100);

    let zonesHtml = '';
    for (let i = 0; i < ZONES; i++) {
      const fill = Math.max(0, Math.min(10, cleared - i * 10)) * 10; // % of this zone cleared
      const isDeathZone = i === zone - 1;
      zonesHtml +=
        `<div class="rs-zone${fill === 100 ? ' rs-cleared' : ''}${isDeathZone ? ' rs-death' : ''}" title="ZONE ${i + 1}">` +
          `<div class="rs-zone-fill" style="width:${fill}%"></div>` +
          (isDeathZone ? `<div class="rs-marker" style="left:${((level - 1) % 10) * 10 + 5}%"></div>` : '') +
        `</div>`;
    }

    const statsHtml = stats(c).map(([label, value]) =>
      `<div class="rs-stat"><div class="rs-stat-label">${label}</div><div class="rs-stat-value">${value}</div></div>`
    ).join('');

    return `
      <div class="rs-progress">
        <div class="rs-progress-head">
          <span>FELL ON LEVEL</span>
          <span class="rs-level">${level}<small> / ${TOTAL_LEVELS}</small></span>
        </div>
        <div class="rs-track">${zonesHtml}</div>
        <div class="rs-progress-foot">
          <span>ZONE ${zone} OF ${ZONES}</span>
          <span>${percent}% COMPLETE</span>
        </div>
      </div>
      <div class="rs-stats">${statsHtml}</div>`;
  }

  return { render, stats };
})();
