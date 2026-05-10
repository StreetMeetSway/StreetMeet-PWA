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

  /* Attach Firestore real-time listener — messages from last 18 hours only */
  var cutoff18h = new Date(Date.now() - 18 * 60 * 60 * 1000);
  SM._chatListener = db.collection('communities').doc(roomId)
    .collection('chat')
    .where('timestamp', '>', cutoff18h)
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
  /* Silently purge stale messages for hosts/admins to keep storage clean */
  if (SM.isHost() || SM.isAdmin()) SM.purgeStaleChatMessages(roomId);

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

  /* Chat image — inline thumbnail, click to enlarge */
  if (m.imageURL) {
    var imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'margin-top:6px;margin-left:8px;';
    var imgEl = document.createElement('img');
    imgEl.src = m.imageURL;
    imgEl.alt = 'Image from ' + (m.senderName || 'member');
    imgEl.style.cssText = 'max-width:200px;max-height:200px;object-fit:cover;' +
      'display:block;border-radius:4px;cursor:pointer;border:1px solid var(--gray-200);';
    imgEl.addEventListener('click', function() {
      SM.openLightbox([m.imageURL], 0);
    });
    imgWrap.appendChild(imgEl);
    div.appendChild(imgWrap);
  }

  div.appendChild(replyBtn);
  container.appendChild(div);
};

/* ══════════════════════════════════════════════════════════
   SEND MESSAGE — writes to Firestore
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   TASK 17 — CHAT IMAGE UPLOAD
   Image button beside chat input. Compresses to ≤200KB,
   uploads to Storage, attaches CDN URL to message doc.
   Images expire with the 18-hour chat purge.
══════════════════════════════════════════════════════════ */

/* Preview helpers — main chat */
SM._previewChatImage = function(input) {
  var file = input.files[0];
  if (!file) return;
  var strip = document.getElementById('chat-img-preview');
  var img   = document.getElementById('chat-img-preview-img');
  if (!strip || !img) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    img.src = e.target.result;
    strip.style.display = 'flex';
  };
  reader.readAsDataURL(file);
};

SM._clearChatImage = function() {
  var fileInput = document.getElementById('chat-img-file');
  var strip     = document.getElementById('chat-img-preview');
  var img       = document.getElementById('chat-img-preview-img');
  if (fileInput) fileInput.value = '';
  if (strip)     strip.style.display = 'none';
  if (img)       img.src = '';
};

/* Preview helpers — community page chat */
SM._previewCommChatImage = function(input, communityId) {
  var file = input.files[0];
  if (!file) return;
  var stripId = 'comm-chat-img-preview-' + communityId;
  var strip   = document.getElementById(stripId);
  if (!strip) return;
  var img = strip.querySelector('img');
  var reader = new FileReader();
  reader.onload = function(e) {
    if (img) img.src = e.target.result;
    strip.style.display = 'flex';
  };
  reader.readAsDataURL(file);
};

SM._clearCommChatImage = function(communityId) {
  var fileInput = document.getElementById('comm-chat-img-file-' + communityId);
  var strip     = document.getElementById('comm-chat-img-preview-' + communityId);
  if (fileInput) fileInput.value = '';
  if (strip)     strip.style.display = 'none';
};

/* Convert dataURL to Blob (learned from Task 16) */
SM._dataURLtoBlob = function(dataURL) {
  var byteStr = atob(dataURL.split(',')[1]);
  var ab = new ArrayBuffer(byteStr.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteStr.length; i++) { ia[i] = byteStr.charCodeAt(i); }
  return new Blob([ab], { type: 'image/jpeg' });
};

/* Upload chat image to Storage, return promise of CDN URL */
SM._uploadChatImage = function(file, communityId, msgId) {
  return SM.compressImage(file, 800, 0.80).then(function(dataURL) {
    var blob = SM._dataURLtoBlob(dataURL);
    var path = 'chat/' + communityId + '/' + msgId + '.jpg';
    var ref  = firebase.storage().ref(path);
    return ref.put(blob).then(function() {
      return ref.getDownloadURL();
    });
  });
};

SM.sendChatMessage = function() {
  var input     = document.getElementById('chat-input');
  var fileInput = document.getElementById('chat-img-file');
  var user      = SM.getCurrentUser();
  if (!input || !user) return;

  var text      = input.value.trim();
  var imageFile = fileInput && fileInput.files[0] ? fileInput.files[0] : null;

  /* Require either text or image */
  if (!text && !imageFile) return;

  var displayName = (user.firstName || '') + ' ' + (user.lastInitial || '');
  var msgData = {
    userId:     user.id,
    senderName: displayName.trim(),
    isHost:     SM.isHost(),
    text:       text,
    timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
    replyTo:    SM._replyTarget || null
  };

  /* Clear input and reply state immediately */
  var pendingReply = SM._replyTarget;
  input.value = '';
  SM.clearReplyTarget();
  SM._clearChatImage();

  /* Write message doc first to get an ID */
  var roomRef = db.collection('communities').doc(SM.currentRoom).collection('chat');
  roomRef.add(msgData).then(function(docRef) {
    if (pendingReply && pendingReply.senderUserId) {
      SM._notifyCommentReply(
        pendingReply.senderUserId,
        displayName.trim(),
        SM.currentRoom.toUpperCase() + ' chat',
        'chat',
        SM.currentRoom
      );
    }
    if (imageFile) {
      SM._uploadChatImage(imageFile, SM.currentRoom, docRef.id).then(function(url) {
        return docRef.update({ imageURL: url });
      }).catch(function(err) {
        console.error('SM: chat image upload error:', err);
      });
    }
  }).catch(function(err) {
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

/* ══════════════════════════════════════════════════════════
   TASK 08 — 18-HOUR CHAT EXPIRATION
   Deletes messages older than 18 hours from Firestore.
   Called automatically when a host or admin opens a community chat.
   Safe to call multiple times — only deletes stale docs.
══════════════════════════════════════════════════════════ */
SM.purgeStaleChatMessages = function(communityId) {
  var cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000);
  db.collection('communities').doc(communityId)
    .collection('chat')
    .where('timestamp', '<', cutoff)
    .get()
    .then(function(snap) {
      if (snap.empty) return;
      /* Batch-delete up to 500 docs at a time (Firestore batch limit) */
      var batch = db.batch();
      var count = 0;
      snap.docs.forEach(function(doc) {
        batch.delete(doc.ref);
        count++;
      });
      return batch.commit().then(function() {
        if (count > 0) console.log('SM: Purged ' + count + ' stale chat messages from ' + communityId);
      });
    })
    .catch(function(err) {
      /* Non-critical — log but don't surface to user */
      console.warn('SM: purgeStaleChatMessages error:', err.message);
    });
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
  var input     = document.getElementById('community-chat-input-' + communityId);
  var fileInput = document.getElementById('comm-chat-img-file-' + communityId);
  var user      = SM.getCurrentUser();
  if (!input || !user) return;

  var text      = input.value.trim();
  var imageFile = fileInput && fileInput.files[0] ? fileInput.files[0] : null;

  if (!text && !imageFile) return;

  var pendingReply = SM._replyTarget || null;
  input.value = '';
  SM.clearCommunityReplyTarget(communityId);
  SM._clearCommChatImage(communityId);

  var displayName = (user.firstName + ' ' + user.lastInitial).trim();

  db.collection('communities').doc(communityId)
    .collection('chat')
    .add({
      userId:     user.id,
      senderName: displayName,
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
    .then(function(docRef) {
      if (pendingReply && pendingReply.senderUserId) {
        SM._notifyCommentReply(
          pendingReply.senderUserId,
          displayName,
          communityId.toUpperCase() + ' chat',
          'chat',
          communityId
        );
      }
      if (imageFile) {
        SM._uploadChatImage(imageFile, communityId, docRef.id).then(function(url) {
          return docRef.update({ imageURL: url });
        }).catch(function(err) {
          console.error('SM: comm chat image upload error:', err);
        });
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

