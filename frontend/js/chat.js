document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  renderUserInfo();

  const currentUser = Auth.getUser();
  const logoutBtn = document.getElementById('logoutBtn');
  const convList = document.getElementById('convList');
  const chatEmpty = document.getElementById('chatEmpty');
  const chatWindow = document.getElementById('chatWindow');
  const chatMessages = document.getElementById('chatMessages');
  const chatName = document.getElementById('chatName');
  const chatSub = document.getElementById('chatSub');
  const chatAvatar = document.getElementById('chatAvatar');
  const msgInput = document.getElementById('msgInput');
  const sendBtn = document.getElementById('sendBtn');
  const typingIndicator = document.getElementById('typingIndicator');

  if (Auth.isAdmin()) {
    document.getElementById('adminLink').style.display = 'inline-flex';
  }

  logoutBtn?.addEventListener('click', () => Auth.logout());

  let activeConv = null; // { conversationId, otherUser, itemRef, itemTitle }
  let typingTimer = null;
  let onlineUsers = [];

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  const socket = io({ auth: { token: Auth.getToken() } });

  socket.on('connect', () => {
    document.getElementById('onlineDot').textContent = '● Connected';
    document.getElementById('onlineDot').style.color = 'var(--found)';
  });

  socket.on('disconnect', () => {
    document.getElementById('onlineDot').textContent = '● Offline';
    document.getElementById('onlineDot').style.color = 'var(--lost)';
  });

  socket.on('online_users', (users) => {
    onlineUsers = users;
    updateOnlineStatus();
  });

  socket.on('receive_message', (msg) => {
    // If this is the active conversation, append message
    if (activeConv && msg.conversationId === activeConv.conversationId) {
      appendMessage(msg, false);
      scrollToBottom();
    }
    // Refresh conversation list
    loadConversations();
    // Show toast if not in active conv
    if (!activeConv || msg.conversationId !== activeConv.conversationId) {
      showToast(`💬 New message from ${msg.senderName}`, 'info');
    }
  });

  socket.on('message_sent', (msg) => {
    // Replace optimistic message or append
    const optimistic = document.querySelector('.msg--optimistic');
    if (optimistic) optimistic.remove();
    appendMessage(msg, true);
    scrollToBottom();
    loadConversations();
  });

  socket.on('user_typing', ({ senderId, isTyping }) => {
    if (activeConv && senderId !== currentUser._id) {
      typingIndicator.style.display = isTyping ? 'flex' : 'none';
    }
  });

  // ── Load Conversations ─────────────────────────────────────────────────────
  async function loadConversations() {
    try {
      const convos = await apiCall('GET', '/chat/conversations');
      if (!convos.length) {
        convList.innerHTML = `<div class="conv-empty"><p>No conversations yet.</p><p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">Click "Chat" on any item to start one.</p></div>`;
        return;
      }
      convList.innerHTML = convos.map(c => {
        const isOnline = onlineUsers.includes(c.otherUser?._id);
        const isActive = activeConv?.conversationId === c.conversationId;
        return `
          <div class="conv-item ${isActive ? 'conv-item--active' : ''}" onclick="openConversation('${c.conversationId}', '${c.otherUser?._id}', '${escHtml(c.otherUser?.name||'')}', '${c.itemRef||''}', '${escHtml(c.itemTitle||'')}')">
            <div class="conv-avatar">
              ${c.otherUser?.name?.charAt(0).toUpperCase() || '?'}
              ${isOnline ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="conv-info">
              <div class="conv-name">${escHtml(c.otherUser?.name || 'Unknown')}</div>
              ${c.itemTitle ? `<div class="conv-item-ref">📦 ${escHtml(c.itemTitle)}</div>` : ''}
              <div class="conv-last">${escHtml(c.lastMessage?.substring(0, 45) || '')}${(c.lastMessage?.length > 45) ? '…' : ''}</div>
            </div>
            <div class="conv-meta">
              <div class="conv-time">${timeAgo(c.lastMessageTime)}</div>
              ${c.unread > 0 ? `<div class="conv-unread">${c.unread}</div>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      convList.innerHTML = `<div class="conv-empty">Failed to load conversations.</div>`;
    }
  }

  function updateOnlineStatus() {
    document.querySelectorAll('.conv-item').forEach(el => {
      // Re-render would handle this; keep it simple
    });
  }

  // ── Open Conversation ──────────────────────────────────────────────────────
  window.openConversation = async (convId, otherId, otherName, itemId, itemTitle) => {
    activeConv = { conversationId: convId, otherId, otherName, itemRef: itemId, itemTitle };

    chatEmpty.style.display = 'none';
    chatWindow.style.display = 'flex';
    chatName.textContent = otherName;
    chatAvatar.textContent = otherName.charAt(0).toUpperCase();
    chatSub.textContent = itemTitle ? `Re: ${itemTitle}` : 'Direct message';
    chatMessages.innerHTML = `<div class="loading-state"><span class="spinner spinner--lg"></span></div>`;

    // Highlight active conv
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('conv-item--active'));
    event?.currentTarget?.classList.add('conv-item--active');

    try {
      const data = await apiCall('GET', `/chat/${convId}`);
      chatMessages.innerHTML = '';

      if (!data.messages.length) {
        chatMessages.innerHTML = `<div class="chat-no-msgs">No messages yet. Say hello! 👋</div>`;
      } else {
        data.messages.forEach(msg => appendMessage(msg, msg.sender === currentUser._id));
      }

      if (itemTitle) {
        const banner = document.createElement('div');
        banner.className = 'item-banner';
        banner.innerHTML = `📦 Chatting about: <strong>${escHtml(itemTitle)}</strong>`;
        chatMessages.prepend(banner);
      }

      scrollToBottom();
      loadConversations(); // refresh unread counts
    } catch (err) {
      chatMessages.innerHTML = `<div class="chat-no-msgs">Failed to load messages.</div>`;
    }
  };

  // ── Append Message ─────────────────────────────────────────────────────────
  function appendMessage(msg, isMine, optimistic = false) {
    const noMsgs = chatMessages.querySelector('.chat-no-msgs');
    if (noMsgs) noMsgs.remove();

    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'msg--mine' : 'msg--theirs'} ${optimistic ? 'msg--optimistic' : ''}`;
    div.innerHTML = `
      <div class="msg__bubble">
        <div class="msg__text">${escHtml(msg.text)}</div>
        <div class="msg__time">${optimistic ? 'Sending…' : new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;
    chatMessages.appendChild(div);
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ── Send Message ───────────────────────────────────────────────────────────
  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !activeConv) return;

    // Optimistic UI
    appendMessage({ text, createdAt: new Date() }, true, true);
    scrollToBottom();
    msgInput.value = '';
    msgInput.style.height = 'auto';

    socket.emit('send_message', {
      receiverId: activeConv.otherId,
      text,
      itemId: activeConv.itemRef || null,
      itemTitle: activeConv.itemTitle || '',
      senderName: currentUser.name,
    });

    // Stop typing
    socket.emit('typing', { receiverId: activeConv.otherId, isTyping: false });
  }

  sendBtn?.addEventListener('click', sendMessage);

  msgInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  msgInput?.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';

    // Typing indicator
    if (activeConv) {
      socket.emit('typing', { receiverId: activeConv.otherId, isTyping: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socket.emit('typing', { receiverId: activeConv.otherId, isTyping: false });
      }, 1500);
    }
  });

  // ── Check URL params (open specific conv from item page) ──────────────────
  const params = new URLSearchParams(window.location.search);
  const toUserId = params.get('userId');
  const toUserName = params.get('userName');
  const itemId = params.get('itemId');
  const itemTitle = params.get('itemTitle');

  if (toUserId && toUserName) {
    const convId = [currentUser._id, toUserId].sort().join('_');
    await loadConversations();
    openConversation(convId, toUserId, decodeURIComponent(toUserName), itemId || '', decodeURIComponent(itemTitle || ''));
  } else {
    await loadConversations();
  }
});