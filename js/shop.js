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

// ─── PIXEL GUN DRAWING ───────────────────────────────────────────────
const gunCanvas = document.getElementById('gun-canvas');
const gctx = gunCanvas.getContext('2d');
gctx.imageSmoothingEnabled = false;
const GS = 4;

function drawGun(upgradeLevel) {
  gctx.clearRect(0, 0, gunCanvas.width, gunCanvas.height);
  const base   = '#888870';
  const barrel = '#ccccaa';
  const grip   = '#3d2b1f';
  const accent = upgradeLevel > 0 ? '#f5c400' : '#444450';
  const glow   = upgradeLevel > 3 ? '#2ecc71' : (upgradeLevel > 0 ? '#f5c400' : null);

  function gp(x, y, c) {
    gctx.fillStyle = c;
    gctx.fillRect(x * GS, y * GS, GS, GS);
  }

  // Handle / grip
  gp(1,3,grip); gp(1,4,grip); gp(2,3,grip); gp(2,4,grip);
  gp(1,5,grip); gp(2,5,grip);

  // Body
  gp(2,2,base); gp(3,2,base); gp(4,2,base);
  gp(2,3,base); gp(3,3,base); gp(4,3,base); gp(5,3,base);

  // Barrel
  gp(5,2,barrel); gp(6,2,barrel); gp(7,2,barrel);
  gp(8,2,barrel); gp(9,2,barrel); gp(10,2,barrel);
  gp(11,2,barrel); gp(12,2,barrel);

  // Accent stripe (grows with upgrades)
  if(upgradeLevel > 0) {
    const stripeLen = Math.min(upgradeLevel + 1, 8);
    for(let i = 0; i < stripeLen; i++) gp(5 + i, 1, accent);
  }

  // Glow tip
  if(glow) {
    gctx.fillStyle = glow + '66';
    gctx.fillRect(12 * GS, 0, GS * 2, GS * 4);
    gp(13, 2, glow);
  }

  // Trigger
  gp(3,4,base);

  // Upgrade indicator dots on body
  if(upgradeLevel > 0) {
    gp(3,2,accent);
    if(upgradeLevel > 2) gp(4,2,accent);
    if(upgradeLevel > 5) gp(5,3,accent);
  }
}

// ─── RENDER UI ───────────────────────────────────────────────────────
function render() {
  document.getElementById('level-display').textContent = campaign.level;
  document.getElementById('riels-display').textContent = campaign.riels;
  document.getElementById('hp-display').textContent = campaign.hp + ' / ' + campaign.maxHp;
  document.getElementById('lives-display').innerHTML = '&#9829;'.repeat(campaign.lives);
  document.getElementById('upgrades-display').textContent = campaign.upgradeCount;

  const cost = campaign.upgradeCost;
  const canAfford = campaign.riels >= cost;

  document.getElementById('dmg-current').textContent = campaign.gunDamage + ' DMG';
  document.getElementById('dmg-next').textContent = (campaign.gunDamage + 2) + ' DMG';
  document.getElementById('cost-display').textContent = cost;

  const btn = document.getElementById('btn-buy');
  const card = document.getElementById('item-card');

  btn.disabled = !canAfford;
  card.className = 'item-card ' + (canAfford ? 'affordable' : 'cant-afford');

  // Upgrade pips (show last 20 upgrades max)
  const pips = document.getElementById('upgrade-pips');
  pips.innerHTML = '';
  const shown = Math.min(campaign.upgradeCount, 20);
  for(let i = 0; i < 20; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip' + (i < shown ? ' filled' : '');
    pips.appendChild(pip);
  }

  drawGun(campaign.upgradeCount);
}

// ─── BUY UPGRADE ─────────────────────────────────────────────────────
function buyUpgrade() {
  const upgradeSound = new Audio('assets/audio/sfx/upgrade.ogg');
  upgradeSound.volume = 0.55 * window.RielVolume.sfx();
  upgradeSound.play().catch(() => {});
  if(campaign.riels < campaign.upgradeCost) {
    showToast('NOT ENOUGH RIELS!');
    return;
  }

  campaign.riels       -= campaign.upgradeCost;
  campaign.gunDamage   += 2;
  campaign.upgradeCount++;
  campaign.upgradeCost += 2; // base level increment (boss increments handled in game.html)

  // Flash
  const flash = document.getElementById('purchase-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 300);

  saveCampaign();
  render();
  showToast('+2 DAMAGE! GUN NOW ' + campaign.gunDamage + ' DMG');
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
  campaign.lives = 3;
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
