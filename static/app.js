// ───── State ─────
let roadmapData = null;
let allItems = [];
let filteredItems = [];

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
  'Infrastructure':       { bg: null, text: null },  // theme-dependent
  'Knowledge Mgmt':       { bg: '#80D7DB', text: '#101A28' },
  'Uncategorized':        { bg: null, text: null },  // theme-dependent
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
  requestAnimationFrame(() => {
    themeIcon.style.transform = 'rotate(360deg)';
  });
}

themeToggle.addEventListener('click', toggleTheme);

// ───── API ─────
const API = '/api';

async function fetchRoadmap() {
  const res = await fetch(`${API}/roadmap`);
  if (!res.ok) throw new Error('Failed to load roadmap');
  return res.json();
}

async function createItem(data) {
  const res = await fetch(`${API}/roadmap/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create item');
  return json;
}

// ───── Toast ─────
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const icon = type === 'success' ? '\u2705' : '\u274C';
  toast.innerHTML = `<span class="toast__icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ───── Helpers ─────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getCategoryStyle(category) {
  const colors = CATEGORY_COLORS[category];
  const isDark = document.body.classList.contains('dark');

  if (category === 'Infrastructure') {
    return { bg: isDark ? '#ECEDE7' : '#101A28', text: isDark ? '#101A28' : '#FFFFFF' };
  }
  if (category === 'Uncategorized') {
    return { bg: isDark ? '#374151' : '#E5E7EB', text: isDark ? '#D1D5DB' : '#4B5563' };
  }
  if (colors) return colors;
  return { bg: '#E5E7EB', text: '#4B5563' };
}

function formatDate(str) {
  if (!str) return null;
  return str;
}

function isTBD(val) {
  return !val || val === 'TBD' || val.startsWith('TBD');
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
      <div class="kanban__cards"></div>
    `;

    const cardsContainer = col.querySelector('.kanban__cards');

    if (items.length === 0) {
      cardsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">\u{1F4CB}</div>
          <div class="empty-state__text">No items</div>
        </div>`;
    } else {
      items.forEach(item => {
        cardsContainer.appendChild(createCard(item));
      });
    }

    kanban.appendChild(col);
  });
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.addEventListener('click', () => openDetail(item));

  const catStyle = getCategoryStyle(item.category);
  const needsDarkText = ['Measurement', 'DevOps', 'Documentation', 'Knowledge Mgmt', 'Reliability', 'Governance'].includes(item.category)
    || item.category === 'Infrastructure' || item.category === 'Uncategorized';

  const priorityHtml = item.priority_score > 0
    ? `<span class="card__priority">\u2B50 ${item.priority_score}</span>`
    : '';

  card.innerHTML = `
    <div class="card__top">
      <span class="card__id">#${item.id}</span>
      ${priorityHtml}
    </div>
    <div class="card__title">${escapeHtml(item.name)}</div>
    <div class="card__bottom">
      <span class="card__category${needsDarkText ? ' card__category--dark-text' : ''}"
            style="background:${catStyle.bg};color:${catStyle.text}">
        ${escapeHtml(item.category)}
      </span>
      <span class="card__owner">${getInitials(item.owner)}</span>
    </div>
  `;

  return card;
}

// ───── Detail Modal ─────
function openDetail(item) {
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
          <div class="score-bar__fill" style="width:${(val / 10) * 100}%"></div>
        </div>
        <span class="score-bar__label">${val}</span>
      </div>
    </div>`;

  detailBody.innerHTML = `
    <div class="detail__meta">
      <span class="detail__meta-badge" style="background:${catStyle.bg};color:${catStyle.text}">${escapeHtml(item.category)}</span>
      <span class="detail__meta-badge">#${item.id}</span>
      <span class="detail__meta-badge">${STATUS_LABELS[item.status] || item.status}</span>
      ${item.phase ? `<span class="detail__meta-badge">${escapeHtml(item.phase)}</span>` : ''}
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

    ${scoreBar('Impact', item.impact_score || 0)}
    ${scoreBar('Ease', item.ease_score || 0)}
    ${scoreBar('Priority', item.priority_score || 0)}

    <div class="detail__row">
      <div class="detail__section">
        <div class="detail__label">Start Date</div>
        ${valOrMuted(formatDate(item.start_date))}
      </div>
      <div class="detail__section">
        <div class="detail__label">Completed Date</div>
        ${valOrMuted(formatDate(item.completed_date))}
      </div>
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

  detailModal.classList.add('active');
}

function closeDetail() {
  detailModal.classList.remove('active');
}

detailClose.addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeDetail();
});

// ───── Add Modal ─────
function openAddModal() {
  addForm.reset();
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

  // Convert numeric fields
  ['impact_score', 'ease_score', 'priority_score'].forEach(f => {
    if (data[f]) data[f] = parseFloat(data[f]);
  });

  try {
    addSubmit.disabled = true;
    addSubmit.textContent = 'Creating...';
    const created = await createItem(data);
    allItems.push(created);
    closeAddModal();
    applyFilters();
    showToast(`Created: ${created.name}`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    addSubmit.disabled = false;
    addSubmit.textContent = 'Create Item';
  }
});

// ───── Keyboard ─────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetail();
    closeAddModal();
  }
});

// ───── Populate category dropdowns ─────
function populateCategories(categories) {
  // Controls filter
  categoryFilter.innerHTML = '<option value="">All Categories</option>';
  categories.forEach(cat => {
    categoryFilter.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });

  // Add form
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

    // Populate UI
    populateCategories(roadmapData.metadata?.categories || []);

    if (roadmapData.last_updated) {
      const d = new Date(roadmapData.last_updated);
      lastUpdated.textContent = `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    // Remove loading, render
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

// Event listeners for controls
searchInput.addEventListener('input', applyFilters);
categoryFilter.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);

document.addEventListener('DOMContentLoaded', init);
