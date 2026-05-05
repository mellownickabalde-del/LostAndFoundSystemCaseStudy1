const API_BASE = '/api';

const Auth = {
  setSession(data) {
    localStorage.setItem('lf_token', data.token);
    localStorage.setItem('lf_user', JSON.stringify({ _id: data._id, name: data.name, email: data.email, role: data.role }));
  },
  getToken() { return localStorage.getItem('lf_token'); },
  getUser() { const u = localStorage.getItem('lf_user'); return u ? JSON.parse(u) : null; },
  isLoggedIn() { return !!this.getToken(); },
  isAdmin() { const u = this.getUser(); return u && u.role === 'admin'; },
  logout() { localStorage.removeItem('lf_token'); localStorage.removeItem('lf_user'); window.location.href = '/index.html'; },
  updateUser(data) {
    const u = this.getUser();
    const updated = { ...u, ...data };
    localStorage.setItem('lf_user', JSON.stringify(updated));
  }
};

async function apiCall(method, endpoint, body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${Auth.getToken()}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed with status ${res.status}`);
  return data;
}

async function apiUpload(endpoint, formData) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data;
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => { toast.classList.remove('toast--visible'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function requireAuth(adminRequired = false) {
  if (!Auth.isLoggedIn()) { window.location.href = '/index.html'; return false; }
  if (adminRequired && !Auth.isAdmin()) { window.location.href = '/dashboard.html'; return false; }
  return true;
}

function renderUserInfo(selector = '#userInfo') {
  const el = document.querySelector(selector);
  const user = Auth.getUser();
  if (el && user) {
    el.innerHTML = `
      <span class="user-badge">
        <span class="user-badge__avatar">${user.name.charAt(0).toUpperCase()}</span>
        <span class="user-badge__name">${user.name}</span>
        <span class="user-badge__role ${user.role}">${user.role}</span>
      </span>`;
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}