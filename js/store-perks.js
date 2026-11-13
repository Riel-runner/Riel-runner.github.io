// UPGRADES tab of the gem shop (store.html): gem upgrades that count in every campaign,
// 5 tiers each. Rules and data: js/perks.js. Uses render() and showToast() from js/store.js.
window.StorePerks = (function () {
  const K = window.RielPerks;
  const listEl = document.getElementById('perk-list');

  function card(def) {
    const t = K.tier(def.id), maxed = t >= K.MAX_TIER, cost = K.nextCost(def.id);
    const gems = window.RielCosmetics.gems();
    const el = document.createElement('div');
    el.className = 'ability-card perk-card owned' + (maxed ? ' awakened' : '');
    el.dataset.id = def.id;
    let pips = '';
    for (let i = 0; i < K.MAX_TIER; i++) pips += '<i' + (i < t ? ' class="on" style="background:' + def.color + '"' : '') + '></i>';
    el.innerHTML =
      '<div class="ab-head"><canvas width="40" height="40"></canvas><div>' +
        '<div class="ab-name">' + def.name + '</div>' +
        '<div class="ab-tags"><span class="ab-level">TIER ' + t + ' / ' + K.MAX_TIER + '</span></div></div></div>' +
      '<div class="perk-pips">' + pips + '</div>' +
      '<div class="ab-desc">NOW: ' + def.text(t) + '</div>' +
      '<div class="ab-trait' + (maxed ? ' on' : '') + '">' + (maxed ? '&#9733; MAXED OUT' : 'NEXT: ' + def.text(t + 1)) + '</div>' +
      '<div class="ab-buttons">' + (maxed
        ? '<button class="store-btn is-equipped perk-buy" disabled>MAXED</button>'
        : '<button class="store-btn is-buy perk-buy"' + (gems < cost ? ' disabled' : '') + '>BUY TIER ' + (t + 1) + ' &middot; ' + cost + ' GEMS</button>') +
      '</div>';
    K.drawIcon(el.querySelector('canvas').getContext('2d'), def, 4, 4, 4);
    const btn = el.querySelector('.perk-buy:not([disabled])');
    if (btn) btn.addEventListener('click', () => {
      const r = K.buy(def.id);
      if (!r.ok) { showToast(r.reason + '!'); return; }
      playSfx('assets/audio/sfx/upgrade.ogg', 0.55);
      flash();
      document.getElementById('gem-count').textContent = window.RielCosmetics.gems().toLocaleString('en-US');
      renderPanel();
      showToast(def.name + (r.maxed ? ' MAXED OUT!' : ' TIER ' + r.tier + '!'));
    });
    return el;
  }

  function renderPanel() {
    listEl.innerHTML = '';
    for (const def of K.LIST) listEl.appendChild(card(def));
  }

  function playSfx(src, vol) {
    const a = new Audio(src);
    a.volume = vol * window.RielVolume.sfx();
    a.play().catch(() => {});
  }
  function flash() {
    const f = document.getElementById('purchase-flash');
    f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 300);
  }

  return { render: renderPanel };
})();
render();   // store.js rendered before this file loaded: draw the tab now if it's open
