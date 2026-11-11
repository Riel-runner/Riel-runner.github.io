// achievements.html: every achievement by category, with progress bars for the
// counting ones. Opening the page marks new unlocks as seen (clears the menu badge).
(function () {
  const A = window.RielAchievements;
  A.sync();                       // pick up anything earned outside the game
  const list = A.status();
  const fmt = n => n.toLocaleString('en-US');

  const done = list.filter(a => a.unlocked);
  const gemsEarned = done.reduce((s, a) => s + a.gems, 0);
  const gemsTotal = list.reduce((s, a) => s + a.gems, 0);
  document.getElementById('ach-count').textContent = done.length + ' / ' + list.length;
  document.getElementById('ach-gems').textContent = fmt(gemsEarned) + ' / ' + fmt(gemsTotal);
  document.getElementById('ach-total-bar').style.width = (100 * done.length / list.length) + '%';

  const card = a => {
    const cls = 'ach-card' + (a.unlocked ? ' unlocked' : '') + (a.isNew ? ' new' : '');
    const bar = a.stat && !a.unlocked
      ? '<div class="ach-bar"><div class="ach-bar-fill" style="width:' + (100 * a.progress / a.goal) + '%"></div></div>' +
        '<div class="ach-progress">' + fmt(a.progress) + ' / ' + fmt(a.goal) + '</div>'
      : '';
    const state = a.unlocked
      ? '<div class="ach-state">' + (a.isNew ? 'NEW! ' : '') + 'UNLOCKED ' + new Date(a.at).toLocaleDateString() + '</div>'
      : '';
    return '<div class="' + cls + '" data-id="' + a.id + '">' +
      '<div class="ach-top"><div class="ach-name">' + a.name + '</div><div class="ach-reward">+' + fmt(a.gems) + ' GEMS</div></div>' +
      '<div class="ach-desc">' + a.desc + '</div>' + bar + state + '</div>';
  };

  document.getElementById('ach-list').innerHTML = A.CATEGORIES.map(cat => {
    const items = list.filter(a => a.cat === cat);
    const got = items.filter(a => a.unlocked).length;
    return '<div class="section"><div class="section-label">&#9632; ' + cat +
      ' <span class="ach-cat-count">' + got + ' / ' + items.length + '</span></div>' +
      items.map(card).join('') + '</div>';
  }).join('');

  A.markSeen();
})();
