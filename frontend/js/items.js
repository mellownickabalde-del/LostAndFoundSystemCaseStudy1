document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  renderUserInfo();

  const currentUser = Auth.getUser();

  const itemsGrid      = document.getElementById('itemsGrid');
  const reportForm     = document.getElementById('reportForm');
  const itemModal      = document.getElementById('itemModal');
  const detailModal    = document.getElementById('detailModal');
  const profileModal   = document.getElementById('profileModal');
  const logoutBtn      = document.getElementById('logoutBtn');
  const filterType     = document.getElementById('filterType');
  const filterStatus   = document.getElementById('filterStatus');
  const filterCategory = document.getElementById('filterCategory');
  const searchItems    = document.getElementById('searchItems');
  const mineOnly       = document.getElementById('mineOnly');
  const paginationEl   = document.getElementById('pagination');
  const imageFileInput = document.getElementById('itemImageFile');
  const imagePreview   = document.getElementById('imagePreview');

  if (Auth.isAdmin()) {
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = 'inline-flex';
  }

  let currentPage = 1;
  let debounceTimer;
  let uploadedImageUrl = '';

  logoutBtn?.addEventListener('click', () => Auth.logout());
  document.getElementById('openProfileBtn')?.addEventListener('click', openProfile);

  // Load unread chat badge
  loadUnreadBadge();

  async function loadUnreadBadge() {
    try {
      const data = await apiCall('GET', '/chat/unread');
      const badge = document.getElementById('chatBadge');
      if (badge && data.count > 0) {
        badge.textContent = data.count + ' ';
        badge.style.cssText = 'background:var(--lost);color:white;border-radius:20px;padding:1px 6px;font-size:0.68rem;font-weight:700;margin-right:2px;';
      }
    } catch (e) {}
  }

  // ── Image Upload ──────────────────────────────────────────────────────────
  imageFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    imagePreview.innerHTML = `<div class="upload-loading"><span class="spinner"></span> Uploading…</div>`;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const data = await apiUpload('/upload/image', formData);
      uploadedImageUrl = data.imageUrl;
      imagePreview.innerHTML = `<img src="${uploadedImageUrl}" class="preview-img" alt="Preview" />`;
    } catch (err) {
      showToast(err.message, 'error');
      imagePreview.innerHTML = '';
    }
  });

  // ── Load Items ────────────────────────────────────────────────────────────
  async function loadItems(page = 1) {
    currentPage = page;
    itemsGrid.innerHTML = `<div class="loading-state"><span class="spinner spinner--lg"></span><p>Loading items…</p></div>`;

    const params = new URLSearchParams({ page, limit: 9 });
    if (filterType?.value)     params.set('type', filterType.value);
    if (filterStatus?.value)   params.set('status', filterStatus.value);
    if (filterCategory?.value) params.set('category', filterCategory.value);
    if (searchItems?.value)    params.set('search', searchItems.value);
    if (mineOnly?.checked)     params.set('mine', 'true');

    try {
      const data = await apiCall('GET', `/items?${params}`);
      renderItems(data.items);
      renderPagination(data.page, data.pages);
      updateItemStats(data.items);
    } catch (err) {
      showToast(err.message, 'error');
      itemsGrid.innerHTML = `<div class="error-state">Failed to load items.</div>`;
    }
  }

  // ── Render Item Cards ─────────────────────────────────────────────────────
  function renderItems(items) {
    if (!items.length) {
      itemsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🔍</div>
          <h3>No items found</h3>
          <p>Try adjusting your filters or report a new item.</p>
        </div>`;
      return;
    }

    itemsGrid.innerHTML = items.map(item => {
      const isOwner = item.reportedBy?._id === currentUser._id;
      const isAdmin = currentUser.role === 'admin';
      const isOpen  = item.status === 'open';

      const imgHtml = item.imageUrl
        ? `<div class="item-card__img"><img src="${item.imageUrl}" alt="${escHtml(item.title)}" /></div>`
        : '';

      const viewBtn    = `<button class="btn btn--outline btn--sm" onclick="openDetail('${item._id}')">View</button>`;
      const claimBtn   = isOpen && !isOwner
        ? `<button class="btn btn--primary btn--sm" onclick="handleClaim('${item._id}')">Claim</button>`
        : '';
      const chatBtn    = !isOwner
        ? `<button class="btn btn--outline btn--sm" onclick="startChat('${item.reportedBy?._id}','${escHtml(item.reportedBy?.name||'')}','${item._id}','${escHtml(item.title)}')">💬 Chat</button>`
        : '';
      const resolveBtn = isOwner && item.status !== 'resolved'
        ? `<button class="btn btn--resolve btn--sm" onclick="handleResolve('${item._id}')">✅ Resolve</button>`
        : '';
      const editBtn    = (isOwner || isAdmin)
        ? `<button class="btn btn--outline btn--sm" onclick="openItemEdit('${item._id}')">Edit</button>`
        : '';
      const deleteBtn  = (isOwner || isAdmin)
        ? `<button class="btn btn--danger btn--sm" onclick="handleItemDelete('${item._id}')">Delete</button>`
        : '';

      return `
        <div class="item-card item-card--${item.type}">
          ${imgHtml}
          <div class="item-card__header">
            <span class="type-badge type-badge--${item.type}">${item.type === 'lost' ? '🔴 Lost' : '🟢 Found'}</span>
            <span class="status-badge status-badge--${item.status}">${item.status}</span>
          </div>
          <div class="item-card__body">
            <h3 class="item-card__title">${escHtml(item.title)}</h3>
            <p class="item-card__desc">${escHtml(item.description)}</p>
            <div class="item-card__meta">
              <span>📍 ${escHtml(item.location)}</span>
              <span>🏷 ${item.category}</span>
              <span>👤 ${item.reportedBy?.name || 'Unknown'}</span>
              <span>🕐 ${timeAgo(item.createdAt)}</span>
            </div>
          </div>
          <div class="item-card__footer">
            ${viewBtn}
            ${claimBtn}
            ${chatBtn}
            ${resolveBtn}
            ${editBtn}
            ${deleteBtn}
          </div>
        </div>`;
    }).join('');
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination(page, pages) {
    if (!paginationEl) return;
    if (pages <= 1) { paginationEl.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${page === 1 ? 'disabled' : ''} onclick="changePage(${page - 1})">‹</button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="page-btn ${i === page ? 'page-btn--active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${page === pages ? 'disabled' : ''} onclick="changePage(${page + 1})">›</button>`;
    paginationEl.innerHTML = html;
  }

  window.changePage = (p) => loadItems(p);

  function updateItemStats(items) {
    document.getElementById('statLost').textContent    = items.filter(i => i.type === 'lost').length;
    document.getElementById('statFound').textContent   = items.filter(i => i.type === 'found').length;
    document.getElementById('statOpen').textContent    = items.filter(i => i.status === 'open').length;
    document.getElementById('statClaimed').textContent = items.filter(i => i.status === 'claimed').length;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  [filterType, filterStatus, filterCategory, mineOnly].forEach(el =>
    el?.addEventListener('change', () => loadItems(1))
  );
  searchItems?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadItems(1), 400);
  });

  // ── Report Item ───────────────────────────────────────────────────────────
  reportForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = reportForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Reporting…';
    const body = {
      title:           document.getElementById('itemTitle').value.trim(),
      description:     document.getElementById('itemDesc').value.trim(),
      type:            document.getElementById('itemType').value,
      category:        document.getElementById('itemCategory').value,
      location:        document.getElementById('itemLocation').value.trim(),
      dateLostOrFound: document.getElementById('itemDate').value || undefined,
      imageUrl:        uploadedImageUrl || undefined,
    };
    try {
      await apiCall('POST', '/items', body);
      showToast('Item reported successfully!', 'success');
      reportForm.reset();
      imagePreview.innerHTML = '';
      uploadedImageUrl = '';
      await loadItems(1);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Report Item';
    }
  });

  // ── Detail Modal ──────────────────────────────────────────────────────────
  window.openDetail = async (id) => {
    try {
      const item = await apiCall('GET', `/items/${id}`);
      const isOwner = item.reportedBy?._id === currentUser._id;
      document.getElementById('detailContent').innerHTML = `
        ${item.imageUrl ? `<img src="${item.imageUrl}" class="detail-img" alt="${escHtml(item.title)}" />` : ''}
        <div class="detail-header">
          <span class="type-badge type-badge--${item.type}">${item.type === 'lost' ? '🔴 Lost' : '🟢 Found'}</span>
          <span class="status-badge status-badge--${item.status}">${item.status}</span>
        </div>
        <h2 class="detail-title">${escHtml(item.title)}</h2>
        <p class="detail-desc">${escHtml(item.description)}</p>
        <div class="detail-grid">
          <div class="detail-field"><span class="detail-label">Category</span><span>${item.category}</span></div>
          <div class="detail-field"><span class="detail-label">Location</span><span>${escHtml(item.location)}</span></div>
          <div class="detail-field"><span class="detail-label">Reported By</span><span>${item.reportedBy?.name || 'Unknown'} (${item.reportedBy?.email || ''})</span></div>
          <div class="detail-field"><span class="detail-label">Date Reported</span><span>${new Date(item.createdAt).toLocaleString()}</span></div>
          ${item.dateLostOrFound ? `<div class="detail-field"><span class="detail-label">Date Lost/Found</span><span>${new Date(item.dateLostOrFound).toLocaleDateString()}</span></div>` : ''}
          ${item.claimedBy ? `<div class="detail-field"><span class="detail-label">Claimed By</span><span>${item.claimedBy.name} (${item.claimedBy.email})</span></div>` : ''}
        </div>
        <div class="detail-actions">
          ${item.status === 'open' && !isOwner
            ? `<button class="btn btn--primary" onclick="handleClaim('${item._id}'); closeDetail()">Claim This Item</button>`
            : ''}
          ${!isOwner
            ? `<button class="btn btn--outline" onclick="startChat('${item.reportedBy?._id}','${escHtml(item.reportedBy?.name || '')}','${item._id}','${escHtml(item.title)}'); closeDetail()">💬 Chat with Reporter</button>`
            : ''}
          ${isOwner && item.status !== 'resolved'
            ? `<button class="btn btn--resolve" onclick="handleResolve('${item._id}'); closeDetail()">✅ Mark as Resolved</button>`
            : ''}
        </div>`;
      detailModal.classList.add('modal--visible');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.closeDetail = () => detailModal.classList.remove('modal--visible');
  document.getElementById('closeDetailModal')?.addEventListener('click', closeDetail);
  detailModal?.addEventListener('click', e => { if (e.target === detailModal) closeDetail(); });

  // ── Start Chat ────────────────────────────────────────────────────────────
  window.startChat = (userId, userName, itemId, itemTitle) => {
    if (!userId || userId === currentUser._id) {
      showToast('You cannot chat with yourself.', 'error');
      return;
    }
    const url = `/chat.html?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&itemId=${encodeURIComponent(itemId)}&itemTitle=${encodeURIComponent(itemTitle)}`;
    window.location.href = url;
  };

  // ── Claim ─────────────────────────────────────────────────────────────────
  window.handleClaim = async (id) => {
    if (!confirm('Claim this item?')) return;
    try {
      await apiCall('PUT', `/items/${id}/claim`);
      showToast('Item claimed!', 'success');
      await loadItems(currentPage);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Resolve ───────────────────────────────────────────────────────────────
  window.handleResolve = async (id) => {
    if (!confirm('Mark this item as resolved?')) return;
    try {
      await apiCall('PUT', `/items/${id}/resolve`);
      showToast('Item marked as resolved!', 'success');
      await loadItems(currentPage);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Edit Item Modal ───────────────────────────────────────────────────────
  window.openItemEdit = async (id) => {
    try {
      const item = await apiCall('GET', `/items/${id}`);
      document.getElementById('editItemId').value       = item._id;
      document.getElementById('editItemTitle').value    = item.title;
      document.getElementById('editItemDesc').value     = item.description;
      document.getElementById('editItemType').value     = item.type;
      document.getElementById('editItemCategory').value = item.category;
      document.getElementById('editItemLocation').value = item.location;
      document.getElementById('editItemStatus').value   = item.status;
      document.getElementById('editUploadedUrl').value  = item.imageUrl || '';
      const ep = document.getElementById('editImagePreview');
      if (ep) ep.innerHTML = item.imageUrl ? `<img src="${item.imageUrl}" class="preview-img" />` : '';
      itemModal.classList.add('modal--visible');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('editItemImageFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ep = document.getElementById('editImagePreview');
    ep.innerHTML = `<span class="spinner"></span>`;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const data = await apiUpload('/upload/image', fd);
      document.getElementById('editUploadedUrl').value = data.imageUrl;
      ep.innerHTML = `<img src="${data.imageUrl}" class="preview-img" />`;
    } catch (err) {
      showToast(err.message, 'error');
      ep.innerHTML = '';
    }
  });

  document.getElementById('closeItemModal')?.addEventListener('click', () => itemModal.classList.remove('modal--visible'));
  itemModal?.addEventListener('click', e => { if (e.target === itemModal) itemModal.classList.remove('modal--visible'); });

  document.getElementById('editItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id  = document.getElementById('editItemId').value;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const body = {
      title:       document.getElementById('editItemTitle').value.trim(),
      description: document.getElementById('editItemDesc').value.trim(),
      type:        document.getElementById('editItemType').value,
      category:    document.getElementById('editItemCategory').value,
      location:    document.getElementById('editItemLocation').value.trim(),
      status:      document.getElementById('editItemStatus').value,
      imageUrl:    document.getElementById('editUploadedUrl').value,
    };
    try {
      await apiCall('PUT', `/items/${id}`, body);
      showToast('Item updated!', 'success');
      itemModal.classList.remove('modal--visible');
      await loadItems(currentPage);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  window.handleItemDelete = async (id) => {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try {
      await apiCall('DELETE', `/items/${id}`);
      showToast('Item deleted.', 'success');
      await loadItems(currentPage);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Profile Modal ─────────────────────────────────────────────────────────
  function openProfile() {
    const u = Auth.getUser();
    document.getElementById('profileName').value     = u.name;
    document.getElementById('profileEmail').value    = u.email;
    document.getElementById('profilePassword').value = '';
    profileModal.classList.add('modal--visible');
  }

  document.getElementById('closeProfileModal')?.addEventListener('click', () => profileModal.classList.remove('modal--visible'));
  profileModal?.addEventListener('click', e => { if (e.target === profileModal) profileModal.classList.remove('modal--visible'); });

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const body = {
      name:  document.getElementById('profileName').value.trim(),
      email: document.getElementById('profileEmail').value.trim(),
    };
    const pwd = document.getElementById('profilePassword').value;
    if (pwd) body.password = pwd;
    try {
      const updated = await apiCall('PUT', '/users/profile', body);
      Auth.updateUser(updated);
      renderUserInfo();
      showToast('Profile updated!', 'success');
      profileModal.classList.remove('modal--visible');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });

  await loadItems(1);
});