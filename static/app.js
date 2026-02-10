// ───── State ─────
let roadmapData = null;
let allItems = [];
let filteredItems = [];
let currentDetailItem = null;
let isEditMode = false;
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
  'CS Enablement':        { bg: '#13D77A', text: '#FFFFFF' },
  'Reliability':          { bg: '#FFA987', text: '#101A28' },
  'Measurement':          { bg: '#F7EE6C', text: '#101A28' },
  'Documentation':        { bg: '#80D7DB', text: '#101A28' },
  'Governance':           { bg: '#FFA987', text: '#101A28' },
  'Product Intelligence': { bg: '#13D77A', text: '#FFFFFF' },
  'Infrastructure':       { bg: null, text: null },
  'Knowledge Mgmt':       { bg: '#80D7DB', text: '#101A28' },
  'Uncategorized':        { bg: null, text: null },
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
const detailEdit = $('detailEdit');
const detailDelete = $('detailDelete');
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

// ───── Detail Modal (Read-Only) ─────
function openDetail(item) {
  currentDetailItem = item;
  isEditMode = false;
  renderDetailView(item);
  renderDetailFooter(false);
  detailModal.classList.add('active');
}

function renderDetailView(item) {
  detailTitle.textContent = item.name;

  const catStyle = getCategoryStyle(item.category);
  const valOrMuted = (val) => isTBD(val)
    ? `<span class="detail__value detail__value--muted">${escapeHtml(val || 'TBD')}</span>`
    : `<span class="detail__value">${escapeHtml(val)}</span>`;

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
      <span class="detail__meta-badge">${STATUS_LABELS[item.status] || item.status}</span>
      ${item.build_time ? `<span class="detail__meta-badge">${escapeHtml(item.build_time)}</span>` : ''}
    </div>

    <div class="detail__section">
      <div class="detail__label">Description</div>
      ${valOrMuted(item.description)}
    </div>

    <div class="detail__section">
      <div class="detail__label">Business Impact</div>
      ${valOrMuted(item.business_impact)}
    </div>

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Outcome</div>
        ${valOrMuted(item.outcome)}
      </div>
      <div class="detail__section">
        <div class="detail__label">Success Metric</div>
        ${valOrMuted(item.success_metric)}
      </div>
    </div>

    ${scoreBar('Impact', item.impact_score)}
    ${scoreBar('Ease', item.ease_score)}
    ${scoreBar('Priority', item.priority_score)}

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Start Date</div>
        ${valOrMuted(item.start_date)}
      </div>
      <div class="detail__section">
        <div class="detail__label">Completed Date</div>
        ${valOrMuted(item.completed_date)}
      </div>
    </div>

    <div class="detail__section">
      <div class="detail__label">Expected Delivery</div>
      ${formatExpectedDelivery(item)}
    </div>

    <div class="detail__section">
      <div class="detail__label">Dependencies</div>
      ${valOrMuted(item.dependencies || 'None')}
    </div>

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Owner</div>
        <span class="detail__value">${escapeHtml(item.owner || 'Unassigned')}</span>
      </div>
      <div class="detail__section">
        <div class="detail__label">Added</div>
        <span class="detail__value">${escapeHtml(item.added_date || 'Unknown')}</span>
      </div>
    </div>
  `;
}

function renderDetailFooter(editing) {
  if (editing) {
    detailFooter.innerHTML = `
      <button class="btn btn--outline" id="editCancel">Cancel</button>
      <button class="btn btn--primary" id="editSave">Save Changes</button>
    `;
    $('editCancel').addEventListener('click', cancelEdit);
    $('editSave').addEventListener('click', saveEdit);
  } else {
    detailFooter.innerHTML = `
      <button class="btn btn--danger" id="detailDelete">Delete</button>
      <button class="btn btn--outline" id="detailEdit">Edit</button>
    `;
    $('detailDelete').addEventListener('click', () => showDeleteConfirmation(currentDetailItem));
    $('detailEdit').addEventListener('click', () => enterEditMode(currentDetailItem));
  }
}

function closeDetail() {
  detailModal.classList.remove('active');
  isEditMode = false;
  // Remove any lingering confirmation overlays
  const overlay = detailModal.querySelector('.confirm-overlay');
  if (overlay) overlay.remove();
  // Return focus
  if (lastFocusTrigger && lastFocusTrigger.isConnected) {
    lastFocusTrigger.focus();
    lastFocusTrigger = null;
  }
}

detailClose.addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeDetail();
});

// ───── Edit Mode ─────
function enterEditMode(item) {
  isEditMode = true;
  detailTitle.textContent = 'Edit Item';

  const field = (label, name, value, type = 'text', opts = {}) => {
    const req = opts.required ? '<span class="required">*</span>' : '';
    const ph = opts.placeholder || '';
    if (type === 'textarea') {
      return `<div class="form__group">
        <label class="form__label">${label} ${req}</label>
        <textarea class="form__textarea" name="${name}" placeholder="${ph}" rows="${opts.rows || 3}">${escapeHtml(value || '')}</textarea>
      </div>`;
    }
    if (type === 'select-category') {
      return `<div class="form__group">
        <label class="form__label">${label} ${req}</label>
        <select class="form__select" name="${name}">${categoryOptions(value)}</select>
      </div>`;
    }
    if (type === 'select-status') {
      return `<div class="form__group">
        <label class="form__label">${label}</label>
        <select class="form__select" name="${name}">${statusOptions(value)}</select>
      </div>`;
    }
    const step = opts.step ? `step="${opts.step}"` : '';
    const min = opts.min != null ? `min="${opts.min}"` : '';
    const max = opts.max != null ? `max="${opts.max}"` : '';
    return `<div class="form__group">
      <label class="form__label">${label} ${req}</label>
      <input class="form__input" type="${type}" name="${name}" value="${escapeHtml(value || '')}" placeholder="${ph}" ${step} ${min} ${max}>
    </div>`;
  };

  detailBody.innerHTML = `
    <form id="editForm">
      ${field('Name', 'name', item.name, 'text', { required: true })}
      <div class="form__row">
        ${field('Category', 'category', item.category, 'select-category', { required: true })}
        ${field('Status', 'status', item.status, 'select-status')}
      </div>
      ${field('Description', 'description', item.description, 'textarea', { placeholder: 'What does it do?' })}
      ${field('Business Impact', 'business_impact', item.business_impact, 'textarea', { placeholder: 'Why does it matter?' })}
      ${field('Outcome', 'outcome', item.outcome, 'textarea', { placeholder: 'What changes when this ships?', rows: 2 })}
      ${field('Success Metric', 'success_metric', item.success_metric, 'text', { placeholder: 'How will you measure success?' })}
      <div class="form__row">
        ${field('Impact', 'impact_score', item.impact_score, 'number', { min: 0, max: 10, step: 0.1 })}
        ${field('Ease', 'ease_score', item.ease_score, 'number', { min: 0, max: 10, step: 0.1 })}
        ${field('Priority', 'priority_score', item.priority_score, 'number', { min: 0, max: 10, step: 0.1 })}
      </div>
      <div class="form__row">
        ${field('Build Time', 'build_time', item.build_time, 'text', { placeholder: 'e.g. 3-4 hrs' })}
        ${field('Expected Delivery', 'expected_delivery', item.expected_delivery || '', 'date')}
      </div>
      <div class="form__row">
        ${field('Dependencies', 'dependencies', item.dependencies, 'text', { placeholder: 'e.g. #14, #18' })}
        ${field('Owner', 'owner', item.owner, 'text', { placeholder: 'Zev' })}
      </div>
    </form>
  `;

  renderDetailFooter(true);

  // Focus first field
  const firstInput = detailBody.querySelector('[name="name"]');
  if (firstInput) firstInput.focus();
}

function cancelEdit() {
  if (!currentDetailItem) return;
  isEditMode = false;
  renderDetailView(currentDetailItem);
  renderDetailFooter(false);
  detailTitle.textContent = currentDetailItem.name;
}

async function saveEdit() {
  const form = $('editForm');
  if (!form) return;

  // Clear previous errors
  form.querySelectorAll('.form__error').forEach(e => e.remove());
  form.querySelectorAll('.form__input--error, .form__textarea--error, .form__select--error')
    .forEach(e => e.classList.remove('form__input--error', 'form__textarea--error', 'form__select--error'));

  const fd = new FormData(form);
  const data = {};
  for (const [key, val] of fd.entries()) {
    data[key] = val.trim();
  }

  // Validate
  let hasErrors = false;
  function addError(name, msg) {
    hasErrors = true;
    const input = form.querySelector(`[name="${name}"]`);
    if (input) {
      const cls = input.tagName === 'TEXTAREA' ? 'form__textarea--error'
        : input.tagName === 'SELECT' ? 'form__select--error'
        : 'form__input--error';
      input.classList.add(cls);
      const errEl = document.createElement('div');
      errEl.className = 'form__error';
      errEl.textContent = msg;
      input.parentNode.appendChild(errEl);
    }
  }

  if (!data.name) addError('name', 'Name is required');
  ['impact_score', 'ease_score', 'priority_score'].forEach(f => {
    if (data[f] !== '') {
      const v = parseFloat(data[f]);
      if (isNaN(v) || v < 0 || v > 10) addError(f, 'Must be 0-10');
      else data[f] = v;
    } else {
      data[f] = 0;
    }
  });

  // Convert empty date to null
  if (!data.expected_delivery) data.expected_delivery = null;

  if (hasErrors) return;

  // Save
  const saveBtn = $('editSave');
  try {
    saveBtn.classList.add('btn--loading');
    saveBtn.disabled = true;
    const updated = await apiUpdateItem(currentDetailItem.id, data);
    syncItemInList(updated);
    currentDetailItem = updated;
    isEditMode = false;
    renderDetailView(updated);
    renderDetailFooter(false);
    detailTitle.textContent = updated.name;
    applyFilters();
    showToast('Changes saved');
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.classList.remove('btn--loading');
      saveBtn.disabled = false;
    }
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
  // Escape closes modals / cancels edit
  if (e.key === 'Escape') {
    if (isEditMode) {
      cancelEdit();
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

  // Enter in edit form saves
  if (e.key === 'Enter' && isEditMode && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    const saveBtn = $('editSave');
    if (saveBtn) saveBtn.click();
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
