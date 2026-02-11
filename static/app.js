// ───── State ─────
let roadmapData = null;
let allItems = [];
let filteredItems = [];
let currentDetailItem = null;
let activeEditField = null;
let saveQueue = Promise.resolve();
let lastFocusTrigger = null;

const STATUSES = ['BACKLOG', 'PLANNED', 'NEXT', 'IN_PROGRESS', 'DONE'];
const STATUS_LABELS = {
  BACKLOG: 'Backlog',
  PLANNED: 'Planned',
  NEXT: 'Next',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

const CATEGORY_COLORS = {
  'CS Intelligence':      { bg: '#13D77A', text: '#FFFFFF' },
  'DevOps':               { bg: '#80D7DB', text: '#101A28' },
  'CS Enablement':        { bg: '#6366F1', text: '#FFFFFF' },
  'Reliability':          { bg: '#FFA987', text: '#101A28' },
  'Measurement':          { bg: '#F7EE6C', text: '#101A28' },
  'Documentation':        { bg: '#F472B6', text: '#FFFFFF' },
  'Governance':           { bg: '#FB923C', text: '#101A28' },
  'Product Intelligence': { bg: '#A78BFA', text: '#FFFFFF' },
  'Infrastructure':       { bg: null, text: null },
  'Knowledge Mgmt':       { bg: '#2DD4BF', text: '#101A28' },
  'Uncategorized':        { bg: null, text: null },
};

const EDITABLE_FIELDS = {
  status:            { type: 'select', options: 'status' },
  category:          { type: 'select', options: 'category' },
  build_time:        { type: 'text', placeholder: 'e.g. 3-4 hrs' },
  description:       { type: 'textarea', placeholder: 'What does it do?' },
  business_impact:   { type: 'textarea', placeholder: 'Why does it matter?' },
  outcome:           { type: 'textarea', placeholder: 'What changes when this ships?' },
  success_metric:    { type: 'text', placeholder: 'How will you measure success?' },
  impact_score:      { type: 'number', placeholder: '0-10', min: 0, max: 10, step: 0.1 },
  ease_score:        { type: 'number', placeholder: '0-10', min: 0, max: 10, step: 0.1 },
  priority_score:    { type: 'number', placeholder: '0-10', min: 0, max: 10, step: 0.1 },
  start_date:        { type: 'date' },
  completed_date:    { type: 'date' },
  expected_delivery: { type: 'date' },
  owner:             { type: 'text', placeholder: 'e.g. Zev' },
  dependencies:      { type: 'text', placeholder: 'e.g. Health Scoring (#18)' },
};

// ───── Confetti Celebration ─────
let doneCountToday = 0;
const todayKey = new Date().toISOString().slice(0, 10);
if (localStorage.getItem('confetti_date') !== todayKey) {
  localStorage.setItem('confetti_date', todayKey);
  localStorage.setItem('confetti_done_count', '0');
}
doneCountToday = parseInt(localStorage.getItem('confetti_done_count') || '0', 10);

const CONFETTI_COLORS = ['#13D77A', '#13D77A', '#13D77A', '#FFA987', '#80D7DB', '#F7EE6C'];

// Create a dedicated confetti canvas to guarantee z-index
let confettiCanvas = null;
let myConfetti = null;
function getConfetti() {
  if (typeof confetti !== 'function') return null;
  if (!confettiCanvas) {
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(confettiCanvas);
    myConfetti = confetti.create(confettiCanvas, { resize: true });
  }
  return myConfetti;
}

function celebrateDone(item, originEl) {
  // ARIA announce for screen readers
  const announce = document.createElement('div');
  announce.setAttribute('role', 'status');
  announce.setAttribute('aria-live', 'polite');
  announce.className = 'sr-only';
  announce.textContent = `Item completed: ${item.name}`;
  document.body.appendChild(announce);
  setTimeout(() => announce.remove(), 2000);

  const fire = getConfetti();
  if (!fire) return;

  let x = 0.5, y = 0.3;
  if (originEl) {
    const rect = originEl.getBoundingClientRect();
    x = (rect.left + rect.width / 2) / window.innerWidth;
    y = (rect.top + rect.height / 2) / window.innerHeight;
  }

  const isHighPriority = item.priority_score > 8.0;
  const isFirstToday = doneCountToday === 0;
  const particleCount = isHighPriority ? 200 : 120;

  try {
    fire({
      particleCount,
      spread: isHighPriority ? 100 : 70,
      origin: { x, y },
      colors: CONFETTI_COLORS,
      gravity: 0.8,
      decay: 0.94,
      ticks: 200,
      startVelocity: 30,
    });

    // Side cannons for first completion of the day
    if (isFirstToday) {
      setTimeout(() => {
        fire({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: CONFETTI_COLORS, gravity: 0.8, ticks: 200 });
        fire({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: CONFETTI_COLORS, gravity: 0.8, ticks: 200 });
      }, 250);
    }

    // High-priority bonus burst
    if (isHighPriority) {
      setTimeout(() => {
        fire({ particleCount: 50, spread: 120, origin: { x, y: y - 0.1 }, colors: CONFETTI_COLORS, startVelocity: 25, gravity: 0.6, shapes: ['star'], scalar: 1.3, ticks: 200 });
      }, 300);
    }
  } catch (err) {
    console.error('[confetti] error:', err);
  }

  doneCountToday++;
  localStorage.setItem('confetti_done_count', String(doneCountToday));
}

// ───── Filter State ─────
let selectedCategories = new Set();
let currentSort = 'priority';

// ───── DOM refs ─────
const $ = (id) => document.getElementById(id);
const kanban = $('kanban');
const loadingState = $('loadingState');
const searchInput = $('searchInput');
const filterToggle = $('filterToggle');
const filterPanel = $('filterPanel');
const filterBadge = $('filterBadge');
const filterCategoriesEl = $('filterCategories');
const addItemBtn = $('addItemBtn');
const detailModal = $('detailModal');
const detailTitle = $('detailTitle');
const detailBody = $('detailBody');
const detailClose = $('detailClose');
const detailFooter = $('detailFooter');
const addModal = $('addModal');
const addForm = $('addForm');
const addClose = $('addClose');
const addCancel = $('addCancel');
const addSubmit = $('addSubmit');
const addCategory = $('addCategory');
const toastContainer = $('toastContainer');
const lastUpdated = $('lastUpdated');
const themeToggle = $('themeToggle');
const themeIcon = $('themeIcon');

// ───── Theme ─────
function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);
  document.body.classList.toggle('dark', isDark);
  updateThemeIcon(isDark);
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  themeIcon.textContent = isDark ? '\u{1F319}' : '\u{2600}\u{FE0F}';
  themeIcon.style.transform = 'rotate(0deg)';
  requestAnimationFrame(() => { themeIcon.style.transform = 'rotate(360deg)'; });
}

themeToggle.addEventListener('click', toggleTheme);

// ───── API ─────
const API = '/api';

function handleApiError(res, json) {
  showErrorBanner({
    error: json.error || `Error ${res.status}`,
    detail: json.detail || json.error || `Request failed with status ${res.status}`,
    ref: json.ref || '',
    endpoint: json.endpoint || '',
    status: res.status,
  });
  throw new Error(json.error || `Request failed (${res.status})`);
}

async function fetchRoadmap() {
  const res = await fetch(`${API}/roadmap`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    handleApiError(res, json);
  }
  return res.json();
}

async function apiCreateItem(data) {
  const res = await fetch(`${API}/roadmap/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) handleApiError(res, json);
  return json;
}

async function apiUpdateItem(id, data) {
  const res = await fetch(`${API}/roadmap/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) handleApiError(res, json);
  return json;
}

async function apiUpdateStatus(id, status) {
  const res = await fetch(`${API}/roadmap/items/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const json = await res.json();
  if (!res.ok) handleApiError(res, json);
  return json;
}

async function apiDeleteItem(id) {
  const res = await fetch(`${API}/roadmap/items/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) handleApiError(res, json);
  return json;
}

// ───── Toast ─────
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const icon = type === 'success' ? '\u2705' : '\u274C';
  const dismissHtml = type === 'error'
    ? '<button class="toast__dismiss" aria-label="Dismiss">&times;</button>'
    : '';
  toast.innerHTML = `<span class="toast__icon">${icon}</span><span>${escapeHtml(message)}</span>${dismissHtml}`;

  if (type === 'error') {
    const btn = toast.querySelector('.toast__dismiss');
    btn.addEventListener('click', () => removeToast(toast));
  }

  toastContainer.appendChild(toast);

  if (type === 'success') {
    setTimeout(() => removeToast(toast), 3000);
  }
}

function removeToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(40px)';
  setTimeout(() => toast.remove(), 300);
}

// ───── Error Banner (screenshot-friendly) ─────
function showErrorBanner(errorInfo) {
  // Remove any existing banner
  const existing = document.querySelector('.error-banner');
  if (existing) existing.remove();

  const detail = errorInfo.detail || errorInfo.error || 'Something went wrong';
  const ref = errorInfo.ref || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const endpoint = errorInfo.endpoint || '';
  const timestamp = new Date().toLocaleString();

  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <span class="error-banner__icon">\u26A0\uFE0F</span>
    <div class="error-banner__body">
      <div class="error-banner__title">${escapeHtml(detail)}</div>
      <div class="error-banner__meta">
        ${endpoint ? `<span>Endpoint: ${escapeHtml(endpoint)}</span>` : ''}
        <span>Ref: ${escapeHtml(ref)}</span>
        <span>${escapeHtml(timestamp)}</span>
      </div>
    </div>
    <div class="error-banner__actions">
      <button class="error-banner__btn" id="errorCopyBtn">Copy error</button>
      <button class="error-banner__btn error-banner__btn--close" aria-label="Dismiss">&times;</button>
    </div>
  `;

  document.body.prepend(banner);

  // Copy button
  banner.querySelector('#errorCopyBtn').addEventListener('click', () => {
    const copyText = [
      `Error: ${detail}`,
      endpoint ? `Endpoint: ${endpoint}` : '',
      `Ref: ${ref}`,
      `Time: ${timestamp}`,
      `URL: ${window.location.href}`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(copyText).then(() => {
      banner.querySelector('#errorCopyBtn').textContent = 'Copied!';
      setTimeout(() => {
        const btn = banner.querySelector('#errorCopyBtn');
        if (btn) btn.textContent = 'Copy error';
      }, 2000);
    });
  });

  // Close button
  banner.querySelector('.error-banner__btn--close').addEventListener('click', () => {
    banner.style.transform = 'translateY(-100%)';
    setTimeout(() => banner.remove(), 300);
  });

  // Auto-dismiss after 30s
  setTimeout(() => {
    if (banner.isConnected) {
      banner.style.transform = 'translateY(-100%)';
      setTimeout(() => banner.remove(), 300);
    }
  }, 30000);
}

// ───── Helpers ─────
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getCategoryStyle(category) {
  const isDark = document.body.classList.contains('dark');
  if (category === 'Infrastructure')
    return { bg: isDark ? '#ECEDE7' : '#101A28', text: isDark ? '#101A28' : '#FFFFFF' };
  if (category === 'Uncategorized')
    return { bg: isDark ? '#374151' : '#E5E7EB', text: isDark ? '#D1D5DB' : '#4B5563' };
  return CATEGORY_COLORS[category] || { bg: '#E5E7EB', text: '#4B5563' };
}

function isTBD(val) {
  return !val || val === 'TBD' || (typeof val === 'string' && val.startsWith('TBD'));
}

function formatExpectedDelivery(item) {
  if (!item.expected_delivery) {
    return `<span class="detail__value detail__value--muted">Not set</span>`;
  }
  const delivery = new Date(item.expected_delivery + 'T00:00:00');
  const formatted = delivery.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (item.status === 'IN_PROGRESS') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = today - delivery;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      return `<span class="detail__value detail__value--overdue">\u26A0\uFE0F ${escapeHtml(formatted)} (${diffDays} day${diffDays !== 1 ? 's' : ''} overdue)</span>`;
    }
  }
  if (item.status === 'DONE') {
    return `<span class="detail__value">${escapeHtml(formatted)}</span>`;
  }
  return `<span class="detail__value">${escapeHtml(formatted)}</span>`;
}

function syncItemInList(updated) {
  const idx = allItems.findIndex(i => i.id === updated.id);
  if (idx !== -1) {
    if (allItems[idx]._movedAt) updated._movedAt = allItems[idx]._movedAt;
    allItems[idx] = updated;
  }
}

function removeItemFromList(id) {
  allItems = allItems.filter(i => i.id !== id);
}

function getCategoryList() {
  return roadmapData?.metadata?.categories || [];
}

function categoryOptions(selected) {
  return getCategoryList().map(c =>
    `<option value="${escapeHtml(c)}"${c === selected ? ' selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
}

function statusOptions(selected) {
  return STATUSES.map(s =>
    `<option value="${s}"${s === selected ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`
  ).join('');
}

// ───── Filtering & Sorting ─────
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();

  filteredItems = allItems.filter(item => {
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) return false;
    if (query) {
      const searchable = `${item.name} ${item.description} ${item.category} ${item.business_impact} ${item.dependencies}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  // Recently moved/created items float to top within their column
  const recency = (a, b) => (b._movedAt || 0) - (a._movedAt || 0);
  const sorters = {
    priority: (a, b) => recency(a, b) || (b.priority_score || 0) - (a.priority_score || 0),
    id: (a, b) => recency(a, b) || a.id - b.id,
    name: (a, b) => recency(a, b) || a.name.localeCompare(b.name),
    impact: (a, b) => recency(a, b) || (b.impact_score || 0) - (a.impact_score || 0),
    ease: (a, b) => recency(a, b) || (b.ease_score || 0) - (a.ease_score || 0),
  };
  filteredItems.sort(sorters[currentSort] || sorters.priority);

  renderKanban();
}

// ───── Render Kanban ─────
function renderKanban() {
  kanban.innerHTML = '';

  STATUSES.forEach(status => {
    const items = filteredItems.filter(i => i.status === status);

    const col = document.createElement('div');
    col.className = 'kanban__column';
    col.dataset.status = status;

    col.innerHTML = `
      <div class="kanban__column-header">
        <span class="kanban__column-title">${STATUS_LABELS[status]}</span>
        <span class="kanban__column-count">${items.length}</span>
      </div>
      <div class="kanban__cards" data-status="${status}"></div>
    `;

    const cardsContainer = col.querySelector('.kanban__cards');
    setupDropZone(cardsContainer);

    if (items.length === 0) {
      cardsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">\u{1F4CB}</div>
          <div class="empty-state__text">No items in ${STATUS_LABELS[status]}</div>
        </div>`;
    } else {
      items.forEach(item => cardsContainer.appendChild(createCard(item)));
    }

    kanban.appendChild(col);
  });
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.itemId = item.id;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${item.name}, ${STATUS_LABELS[item.status]}`);

  const catStyle = getCategoryStyle(item.category);

  let overdueHtml = '';
  if (item.status === 'IN_PROGRESS' && item.expected_delivery) {
    const delivery = new Date(item.expected_delivery + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - delivery) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      overdueHtml = `<span class="card__overdue">\u26A0\uFE0F ${diffDays}d overdue</span>`;
    }
  }

  // Votes + comments meta row
  const voteCount = item.vote_count || 0;
  const votes = item.votes || [];
  const commentCount = (item.comments || []).length;
  const hasUserVote = currentUser && votes.some(v => v.user_id === currentUser.id);
  let metaHtml = '';
  if (voteCount > 0 || commentCount > 0) {
    const voterInitials = votes
      .filter(v => v.vote === 'up')
      .slice(0, 3)
      .map(v => `<span class="card__voter">${getInitials(v.username)}</span>`)
      .join('');
    const extraVoters = votes.filter(v => v.vote === 'up').length - 3;
    const votersHtml = voterInitials
      ? `<span class="card__voters">${voterInitials}${extraVoters > 0 ? `<span class="card__voter card__voter--more">+${extraVoters}</span>` : ''}</span>`
      : '';
    const votesHtml = voteCount > 0
      ? `<span class="card__votes${hasUserVote ? ' card__votes--active' : ''}">&#9650; ${voteCount}</span>`
      : '';
    const commentsHtml = commentCount > 0
      ? `<span class="card__comments">\u{1F4AC} ${commentCount}</span>`
      : '';
    metaHtml = `<div class="card__meta">${votesHtml}${votersHtml}<span class="card__meta-spacer"></span>${commentsHtml}</div>`;
  }

  card.innerHTML = `
    <div class="card__title">${escapeHtml(item.name)}</div>
    ${overdueHtml}
    <div class="card__bottom">
      <span class="card__category" style="background:${catStyle.bg};color:${catStyle.text}">
        ${escapeHtml(item.category)}
      </span>
      <span class="card__owner">${getInitials(item.owner)}</span>
    </div>
    ${metaHtml}
  `;

  // Click opens detail (not during drag)
  card.addEventListener('click', (e) => {
    if (!card.classList.contains('dragging')) {
      lastFocusTrigger = card;
      openDetail(item);
    }
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      lastFocusTrigger = card;
      openDetail(item);
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCardWithKeyboard(item, e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // Drag events
  setupDragSource(card, item);

  return card;
}

// ───── Drag & Drop ─────
let draggedItem = null;
let draggedCard = null;

function setupDragSource(card, item) {
  card.addEventListener('dragstart', (e) => {
    draggedItem = item;
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(item.id));
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    clearAllDropHighlights();
    draggedItem = null;
    draggedCard = null;
  });

  // Touch support
  let touchStartY = 0;
  let touchClone = null;
  let touchCurrentDropZone = null;

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    draggedItem = item;
    draggedCard = card;

    // Delay to distinguish from tap
    card._touchTimer = setTimeout(() => {
      card.classList.add('dragging');
      touchClone = card.cloneNode(true);
      touchClone.style.cssText = 'position:fixed;pointer-events:none;z-index:1000;width:' + card.offsetWidth + 'px;opacity:0.8;transform:rotate(2deg);';
      touchClone.style.left = (touch.clientX - card.offsetWidth / 2) + 'px';
      touchClone.style.top = (touch.clientY - 20) + 'px';
      document.body.appendChild(touchClone);
    }, 200);
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!touchClone) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchClone.style.left = (touch.clientX - card.offsetWidth / 2) + 'px';
    touchClone.style.top = (touch.clientY - 20) + 'px';

    // Find drop zone under touch
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = el?.closest('.kanban__cards');
    if (zone !== touchCurrentDropZone) {
      if (touchCurrentDropZone) touchCurrentDropZone.classList.remove('drag-over');
      if (zone && zone.dataset.status !== draggedItem.status) {
        zone.classList.add('drag-over');
      }
      touchCurrentDropZone = zone;
    }
  }, { passive: false });

  card.addEventListener('touchend', (e) => {
    clearTimeout(card._touchTimer);
    if (touchClone) {
      touchClone.remove();
      touchClone = null;
    }
    card.classList.remove('dragging');

    if (touchCurrentDropZone && draggedItem) {
      const newStatus = touchCurrentDropZone.dataset.status;
      if (newStatus && newStatus !== draggedItem.status) {
        handleDrop(draggedItem, newStatus);
      }
      touchCurrentDropZone.classList.remove('drag-over');
      touchCurrentDropZone = null;
    }

    clearAllDropHighlights();
    draggedItem = null;
    draggedCard = null;
  });
}

function setupDropZone(container) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItem && container.dataset.status !== draggedItem.status) {
      container.classList.add('drag-over');
    }
  });

  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) {
      container.classList.remove('drag-over');
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    if (!draggedItem) return;
    const newStatus = container.dataset.status;
    if (newStatus && newStatus !== draggedItem.status) {
      handleDrop(draggedItem, newStatus);
    }
  });
}

function clearAllDropHighlights() {
  document.querySelectorAll('.kanban__cards.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.drop-placeholder').forEach(el => el.remove());
}

async function handleDrop(item, newStatus) {
  const oldStatus = item.status;

  // Optimistic update
  item.status = newStatus;
  item._movedAt = Date.now();
  applyFilters();
  showToast(`Moved to ${STATUS_LABELS[newStatus]}`);

  // Celebrate if moving to DONE (not already DONE)
  if (newStatus === 'DONE' && oldStatus !== 'DONE') {
    const card = kanban.querySelector(`.card[data-item-id="${item.id}"]`);
    celebrateDone(item, card);
  }

  try {
    const updated = await apiUpdateStatus(item.id, newStatus);
    syncItemInList(updated);
    // Re-render to pick up any server-side date changes
    applyFilters();
  } catch (err) {
    // Rollback
    item.status = oldStatus;
    applyFilters();
    showToast(`Move failed: ${err.message}`, 'error');
  }
}

async function moveCardWithKeyboard(item, direction) {
  const currentIdx = STATUSES.indexOf(item.status);
  const newIdx = currentIdx + direction;
  if (newIdx < 0 || newIdx >= STATUSES.length) return;
  await handleDrop(item, STATUSES[newIdx]);
}

// ───── Detail Modal ─────
function openDetail(item) {
  currentDetailItem = item;
  activeEditField = null;
  // Clean up any leftover header badges from previous item
  const oldBadges = detailModal.querySelector('.modal__header-badges');
  if (oldBadges) oldBadges.remove();
  renderDetailView(item);
  renderDetailFooter();
  detailModal.classList.add('active');
}

// ───── Relative Time ─────
function relativeTime(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ───── Collapsible State ─────
function isCollapsibleOpen(itemId, section) {
  return sessionStorage.getItem(`collapse_${itemId}_${section}`) === 'open';
}

function setCollapsibleState(itemId, section, open) {
  sessionStorage.setItem(`collapse_${itemId}_${section}`, open ? 'open' : 'closed');
}

// ───── Field Display ─────
function getFieldDisplayHtml(fieldName, item) {
  const valOrMuted = (val, placeholder) => isTBD(val)
    ? `<span class="detail__field-value detail__field-value--muted">${escapeHtml(placeholder || 'TBD')}</span>`
    : `<span class="detail__field-value">${escapeHtml(val)}</span>`;

  switch (fieldName) {
    case 'status':
      return `<span class="detail__badge detail__badge--status">${STATUS_LABELS[item.status] || item.status}</span>`;
    case 'category': {
      const cs = getCategoryStyle(item.category);
      return `<span class="detail__badge" style="background:${cs.bg};color:${cs.text}">${escapeHtml(item.category)}</span>`;
    }
    case 'build_time':
      return item.build_time
        ? `<span class="detail__field-value">${escapeHtml(item.build_time)}</span>`
        : `<span class="detail__field-value detail__field-value--muted">Not estimated</span>`;
    case 'expected_delivery':
      if (!item.expected_delivery) return `<span class="detail__field-value detail__field-value--muted">Not set</span>`;
      return `<span class="detail__field-value">${new Date(item.expected_delivery + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
    case 'start_date':
    case 'completed_date':
      if (!item[fieldName]) return `<span class="detail__field-value detail__field-value--muted">Not set</span>`;
      return `<span class="detail__field-value">${new Date(item[fieldName] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
    case 'owner':
      return `<span class="detail__field-value">${escapeHtml(item.owner || 'Unassigned')}</span>`;
    case 'impact_score':
    case 'ease_score':
    case 'priority_score':
      return `<span class="detail__field-value">${item[fieldName] || 0}/10</span>`;
    case 'dependencies':
      return valOrMuted(item.dependencies, 'None');
    case 'description':
      return valOrMuted(item.description, 'No description yet');
    case 'business_impact':
      return valOrMuted(item.business_impact, 'Not defined yet');
    case 'outcome':
      return isTBD(item.outcome)
        ? `<span class="detail__field-value detail__field-value--muted">\u{1F4AD} TBD - let's define this together</span>`
        : `<span class="detail__field-value">${escapeHtml(item.outcome)}</span>`;
    case 'success_metric':
      return isTBD(item.success_metric)
        ? `<span class="detail__field-value detail__field-value--muted">\u{1F4AD} Not set yet</span>`
        : `<span class="detail__field-value">${escapeHtml(item.success_metric)}</span>`;
    default:
      return valOrMuted(item[fieldName]);
  }
}

function renderDetailView(item) {
  detailTitle.textContent = item.name;

  const catStyle = getCategoryStyle(item.category);

  const editable = (fieldName, displayHtml) =>
    `<div class="editable" data-field="${fieldName}" tabindex="0" role="button" aria-label="Click to edit ${fieldName.replace(/_/g, ' ')}">
      <div class="editable__display">${displayHtml}</div>
    </div>`;

  // Header badges
  const badgesEl = detailModal.querySelector('.modal__header-badges') || document.createElement('div');
  badgesEl.className = 'modal__header-badges';
  badgesEl.innerHTML = `
    ${editable('category', getFieldDisplayHtml('category', item))}
    ${editable('status', getFieldDisplayHtml('status', item))}
  `;
  const headerEl = detailModal.querySelector('.modal__header');
  if (!headerEl.querySelector('.modal__header-badges')) {
    headerEl.appendChild(badgesEl);
  }

  // Hero: description with micro-label
  const desc = item.description || '';
  const heroHtml = `<div class="detail__hero">
    <div class="detail__hero-label">Description</div>
    ${editable('description', desc
      ? `<span class="detail__field-value">${escapeHtml(desc)}</span>`
      : '<span class="detail__hero-muted">Add a description...</span>')}
  </div>`;

  // Smart context chips
  const chips = [];

  // Time in current status
  const history = item.edit_history || [];
  const lastStatusChange = [...history].reverse().find(h => h.field === 'status');
  const statusSince = lastStatusChange ? lastStatusChange.timestamp : (item.added_date ? item.added_date + 'T12:00:00Z' : null);
  if (statusSince) {
    const days = Math.floor((new Date() - new Date(statusSince)) / 86400000);
    const statusLabel = STATUS_LABELS[item.status] || item.status;
    const durStr = days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
    chips.push(`<span class="detail__chip"><span class="detail__chip-icon">\u23F1\uFE0F</span>${escapeHtml(statusLabel)} for ${durStr}</span>`);
  }

  // Owner
  chips.push(`<span class="detail__chip"><span class="detail__chip-icon">\u{1F464}</span>${escapeHtml(item.owner || 'Unassigned')}</span>`);

  // Delivery context
  if (item.expected_delivery && item.status !== 'DONE') {
    const delivery = new Date(item.expected_delivery + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.floor((delivery - today) / 86400000);
    let deliveryChip;
    if (diff < 0) deliveryChip = `<span class="detail__chip detail__chip--overdue"><span class="detail__chip-icon">\u{1F6A8}</span>${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue</span>`;
    else if (diff === 0) deliveryChip = `<span class="detail__chip detail__chip--warn"><span class="detail__chip-icon">\u{1F680}</span>Due today</span>`;
    else if (diff <= 7) deliveryChip = `<span class="detail__chip detail__chip--warn"><span class="detail__chip-icon">\u{1F680}</span>Due in ${diff} day${diff !== 1 ? 's' : ''}</span>`;
    else deliveryChip = `<span class="detail__chip"><span class="detail__chip-icon">\u{1F680}</span>Due ${new Date(item.expected_delivery + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`;
    chips.push(deliveryChip);
  } else if (item.status === 'DONE' && item.completed_date) {
    chips.push(`<span class="detail__chip detail__chip--done"><span class="detail__chip-icon">\u2705</span>Completed ${relativeTime(item.completed_date + 'T12:00:00Z')}</span>`);
  } else if (!item.expected_delivery && item.status !== 'DONE') {
    chips.push(`<span class="detail__chip detail__chip--muted"><span class="detail__chip-icon">\u{1F4C5}</span>No deadline</span>`);
  }

  // Last activity
  const lastEdit = history.length > 0 ? history[history.length - 1] : null;
  if (lastEdit) {
    chips.push(`<span class="detail__chip detail__chip--muted"><span class="detail__chip-icon">\u270F\uFE0F</span>Edited ${relativeTime(lastEdit.timestamp)}</span>`);
  }

  const metadataHtml = `<div class="detail__chips">${chips.join('')}</div>`;

  // Alerts
  let alertsHtml = '';
  if (isTBD(item.success_metric)) {
    alertsHtml += `<div class="detail__alert detail__alert--warning">
      \u{1F4AD} Success metrics undefined
      <button class="detail__alert-action" data-action="edit-metric">+ Add</button>
    </div>`;
  }
  if (item.expected_delivery && item.status !== 'DONE') {
    const delivery = new Date(item.expected_delivery + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - delivery) / 86400000);
    if (diffDays > 0) {
      alertsHtml += `<div class="detail__alert detail__alert--overdue">\u26A0\uFE0F ${diffDays} day${diffDays !== 1 ? 's' : ''} overdue</div>`;
    }
  }

  // Collapsible sections
  const collapsible = (id, title, contentHtml) => {
    const isOpen = isCollapsibleOpen(item.id, id);
    return `<div class="detail__collapsible" data-section="${id}">
      <button class="detail__collapsible-header" aria-expanded="${isOpen}" aria-controls="section-${id}">
        <span class="detail__collapsible-arrow${isOpen ? ' detail__collapsible-arrow--open' : ''}">\u25B6</span>
        ${title}
      </button>
      <div class="detail__collapsible-body${isOpen ? ' detail__collapsible-body--open' : ''}" id="section-${id}">
        ${contentHtml}
      </div>
    </div>`;
  };

  // Section 1: Business impact & details
  const section1 = `
    <div class="detail__field">
      <div class="detail__field-label">Why it matters</div>
      ${editable('business_impact', getFieldDisplayHtml('business_impact', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Success looks like...</div>
      ${editable('outcome', getFieldDisplayHtml('outcome', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">How we'll measure it</div>
      ${editable('success_metric', getFieldDisplayHtml('success_metric', item))}
    </div>
  `;

  // Section 2: Timeline & history
  const section2 = `
    <div class="detail__field">
      <div class="detail__field-label">Started</div>
      ${editable('start_date', getFieldDisplayHtml('start_date', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Expected delivery</div>
      ${editable('expected_delivery', getFieldDisplayHtml('expected_delivery', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Completed</div>
      ${editable('completed_date', getFieldDisplayHtml('completed_date', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Added</div>
      <span class="detail__field-value">${item.added_date ? new Date(item.added_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}</span>
    </div>
  `;

  // Section 3: Technical details
  const section3 = `
    <div class="detail__field">
      <div class="detail__field-label">Dependencies</div>
      ${editable('dependencies', getFieldDisplayHtml('dependencies', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Build time estimate</div>
      ${editable('build_time', getFieldDisplayHtml('build_time', item))}
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Scores</div>
      <div class="detail__field-inline">
        ${editable('impact_score', `<span class="detail__field-inline-item"><span>Impact:</span> ${item.impact_score || 0}/10</span>`)}
        ${editable('ease_score', `<span class="detail__field-inline-item"><span>Ease:</span> ${item.ease_score || 0}/10</span>`)}
        ${editable('priority_score', `<span class="detail__field-inline-item"><span>Priority:</span> ${item.priority_score || 0}/10</span>`)}
      </div>
    </div>
    <div class="detail__field">
      <div class="detail__field-label">Owner</div>
      ${editable('owner', getFieldDisplayHtml('owner', item))}
    </div>
  `;

  // Activity log
  const activityHtml = renderActivityLog(item);

  // Voting controls
  const voteCount = item.vote_count || 0;
  const userVote = item.user_vote || null;
  const votingHtml = `<div class="vote-controls" id="voteControls">
    <button class="vote-btn${userVote === 'up' ? ' vote-btn--active' : ''}" data-vote="up" title="Upvote" aria-label="Upvote">&#9650;</button>
    <span class="vote-count" id="voteCount">${voteCount}</span>
    <button class="vote-btn${userVote === 'down' ? ' vote-btn--active' : ''}" data-vote="down" title="Downvote" aria-label="Downvote">&#9660;</button>
  </div>`;

  // Comments / Notes section
  const commentsHtml = `<div class="comments-section" id="commentsSection">
    <div class="comments-header">Notes</div>
    <div id="commentsList"><span class="detail__field-value--muted" style="font-size:13px">Loading...</span></div>
    <div class="comment-form" id="commentForm" style="display:none">
      <textarea id="commentInput" placeholder="Add a note..." rows="2" maxlength="5000"></textarea>
      <button class="btn btn--primary btn--sm" id="commentSubmit">Post</button>
    </div>
  </div>`;

  detailBody.innerHTML = `
    ${heroHtml}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="flex:1">${metadataHtml}</div>
      ${votingHtml}
    </div>
    ${alertsHtml}
    ${collapsible('impact', '\u{1F4CB} Business impact & details', section1)}
    ${collapsible('timeline', '\u{1F4C5} Timeline & history', section2)}
    ${collapsible('technical', '\u{2699}\uFE0F Technical details', section3)}
    ${activityHtml}
    ${commentsHtml}
  `;

  attachEditableHandlers();
  attachCollapsibleHandlers(item.id);
  attachAlertActions(item);
  attachVoteHandlers(item);
  loadAndRenderComments(item.id);
  // "View all" in activity log
  const showAllBtn = detailBody.querySelector('#activityShowAll');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      const logEl = detailBody.querySelector('.detail__activity-log');
      if (!logEl) return;
      const history = item.edit_history || [];
      const entries = [];
      history.forEach(h => {
        if (h.field === 'status') {
          entries.push({ type: 'status_change', user: h.edited_by || 'Zev', timestamp: h.timestamp, from_status: h.old_value, to_status: h.new_value });
        } else {
          entries.push({ type: 'field_change', user: h.edited_by || 'Zev', timestamp: h.timestamp, field: h.field, old_value: h.old_value, new_value: h.new_value });
        }
      });
      if (item.added_date) entries.push({ type: 'created', user: item.owner || 'Zev', timestamp: item.added_date + 'T12:00:00Z' });
      entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      logEl.innerHTML = entries.map(e => {
        const time = relativeTime(e.timestamp);
        let actionText = '', detailText = '';
        if (e.type === 'created') { actionText = 'created this item'; }
        else if (e.type === 'status_change') { actionText = `moved to ${STATUS_LABELS[e.to_status] || e.to_status}`; detailText = `From: ${STATUS_LABELS[e.from_status] || e.from_status}`; }
        else { const fl = (e.field || '').replace(/_/g, ' '); actionText = `changed ${fl}`; const os = e.old_value != null ? String(e.old_value) : '—'; const ns = e.new_value != null ? String(e.new_value) : '—'; detailText = `${os.length > 40 ? os.slice(0,40)+'...' : os} → ${ns.length > 40 ? ns.slice(0,40)+'...' : ns}`; }
        return `<div class="detail__activity-entry"><span class="detail__activity-user">${escapeHtml(e.user)}</span> ${escapeHtml(actionText)} <span class="detail__activity-time">• ${escapeHtml(time)}</span>${detailText ? `<div class="detail__activity-detail">${escapeHtml(detailText)}</div>` : ''}</div>`;
      }).join('');
    });
  }
}

// ───── Vote Handlers ─────
function attachVoteHandlers(item) {
  const container = document.getElementById('voteControls');
  if (!container) return;
  container.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const voteType = btn.dataset.vote;
      try {
        const result = await voteOnItem(item.id, voteType);
        if (!result) return; // login required, modal opened
        // Update vote count display
        const countEl = document.getElementById('voteCount');
        if (countEl) countEl.textContent = result.vote_count;
        // Update active states
        container.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('vote-btn--active'));
        if (result.user_vote) {
          const activeBtn = container.querySelector(`[data-vote="${result.user_vote}"]`);
          if (activeBtn) activeBtn.classList.add('vote-btn--active');
        }
        // Update the item in local data
        item.vote_count = result.vote_count;
        item.user_vote = result.user_vote;
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// ───── Comments / Notes ─────
async function loadAndRenderComments(itemId) {
  const listEl = document.getElementById('commentsList');
  const formEl = document.getElementById('commentForm');
  if (!listEl) return;

  // Show form if logged in (attach listeners only once via data attribute)
  if (formEl && currentUser) {
    formEl.style.display = 'flex';
    const submitBtn = document.getElementById('commentSubmit');
    const input = document.getElementById('commentInput');
    if (submitBtn && input && !submitBtn.dataset.bound) {
      submitBtn.dataset.bound = '1';
      submitBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;
        try {
          submitBtn.disabled = true;
          await addComment(itemId, text);
          input.value = '';
          await loadAndRenderComments(itemId);
          showToast('Note added');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          submitBtn.disabled = false;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submitBtn.click();
        }
      });
    }
  }

  try {
    const comments = await loadComments(itemId);
    if (comments.length === 0) {
      listEl.innerHTML = '<span class="detail__field-value--muted" style="font-size:13px">No notes yet</span>';
      return;
    }
    listEl.innerHTML = comments.map(c => {
      const canDelete = currentUser && (currentUser.username === c.author || currentUser.role === 'admin');
      return `<div class="comment">
        <div class="comment__meta">
          <span class="comment__author">${escapeHtml(c.author)}</span>
          <span class="comment__time">${relativeTime(c.created_at)}</span>
          ${canDelete ? `<button class="comment__delete" data-comment-id="${c.id}" title="Delete note">&times;</button>` : ''}
        </div>
        <div class="comment__text">${escapeHtml(c.comment)}</div>
      </div>`;
    }).join('');

    // Attach delete handlers
    listEl.querySelectorAll('.comment__delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const commentId = btn.dataset.commentId;
        try {
          await deleteComment(itemId, commentId);
          await loadAndRenderComments(itemId);
          showToast('Note deleted');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<span class="detail__field-value--muted" style="font-size:13px">Failed to load notes</span>';
  }
}

function renderActivityLog(item) {
  const history = item.edit_history || [];

  // Build entries from edit_history + creation
  const entries = [];

  // Add creation entry
  if (item.added_date) {
    entries.push({
      type: 'created',
      user: item.owner || 'Zev',
      timestamp: item.added_date + 'T09:00:00Z',
    });
  }

  // Add edit_history entries
  history.forEach(h => {
    if (h.field === 'status') {
      entries.push({
        type: 'status_change',
        user: h.edited_by || 'Unknown',
        timestamp: h.timestamp,
        from_status: h.old_value,
        to_status: h.new_value,
      });
    } else {
      entries.push({
        type: 'field_update',
        user: h.edited_by || 'Unknown',
        timestamp: h.timestamp,
        field: h.field,
        old_value: h.old_value,
        new_value: h.new_value,
      });
    }
  });

  // Sort reverse chronological
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const totalCount = entries.length;
  const showLimit = 10;
  const visible = entries.slice(0, showLimit);

  let entriesHtml = '';
  if (visible.length === 0) {
    entriesHtml = '<div class="detail__activity-empty">No activity yet</div>';
  } else {
    entriesHtml = visible.map(e => {
      const time = relativeTime(e.timestamp);
      let actionText = '';
      let detailText = '';

      if (e.type === 'created') {
        actionText = 'created this item';
      } else if (e.type === 'status_change') {
        const label = STATUS_LABELS[e.to_status] || e.to_status;
        actionText = `moved to ${label}`;
        detailText = `From: ${STATUS_LABELS[e.from_status] || e.from_status}`;
      } else {
        const fieldLabel = (e.field || '').replace(/_/g, ' ');
        actionText = `changed ${fieldLabel}`;
        const oldStr = e.old_value != null ? String(e.old_value) : '—';
        const newStr = e.new_value != null ? String(e.new_value) : '—';
        const oldTrunc = oldStr.length > 40 ? oldStr.slice(0, 40) + '...' : oldStr;
        const newTrunc = newStr.length > 40 ? newStr.slice(0, 40) + '...' : newStr;
        detailText = `${oldTrunc} \u2192 ${newTrunc}`;
      }

      return `<div class="detail__activity-entry">
        <span class="detail__activity-user">${escapeHtml(e.user)}</span> ${escapeHtml(actionText)}
        <span class="detail__activity-time">\u2022 ${escapeHtml(time)}</span>
        ${detailText ? `<div class="detail__activity-detail">${escapeHtml(detailText)}</div>` : ''}
      </div>`;
    }).join('');
  }

  const moreHtml = totalCount > showLimit
    ? `<button class="detail__activity-more" id="activityShowAll">View all (${totalCount})</button>`
    : '';

  return `<div class="detail__activity">
    <div class="detail__activity-header">\u{1F4DD} Activity</div>
    <div class="detail__activity-log">
      ${entriesHtml}
      ${moreHtml}
    </div>
  </div>`;
}

function attachCollapsibleHandlers(itemId) {
  detailBody.querySelectorAll('.detail__collapsible').forEach(el => {
    const section = el.dataset.section;
    const header = el.querySelector('.detail__collapsible-header');
    const body = el.querySelector('.detail__collapsible-body');
    const arrow = el.querySelector('.detail__collapsible-arrow');

    header.addEventListener('click', () => {
      const isOpen = body.classList.contains('detail__collapsible-body--open');
      body.classList.toggle('detail__collapsible-body--open', !isOpen);
      arrow.classList.toggle('detail__collapsible-arrow--open', !isOpen);
      header.setAttribute('aria-expanded', !isOpen);
      setCollapsibleState(itemId, section, !isOpen);
    });
  });
}

function attachAlertActions(item) {
  const metricBtn = detailBody.querySelector('[data-action="edit-metric"]');
  if (metricBtn) {
    metricBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Open the impact section and focus success_metric
      const impactSection = detailBody.querySelector('[data-section="impact"]');
      if (impactSection) {
        const body = impactSection.querySelector('.detail__collapsible-body');
        const arrow = impactSection.querySelector('.detail__collapsible-arrow');
        body.classList.add('detail__collapsible-body--open');
        arrow.classList.add('detail__collapsible-arrow--open');
        setCollapsibleState(item.id, 'impact', true);
        setTimeout(() => {
          const metricField = impactSection.querySelector('[data-field="success_metric"]');
          if (metricField) metricField.click();
        }, 100);
      }
    });
  }
}

function renderDetailFooter() {
  detailFooter.innerHTML = `
    <button class="btn btn--icon-danger" id="detailDelete" aria-label="Delete item" title="Delete item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    </button>
  `;
  $('detailDelete').addEventListener('click', () => showDeleteConfirmation(currentDetailItem));
}

function closeDetail() {
  detailModal.classList.remove('active');
  activeEditField = null;
  const overlay = detailModal.querySelector('.confirm-overlay');
  if (overlay) overlay.remove();
  const badges = detailModal.querySelector('.modal__header-badges');
  if (badges) badges.remove();
  if (lastFocusTrigger && lastFocusTrigger.isConnected) {
    lastFocusTrigger.focus();
    lastFocusTrigger = null;
  }
}

detailClose.addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeDetail();
});

// ───── Inline Editing ─────
function attachEditableHandlers() {
  // Attach to all editable elements in both body and header badges
  const modal = detailModal.querySelector('.modal');
  modal.querySelectorAll('.editable').forEach(el => {
    const fieldName = el.dataset.field;
    el.addEventListener('click', () => activateInlineEdit(el, fieldName));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateInlineEdit(el, fieldName);
      }
    });
  });
}

function activateInlineEdit(wrapperEl, fieldName) {
  if (activeEditField === fieldName) return;

  // Blur any active edit first
  if (activeEditField) {
    const modal = detailModal.querySelector('.modal');
    const activeInput = modal.querySelector('.editable--active input, .editable--active textarea, .editable--active select');
    if (activeInput) activeInput.blur();
  }

  const config = EDITABLE_FIELDS[fieldName];
  if (!config) return;

  const currentValue = currentDetailItem[fieldName] || '';
  activeEditField = fieldName;
  wrapperEl.classList.add('editable--active');

  let inputHtml;
  if (config.type === 'select' && config.options === 'status') {
    inputHtml = `<select class="editable__select" data-field="${fieldName}">${statusOptions(currentValue)}</select>`;
  } else if (config.type === 'select' && config.options === 'category') {
    inputHtml = `<select class="editable__select" data-field="${fieldName}">${categoryOptions(currentValue)}</select>`;
  } else if (config.type === 'textarea') {
    inputHtml = `<textarea class="editable__textarea" data-field="${fieldName}" placeholder="${config.placeholder || ''}" rows="3">${escapeHtml(currentValue)}</textarea>`;
  } else if (config.type === 'date') {
    inputHtml = `<input class="editable__input" type="date" data-field="${fieldName}" value="${escapeHtml(currentValue || '')}">`;
  } else if (config.type === 'number') {
    inputHtml = `<input class="editable__input" type="number" data-field="${fieldName}" value="${currentValue || 0}" min="${config.min || 0}" max="${config.max || 10}" step="${config.step || 0.1}" placeholder="${config.placeholder || ''}">`;
  } else {
    inputHtml = `<input class="editable__input" type="text" data-field="${fieldName}" value="${escapeHtml(currentValue)}" placeholder="${config.placeholder || ''}">`;
  }

  wrapperEl.innerHTML = inputHtml;
  const input = wrapperEl.querySelector('input, textarea, select');
  input.focus();
  if (input.type === 'text' || input.type === 'number') input.select();

  input.addEventListener('blur', () => {
    const newValue = input.value.trim();
    handleInlineSave(wrapperEl, fieldName, newValue, currentValue);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      revertInlineEdit(wrapperEl, fieldName);
      return;
    }
    if (e.key === 'Enter' && config.type !== 'textarea') {
      e.preventDefault();
      input.blur();
    }
  });

  if (config.type === 'select') {
    input.addEventListener('change', () => input.blur());
  }
}

function revertInlineEdit(wrapperEl, fieldName) {
  activeEditField = null;
  wrapperEl.classList.remove('editable--active');
  wrapperEl.innerHTML = `<div class="editable__display">${getFieldDisplayHtml(fieldName, currentDetailItem)}</div>`;
}

function handleInlineSave(wrapperEl, fieldName, newValue, oldValue) {
  activeEditField = null;
  const oldNorm = String(oldValue || '');
  const newNorm = String(newValue || '');

  if (oldNorm === newNorm) {
    revertInlineEdit(wrapperEl, fieldName);
    return;
  }

  wrapperEl.classList.remove('editable--active');
  wrapperEl.classList.add('editable--saving');
  const previewItem = { ...currentDetailItem, [fieldName]: newValue || null };
  wrapperEl.innerHTML = `<div class="editable__display editable__saving-indicator">
    <span class="editable__spinner"></span>
    ${getFieldDisplayHtml(fieldName, previewItem)}
  </div>`;

  saveQueue = saveQueue.then(() => executeInlineSave(wrapperEl, fieldName, newValue, oldValue));
}

async function executeInlineSave(wrapperEl, fieldName, newValue, oldValue) {
  // Convert number fields
  const numFields = ['impact_score', 'ease_score', 'priority_score'];
  const saveValue = numFields.includes(fieldName) ? parseFloat(newValue) || 0 : (newValue || null);
  currentDetailItem[fieldName] = saveValue;

  try {
    const payload = { ...currentDetailItem, _edited_by: 'Zev' };
    delete payload.edit_history;

    const updated = await apiUpdateItem(currentDetailItem.id, payload);
    syncItemInList(updated);
    currentDetailItem = updated;

    if (fieldName === 'status') {
      updated._movedAt = Date.now();
      if (newValue === 'DONE' && oldValue !== 'DONE') {
        celebrateDone(updated, detailModal.querySelector('.modal'));
      }
    }

    // Re-render entire detail view to refresh metadata bar, alerts, activity log
    renderDetailView(updated);
    applyFilters();
    showToast(`Updated ${fieldName.replace(/_/g, ' ')}`);
  } catch (err) {
    currentDetailItem[fieldName] = oldValue;
    wrapperEl.classList.remove('editable--saving');
    wrapperEl.innerHTML = `<div class="editable__display">${getFieldDisplayHtml(fieldName, currentDetailItem)}</div>`;
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

// ───── Delete ─────
function showDeleteConfirmation(item) {
  // Add confirmation overlay inside the modal
  const modal = detailModal.querySelector('.modal');
  const existing = modal.querySelector('.confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog__title">Delete Item?</div>
      <div class="confirm-dialog__message">Delete #${item.id}: ${escapeHtml(item.name)}? This action cannot be undone.</div>
      <div class="confirm-dialog__actions">
        <button class="btn btn--outline" id="confirmCancel">Cancel</button>
        <button class="btn btn--danger-fill" id="confirmDelete">Delete</button>
      </div>
    </div>
  `;

  modal.appendChild(overlay);

  $('confirmCancel').addEventListener('click', () => overlay.remove());
  $('confirmDelete').addEventListener('click', () => executeDelete(item, overlay));

  $('confirmCancel').focus();
}

async function executeDelete(item, overlay) {
  const deleteBtn = $('confirmDelete');
  try {
    deleteBtn.classList.add('btn--loading');
    deleteBtn.disabled = true;
    await apiDeleteItem(item.id);
    overlay.remove();
    closeDetail();

    // Animate card removal
    const card = kanban.querySelector(`[data-item-id="${item.id}"]`);
    if (card) {
      card.classList.add('card--fade-out');
      setTimeout(() => {
        removeItemFromList(item.id);
        applyFilters();
      }, 350);
    } else {
      removeItemFromList(item.id);
      applyFilters();
    }

    showToast('Item deleted');
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
    if (deleteBtn) {
      deleteBtn.classList.remove('btn--loading');
      deleteBtn.disabled = false;
    }
  }
}

// ───── Add Modal ─────
function openAddModal() {
  addForm.reset();
  addForm.querySelectorAll('.form__error').forEach(e => e.remove());
  addForm.querySelectorAll('.form__input--error, .form__textarea--error, .form__select--error')
    .forEach(e => e.classList.remove('form__input--error', 'form__textarea--error', 'form__select--error'));
  addModal.classList.add('active');
  addForm.querySelector('[name="name"]').focus();
}

function closeAddModal() {
  addModal.classList.remove('active');
}

addItemBtn.addEventListener('click', openAddModal);
addClose.addEventListener('click', closeAddModal);
addCancel.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (e) => {
  if (e.target === addModal) closeAddModal();
});

addSubmit.addEventListener('click', async () => {
  const fd = new FormData(addForm);
  const data = {};
  for (const [key, val] of fd.entries()) {
    const trimmed = val.trim();
    if (trimmed) data[key] = trimmed;
  }

  if (!data.name) {
    showToast('Name is required', 'error');
    return;
  }

  ['impact_score', 'ease_score', 'priority_score'].forEach(f => {
    if (data[f]) data[f] = parseFloat(data[f]);
  });
  if (!data.expected_delivery) data.expected_delivery = null;

  try {
    addSubmit.classList.add('btn--loading');
    addSubmit.disabled = true;
    const created = await apiCreateItem(data);
    created._movedAt = Date.now();
    allItems.unshift(created);
    closeAddModal();
    applyFilters();
    showToast(`Created: ${created.name}`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    addSubmit.classList.remove('btn--loading');
    addSubmit.disabled = false;
  }
});

// ───── Keyboard Shortcuts ─────
document.addEventListener('keydown', (e) => {
  // Escape: cancel inline edit → close detail → close add modal
  if (e.key === 'Escape') {
    if (activeEditField) {
      const activeWrapper = detailModal.querySelector(`.modal .editable--active`);
      if (activeWrapper) revertInlineEdit(activeWrapper, activeEditField);
      else activeEditField = null;
    } else if (detailModal.classList.contains('active')) {
      closeDetail();
    } else if (addModal.classList.contains('active')) {
      closeAddModal();
    }
    return;
  }

  // Ctrl/Cmd+K → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // Enter in add form submits
  if (e.key === 'Enter' && addModal.classList.contains('active') && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    addSubmit.click();
  }
});

// ───── Populate category filter + add-form dropdown ─────
function populateCategories(categories) {
  // Build checkboxes for unified filter panel
  filterCategoriesEl.innerHTML = '';
  categories.forEach(cat => {
    const catStyle = getCategoryStyle(cat);
    const swatchBg = catStyle.bg || 'var(--bg-badge)';
    const label = document.createElement('label');
    label.className = 'filter-menu__option';
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(cat)}"><span class="filter-menu__option-swatch" style="background:${swatchBg}"></span><span>${escapeHtml(cat)}</span>`;
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedCategories.add(cat);
      } else {
        selectedCategories.delete(cat);
      }
      updateFilterBadge();
      applyFilters();
    });
    filterCategoriesEl.appendChild(label);
  });

  // Add-form category dropdown (unchanged behavior)
  addCategory.innerHTML = '<option value="Uncategorized">Uncategorized</option>';
  categories.filter(c => c !== 'Uncategorized').forEach(cat => {
    addCategory.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });
}

// ───── Filter Panel Toggle ─────
function toggleFilterPanel() {
  const isOpen = filterPanel.classList.toggle('filter-menu__panel--open');
  filterToggle.setAttribute('aria-expanded', isOpen);
}

function closeFilterPanel() {
  filterPanel.classList.remove('filter-menu__panel--open');
  filterToggle.setAttribute('aria-expanded', 'false');
}

function updateFilterBadge() {
  const count = selectedCategories.size;
  if (count > 0) {
    filterBadge.textContent = count;
    filterBadge.classList.add('filter-menu__badge--visible');
  } else {
    filterBadge.classList.remove('filter-menu__badge--visible');
  }
}

function clearAllFilters() {
  selectedCategories.clear();
  filterCategoriesEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  // Reset sort to priority
  currentSort = 'priority';
  const sortRadios = document.querySelectorAll('#filterSort input[type="radio"]');
  sortRadios.forEach(r => { r.checked = r.value === 'priority'; });
  updateFilterBadge();
  applyFilters();
}

filterToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFilterPanel();
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#filterMenu')) {
    closeFilterPanel();
  }
});

// Sort radio change handler
document.querySelectorAll('#filterSort input[type="radio"]').forEach(radio => {
  radio.addEventListener('change', () => {
    currentSort = radio.value;
    applyFilters();
  });
});

// Clear all filters button
$('filterClear').addEventListener('click', clearAllFilters);

// ───── Init ─────
async function init() {
  initTheme();

  try {
    roadmapData = await fetchRoadmap();
    allItems = roadmapData.items || [];
    filteredItems = [...allItems];

    populateCategories(roadmapData.metadata?.categories || []);

    if (roadmapData.last_updated) {
      const d = new Date(roadmapData.last_updated);
      lastUpdated.textContent = `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    loadingState.remove();
    applyFilters();
  } catch (err) {
    loadingState.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">\u26A0\uFE0F</div>
        <div class="empty-state__text">Failed to load roadmap. Is the API running?</div>
      </div>`;
    console.error('Init error:', err);
  }
}

searchInput.addEventListener('input', applyFilters);

document.addEventListener('DOMContentLoaded', init);
