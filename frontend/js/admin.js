document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth(true)) return;
  renderUserInfo();

  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn?.addEventListener('click', () => Auth.logout());

  // ── Tab Switching ─────────────────────────────────────────────────────────
  const tabs   = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('tab-btn--active'));
      panels.forEach(p => p.classList.remove('tab-panel--active'));
      btn.classList.add('tab-btn--active');
      const panelId = btn.dataset.tab;
      document.getElementById(panelId).classList.add('tab-panel--active');
      if (panelId === 'statsPanel')   loadStats();
      if (panelId === 'logsPanel')    loadLogs(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // USERS TAB
  // ════════════════════════════════════════════════════════════════════════════
  const userTableBody  = document.getElementById('userTableBody');
  const createUserForm = document.getElementById('createUserForm');
  const editModal      = document.getElementById('editModal');
  const editForm       = document.getElementById('editForm');
  const searchInput    = document.getElementById('searchUsers');
  let allUsers = [];

  async function loadUsers() {
    userTableBody.innerHTML = `<tr><td colspan="5" class="loading-row"><span class="spinner"></span> Loading…</td></tr>`;
    try {
      allUsers = await apiCall('GET', '/users');
      renderUsers(allUsers);
      updateUserStats(allUsers);
    } catch (err) {
      showToast(err.message, 'error');
      userTableBody.innerHTML = `<tr><td colspan="5" class="error-row">Failed to load users.</td></tr>`;
    }
  }

  function renderUsers(users) {
    if (!users.length) {
      userTableBody.innerHTML = `<tr><td colspan="5" class="empty-row">No users found.</td></tr>`;
      return;
    }
    userTableBody.innerHTML = users.map(u => `
      <tr class="${!u.isActive ? 'row--inactive' : ''}">
        <td>
          <div class="user-cell">
            <span class="avatar">${u.name.charAt(0).toUpperCase()}</span>
            <div>
              <div class="user-cell__name">${escHtml(u.name)}</div>
              <div class="user-cell__email">${escHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge--${u.role}">${u.role}</span></td>
        <td><span class="status-pill ${u.isActive ? 'status-pill--active' : 'status-pill--inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="actions-cell">
          <button class="btn btn--sm btn--outline" onclick="openEditModal('${u._id}')">Edit</button>
          <button class="btn btn--sm btn--danger" onclick="handleDelete('${u._id}', '${escHtml(u.name)}')">Delete</button>
        </td>
      </tr>`).join('');
  }

  function updateUserStats(users) {
    document.getElementById('statTotal').textContent  = users.length;
    document.getElementById('statAdmins').textContent = users.filter(u => u.role === 'admin').length;
    document.getElementById('statActive').textContent = users.filter(u => u.isActive).length;
  }

  searchInput?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderUsers(allUsers.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    ));
  });

  createUserForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = createUserForm.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating…';
    const body = {
      name:     document.getElementById('newName').value.trim(),
      email:    document.getElementById('newEmail').value.trim(),
      password: document.getElementById('newPassword').value,
      role:     document.getElementById('newRole').value,
    };
    try {
      await apiCall('POST', '/users', body);
      showToast(`User "${body.name}" created!`, 'success');
      createUserForm.reset();
      await loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create User';
    }
  });

  window.openEditModal = async (id) => {
    try {
      const user = await apiCall('GET', `/users/${id}`);
      document.getElementById('editId').value       = user._id;
      document.getElementById('editName').value     = user.name;
      document.getElementById('editEmail').value    = user.email;
      document.getElementById('editRole').value     = user.role;
      document.getElementById('editActive').checked = user.isActive;
      document.getElementById('editPassword').value = '';
      editModal.classList.add('modal--visible');
    } catch (err) { showToast(err.message, 'error'); }
  };

  document.getElementById('closeModal')?.addEventListener('click', () => editModal.classList.remove('modal--visible'));
  editModal?.addEventListener('click', e => { if (e.target === editModal) editModal.classList.remove('modal--visible'); });

  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id  = document.getElementById('editId').value;
    const btn = editForm.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    const body = {
      name:     document.getElementById('editName').value.trim(),
      email:    document.getElementById('editEmail').value.trim(),
      role:     document.getElementById('editRole').value,
      isActive: document.getElementById('editActive').checked,
    };
    const pwd = document.getElementById('editPassword').value;
    if (pwd) body.password = pwd;
    try {
      await apiCall('PUT', `/users/${id}`, body);
      showToast('User updated!', 'success');
      editModal.classList.remove('modal--visible');
      await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
  });

  window.handleDelete = async (id, name) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await apiCall('DELETE', `/users/${id}`);
      showToast(`User "${name}" deleted.`, 'success');
      await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // STATS TAB
  // ════════════════════════════════════════════════════════════════════════════
  let statsLoaded = false;

  async function loadStats() {
    if (statsLoaded) return;
    try {
      const s = await apiCall('GET', '/items/stats');
      statsLoaded = true;

      // Fill overview numbers
      document.getElementById('s_total').textContent   = s.total;
      document.getElementById('s_lost').textContent    = s.lost;
      document.getElementById('s_found').textContent   = s.found;
      document.getElementById('s_open').textContent    = s.open;
      document.getElementById('s_claimed').textContent = s.claimed;
      document.getElementById('s_resolved').textContent = s.resolved;

      renderCategoryChart(s.byCategory);
      renderStatusDonut(s);
      renderDayChart(s.byDay);
    } catch (err) {
      showToast('Failed to load statistics: ' + err.message, 'error');
    }
  }

  function renderCategoryChart(data) {
    const el = document.getElementById('categoryChart');
    if (!el || !data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet.</p>';
      return;
    }
    const max = Math.max(...data.map(d => d.count), 1);
    el.innerHTML = data.map(d => `
      <div class="bar-row">
        <span class="bar-label">${escHtml(d._id)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count / max) * 100}%"></div></div>
        <span class="bar-value">${d.count}</span>
      </div>`).join('');
  }

  function renderStatusDonut(s) {
    const el = document.getElementById('statusChart');
    if (!el) return;
    const total = (s.open + s.claimed + s.resolved) || 1;
    const segments = [
      { label: 'Open',     value: s.open,     color: 'var(--accent)' },
      { label: 'Claimed',  value: s.claimed,  color: '#6c8ebf' },
      { label: 'Resolved', value: s.resolved, color: 'var(--found)' },
    ];
    let svg = `<svg viewBox="0 0 36 36" class="donut-svg">`;
    let offset = 25;
    segments.forEach(seg => {
      const pct = (seg.value / total) * 100;
      svg += `<circle class="donut-segment" stroke="${seg.color}" stroke-width="3.5"
        stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${offset}"
        fill="none" r="15.9155" cx="18" cy="18"/>`;
      offset -= pct;
    });
    svg += `<text x="18" y="20" class="donut-label">${total}</text></svg>`;
    svg += `<div class="donut-legend">${segments.map(seg => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${seg.color}"></span>
        ${seg.label}: <strong>${seg.value}</strong>
      </div>`).join('')}</div>`;
    el.innerHTML = svg;
  }

  function renderDayChart(data) {
    const el = document.getElementById('dayChart');
    if (!el) return;
    if (!data || !data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.85rem;">No data yet.</p>';
      return;
    }
    const max = Math.max(...data.map(d => d.count), 1);
    const h   = 120;
    const w   = 500;
    const pts = data.map((d, i) => {
      const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * (w - 60) + 30;
      const y = h - 20 - ((d.count / max) * (h - 40));
      return { x, y, d };
    });
    let svg = `<svg viewBox="0 0 ${w} ${h}" class="line-svg" preserveAspectRatio="xMidYMid meet">`;
    if (pts.length > 1) {
      svg += `<polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
    }
    pts.forEach(p => {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`;
      svg += `<text x="${p.x}" y="${h - 4}" text-anchor="middle" font-size="7" fill="var(--text-muted)">${p.d._id.slice(5)}</text>`;
      svg += `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="8" fill="var(--text)">${p.d.count}</text>`;
    });
    svg += `</svg>`;
    el.innerHTML = svg;
  }

  // ── Export with auth token ────────────────────────────────────────────────
  window.exportFile = async (type) => {
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      const res = await fetch(`/api/items/export/${type}`, {
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Export failed');
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `LostFound_Report_${Date.now()}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`${type === 'excel' ? 'Excel' : 'PDF'} exported successfully!`, 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = type === 'excel' ? 'Download Excel' : 'Download PDF'; }
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // LOGS TAB
  // ════════════════════════════════════════════════════════════════════════════
  async function loadLogs(page = 1) {
    const container = document.getElementById('logsContent');
    container.innerHTML = `<div class="loading-state"><span class="spinner spinner--lg"></span></div>`;
    try {
      const data = await apiCall('GET', `/logs?page=${page}&limit=20`);

      const actionIcon = {
        LOGIN:           '🔑',
        ITEM_CREATED:    '➕',
        ITEM_UPDATED:    '✏️',
        ITEM_DELETED:    '🗑️',
        ITEM_CLAIMED:    '🤝',
        ITEM_RESOLVED:   '✅',
        USER_CREATED:    '👤',
        USER_UPDATED:    '👤',
        USER_DELETED:    '👤',
        PROFILE_UPDATED: '👤',
      };

      if (!data.logs.length) {
        container.innerHTML = `<div class="empty-state" style="padding:60px"><div class="empty-state__icon">📋</div><h3>No activity yet</h3><p>Actions will appear here once users start using the system.</p></div>`;
        return;
      }

      let html = `<div class="log-list">`;
      data.logs.forEach(l => {
        html += `
          <div class="log-entry">
            <span class="log-icon">${actionIcon[l.action] || '•'}</span>
            <div class="log-body">
              <div class="log-details"><strong>${escHtml(l.userName)}</strong> — ${escHtml(l.details)}</div>
              <div class="log-time">${new Date(l.createdAt).toLocaleString()}</div>
            </div>
            <span class="log-action-badge">${l.action.replace(/_/g, ' ')}</span>
          </div>`;
      });
      html += `</div>`;

      // Pagination
      if (data.pages > 1) {
        html += `<div class="pagination" style="margin-top:20px;">`;
        if (data.page > 1) html += `<button class="page-btn" onclick="loadLogsPage(${data.page - 1})">‹</button>`;
        html += `<span class="page-btn page-btn--active">${data.page} / ${data.pages}</span>`;
        if (data.page < data.pages) html += `<button class="page-btn" onclick="loadLogsPage(${data.page + 1})">›</button>`;
        html += `</div>`;
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="padding:60px"><div class="empty-state__icon">⚠️</div><h3>Failed to load logs</h3><p>${escHtml(err.message)}</p></div>`;
    }
  }

  window.loadLogsPage = (p) => loadLogs(p);

  // ════════════════════════════════════════════════════════════════════════════
  // MATCHES TAB
  // ════════════════════════════════════════════════════════════════════════════
  // ── Initial load ──────────────────────────────────────────────────────────
  await loadUsers();
});