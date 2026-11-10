// ─── LOAD CAMPAIGN ───────────────────────────────────────────────────
let campaign;
try {
  campaign = JSON.parse(localStorage.getItem('activeCampaign'));
} catch { campaign = null; }

if (!campaign) {
  // Fallback defaults if somehow landed here directly
  campaign = {
    level: 1, riels: 0, hp: 150, maxHp: 150,
    lives: 3, gunDamage: 2, upgradeCount: 0,
    upgradeCost: 4, npcCount: 5, bossesBeaten: 0
  };
}

const UPG = window.RielUpgrades;
UPG.ensure(campaign); // migrate older saves (gun upgrades only) to per-upgrade levels

// ─── PIXEL ICONS (8x8; '#' = main colour, '+' = shade) ───────────────
const ICONS = {
  damage:   { main: '#f5c400', shade: '#888870', map: [
    '........', '#######+', '######..', '##.#....', '##......', '##......', '........', '........'] },
  armor:    { main: '#9fb4d8', shade: '#3b5b92', map: [
    '.######.', '#++++++#', '#++##++#', '#+####+#', '#++##++#', '.#++++#.', '..#++#..', '...##...'] },
  speed:    { main: '#2ecc71', shade: '#1a7a40', map: [
    '....##..', '...##...', '..##....', '.######.', '....##..', '...##...', '..##....', '.#......'] },
  maxhp:    { main: '#e74c3c', shade: '#8e1a10', map: [
    '.##..##.', '#+######', '#+######', '########', '.######.', '..####..', '...##...', '........'] },
  firerate: { main: '#f5c400', shade: '#e67e22', map: [
    '........', '##.##.##', '++.++.++', '++.++.++', '++.++.++', '++.++.++', '........', '........'] },
  ammo:     { main: '#c8c8b0', shade: '#f5c400', map: [
    '..####..', '..#++#..', '..####..', '..#++#..', '..####..', '..#++#..', '..####..', '..####..'] },
  reload:   { main: '#5dade2', shade: '#21618c', map: [
    '..####..', '.#....#.', '#......#', '#....###', '#.....#.', '.#......', '..####..', '........'] },
};

function drawIcon(canvas, key) {
  const icon = ICONS[key];
  const ctx = canvas.getContext('2d');
  const px = canvas.width / 8;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  icon.map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = ch === '#' ? icon.main : icon.shade;
    ctx.fillRect(x * px, y * px, px, px);
  }));
}

// ─── RENDER UI ───────────────────────────────────────────────────────
const listEl = document.getElementById('upgrade-list');

// Build one card per upgrade once; render() just updates them.
const cards = {};
UPG.LIST.forEach(u => {
  const card = document.createElement('div');
  card.className = 'upg-card';
  card.innerHTML = `
    <div class="upg-head">
      <canvas class="upg-icon" width="32" height="32"></canvas>
      <div class="upg-title">
        <div class="item-name">${u.name}</div>
        <div class="upg-level"></div>
      </div>
    </div>
    <div class="item-desc">${u.desc}</div>
    <div class="dmg-preview">
      <span class="dmg-current"></span>
      <span class="dmg-arrow">&#9658;</span>
      <span class="dmg-next"></span>
    </div>
    <div class="upgrade-pips"></div>
    <div class="upg-foot">
      <div class="upg-cost"><span class="cost-amount"></span> <span class="cost-unit">KHR</span></div>
      <button class="btn-buy" data-key="${u.key}">BUY</button>
    </div>`;
  drawIcon(card.querySelector('.upg-icon'), u.key);
  card.querySelector('.btn-buy').addEventListener('click', () => buyUpgrade(u.key));
  listEl.appendChild(card);
  cards[u.key] = card;
});

// Current (step 0) or next-level (step 1) value text for an upgrade card.
function previewText(u, lvl, step) {
  return u.live ? u.live(campaign, step) : u.format(u.value(lvl + step));
}

function render() {
  document.getElementById('level-display').textContent = campaign.level;
  document.getElementById('riels-display').textContent = campaign.riels;
  document.getElementById('hp-display').textContent = campaign.hp + ' / ' + campaign.maxHp;
  // Lives only refill after boss levels now, so show lost ones as empty hearts.
  const lives = Math.max(0, Math.min(3, campaign.lives));
  document.getElementById('lives-display').innerHTML = '&#9829;'.repeat(lives) + '&#9825;'.repeat(3 - lives);
  const totalLevels = UPG.LIST.reduce((sum, u) => sum + UPG.level(campaign, u.key), 0);
  document.getElementById('upgrades-display').textContent = totalLevels + ' / ' + UPG.LIST.length * UPG.MAX_LEVEL;

  UPG.LIST.forEach(u => {
    const card  = cards[u.key];
    const lvl   = UPG.level(campaign, u.key);
    const maxed = lvl >= UPG.MAX_LEVEL;
    const cost  = UPG.cost(u.key, lvl);
    const canAfford = !maxed && campaign.riels >= cost;

    card.className = 'upg-card ' + (maxed ? 'maxed' : canAfford ? 'affordable' : 'cant-afford');
    card.querySelector('.upg-level').textContent = maxed ? 'MAX LEVEL' : 'LV ' + lvl + ' / ' + UPG.MAX_LEVEL;
    card.querySelector('.dmg-current').textContent = previewText(u, lvl, 0);
    card.querySelector('.dmg-arrow').hidden = maxed;
    card.querySelector('.dmg-next').textContent = maxed ? '' : previewText(u, lvl, 1);
    card.querySelector('.upgrade-pips').innerHTML =
      Array.from({ length: UPG.MAX_LEVEL }, (_, i) => `<div class="pip${i < lvl ? ' filled' : ''}"></div>`).join('');
    card.querySelector('.upg-cost').hidden = maxed;
    card.querySelector('.cost-amount').textContent = cost;

    const btn = card.querySelector('.btn-buy');
    btn.disabled = !canAfford;
    btn.classList.toggle('maxed-btn', maxed);
    btn.textContent = maxed ? 'MAXED' : 'BUY';
  });
}

// ─── BUY UPGRADE ─────────────────────────────────────────────────────
function buyUpgrade(key) {
  const u = UPG.BY_KEY[key];
  const lvl = UPG.level(campaign, key);
  if (lvl >= UPG.MAX_LEVEL) { showToast(u.name + ' IS MAXED!'); return; }
  const cost = UPG.cost(key, lvl);
  if (campaign.riels < cost) { showToast('NOT ENOUGH RIELS!'); return; }

  const upgradeSound = new Audio('assets/audio/sfx/upgrade.ogg');
  upgradeSound.volume = 0.55 * window.RielVolume.sfx();
  upgradeSound.play().catch(() => {});

  campaign.riels -= cost;
  campaign.upgrades[key] = lvl + 1;
  campaign.upgradeCount = (campaign.upgradeCount || 0) + 1; // total purchases (shown in stats)
  // Damage and Max HP are stored directly on the campaign; the rest are read from levels in game.js.
  if (key === 'damage') campaign.gunDamage += 2;
  if (key === 'maxhp')  { campaign.maxHp += 15; campaign.hp = campaign.maxHp; }

  // Flash
  const flash = document.getElementById('purchase-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 300);

  saveCampaign();
  render();
  const now = previewText(u, lvl + 1, 0);
  showToast(lvl + 1 >= UPG.MAX_LEVEL ? u.name + ' MAXED! ' + now : u.name + ' UP! ' + now);
}

// ─── SAVE & CONTINUE ─────────────────────────────────────────────────
function saveCampaign() {
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));

  // Also update in campaigns array
  const idx = parseInt(localStorage.getItem('activeCampaignIdx'));
  if(!isNaN(idx)) {
    try {
      const campaigns = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || [];
      if(campaigns[idx]) {
        campaigns[idx] = { ...campaigns[idx], ...campaign, lastPlayed: Date.now() };
        localStorage.setItem('rielrunner_campaigns', JSON.stringify(campaigns));
      }
    } catch {}
  }

  // Track best riels ever
  const best = parseInt(localStorage.getItem('bestRiels') || '0');
  if(campaign.riels > best) localStorage.setItem('bestRiels', campaign.riels);
}

function continueToGame() {
  // Advance to next level
  campaign.level++;
  // Start every level at full HP. Lives are NOT reset here: they only refill
  // to 3 after beating a boss level (handled in game.js when the level is cleared).
  campaign.hp = campaign.maxHp;
  // Write to localStorage BEFORE redirect so game.html reads the correct level
  localStorage.setItem('activeCampaign', JSON.stringify(campaign));
  const idx = parseInt(localStorage.getItem('activeCampaignIdx'));
  if (!isNaN(idx)) {
    try {
      const all = JSON.parse(localStorage.getItem('rielrunner_campaigns')) || [];
      if (all[idx]) {
        all[idx] = { ...all[idx], ...campaign, lastPlayed: Date.now() };
        localStorage.setItem('rielrunner_campaigns', JSON.stringify(all));
      }
    } catch {}
  }
  window.location.href = 'game.html';
}

// ─── TOAST ───────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── INIT ────────────────────────────────────────────────────────────
render();

// Shop music starts from the beginning whenever the shop page opens and loops.
const shopMusic = new Audio('assets/audio/music/shop-music.flac');
shopMusic.loop = true;
window.RielVolume.bindMusic(shopMusic, 0.50); // Upgrade and click sound effects are set slightly louder.
shopMusic.play().catch(() => {});
window.addEventListener('pointerdown', () => shopMusic.play().catch(() => {}), { once: true });
window.addEventListener('keydown', () => shopMusic.play().catch(() => {}), { once: true });
