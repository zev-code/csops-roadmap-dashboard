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
  build_time:        { type: 'text', placeholder: 'e.g. 3-4 hrs' },
  description:       { type: 'textarea', placeholder: 'What does it do?' },
  business_impact:   { type: 'textarea', placeholder: 'Why does it matter?' },
  outcome:           { type: 'textarea', placeholder: 'What changes when this ships?' },
  success_metric:    { type: 'text', placeholder: 'How will you measure success?' },
  start_date:        { type: 'date' },
  completed_date:    { type: 'date' },
  expected_delivery: { type: 'date' },
  owner:             { type: 'text', placeholder: 'e.g. Zev' },
};

// ───── DOM refs ─────
const $ = (id) => document.getElementById(id);
const kanban = $('kanban');
const loadingState = $('loadingState');
const searchInput = $('searchInput');
const categoryFilter = $('categoryFilter');
const sortSelect = $('sortSelect');
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

async function fetchRoadmap() {
  const res = await fetch(`${API}/roadmap`);
  if (!res.ok) throw new Error('Failed to load roadmap');
  return res.json();
}

async function apiCreateItem(data) {
  const res = await fetch(`${API}/roadmap/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Create failed');
  return json;
}

async function apiUpdateItem(id, data) {
  const res = await fetch(`${API}/roadmap/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Update failed');
  return json;
}

async function apiUpdateStatus(id, status) {
  const res = await fetch(`${API}/roadmap/items/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Status update failed');
  return json;
}

async function apiDeleteItem(id) {
  const res = await fetch(`${API}/roadmap/items/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Delete failed');
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
  if (idx !== -1) allItems[idx] = updated;
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
  const cat = categoryFilter.value;
  const sort = sortSelect.value;

  filteredItems = allItems.filter(item => {
    if (cat && item.category !== cat) return false;
    if (query) {
      const searchable = `${item.name} ${item.description} ${item.category} ${item.business_impact} ${item.dependencies}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  const sorters = {
    priority: (a, b) => (b.priority_score || 0) - (a.priority_score || 0),
    id: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name),
    impact: (a, b) => (b.impact_score || 0) - (a.impact_score || 0),
    ease: (a, b) => (b.ease_score || 0) - (a.ease_score || 0),
  };
  filteredItems.sort(sorters[sort] || sorters.priority);

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
  card.setAttribute('aria-label', `${item.name}, ${STATUS_LABELS[item.status]}, priority ${item.priority_score}`);

  const catStyle = getCategoryStyle(item.category);
  const priorityHtml = item.priority_score > 0
    ? `<span class="card__priority">\u2B50 ${item.priority_score}</span>`
    : '';

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

  card.innerHTML = `
    <div class="card__top">
      <span class="card__id">#${item.id}</span>
      ${priorityHtml}
    </div>
    <div class="card__title">${escapeHtml(item.name)}</div>
    ${overdueHtml}
    <div class="card__bottom">
      <span class="card__category" style="background:${catStyle.bg};color:${catStyle.text}">
        ${escapeHtml(item.category)}
      </span>
      <span class="card__owner">${getInitials(item.owner)}</span>
    </div>
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
  applyFilters();
  showToast(`Moved to ${STATUS_LABELS[newStatus]}`);

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
  renderDetailView(item);
  renderDetailFooter();
  detailModal.classList.add('active');
}

function getFieldDisplayHtml(fieldName, item) {
  const valOrMuted = (val) => isTBD(val)
    ? `<span class="detail__value detail__value--muted">${escapeHtml(val || 'TBD')}</span>`
    : `<span class="detail__value">${escapeHtml(val)}</span>`;

  switch (fieldName) {
    case 'status':
      return `<span class="detail__meta-badge">${STATUS_LABELS[item.status] || item.status}</span>`;
    case 'build_time':
      return item.build_time
        ? `<span class="detail__meta-badge">${escapeHtml(item.build_time)}</span>`
        : `<span class="detail__meta-badge detail__meta-badge--muted">+ Build Time</span>`;
    case 'expected_delivery':
      return formatExpectedDelivery(item);
    case 'owner':
      return `<span class="detail__value">${escapeHtml(item.owner || 'Unassigned')}</span>`;
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

  const scoreBar = (label, val) => `
    <div class="detail__section">
      <div class="detail__label">${label}</div>
      <div class="score-bar">
        <div class="score-bar__track">
          <div class="score-bar__fill" style="width:${((val || 0) / 10) * 100}%"></div>
        </div>
        <span class="score-bar__label">${val || 0}</span>
      </div>
    </div>`;

  detailBody.innerHTML = `
    <div class="detail__meta">
      <span class="detail__meta-badge" style="background:${catStyle.bg};color:${catStyle.text}">${escapeHtml(item.category)}</span>
      <span class="detail__meta-badge">#${item.id}</span>
      ${editable('status', getFieldDisplayHtml('status', item))}
      ${editable('build_time', getFieldDisplayHtml('build_time', item))}
    </div>

    <div class="detail__section">
      <div class="detail__label">Description</div>
      ${editable('description', getFieldDisplayHtml('description', item))}
    </div>

    <div class="detail__section">
      <div class="detail__label">Business Impact</div>
      ${editable('business_impact', getFieldDisplayHtml('business_impact', item))}
    </div>

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Outcome</div>
        ${editable('outcome', getFieldDisplayHtml('outcome', item))}
      </div>
      <div class="detail__section">
        <div class="detail__label">Success Metric</div>
        ${editable('success_metric', getFieldDisplayHtml('success_metric', item))}
      </div>
    </div>

    ${scoreBar('Impact', item.impact_score)}
    ${scoreBar('Ease', item.ease_score)}
    ${scoreBar('Priority', item.priority_score)}

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Start Date</div>
        ${editable('start_date', getFieldDisplayHtml('start_date', item))}
      </div>
      <div class="detail__section">
        <div class="detail__label">Completed Date</div>
        ${editable('completed_date', getFieldDisplayHtml('completed_date', item))}
      </div>
    </div>

    <div class="detail__section">
      <div class="detail__label">Expected Delivery</div>
      ${editable('expected_delivery', getFieldDisplayHtml('expected_delivery', item))}
    </div>

    <div class="detail__section">
      <div class="detail__label">Dependencies</div>
      <span class="detail__value">${escapeHtml(item.dependencies || 'None')}</span>
    </div>

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Owner</div>
        ${editable('owner', getFieldDisplayHtml('owner', item))}
      </div>
      <div class="detail__section">
        <div class="detail__label">Added</div>
        <span class="detail__value">${escapeHtml(item.added_date || 'Unknown')}</span>
      </div>
    </div>
  `;

  attachEditableHandlers();
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
  detailBody.querySelectorAll('.editable').forEach(el => {
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
    const activeInput = detailBody.querySelector('.editable--active input, .editable--active textarea, .editable--active select');
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
  } else if (config.type === 'textarea') {
    inputHtml = `<textarea class="editable__textarea" data-field="${fieldName}" placeholder="${config.placeholder || ''}" rows="3">${escapeHtml(currentValue)}</textarea>`;
  } else if (config.type === 'date') {
    inputHtml = `<input class="editable__input" type="date" data-field="${fieldName}" value="${escapeHtml(currentValue || '')}">`;
  } else {
    inputHtml = `<input class="editable__input" type="text" data-field="${fieldName}" value="${escapeHtml(currentValue)}" placeholder="${config.placeholder || ''}">`;
  }

  wrapperEl.innerHTML = inputHtml;
  const input = wrapperEl.querySelector('input, textarea, select');
  input.focus();
  if (input.type === 'text') input.select();

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
  const oldNorm = oldValue || '';
  const newNorm = newValue || '';

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
  currentDetailItem[fieldName] = newValue || null;

  try {
    const payload = { ...currentDetailItem, _edited_by: 'Zev' };
    delete payload.edit_history;

    const updated = await apiUpdateItem(currentDetailItem.id, payload);
    syncItemInList(updated);
    currentDetailItem = updated;

    wrapperEl.classList.remove('editable--saving');
    wrapperEl.innerHTML = `<div class="editable__display">${getFieldDisplayHtml(fieldName, updated)}</div>`;

    if (fieldName === 'status') {
      rerenderDateFields(updated);
    }

    applyFilters();
    showToast(`Updated ${fieldName.replace(/_/g, ' ')}`);
  } catch (err) {
    currentDetailItem[fieldName] = oldValue;
    wrapperEl.classList.remove('editable--saving');
    wrapperEl.innerHTML = `<div class="editable__display">${getFieldDisplayHtml(fieldName, currentDetailItem)}</div>`;
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

function rerenderDateFields(item) {
  ['start_date', 'completed_date', 'expected_delivery'].forEach(fieldName => {
    const el = detailBody.querySelector(`.editable[data-field="${fieldName}"]`);
    if (el && !el.classList.contains('editable--active')) {
      el.innerHTML = `<div class="editable__display">${getFieldDisplayHtml(fieldName, item)}</div>`;
    }
  });
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
    allItems.push(created);
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
      const activeWrapper = detailBody.querySelector(`.editable--active`);
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

// ───── Populate category dropdowns ─────
function populateCategories(categories) {
  categoryFilter.innerHTML = '<option value="">All Categories</option>';
  categories.forEach(cat => {
    categoryFilter.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });

  addCategory.innerHTML = '<option value="Uncategorized">Uncategorized</option>';
  categories.filter(c => c !== 'Uncategorized').forEach(cat => {
    addCategory.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });
}

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
categoryFilter.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);

document.addEventListener('DOMContentLoaded', init);
