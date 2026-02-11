// ───── Auth State ─────
let currentUser = null;

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      currentUser = await safeJson(res);
      updateAuthUI();
    }
  } catch (_) {
    // Not authenticated — that's fine
  }
}

async function doLogin(username, password, remember) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password, remember }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  currentUser = data.user;
  updateAuthUI();
  return data;
}

async function doLogout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  currentUser = null;
  window.location.href = '/';
}

function updateAuthUI() {
  // Remove old auth-controls if present
  const existing = document.querySelector('.auth-controls');
  if (existing) existing.remove();

  // Update the user menu (avatar dropdown in header)
  const userMenu = document.getElementById('userMenu');
  const avatarImg = document.getElementById('userAvatarImg');
  const initialsEl = document.getElementById('userInitials');
  const nameEl = document.getElementById('dropdownName');
  const emailEl = document.getElementById('dropdownEmail');
  const roleEl = document.getElementById('dropdownRole');

  if (currentUser && userMenu) {
    userMenu.style.display = 'block';

    // Avatar or initials
    if (currentUser.picture && avatarImg) {
      avatarImg.src = currentUser.picture;
      avatarImg.alt = currentUser.name || currentUser.username;
      avatarImg.style.display = 'block';
      if (initialsEl) initialsEl.style.display = 'none';
    } else if (initialsEl) {
      const name = currentUser.name || currentUser.username || '';
      const initials = name.includes(' ')
        ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : name.substring(0, 2).toUpperCase();
      initialsEl.textContent = initials;
      initialsEl.style.display = 'flex';
      if (avatarImg) avatarImg.style.display = 'none';
    }

    // Dropdown info
    if (nameEl) nameEl.textContent = currentUser.name || currentUser.username;
    if (emailEl) emailEl.textContent = currentUser.email;
    if (roleEl) roleEl.textContent = currentUser.role;
  }
}

// ───── User menu interactions ─────
function initUserMenu() {
  const avatar = document.getElementById('userAvatar');
  const dropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('menuLogout');

  if (avatar && dropdown) {
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', doLogout);
  }
}

// ───── Login Modal (fallback for password auth) ─────
function openLoginModal() {
  let overlay = document.getElementById('loginModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loginModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal__header">
          <h2 class="modal__header-title">Login</h2>
          <button class="modal__close" id="loginClose">&times;</button>
        </div>
        <div class="modal__body">
          <form id="loginForm">
            <div class="form__group">
              <label class="form__label">Username</label>
              <input class="form__input" type="text" name="username" required autocomplete="username">
            </div>
            <div class="form__group">
              <label class="form__label">Password</label>
              <input class="form__input" type="password" name="password" required autocomplete="current-password">
            </div>
            <div class="form__group" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" name="remember" id="loginRemember">
              <label for="loginRemember" style="font-size:13px;cursor:pointer">Remember me</label>
            </div>
            <div id="loginError" style="color:var(--coral);font-size:13px;margin-bottom:8px;display:none"></div>
          </form>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="loginCancel" type="button">Cancel</button>
          <button class="btn btn--primary" id="loginSubmit" type="button">Login</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#loginClose').addEventListener('click', closeLoginModal);
    overlay.querySelector('#loginCancel').addEventListener('click', closeLoginModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLoginModal();
    });

    overlay.querySelector('#loginSubmit').addEventListener('click', submitLogin);
    overlay.querySelector('#loginForm').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitLogin(); }
    });
  }

  overlay.classList.add('active');
  overlay.querySelector('[name="username"]').focus();
}

function closeLoginModal() {
  const overlay = document.getElementById('loginModal');
  if (overlay) overlay.classList.remove('active');
}

async function submitLogin() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmit');
  const fd = new FormData(form);

  const username = (fd.get('username') || '').trim();
  const password = fd.get('password') || '';
  const remember = fd.has('remember');

  if (!username || !password) {
    errorEl.textContent = 'Username and password required';
    errorEl.style.display = 'block';
    return;
  }

  try {
    submitBtn.classList.add('btn--loading');
    submitBtn.disabled = true;
    errorEl.style.display = 'none';
    await doLogin(username, password, remember);
    closeLoginModal();
    showToast(`Welcome, ${currentUser.username}!`);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.classList.remove('btn--loading');
    submitBtn.disabled = false;
  }
}

// ───── Voting ─────
async function voteOnItem(itemId, voteType) {
  if (!currentUser) {
    showToast('Login required to vote', 'error');
    openLoginModal();
    return null;
  }
  const res = await fetch(`/api/roadmap/items/${itemId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ vote: voteType || 'up' }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Vote failed');
  return data;
}

// ───── Safe JSON helper ─────
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (res.status === 401) throw new Error('Session expired — please log in again');
    throw new Error(`Server error (${res.status})`);
  }
  return res.json();
}

// ───── Comments ─────
async function loadComments(itemId) {
  const res = await fetch(`/api/roadmap/items/${itemId}/comments`, {
    credentials: 'same-origin',
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load comments');
  return data.comments || [];
}

async function addComment(itemId, text) {
  if (!currentUser) {
    showToast('Login required to comment', 'error');
    openLoginModal();
    return null;
  }
  const res = await fetch(`/api/roadmap/items/${itemId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ comment: text }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to add comment');
  return data.comment;
}

async function deleteComment(itemId, commentId) {
  const res = await fetch(`/api/roadmap/items/${itemId}/comments/${commentId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to delete comment');
  return data;
}

// ───── Init ─────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initUserMenu();
});
