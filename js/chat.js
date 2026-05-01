/* ============================================================
   STREETMEET — CHAT MODULE  (Phase 2: Tasks 2.1 / 2.2 / 2.3)
   Task 2.1 — Real-time Firestore onSnapshot delivery
   Task 2.2 — Quote-reply threading
   Task 2.3 — Profile-linked usernames
   ============================================================ */

window.SM = window.SM || {};
var SM = window.SM;

/* ── Community metadata ── */
SM.chatRoomMeta = {
  smdc: { label: '#smdc-general — StreetMeet DC',  welcome: '*** Welcome to #smdc-general. Be respectful. Create dope content. ***' },
  smwa: { label: '#smwa-general — StreetMeet WA',  welcome: '*** Welcome to #smwa-general. Rain or shine, we shoot. ***' },
  smmd: { label: '#smmd-general — StreetMeet MD',  welcome: '*** Welcome to #smmd-general. DMV represent. ***' }
};

SM.currentRoom    = 'smdc';
SM._chatListener  = null;   /* Active Firestore onSnapshot unsubscribe fn */
SM._replyTarget   = null;   /* { msgId, senderName, preview } */
SM._onlineTracker = {};     /* { roomId: [{ userId, displayName }] } */

/* ══════════════════════════════════════════════════════════
   TASK 2.1 — REAL-TIME CHAT
   Replaces static chatMessageData array with Firestore
   onSnapshot — every connected user sees new messages
   within milliseconds of them being sent.
══════════════════════════════════════════════════════════ */

SM.initChat = function() {
  /* Legacy no-op — real init happens in renderChatRoom */
};

SM.renderChatRoom = function(roomId) {
  SM.currentRoom = roomId;
  var meta = SM.chatRoomMeta[roomId] || {};

  /* Update tab UI */
  var labelEl  = document.getElementById('chat-room-label');
  var onlineEl = document.getElementById('chat-online-count');
  if (labelEl)  labelEl.textContent  = meta.label || roomId;
  if (onlineEl) onlineEl.textContent = '— ONLINE';

  document.querySelectorAll('.chat-room-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.room === roomId);
  });

  /* Detach previous listener before switching rooms */
  if (SM._chatListener) {
    SM._chatListener();
    SM._chatListener = null;
  }

  /* Show loading state */
  var msgsEl = document.getElementById('chat-messages');
  if (msgsEl) {
    msgsEl.innerHTML = '<div class="chat-msg"><span class="sys">Loading messages...</span></div>';
  }

  /* Clear reply state when switching rooms */
  SM.clearReplyTarget();

  /* Attach Firestore real-time listener — last 50 messages, ordered by time */
  SM._chatListener = db.collection('communities').doc(roomId)
    .collection('chat')
    .orderBy('timestamp', 'asc')
    .limitToLast(50)
    .onSnapshot(function(snapshot) {
      if (!msgsEl) return;
      msgsEl.innerHTML = '';

      /* Welcome system message */
      var welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'chat-msg';
      welcomeDiv.innerHTML = '<span class="sys">' + (meta.welcome || '') + '</span>';
      msgsEl.appendChild(welcomeDiv);

      snapshot.forEach(function(doc) {
        SM._appendChatMsg(msgsEl, doc.id, doc.data());
      });

      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, function(err) {
      console.error('SM: chat listener error:', err);
      if (msgsEl) msgsEl.innerHTML = '<div class="chat-msg"><span class="sys">Could not load messages. Check your connection.</span></div>';
    });

  /* Update online count from presence */
  SM._updateOnlineCount(roomId);
};

/* ── Append a single message to the chat DOM ──
   Called by onSnapshot — handles both new and historical messages */
SM._appendChatMsg = function(container, msgId, m) {
  var div = document.createElement('div');
  div.className = 'chat-msg';
  div.dataset.msgId = msgId;

  if (m.sys) {
    div.innerHTML = '<span class="sys">' + SM._escapeHtml(m.text) + '</span>';
    container.appendChild(div);
    return;
  }

  /* ── Task 2.3: Profile-linked username ── */
  var senderBtn = document.createElement('button');
  senderBtn.className = 'sender-link' + (m.isHost ? ' host' : '');
  senderBtn.title = 'View ' + (m.senderName || '') + '\'s profile';
  senderBtn.textContent = m.senderName || 'Member';
  senderBtn.addEventListener('click', function() {
    SM.viewProfile(m.userId || '');
  });

  /* ── Task 2.2: Reply quote block ── */
  var replyHTML = '';
  if (m.replyTo && m.replyTo.senderName) {
    replyHTML =
      '<div class="chat-reply-quote">' +
        '<span class="reply-to-name">' + SM._escapeHtml(m.replyTo.senderName) + '</span>' +
        '<span class="reply-preview">' + SM._escapeHtml(m.replyTo.preview || '') + '</span>' +
      '</div>';
  }

  /* Time display */
  var timeStr = '';
  if (m.timestamp) {
    try {
      timeStr = new Date(m.timestamp.toMillis()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch(e) {}
  }

  /* Build content wrapper */
  var contentDiv = document.createElement('div');
  contentDiv.className = 'chat-msg-content';
  contentDiv.appendChild(senderBtn);
  var colon = document.createElement('span');
  colon.className = 'chat-colon';
  colon.textContent = ':';
  contentDiv.appendChild(colon);
  var txtSpan = document.createElement('span');
  txtSpan.className = 'chat-txt';
  txtSpan.textContent = m.text || '';
  contentDiv.appendChild(txtSpan);
  if (timeStr) {
    var timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = timeStr;
    contentDiv.appendChild(timeSpan);
  }

  /* Reply trigger button — uses data attrs, no inline string interpolation */
  var replyBtn = document.createElement('button');
  replyBtn.className = 'reply-trigger';
  replyBtn.title = 'Reply';
  replyBtn.textContent = '↩';
  /* Store reply data safely on the element */
  replyBtn.dataset.msgId     = msgId;
  replyBtn.dataset.sender    = m.senderName || 'Member';
  replyBtn.dataset.preview   = (m.text || '').substring(0, 50);
  replyBtn.dataset.userId    = m.userId || '';
  replyBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    SM.setReplyTarget(
      replyBtn.dataset.msgId,
      replyBtn.dataset.sender,
      replyBtn.dataset.preview,
      replyBtn.dataset.userId
    );
  });

  if (replyHTML) {
    var quoteDiv = document.createElement('div');
    quoteDiv.innerHTML = replyHTML;
    div.appendChild(quoteDiv.firstChild);
  }
  div.appendChild(contentDiv);
  div.appendChild(replyBtn);
  container.appendChild(div);
};

/* ══════════════════════════════════════════════════════════
   SEND MESSAGE — writes to Firestore
══════════════════════════════════════════════════════════ */

SM.sendChatMessage = function() {
  var input = document.getElementById('chat-input');
  var user  = SM.getCurrentUser();
  if (!input || !user) return;
  var text = input.value.trim();
  if (!text) return;

  var displayName = (user.firstName || '') + ' ' + (user.lastInitial || '');
  var msgData = {
    userId:     user.id,
    senderName: displayName.trim(),
    isHost:     SM.isHost(),
    text:       text,
    timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
    replyTo:    SM._replyTarget || null
  };

  /* Clear input and reply state immediately (optimistic) */
  var pendingReply = SM._replyTarget; /* capture before clearing */
  input.value = '';
  SM.clearReplyTarget();

  /* Write to Firestore — onSnapshot picks it up for all users */
  db.collection('communities').doc(SM.currentRoom)
    .collection('chat')
    .add(msgData)
    .then(function() {
      /* If this was a reply, notify the original sender */
      if (pendingReply && pendingReply.senderUserId) {
        SM._notifyCommentReply(
          pendingReply.senderUserId,
          displayName.trim(),
          SM.currentRoom.toUpperCase() + ' chat'
        );
      }
    })
    .catch(function(err) {
      console.error('SM: sendChatMessage error:', err);
      SM.showToast('Message could not be sent — try again', 'error');
    });
};

/* ══════════════════════════════════════════════════════════
   TASK 2.2 — REPLY SYSTEM
   Sets a reply target, shows quote preview above input,
   stores replyTo on the sent message document.
══════════════════════════════════════════════════════════ */

SM.setReplyTarget = function(msgId, senderName, preview, senderUserId) {
  SM._replyTarget = {
    msgId:        msgId,
    senderName:   senderName,
    preview:      preview,
    senderUserId: senderUserId || null
  };

  var stripContent =
    '<div class="reply-strip-inner">' +
      '<span class="reply-strip-label">Replying to <strong>' + SM._escapeHtml(senderName) + '</strong></span>' +
      '<span class="reply-strip-preview">' + SM._escapeHtml(preview) + (preview.length >= 50 ? '...' : '') + '</span>' +
    '</div>' +
    '<button class="reply-strip-close" onclick="SM.clearReplyTarget()" title="Cancel reply">✕</button>';

  /* Determine which page is active to target the right strip */
  var activePage = document.querySelector('.page.active');
  var activePageId = activePage ? activePage.id : '';

  if (activePageId === 'page-chat') {
    /* Main standalone chat page */
    var strip = document.getElementById('chat-reply-strip');
    if (strip) {
      strip.style.display = 'flex';
      strip.innerHTML = stripContent;
    }
    var input = document.getElementById('chat-input');
    if (input) input.focus();
  } else {
    /* Community page embedded chat — find the visible community strip */
    var commStrips = document.querySelectorAll('[id^="comm-reply-strip-"]');
    commStrips.forEach(function(s) {
      var commId = s.id.replace('comm-reply-strip-', '');
      /* Check if this community's chat panel is currently shown */
      var chatPanel = document.getElementById('cpanel-chat-' + commId);
      if (chatPanel && chatPanel.style.display !== 'none') {
        s.style.display = 'flex';
        s.innerHTML = stripContent.replace(
          'onclick="SM.clearReplyTarget()"',
          'onclick="SM.clearCommunityReplyTarget(\'' + commId + '\')"'
        );
        var commInput = document.getElementById('community-chat-input-' + commId);
        if (commInput) commInput.focus();
      }
    });
  }
};

SM.clearReplyTarget = function() {
  SM._replyTarget = null;
  var strip = document.getElementById('chat-reply-strip');
  if (strip) { strip.style.display = 'none'; strip.innerHTML = ''; }
};

SM.clearCommunityReplyTarget = function(communityId) {
  SM._replyTarget = null;
  var strip = document.getElementById('comm-reply-strip-' + communityId);
  if (strip) { strip.style.display = 'none'; strip.innerHTML = ''; }
};

/* ══════════════════════════════════════════════════════════
   ONLINE PRESENCE
   Simple Firestore-based presence — writes user doc on
   room entry, cleans up on room switch or page unload.
══════════════════════════════════════════════════════════ */

SM._updateOnlineCount = function(roomId) {
  var user = SM.getCurrentUser();
  if (!user) return;

  /* Write presence */
  var presenceRef = db.collection('communities').doc(roomId)
    .collection('presence').doc(user.id);
  presenceRef.set({
    userId:      user.id,
    displayName: (user.firstName + ' ' + user.lastInitial).trim(),
    isHost:      SM.isHost(),
    lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function() {});

  /* Listen for presence count */
  var cutoff = new Date(Date.now() - 5 * 60 * 1000); /* 5 min window */
  db.collection('communities').doc(roomId)
    .collection('presence')
    .where('lastSeen', '>', cutoff)
    .onSnapshot(function(snap) {
      var onlineEl = document.getElementById('chat-online-count');
      if (onlineEl) onlineEl.textContent = snap.size + ' ONLINE';

      /* Update members sidebar */
      var usersEl = document.getElementById('chat-users-list');
      if (!usersEl) return;
      usersEl.innerHTML = '';
      snap.forEach(function(doc) {
        var u = doc.data();
        var div = document.createElement('div');
        div.className = 'chat-user';
        div.innerHTML =
          '<div class="chat-user-dot"></div>' +
          '<button class="chat-user-name sender-link' + (u.isHost ? ' host' : '') + '" ' +
            'onclick="SM.viewProfile(\'' + u.userId + '\')">' +
            SM._escapeHtml(u.displayName || u.userId) +
          '</button>' +
          (u.isHost ? '<div class="chat-user-badge">HOST</div>' : '');
        usersEl.appendChild(div);
      });
    }, function() {});
};

/* Clean up presence on page unload */
window.addEventListener('beforeunload', function() {
  var user = SM.getCurrentUser();
  if (!user || !SM.currentRoom) return;
  db.collection('communities').doc(SM.currentRoom)
    .collection('presence').doc(user.id)
    .delete().catch(function() {});
});

/* ══════════════════════════════════════════════════════════
   COMMUNITY PAGE CHAT (embedded mini-chat on community pages)
   Same Firestore pattern, scoped to that community's room
══════════════════════════════════════════════════════════ */

SM.sendCommunityChatMsg = function(communityId) {
  var input = document.getElementById('community-chat-input-' + communityId);
  var user  = SM.getCurrentUser();
  if (!input || !user) return;
  var text = input.value.trim();
  if (!text) return;

  /* Capture and clear reply target before async write */
  var pendingReply = SM._replyTarget;
  input.value = '';
  SM.clearCommunityReplyTarget(communityId);

  db.collection('communities').doc(communityId)
    .collection('chat')
    .add({
      userId:     user.id,
      senderName: (user.firstName + ' ' + user.lastInitial).trim(),
      isHost:     SM.isHost(),
      text:       text,
      timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
      replyTo:    pendingReply ? {
        msgId:        pendingReply.msgId,
        senderName:   pendingReply.senderName,
        preview:      pendingReply.preview,
        senderUserId: pendingReply.senderUserId
      } : null
    })
    .then(function() {
      /* Notify the person being replied to */
      if (pendingReply && pendingReply.senderUserId) {
        SM._notifyCommentReply(
          pendingReply.senderUserId,
          (user.firstName + ' ' + user.lastInitial).trim(),
          communityId.toUpperCase() + ' chat'
        );
      }
    })
    .catch(function(err) {
      console.error('SM: sendCommunityChatMsg error:', err);
    });
};

/* ── HTML escape helper ── */
SM._escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
