const MAX_SLOTS = 6;
const STORAGE_KEY = 'rielrunner_campaigns';

// ─── DATA ────────────────────────────────────────────────────────────
function getCampaigns() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveCampaigns(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function getDefaultCampaignState(name) {
  return {
    id: Date.now(),
    name: name.toUpperCase(),
    level: 1,
    riels: 0,
    hp: 150,
    maxHp: 150,
    lives: 3,
    gunDamage: 2,
    upgradeCount: 0,
    upgradeCost: 4,
    npcCount: 5,
    bossesBeaten: 0,
    createdAt: Date.now(),
    lastPlayed: Date.now()
  };
}

// ─── RENDER ──────────────────────────────────────────────────────────
function renderSlots() {
  const campaigns = getCampaigns();
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '';

  // Existing campaign slots
  campaigns.forEach((c, i) => {
    const progress = Math.round((c.level - 1) / 100 * 100);
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.innerHTML = `
      <div class="slot-number">SLOT ${i+1}</div>
      <div>
        <div class="slot-name">${escHtml(c.name)}</div>
        <div class="slot-stats">
          <div class="slot-stat">LEVEL <span>${c.level} / 100</span></div>
          <div class="slot-stat">RIELS <span>${c.riels} KHR</span></div>
          <div class="slot-stat">GUN DMG <span>${c.gunDamage}</span></div>
          <div class="slot-stat">LIVES <span>${'&#9829; '.repeat(c.lives).trim()}</span></div>
        </div>
        <div class="slot-progress-bar">
          <div class="slot-progress-fill" style="width:${progress}%"></div>
        </div>
        <div class="slot-progress-label">${progress}% COMPLETE</div>
      </div>
      <button class="slot-delete" data-idx="${i}">&#10006; DELETE</button>
    `;
    card.addEventListener('click', (e) => {
      if(e.target.closest('.slot-delete')) return;
      loadCampaign(i);
    });
    card.querySelector('.slot-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(i);
    });
    grid.appendChild(card);
  });

  // Empty slot (add new) — only if under max
  if(campaigns.length < MAX_SLOTS) {
    const empty = document.createElement('div');
    empty.className = 'slot-card empty';
    empty.innerHTML = `
      <span class="empty-icon">&#43;</span>
      <span class="empty-label">NEW CAMPAIGN</span>
    `;
    empty.addEventListener('click', openNewModal);
    grid.appendChild(empty);
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── LOAD CAMPAIGN ───────────────────────────────────────────────────
function loadCampaign(idx) {
  const campaigns = getCampaigns();
  const c = campaigns[idx];
  if(!c) return;

  // Update last played
  c.lastPlayed = Date.now();
  campaigns[idx] = c;
  saveCampaigns(campaigns);

  // Write active campaign to localStorage for game.html to read
  localStorage.setItem('activeCampaignIdx', idx);
  localStorage.setItem('activeCampaign', JSON.stringify(c));

  window.location.href = 'game.html';
}

// ─── NEW CAMPAIGN MODAL ───────────────────────────────────────────────
const newModal = document.getElementById('new-modal');
const nameInput = document.getElementById('campaign-name-input');
const charCount = document.getElementById('char-count');

function openNewModal() {
  nameInput.value = '';
  charCount.textContent = '0';
  newModal.classList.add('active');
  setTimeout(() => nameInput.focus(), 50);
}

function closeNewModal() {
  newModal.classList.remove('active');
}

nameInput.addEventListener('input', () => {
  charCount.textContent = nameInput.value.length;
});

nameInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') confirmNew();
  if(e.key === 'Escape') closeNewModal();
});

document.getElementById('new-cancel').addEventListener('click', closeNewModal);

document.getElementById('new-confirm').addEventListener('click', confirmNew);

function confirmNew() {
  const name = nameInput.value.trim();
  if(!name) {
    showToast('PLEASE ENTER A NAME!');
    nameInput.focus();
    return;
  }

  const campaigns = getCampaigns();
  if(campaigns.length >= MAX_SLOTS) {
    showToast('MAX 6 CAMPAIGNS!');
    closeNewModal();
    return;
  }

  const newCampaign = getDefaultCampaignState(name);
  campaigns.push(newCampaign);
  saveCampaigns(campaigns);
  closeNewModal();

  const idx = campaigns.length - 1;
  localStorage.setItem('activeCampaignIdx', idx);
  localStorage.setItem('activeCampaign', JSON.stringify(newCampaign));
  window.location.href = 'game.html';
}

// ─── DELETE MODAL ────────────────────────────────────────────────────
const deleteModal = document.getElementById('delete-modal');
let pendingDeleteIdx = null;

function openDeleteModal(idx) {
  const campaigns = getCampaigns();
  pendingDeleteIdx = idx;
  document.getElementById('delete-name-display').textContent = campaigns[idx].name;
  deleteModal.classList.add('active');
}

function closeDeleteModal() {
  deleteModal.classList.remove('active');
  pendingDeleteIdx = null;
}

document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);

document.getElementById('delete-confirm').addEventListener('click', () => {
  if(pendingDeleteIdx === null) return;
  const campaigns = getCampaigns();
  const name = campaigns[pendingDeleteIdx].name;
  campaigns.splice(pendingDeleteIdx, 1);
  saveCampaigns(campaigns);
  closeDeleteModal();
  renderSlots();
  showToast(name + ' DELETED');
});

// Close modals on backdrop click
[newModal, deleteModal].forEach(m => {
  m.addEventListener('click', (e) => {
    if(e.target === m) {
      m.classList.remove('active');
      pendingDeleteIdx = null;
    }
  });
});

// ─── TOAST ───────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── INIT ────────────────────────────────────────────────────────────
renderSlots();
