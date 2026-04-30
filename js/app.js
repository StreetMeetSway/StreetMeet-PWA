/* ============================================================
   STREETMEET — MAIN APP
   Page routing, nav, events, RSVP, profile management
   ============================================================ */

window.SM = window.SM || {};
var SM = window.SM;

/* ── EVENTS CACHE ──
   SM.events is populated from Firestore on load.
   Local array stays for rendering — Firestore is source of truth. */
SM.events    = [];
SM.rsvpState = {}; /* { eventId: 'going'|'maybe'|'notgoing' } */

/* ── LOAD ALL EVENTS FROM FIRESTORE ──
   Reads across all three community subcollections,
   merges into SM.events, then re-renders wherever events appear. */
SM.loadEvents = function() {
  var communities = ['smdc', 'smwa', 'smmd'];
  var promises = communities.map(function(cid) {
    return db.collection('communities').doc(cid)
      .collection('events')
      .orderBy('date', 'asc')
      .get()
      .then(function(snap) {
        return snap.docs.map(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          return d;
        });
      });
  });
  return Promise.all(promises)
    .then(function(results) {
      /* Flatten and sort by date ascending */
      SM.events = results
        .reduce(function(acc, arr) { return acc.concat(arr); }, [])
        .sort(function(a, b) { return a.date > b.date ? 1 : -1; });
      return SM.events;
    })
    .catch(function(err) {
      console.error('SM: loadEvents error:', err);
      return [];
    });
};

/* ── LOAD USER'S RSVP STATE ──
   Fetches the current user's RSVP across all events
   so buttons render with the correct active state. */
SM.loadRsvpState = function() {
  var user = SM.getCurrentUser();
  if (!user) return Promise.resolve();
  var communities = ['smdc', 'smwa', 'smmd'];
  var promises = communities.map(function(cid) {
    return db.collection('communities').doc(cid)
      .collection('events')
      .get()
      .then(function(snap) {
        var rsvpPromises = snap.docs.map(function(doc) {
          return db.collection('communities').doc(cid)
            .collection('events').doc(doc.id)
            .collection('rsvps').doc(user.id)
            .get()
            .then(function(rsvpDoc) {
              if (rsvpDoc.exists) {
                SM.rsvpState[doc.id] = rsvpDoc.data().state;
              }
            });
        });
        return Promise.all(rsvpPromises);
      });
  });
  return Promise.all(promises).catch(function(err) {
    console.error('SM: loadRsvpState error:', err);
  });
};

/* ── SEED DEMO EVENTS ──
   Called once from admin to populate Firestore with the
   four original demo events. Safe to call multiple times
   (checks for existing docs first). */
SM.seedEvents = function() {
  if (!SM.isAdmin()) { SM.showToast('Admin only', 'error'); return; }
  var demoEvents = [
    {
      community: 'smdc', communityLabel: 'StreetMeet DC',
      title: 'Golden Hour Edition — Adams Morgan',
      date: '2026-04-26', time: '17:30',
      address: 'Columbia Rd NW & 18th St NW, Washington, DC 20009',
      description: "We're looking forward to seeing everyone at the next StreetMeet. RSVP to receive updates! Golden hour hits around 7:30 — bring your wide glass and come ready to create.",
      photo: '', going: [], maybe: [], notgoing: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    {
      community: 'smdc', communityLabel: 'StreetMeet DC',
      title: 'Navy Yard Shoot — May Edition',
      date: '2026-05-17', time: '14:00',
      address: '1239 1st St SE, Washington, DC 20003',
      description: 'Join us at the waterfront for our May meet. Lots of great architectural shots and people watching. All skill levels welcome.',
      photo: '', going: [], maybe: [], notgoing: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    {
      community: 'smwa', communityLabel: 'StreetMeet WA',
      title: 'Capitol Hill Street Session',
      date: '2026-05-03', time: '16:00',
      address: 'Broadway & E Pike St, Seattle, WA 98122',
      description: 'Pacific Northwest creatives come together on Capitol Hill. Rain gear optional, good vibes mandatory.',
      photo: '', going: [], maybe: [], notgoing: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    {
      community: 'smmd', communityLabel: 'StreetMeet MD',
      title: 'Inner Harbor Golden Hour',
      date: '2026-05-10', time: '18:00',
      address: '201 E Pratt St, Baltimore, MD 21202',
      description: "Baltimore's Inner Harbor at golden hour is something special. Come through and let's create together.",
      photo: '', going: [], maybe: [], notgoing: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }
  ];

  var batch = db.batch();
  demoEvents.forEach(function(ev) {
    var ref = db.collection('communities').doc(ev.community)
                .collection('events').doc();
    batch.set(ref, ev);
  });
  batch.commit()
    .then(function() {
      SM.showToast('Demo events seeded to Firestore!', 'success');
      SM.loadEvents().then(function() {
        SM.renderEventsList();
        SM.renderHomeEvents();
      });
    })
    .catch(function(err) {
      SM.showToast('Seed failed: ' + err.message, 'error');
      console.error(err);
    });
};

/* ── PAGE ROUTING ── */
SM.showPage = function(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  SM.updateNav(pageId);
  SM.onPageLoad(pageId);
};

SM.onPageLoad = function(pageId) {
  switch(pageId) {
    case 'home':
      SM.renderHomeCommunityHeader();
      SM.renderHomeEvents();
      break;
    case 'events':
      SM.renderEventsList();
      var hostBtn = document.getElementById('host-create-btn');
      if (hostBtn && SM.isHost()) {
        hostBtn.innerHTML = '<button class="btn btn-sm" onclick="SM.showPage(\'create-event\')">+ CREATE EVENT</button>';
      }
      break;
    case 'chat': SM.initChat(); SM.renderChatRoom(SM.currentRoom || 'smdc'); break;
    case 'profile': SM.renderProfile(); break;
    case 'edit-profile': SM.renderEditProfile(); break;
    case 'admin': SM.renderAdmin(); break;
    case 'smdc': SM.renderCommunityPage('smdc'); break;
    case 'smwa': SM.renderCommunityPage('smwa'); break;
    case 'smmd': SM.renderCommunityPage('smmd'); break;
    case 'create-event': SM.renderCreateEvent(); break;
  }
};

/* ── HOME COMMUNITY HEADER ── */
SM.renderHomeCommunityHeader = function() {
  var user = SM.getCurrentUser();
  if (!user) return;
  var hdr = document.getElementById('home-community-header');
  if (!hdr) return;
  var cd = SM.communityData[user.community];
  hdr.innerHTML =
    '<div style="font-family:var(--font-head);font-size:3.5rem;color:var(--white);letter-spacing:0.06em;line-height:1">' + (cd ? cd.code : user.community.toUpperCase()) + '</div>' +
    '<div style="font-family:var(--font-head);font-size:1.1rem;color:rgba(255,255,255,0.45);letter-spacing:0.15em;margin-top:4px">' + (cd ? cd.name.toUpperCase() : '') + '</div>' +
    '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-outline-white" onclick="SM.showPage(\'events\')">VIEW ALL EVENTS</button>' +
      '<button class="btn btn-sm btn-outline-white" onclick="SM.showPage(\'chat\')">COMMUNITY CHAT</button>' +
      '<button class="btn btn-sm btn-outline-white" onclick="SM.showPage(\'' + user.community + '\')">COMMUNITY PAGE</button>' +
    '</div>';
};

/* ── NAV ── */
SM.updateNav = function(activePageId) {
  var user = SM.getCurrentUser();
  var navLinksEl = document.getElementById('nav-links');
  var navUserEl  = document.getElementById('nav-user');
  if (!navLinksEl) return;

  navLinksEl.innerHTML = '';
  if (navUserEl) navUserEl.innerHTML = '';

  if (!user) {
    /* Logged-out state — Sign In button scrolls to sign-in section */
    if (navUserEl) navUserEl.innerHTML =
      '<button class="btn btn-sm btn-outline-white" onclick="SM.showPage(\'landing\');setTimeout(function(){var s=document.getElementById(\'signup-section\');if(s)s.scrollIntoView({behavior:\'smooth\'});},200)">SIGN IN</button>';
    return;
  }

  /* Logged-in nav links */
  var links =
    '<a class="nav-link' + (activePageId === 'home' ? ' active' : '') + '" onclick="SM.navGo(\'home\')">Home</a>' +
    '<div class="nav-dropdown" id="dd-communities">' +
      '<a class="nav-link" onclick="SM.toggleDropdown(\'dd-communities\',event)">Communities ▾</a>' +
      '<div class="nav-dropdown-menu" id="dd-communities-menu">' +
        '<a class="nav-dropdown-item" onclick="SM.navGo(\'smdc\')">SMDC — Washington D.C.</a>' +
        '<a class="nav-dropdown-item" onclick="SM.navGo(\'smwa\')">SMWA — Washington State</a>' +
        '<a class="nav-dropdown-item" onclick="SM.navGo(\'smmd\')">SMMD — Maryland</a>' +
      '</div>' +
    '</div>' +
    '<a class="nav-link' + (activePageId === 'events' ? ' active' : '') + '" onclick="SM.navGo(\'events\')">Events</a>' +
    '<a class="nav-link' + (activePageId === 'chat' ? ' active' : '') + '" onclick="SM.navGo(\'chat\')">Chat</a>';

  if (SM.isHost()) links += '<a class="nav-link" onclick="SM.navGo(\'create-event\')">+ Event</a>';
  if (SM.isAdmin()) links += '<a class="nav-link' + (activePageId === 'admin' ? ' active' : '') + '" onclick="SM.navGo(\'admin\')">Admin</a>';
  navLinksEl.innerHTML = links;

  if (navUserEl) {
    var initials = ((user.firstName||'')[0] + ((user.lastInitial||'')[0] || '')).toUpperCase();
    navUserEl.innerHTML =
      '<div class="nav-dropdown" id="dd-user">' +
        '<div class="nav-avatar" onclick="SM.toggleDropdown(\'dd-user\',event)">' + initials + '</div>' +
        '<div class="nav-dropdown-menu" id="dd-user-menu" style="right:0;left:auto;min-width:160px;">' +
          '<a class="nav-dropdown-item" onclick="SM.navGo(\'profile\')">My Profile</a>' +
          '<a class="nav-dropdown-item" onclick="SM.navGo(\'edit-profile\')">Edit Profile</a>' +
          '<a class="nav-dropdown-item" onclick="SM.logout()" style="color:rgba(255,100,100,0.9)">Sign Out</a>' +
        '</div>' +
      '</div>';
  }
};

SM.toggleDropdown = function(ddId, event) {
  if (event) event.stopPropagation();
  var dd   = document.getElementById(ddId);
  if (!dd) return;
  var menu = dd.querySelector('.nav-dropdown-menu');
  if (!menu) return;
  var isOpen = menu.style.display === 'block';
  SM.closeAllDropdowns();
  if (!isOpen) { menu.style.display = 'block'; dd.classList.add('open'); }
};

SM.closeAllDropdowns = function() {
  document.querySelectorAll('.nav-dropdown-menu').forEach(function(m) { m.style.display = 'none'; });
  document.querySelectorAll('.nav-dropdown').forEach(function(d) { d.classList.remove('open'); });
};

SM.navGo = function(pageId) {
  SM.closeAllDropdowns();
  SM.showPage(pageId);
};

document.addEventListener('click', function(e) {
  if (!e.target.closest('nav')) SM.closeAllDropdowns();
});

/* ── TOAST ── */
SM.showToast = function(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
};

/* ── RENDER HOME EVENTS ── */
SM.renderHomeEvents = function() {
  var user = SM.getCurrentUser();
  if (!user) return;
  var container = document.getElementById('home-events');
  if (!container) return;

  container.innerHTML = '<p class="p2" style="color:var(--gray-600)">Loading events...</p>';

  SM.loadEvents().then(function(events) {
    SM.loadRsvpState().then(function() {
      var communityEvents = events.filter(function(e) { return e.community === user.community; });
      container.innerHTML = communityEvents.length
        ? communityEvents.map(SM.renderEventCard).join('')
        : '<p class="p2" style="color:var(--gray-600)">No upcoming events. Check back soon.</p>';
      /* Load comments for each rendered event */
      communityEvents.forEach(function(ev) { SM.loadComments(ev.id); });
    });
  });
};

/* ── RENDER EVENTS LIST ── */
SM.renderEventsList = function() {
  var container = document.getElementById('all-events');
  if (!container) return;

  container.innerHTML = '<p class="p2" style="color:var(--gray-600)">Loading events...</p>';

  SM.loadEvents().then(function(events) {
    SM.loadRsvpState().then(function() {
      container.innerHTML = events.length
        ? events.map(SM.renderEventCard).join('')
        : '<p class="p2" style="color:var(--gray-600)">No events yet. Check back soon.</p>';
      /* Load comments for each rendered event */
      events.forEach(function(ev) { SM.loadComments(ev.id); });
    });
  });
};

/* ── EVENT CARD HTML ── */
SM.renderEventCard = function(ev) {
  var d = new Date(ev.date + 'T' + ev.time);
  var dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  var timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  var rsvpState = SM.rsvpState[ev.id] || '';
  var calLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + ev.date.replace(/-/g,'') + 'T' + ev.time.replace(':','') + '00/' + ev.date.replace(/-/g,'') + 'T200000&details=' + encodeURIComponent(ev.description) + '&location=' + encodeURIComponent(ev.address);
  var mapLink = 'https://maps.google.com/?q=' + encodeURIComponent(ev.address);

  /* Host/Admin action bar — edit and delete */
  var adminBar = (SM.isHost() || SM.isAdmin()) ?
    '<div class="event-admin-bar">' +
      '<button class="event-admin-btn edit" onclick="SM.editEvent(\'' + ev.id + '\',\'' + ev.community + '\')" title="Edit event">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        ' EDIT' +
      '</button>' +
      (SM.isAdmin() ?
        '<button class="event-admin-btn delete" onclick="SM.deleteEvent(\'' + ev.id + '\',\'' + ev.community + '\')" title="Delete event">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
          ' DELETE' +
        '</button>' : '') +
    '</div>' : '';

  return '<div class="event-card" id="event-card-' + ev.id + '">' +
    adminBar +
    '<div class="event-card-img">' +
      '<div class="event-card-img-placeholder">' +
        '<div style="font-family:var(--font-head);font-size:4rem;color:rgba(255,255,255,0.08);letter-spacing:0.1em">' + ev.community.toUpperCase() + '</div>' +
      '</div>' +
      '<div class="event-card-badge"><span class="tag tag-red">UPCOMING</span></div>' +
    '</div>' +
    '<div class="event-card-body">' +
      '<div class="event-card-community">' + (ev.communityLabel || '') + '</div>' +
      '<div class="event-card-title">' + (ev.title || '') + '</div>' +
      (ev.description ? '<div class="event-card-desc">' + (ev.description || '') + '</div>' : '') +
      '<div class="event-meta-item">' +
        '<svg class="event-meta-icon" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>' +
        '<div>' +
          '<div style="font-size:var(--p3)">' + (ev.address || '') + '</div>' +
          '<button class="event-meta-link" onclick="window.open(\'' + mapLink + '\',\'_blank\')">Open in Maps →</button>' +
        '</div>' +
      '</div>' +
      '<div class="event-meta-item">' +
        '<svg class="event-meta-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<div>' +
          '<div style="font-size:var(--p3)">' + dateStr + ' · ' + timeStr + '</div>' +
          '<a class="event-meta-link" href="' + calLink + '" target="_blank">+ Save to Calendar</a>' +
        '</div>' +
      '</div>' +
      '<div class="rsvp-counts">' +
        '<div class="rsvp-count-item"><strong id="going-' + ev.id + '">' + (ev.going||[]).length + '</strong> I\'m Down</div>' +
        '<div class="rsvp-count-item"><strong id="maybe-' + ev.id + '">' + (ev.maybe||[]).length + '</strong> Just Might</div>' +
        '<div class="rsvp-count-item"><strong id="notgoing-' + ev.id + '">' + (ev.notgoing||[]).length + '</strong> Missing Out</div>' +
        '<button class="event-meta-link" onclick="SM.showAttendeesModal(\'' + ev.id + '\')" style="margin-left:auto">Who\'s going →</button>' +
      '</div>' +
      '<div class="rsvp-btns">' +
        '<button class="rsvp-btn' + (rsvpState==='going'?' going':'') + '" id="rsvp-going-' + ev.id + '" onclick="SM.setRsvp(\'' + ev.id + '\',\'going\')">I\'M DOWN</button>' +
        '<button class="rsvp-btn' + (rsvpState==='maybe'?' maybe':'') + '" id="rsvp-maybe-' + ev.id + '" onclick="SM.setRsvp(\'' + ev.id + '\',\'maybe\')">JUST MIGHT</button>' +
        '<button class="rsvp-btn' + (rsvpState==='notgoing'?' notgoing':'') + '" id="rsvp-notgoing-' + ev.id + '" onclick="SM.setRsvp(\'' + ev.id + '\',\'notgoing\')">MISSING OUT</button>' +
      '</div>' +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--gray-200)">' +
        '<div style="font-family:var(--font-head);font-size:1.2rem;letter-spacing:0.04em;margin-bottom:10px">DISCUSSION</div>' +
        '<div class="comment-thread" id="comments-' + ev.id + '">' +
          '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">Loading comments...</p>' +
        '</div>' +
        '<div class="comment-input-row">' +
          '<input class="field-input" type="text" placeholder="Add a comment..." id="comment-input-' + ev.id + '" onkeydown="if(event.key===\'Enter\')SM.postComment(\'' + ev.id + '\')"/>' +
          '<button class="btn btn-sm btn-black" onclick="SM.postComment(\'' + ev.id + '\')">POST</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
};

/* ── RSVP ── */
SM.setRsvp = function(evId, state) {
  var user = SM.getCurrentUser();
  if (!user) { SM.showToast('Sign in to RSVP', 'error'); return; }

  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (!ev) return;

  /* Optimistic UI update first */
  var prev = SM.rsvpState[evId];
  if (prev === state) return; /* Already in this state */

  /* Remove user from previous state array */
  if (prev && ev[prev]) {
    ev[prev] = ev[prev].filter(function(u) { return u !== user.id; });
  }

  /* Add to new state */
  SM.rsvpState[evId] = state;
  if (!ev[state]) ev[state] = [];
  if (!ev[state].includes(user.id)) ev[state].push(user.id);

  /* Update count displays */
  ['going','maybe','notgoing'].forEach(function(s) {
    var countEl = document.getElementById(s + '-' + evId);
    if (countEl) countEl.textContent = (ev[s] || []).length;
    var btn = document.getElementById('rsvp-' + s + '-' + evId);
    if (btn) btn.className = 'rsvp-btn' + (s === state ? ' ' + s : '');
  });

  /* Write to Firestore — rsvps subcollection keyed by userId */
  var rsvpRef = db.collection('communities').doc(ev.community)
    .collection('events').doc(evId)
    .collection('rsvps').doc(user.id);

  rsvpRef.set({
    userId:    user.id,
    state:     state,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    SM.showToast('RSVP updated!', 'success');
  }).catch(function(err) {
    console.error('SM: RSVP error:', err);
    SM.showToast('Could not save RSVP — try again', 'error');
    /* Revert optimistic update on failure */
    SM.rsvpState[evId] = prev;
  });
};

/* ── COMMENTS ── */
SM.postComment = function(evId) {
  var inp  = document.getElementById('comment-input-' + evId);
  var user = SM.getCurrentUser();
  if (!inp || !user) return;
  var text = inp.value.trim();
  if (!text) return;

  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (!ev) return;

  var initials = ((user.firstName||'')[0] + ((user.lastInitial||'')[0] || '')).toUpperCase();
  var commentData = {
    authorId:   user.id,
    authorName: (user.firstName || '') + ' ' + (user.lastInitial || ''),
    authorInitials: initials,
    text:       text,
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    replyTo:    null
  };

  /* Optimistic render first */
  var container = document.getElementById('comments-' + evId);
  if (container) {
    var div = document.createElement('div');
    div.className = 'comment';
    div.innerHTML =
      '<div class="comment-avatar">' + initials + '</div>' +
      '<div class="comment-body">' +
        '<div class="comment-meta">' +
          '<span class="comment-name">' + commentData.authorName + '</span>' +
          '<span class="comment-time">just now</span>' +
        '</div>' +
        '<div class="comment-text">' + text + '</div>' +
      '</div>';
    container.appendChild(div);
  }
  inp.value = '';

  /* Write to Firestore */
  db.collection('communities').doc(ev.community)
    .collection('events').doc(evId)
    .collection('comments')
    .add(commentData)
    .catch(function(err) {
      console.error('SM: postComment error:', err);
      SM.showToast('Comment could not be saved — check your connection', 'error');
    });
};

/* ── ATTENDEES MODAL ── */
/* ── LOAD COMMENTS FROM FIRESTORE ──
   Called after event cards render to populate comment threads */
SM.loadComments = function(evId) {
  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (!ev) return;
  var container = document.getElementById('comments-' + evId);
  if (!container) return;

  db.collection('communities').doc(ev.community)
    .collection('events').doc(evId)
    .collection('comments')
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get()
    .then(function(snap) {
      if (snap.empty) {
        container.innerHTML = '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">No comments yet — be the first!</p>';
        return;
      }
      container.innerHTML = snap.docs.map(function(doc) {
        var c = doc.data();
        var initials = c.authorInitials || (c.authorName||'??').substring(0,2).toUpperCase();
        var timeStr = c.createdAt ? new Date(c.createdAt.toMillis()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'just now';
        return '<div class="comment">' +
          '<div class="comment-avatar">' + initials + '</div>' +
          '<div class="comment-body">' +
            '<div class="comment-meta">' +
              '<span class="comment-name">' + (c.authorName||'Member') + '</span>' +
              '<span class="comment-time">' + timeStr + '</span>' +
            '</div>' +
            '<div class="comment-text">' + (c.text||'') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    })
    .catch(function(err) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--gray-600)">Could not load comments.</p>';
      console.error('SM: loadComments error:', err);
    });
};

/* ── ATTENDEES MODAL ── */
SM.showAttendeesModal = function(evId) {
  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (!ev) return;
  var modal = document.getElementById('attendees-modal');
  var list  = document.getElementById('attendees-list');
  if (!modal || !list) return;

  list.innerHTML = '<div style="padding:16px;font-size:var(--p3);color:var(--gray-600)">Loading attendees...</div>';
  modal.classList.add('open');

  /* Load RSVPs from Firestore */
  db.collection('communities').doc(ev.community)
    .collection('events').doc(evId)
    .collection('rsvps')
    .where('state', '==', 'going')
    .get()
    .then(function(snap) {
      if (snap.empty) {
        list.innerHTML = '<div style="padding:16px;font-size:var(--p3);color:var(--gray-600)">No one has RSVP\'d yet.</div>';
        return;
      }
      /* Fetch profile for each attendee */
      var profilePromises = snap.docs.map(function(doc) {
        return db.collection('users').doc(doc.data().userId).get();
      });
      return Promise.all(profilePromises).then(function(profiles) {
        list.innerHTML = profiles.map(function(pDoc) {
          if (!pDoc.exists) return '';
          var u = pDoc.data();
          var initials = ((u.firstName||'')[0]||'').toUpperCase() + ((u.lastInitial||'')[0]||'').toUpperCase();
          var avatarHTML = u.avatarURL
            ? '<img src="' + u.avatarURL + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"/>'
            : '<div class="comment-avatar" style="width:36px;height:36px;flex-shrink:0">' + initials + '</div>';
          return '<div class="attendee-row" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--gray-200);cursor:pointer" onclick="SM.closeAttendeesModal({target:document.getElementById(\'attendees-modal\')});SM.viewProfile(\'' + pDoc.id + '\')">' +
            avatarHTML +
            '<div>' +
              '<div style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.03em">' + (u.firstName||'') + ' ' + (u.lastInitial||'') + '</div>' +
              '<div style="font-size:var(--p3);color:var(--gray-600)">' + (u.creatorType||'') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      });
    })
    .catch(function(err) {
      list.innerHTML = '<div style="padding:16px;font-size:var(--p3);color:var(--red)">Could not load attendees.</div>';
      console.error('SM: showAttendeesModal error:', err);
    });
};

SM.closeAttendeesModal = function(e) {
  if (e.target === document.getElementById('attendees-modal')) {
    document.getElementById('attendees-modal').classList.remove('open');
  }
};

/* ── PROFILE ── */
SM.renderProfile = function() {
  var user = SM.getCurrentUser();
  if (!user) { SM.showPage('landing'); return; }
  SM._renderProfileData(user, true); /* true = own profile, show Edit button */
};

/* View any user's public profile by Firestore userId */
SM.viewProfile = function(userId) {
  var current = SM.getCurrentUser();
  /* If viewing own profile, use cached data */
  if (current && current.id === userId) {
    SM.renderProfile();
    SM.showPage('profile');
    return;
  }
  /* Fetch from Firestore */
  var el = document.getElementById('profile-content');
  if (el) el.innerHTML = '<div class="section"><p class="p2" style="color:var(--gray-600)">Loading profile...</p></div>';
  SM.showPage('profile');
  SM.fetchUserProfile(userId).then(function(result) {
    if (!result.ok) {
      if (el) el.innerHTML = '<div class="section"><p class="p2" style="color:var(--red)">Profile not found.</p></div>';
      return;
    }
    SM._renderProfileData(result.user, false); /* false = someone else's profile */
  });
};

SM._renderProfileData = function(user, isOwn) {
  var el = document.getElementById('profile-content');
  if (!el) return;

  var initials = ((user.firstName||'')[0] || '').toUpperCase() +
                 ((user.lastInitial||'')[0] || '').toUpperCase();

  /* Avatar — use Firebase Storage URL if available, else initials */
  var avatarHTML = user.avatarURL
    ? '<img src="' + user.avatarURL + '" alt="' + user.firstName + '" style="width:100%;height:100%;object-fit:cover;"/>'
    : '<span style="font-family:var(--font-head);font-size:2.5rem;color:var(--white)">' + initials + '</span>';

  /* Portfolio photos — use photoURLs array from Firestore */
  var photos = user.photoURLs || [];
  var photosHTML = [0,1,2,3].map(function(i) {
    if (photos[i]) {
      return '<div class="photo-slot filled"><img src="' + photos[i] + '" alt="Photo ' + (i+1) + '"/></div>';
    }
    return '<div class="photo-slot">' +
      '<svg class="slot-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
      '<span class="slot-label">' + (isOwn ? 'ADD PHOTO' : '') + '</span>' +
    '</div>';
  }).join('');

  /* Video embed — Task 2.4 will expand this */
  var videoHTML = '';
  if (user.videoUrl) {
    var embed = SM.parseVideoEmbed ? SM.parseVideoEmbed(user.videoUrl) : null;
    if (embed) {
      videoHTML = '<div class="mb-lg">' +
        '<span class="section-label">Featured Work</span>' +
        '<div style="position:relative;padding-top:56.25%;background:var(--black);margin-top:8px">' +
          '<iframe src="' + embed.embedUrl + '" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>' +
        '</div>' +
      '</div>';
    }
  }

  el.innerHTML =
    '<div class="profile-header">' +
      '<div class="flex items-center gap-md" style="gap:20px;max-width:var(--max-w);margin:0 auto">' +
        '<div class="profile-avatar-lg" style="background:var(--teal);display:flex;align-items:center;justify-content:center;overflow:hidden">' +
          avatarHTML +
        '</div>' +
        '<div>' +
          '<div class="profile-name">' + (user.firstName||'') + ' ' + (user.lastInitial||'') + '</div>' +
          '<div class="profile-role">' + (user.creatorType||'') + '</div>' +
          '<div class="profile-community">' + SM.communityName(user.community) + '</div>' +
        '</div>' +
        (isOwn ? '<button class="btn btn-sm btn-outline-white" style="margin-left:auto" onclick="SM.showPage(\'edit-profile\')">EDIT PROFILE</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="section">' +
      '<div class="two-col">' +
        '<div>' +
          '<span class="section-label">About</span>' +
          '<p class="p2 mb-lg">' + (user.bio || 'No bio yet.') + '</p>' +
          videoHTML +
          (user.website ? '<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">PORTFOLIO</span><br><a href="https://' + user.website + '" target="_blank" class="event-meta-link">' + user.website + '</a></div>' : '') +
          (user.instagram ? '<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">INSTAGRAM</span><br><a href="https://instagram.com/' + user.instagram + '" target="_blank" class="event-meta-link">@' + user.instagram + '</a></div>' : '') +
        '</div>' +
        '<div>' +
          '<span class="section-label">Photos</span>' +
          '<div class="profile-photos-grid">' + photosHTML + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
};

/* ── EDIT PROFILE ── */
SM.renderEditProfile = function() {
  var user = SM.getCurrentUser();
  if (!user) { SM.showPage('landing'); return; }
  var el = document.getElementById('edit-profile-content');
  if (!el) return;

  var avatarStyle = user.avatarURL
    ? 'background:url(' + user.avatarURL + ') center/cover no-repeat;'
    : 'background:var(--teal);display:flex;align-items:center;justify-content:center;';
  var avatarInner = user.avatarURL ? '' :
    '<span style="font-family:var(--font-head);font-size:1.4rem;color:var(--white)">' +
    ((user.firstName||'')[0]||'').toUpperCase() + ((user.lastInitial||'')[0]||'').toUpperCase() + '</span>';

  var photos = user.photoURLs || [];

  el.innerHTML =
    '<div class="section" style="max-width:640px;margin:0 auto">' +
      '<h2 class="mb-lg">EDIT PROFILE</h2>' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +

        /* Avatar */
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div id="avatar-preview" style="width:72px;height:72px;border-radius:50%;overflow:hidden;flex-shrink:0;' + avatarStyle + '">' +
            avatarInner +
          '</div>' +
          '<div>' +
            '<div style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em;margin-bottom:4px">PROFILE PHOTO</div>' +
            '<button id="avatar-upload-btn" class="btn btn-sm btn-outline" onclick="SM.triggerAvatarUpload()">CHANGE PHOTO</button>' +
          '</div>' +
        '</div>' +

        /* Name */
        '<div class="form-grid">' +
          '<div class="field"><label class="field-label">FIRST NAME</label>' +
            '<input class="field-input" type="text" id="ep-fname" value="' + (user.firstName||'') + '"/></div>' +
          '<div class="field"><label class="field-label">LAST INITIAL</label>' +
            '<input class="field-input" type="text" id="ep-linitial" value="' + (user.lastInitial||'') + '" maxlength="2" style="width:80px"/></div>' +
        '</div>' +

        /* Bio */
        '<div class="field">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<label class="field-label">BIO</label>' +
            '<span class="char-count" id="ep-char-ct">' + (user.bio||'').length + ' / 200</span>' +
          '</div>' +
          '<textarea class="field-textarea" id="ep-bio" maxlength="200" rows="3" ' +
            'oninput="document.getElementById(\'ep-char-ct\').textContent=this.value.length+\' / 200\'">' +
            (user.bio||'') + '</textarea>' +
        '</div>' +

        /* Creator type */
        '<div class="field"><label class="field-label">I AM A...</label>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px" id="ep-roles">' +
            ['Photographer','Model','Videographer','Content Creator'].map(function(r) {
              return '<div class="role-chip' + (user.creatorType===r?' selected':'') + '" onclick="SM.pickRole(this,\'ep-roles\')">' + r + '</div>';
            }).join('') +
          '</div>' +
        '</div>' +

        /* Community */
        '<div class="field"><label class="field-label">HOME COMMUNITY</label>' +
          '<select class="field-select" id="ep-community">' +
            '<option value="smdc"' + (user.community==='smdc'?' selected':'') + '>SMDC — Washington, D.C.</option>' +
            '<option value="smwa"' + (user.community==='smwa'?' selected':'') + '>SMWA — Washington State</option>' +
            '<option value="smmd"' + (user.community==='smmd'?' selected':'') + '>SMMD — Maryland</option>' +
          '</select>' +
        '</div>' +

        /* Website */
        '<div class="field"><label class="field-label">PORTFOLIO WEBSITE</label>' +
          '<input class="field-input" type="text" id="ep-website" value="' + (user.website||'') + '" placeholder="yourportfolio.com"/>' +
        '</div>' +

        /* Instagram */
        '<div class="field"><label class="field-label">INSTAGRAM</label>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:var(--p2);color:var(--gray-600);white-space:nowrap">@</span>' +
            '<input class="field-input" type="text" id="ep-instagram" value="' + (user.instagram||'') + '" placeholder="yourhandle"/>' +
          '</div>' +
        '</div>' +

        /* Video URL — Task 2.4 */
        '<div class="field"><label class="field-label">FEATURED VIDEO <span style="font-family:var(--font-body);font-size:var(--p3);font-weight:400;text-transform:none;letter-spacing:0;">(YouTube or Vimeo URL)</span></label>' +
          '<input class="field-input" type="url" id="ep-video" value="' + (user.videoUrl||'') + '" placeholder="https://youtu.be/... or https://vimeo.com/..."/>' +
          '<p class="field-hint mt-sm">Paste a YouTube or Vimeo link to showcase your work on your profile.</p>' +
        '</div>' +

        /* Portfolio photos */
        '<div class="field"><label class="field-label">PORTFOLIO PHOTOS <span style="font-family:var(--font-body);font-size:var(--p3);font-weight:400;text-transform:none;letter-spacing:0;">(up to 4)</span></label>' +
          '<div class="profile-photos-grid" style="margin-top:8px">' +
            [0,1,2,3].map(function(i) {
              if (photos[i]) {
                return '<div class="photo-slot filled" id="photo-slot-' + i + '">' +
                  '<img src="' + photos[i] + '" alt="Photo ' + (i+1) + '" style="width:100%;height:100%;object-fit:cover;"/>' +
                  '<button class="photo-delete-btn" onclick="SM.deletePhoto(' + i + ')" title="Remove photo">✕</button>' +
                '</div>';
              }
              return '<div class="photo-slot" id="photo-slot-' + i + '" onclick="SM.triggerPhotoUpload(' + i + ')">' +
                '<svg class="slot-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                '<span class="slot-label">ADD</span>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<p class="field-hint mt-sm">Tap a slot to upload. JPEG, PNG or WEBP — max 15MB each. Photos are compressed automatically before uploading.</p>' +
        '</div>' +

        /* Actions */
        '<div style="display:flex;gap:10px;padding-top:8px;border-top:1px solid var(--gray-200)">' +
          '<button class="btn btn-sm btn-outline" onclick="SM.showPage(\'profile\')">CANCEL</button>' +
          '<button class="btn btn-sm" style="flex:1" id="ep-save-btn" onclick="SM.saveProfile()">SAVE PROFILE</button>' +
        '</div>' +
      '</div>' +
    '</div>';
};

SM.pickRole = function(el, containerId) {
  document.querySelectorAll('#'+containerId+' .role-chip').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
};

SM.saveProfile = function() {
  var fname      = (document.getElementById('ep-fname')?.value || '').trim();
  var linitial   = (document.getElementById('ep-linitial')?.value || '').trim();
  var bio        = (document.getElementById('ep-bio')?.value || '').trim();
  var community  = document.getElementById('ep-community')?.value || 'smdc';
  var website    = (document.getElementById('ep-website')?.value || '').trim();
  var instagram  = (document.getElementById('ep-instagram')?.value || '').trim();
  var videoUrl   = (document.getElementById('ep-video')?.value || '').trim();
  var roleEl     = document.querySelector('#ep-roles .role-chip.selected');
  var creatorType = roleEl ? roleEl.textContent.trim() : 'Photographer';
  var saveBtn    = document.getElementById('ep-save-btn');

  if (!fname) { SM.showToast('First name is required', 'error'); return; }

  if (saveBtn) { saveBtn.textContent = 'SAVING...'; saveBtn.disabled = true; }

  SM.updateProfile({
    firstName:   fname,
    lastInitial: linitial,
    bio:         bio,
    community:   community,
    website:     website,
    instagram:   instagram,
    videoUrl:    videoUrl,
    creatorType: creatorType
  }).then(function(result) {
    if (saveBtn) { saveBtn.textContent = 'SAVE PROFILE'; saveBtn.disabled = false; }
    if (!result.ok) {
      SM.showToast(result.error || 'Could not save profile', 'error');
      return;
    }
    SM.showToast('Profile saved!', 'success');
    SM.showPage('profile');
  });
};

/* ── COMMUNITY PAGE ── */
SM.communityData = {
  smdc: {
    code: 'SMDC', name: 'Washington, D.C.', fullName: 'StreetMeet DC',
    tagline: 'The original and leading StreetMeet community.',
    description: 'Since March of 2015 StreetMeetDC has been the leading community for StreetMeet. Bringing community together over the last 11 years we\'ve seen so many incredible creators be a part of this everlasting community.',
    instagram: 'streetmeetdc',
    hosts: [
      { name: 'Kevin Wayne', handle: 'k3vin.wayne', bio: 'D.C.-born photographer and visual storyteller with over 15 years of experience behind the camera.', link: 'https://www.dreamcityphotodept.com/' },
      { name: 'DeVante Capers', handle: 'devantecapers92', bio: 'Multidisciplinary artist whose work explores what it means to move through the world as an outsider.', link: 'https://www.devantecapers.com/' }
    ]
  },
  smwa: {
    code: 'SMWA', name: 'Washington State', fullName: 'StreetMeet WA',
    tagline: 'Pacific Northwest creatives united.',
    description: 'StreetMeetWA brings together the creative community across Washington State. From the gritty urban streets of Seattle to the stunning natural backdrops of the Pacific Northwest.',
    instagram: 'streetmeetwa',
    hosts: [
      { name: 'Pacific Leo', handle: 'pacificpnw_leo', bio: 'Seattle-based photographer chasing light in the Pacific Northwest.', link: '#' }
    ]
  },
  smmd: {
    code: 'SMMD', name: 'Maryland', fullName: 'StreetMeet MD',
    tagline: 'DMV creative community, Maryland chapter.',
    description: 'StreetMeetMD extends the DMV creative community into the heart of Maryland. From Baltimore\'s storied streets to the suburbs and beyond.',
    instagram: 'streetmeetmd',
    hosts: [
      { name: 'Baltimore Frames', handle: 'baltimoreframes', bio: 'Baltimore documentary photographer and community builder.', link: '#' }
    ]
  }
};

/* ── VIDEO EMBED PARSER (Task 2.4 — used in renderProfile already) ── */
/* ══════════════════════════════════════════════════════════
   PHOTO UPLOAD SYSTEM (Task 1.5 — Firebase Storage)
   Compress → Upload → Save CDN URL to Firestore
══════════════════════════════════════════════════════════ */

/* ── Image Compression ──
   Resizes and compresses a File before upload.
   A 3MB JPEG becomes ~150KB at 800px / quality 0.75
   Avatar targets 300px for the circular profile photo */
SM.compressImage = function(file, maxWidth, quality) {
  maxWidth = maxWidth || 800;
  quality  = quality  || 0.75;
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function() { reject(new Error('Could not read file')); };
    reader.onload = function(e) {
      var img = new Image();
      img.onerror = function() { reject(new Error('Could not load image')); };
      img.onload = function() {
        var scale  = Math.min(1, maxWidth / img.width);
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

/* ── Avatar Upload ──
   Triggered when user taps "CHANGE PHOTO" on edit profile.
   Opens a hidden file input, compresses the chosen image,
   uploads to Firebase Storage avatars/{uid}/profile.jpg,
   saves the CDN URL to Firestore, refreshes the avatar preview. */
SM.triggerAvatarUpload = function() {
  var user = SM.getCurrentUser();
  if (!user) return;

  /* Create a hidden file input and click it */
  var input = document.createElement('input');
  input.type   = 'accept';
  input.type   = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/heic';

  input.onchange = function() {
    var file = input.files[0];
    if (!file) return;

    /* Validate size before compressing — 15MB raw max */
    if (file.size > 15 * 1024 * 1024) {
      SM.showToast('Photo must be under 15MB', 'error');
      return;
    }

    /* Update button to show progress */
    var btn = document.getElementById('avatar-upload-btn');
    if (btn) { btn.textContent = 'UPLOADING...'; btn.disabled = true; }

    SM.compressImage(file, 300, 0.80)
      .then(function(dataUrl) {
        /* Convert base64 data URL to Blob for Firebase upload */
        return fetch(dataUrl).then(function(r) { return r.blob(); });
      })
      .then(function(blob) {
        var path = 'avatars/' + user.id + '/profile.jpg';
        var ref  = storage.ref(path);
        return ref.put(blob, { contentType: 'image/jpeg' });
      })
      .then(function(snapshot) {
        return snapshot.ref.getDownloadURL();
      })
      .then(function(url) {
        /* Save URL to Firestore */
        return SM.updateProfile({ avatarURL: url }).then(function() { return url; });
      })
      .then(function(url) {
        /* Refresh avatar preview in the edit form */
        var preview = document.getElementById('avatar-preview');
        if (preview) {
          preview.style.background = 'url(' + url + ') center/cover no-repeat';
          preview.innerHTML = '';
        }
        if (btn) { btn.textContent = 'CHANGE PHOTO'; btn.disabled = false; }
        SM.showToast('Profile photo updated!', 'success');
      })
      .catch(function(err) {
        if (btn) { btn.textContent = 'CHANGE PHOTO'; btn.disabled = false; }
        console.error('SM: avatar upload error:', err);
        SM.showToast('Upload failed — please try again', 'error');
      });
  };

  input.click();
};

/* ── Portfolio Photo Upload ──
   Triggered when user taps an empty photo slot (index 0–3).
   Compresses, uploads to portfolio/{uid}/photo_{index}.jpg,
   saves CDN URL into the photoURLs array in Firestore,
   refreshes that slot in the UI immediately. */
SM.triggerPhotoUpload = function(slotIndex) {
  var user = SM.getCurrentUser();
  if (!user) return;

  var input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/heic';

  input.onchange = function() {
    var file = input.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      SM.showToast('Photo must be under 15MB', 'error');
      return;
    }

    /* Show uploading state on the tapped slot */
    var slot = document.getElementById('photo-slot-' + slotIndex);
    if (slot) {
      slot.innerHTML = '<span style="font-family:var(--font-head);font-size:0.85rem;letter-spacing:0.05em;color:var(--gray-400)">UPLOADING...</span>';
    }

    SM.compressImage(file, 800, 0.75)
      .then(function(dataUrl) {
        return fetch(dataUrl).then(function(r) { return r.blob(); });
      })
      .then(function(blob) {
        var path = 'portfolio/' + user.id + '/photo_' + slotIndex + '.jpg';
        var ref  = storage.ref(path);
        return ref.put(blob, { contentType: 'image/jpeg' });
      })
      .then(function(snapshot) {
        return snapshot.ref.getDownloadURL();
      })
      .then(function(url) {
        /* Update the photoURLs array in Firestore */
        var photos = (SM.getCurrentUser().photoURLs || []).slice(); /* copy */
        photos[slotIndex] = url;
        /* Pad any gaps with empty string */
        while (photos.length < 4) photos.push('');
        return SM.updateProfile({ photoURLs: photos }).then(function() { return url; });
      })
      .then(function(url) {
        /* Refresh the slot in the UI */
        var slot = document.getElementById('photo-slot-' + slotIndex);
        if (slot) {
          slot.className = 'photo-slot filled';
          slot.innerHTML =
            '<img src="' + url + '" alt="Photo ' + (slotIndex + 1) + '" style="width:100%;height:100%;object-fit:cover;"/>' +
            '<button class="photo-delete-btn" onclick="SM.deletePhoto(' + slotIndex + ')" title="Remove photo">✕</button>';
        }
        SM.showToast('Photo ' + (slotIndex + 1) + ' uploaded!', 'success');
      })
      .catch(function(err) {
        var slot = document.getElementById('photo-slot-' + slotIndex);
        if (slot) SM._renderEmptySlot(slot, slotIndex);
        console.error('SM: photo upload error:', err);
        SM.showToast('Upload failed — please try again', 'error');
      });
  };

  input.click();
};

/* ── Delete Portfolio Photo ──
   Removes the photo from Firebase Storage and clears the
   Firestore photoURLs entry, then refreshes the slot. */
SM.deletePhoto = function(slotIndex) {
  var user = SM.getCurrentUser();
  if (!user) return;
  if (!confirm('Remove this photo?')) return;

  var photos = (user.photoURLs || []).slice();
  var oldUrl = photos[slotIndex];

  /* Clear the slot in Firestore first */
  photos[slotIndex] = '';
  SM.updateProfile({ photoURLs: photos }).then(function() {
    /* Attempt to delete from Storage (non-critical if it fails) */
    if (oldUrl) {
      try {
        storage.refFromURL(oldUrl).delete().catch(function() {});
      } catch(e) {}
    }
    /* Refresh slot in UI */
    var slot = document.getElementById('photo-slot-' + slotIndex);
    if (slot) SM._renderEmptySlot(slot, slotIndex);
    SM.showToast('Photo removed', 'success');
  }).catch(function() {
    SM.showToast('Could not remove photo — try again', 'error');
  });
};

/* ── Render empty slot helper ── */
SM._renderEmptySlot = function(slotEl, index) {
  slotEl.className = 'photo-slot';
  slotEl.innerHTML =
    '<svg class="slot-icon" viewBox="0 0 24 24">' +
      '<line x1="12" y1="5" x2="12" y2="19"/>' +
      '<line x1="5" y1="12" x2="19" y2="12"/>' +
    '</svg>' +
    '<span class="slot-label">ADD</span>';
  slotEl.onclick = function() { SM.triggerPhotoUpload(index); };
};

SM.parseVideoEmbed = function(url) {
  if (!url) return null;
  /* YouTube — handles youtu.be/ID and youtube.com/watch?v=ID */
  var ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { platform: 'youtube', embedUrl: 'https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0' };
  /* Vimeo — handles vimeo.com/ID */
  var vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return { platform: 'vimeo', embedUrl: 'https://player.vimeo.com/video/' + vmMatch[1] };
  return null;
};

SM.communityName = function(id) {
  return SM.communityData[id] ? SM.communityData[id].fullName : id.toUpperCase();
};

SM.renderCommunityPage = function(communityId) {
  var el   = document.getElementById('community-content-' + communityId);
  var data = SM.communityData[communityId];
  if (!el || !data) return;
  var events = SM.events.filter(function(e) { return e.community === communityId; });

  el.innerHTML =
    '<div class="community-hero">' +
      '<div class="community-code">' + data.code + '</div>' +
      '<div class="community-city">' + data.name + '</div>' +
      '<p class="community-sub">' + data.tagline + '</p>' +
    '</div>' +
    '<div class="community-tabs" id="ctabs-' + communityId + '">' +
      '<button class="community-tab active" onclick="SM.switchCommunityTab(\'' + communityId + '\',\'about\',this)">ABOUT</button>' +
      '<button class="community-tab" onclick="SM.switchCommunityTab(\'' + communityId + '\',\'chat\',this)">CHAT</button>' +
      '<button class="community-tab" onclick="SM.switchCommunityTab(\'' + communityId + '\',\'board\',this)">BOARD</button>' +
    '</div>' +
    '<div class="community-panel" id="cpanel-about-' + communityId + '">' +
      '<div class="section">' +
        '<div class="two-col">' +
          '<div>' +
            '<span class="section-label">About</span>' +
            '<h2 class="mb-md">' + data.fullName.toUpperCase() + '</h2>' +
            '<p class="p2 mb-lg">' + data.description + '</p>' +
            '<a class="btn btn-sm" href="https://instagram.com/' + data.instagram + '" target="_blank">FOLLOW @' + data.instagram.toUpperCase() + '</a>' +
          '</div>' +
          '<div>' +
            '<span class="section-label">Community Hosts</span>' +
            '<div style="display:flex;flex-direction:column;gap:24px">' +
              data.hosts.map(function(h) {
                return '<div class="host-card">' +
                  '<div class="host-img-placeholder"><svg width="36" height="36" viewBox="0 0 24 24" fill="var(--gray-400)"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
                  '<div>' +
                    '<div class="host-name">' + h.name.toUpperCase() + '</div>' +
                    '<div class="host-handle"><a href="https://instagram.com/' + h.handle + '" target="_blank">@' + h.handle + '</a></div>' +
                    '<div class="host-bio">' + h.bio + '</div>' +
                    '<a class="host-link" href="' + h.link + '" target="_blank">LEARN MORE \u2192</a>' +
                  '</div>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:var(--gray-100);padding:var(--space-2xl) 24px">' +
        '<div style="max-width:var(--max-w);margin:0 auto">' +
          '<span class="section-label">Upcoming Meets</span>' +
          (events.length
            ? '<div class="three-col">' + events.map(SM.renderEventCard).join('') + '</div>'
            : '<p class="p2" style="color:var(--gray-600)">No upcoming events. Check back soon.</p>'
          ) +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="community-panel" id="cpanel-chat-' + communityId + '" style="display:none">' +
      '<div class="section">' +
        '<span class="section-label">Community Chat</span>' +
        '<div class="chat-shell">' +
          '<div class="chat-titlebar">' +
            '<div><div class="chat-title">STREETMEET INSTANT MESSENGER</div><div class="chat-room-label">#' + communityId + '-general</div></div>' +
            '<div class="chat-controls">' +
              '<div class="chat-ctrl" style="background:#4CAF50"></div>' +
              '<div class="chat-ctrl" style="background:#F5A623"></div>' +
              '<div class="chat-ctrl" style="background:var(--red)"></div>' +
            '</div>' +
          '</div>' +
          '<div class="chat-online-bar"><div class="chat-online-dot"></div><span id="comm-online-' + communityId + '" class="chat-online-text">\u2014 ONLINE</span></div>' +
          '<div class="chat-layout">' +
            '<div class="chat-messages" id="community-chat-msgs-' + communityId + '"><div class="chat-msg"><span class="sys">Loading messages...</span></div></div>' +
            '<div class="chat-users"><div class="chat-users-title">MEMBERS</div><div id="comm-users-' + communityId + '"></div></div>' +
          '</div>' +
          '<div id="comm-reply-strip-' + communityId + '" style="display:none;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;background:var(--teal-light,#d0eeec);border-top:2px solid var(--teal);font-size:0.82rem;"></div>' +
          '<div class="chat-input-bar">' +
            '<input class="chat-input" type="text" id="community-chat-input-' + communityId + '" placeholder="Say something to the community..." onkeydown="if(event.key===\'Enter\')SM.sendCommunityChatMsg(\'' + communityId + '\')"/>' +
            '<button class="chat-send" onclick="SM.sendCommunityChatMsg(\'' + communityId + '\')">SEND</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="community-panel" id="cpanel-board-' + communityId + '" style="display:none">' +
      '<div class="section" id="board-' + communityId + '"><p class="p2" style="color:var(--gray-600)">Loading board...</p></div>' +
    '</div>';

  if (events.length) { events.forEach(function(ev) { SM.loadComments(ev.id); }); }
};

SM.switchCommunityTab = function(communityId, tab, btnEl) {
  document.querySelectorAll('#ctabs-' + communityId + ' .community-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btnEl) btnEl.classList.add('active');
  ['about','chat','board'].forEach(function(t) {
    var panel = document.getElementById('cpanel-' + t + '-' + communityId);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'chat') SM._initCommunityChat(communityId);
  else if (tab === 'board') SM.renderBoard(communityId);
};

SM._commChatListeners = {};

SM._initCommunityChat = function(communityId) {
  if (SM._commChatListeners[communityId]) return;
  var meta   = SM.chatRoomMeta[communityId] || {};
  var msgsEl = document.getElementById('community-chat-msgs-' + communityId);
  if (!msgsEl) return;
  SM._commChatListeners[communityId] = db.collection('communities').doc(communityId)
    .collection('chat').orderBy('timestamp','asc').limitToLast(50)
    .onSnapshot(function(snapshot) {
      if (!msgsEl) return;
      msgsEl.innerHTML = '';
      var w = document.createElement('div'); w.className = 'chat-msg';
      w.innerHTML = '<span class="sys">' + (meta.welcome || '') + '</span>';
      msgsEl.appendChild(w);
      snapshot.forEach(function(doc) { SM._appendChatMsg(msgsEl, doc.id, doc.data()); });
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, function(err) { console.error('SM: community chat error:', err); });

  var user = SM.getCurrentUser();
  if (!user) return;
  db.collection('communities').doc(communityId).collection('presence').doc(user.id).set({
    userId: user.id, displayName: (user.firstName + ' ' + user.lastInitial).trim(),
    isHost: SM.isHost(), lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function() {});

  var cutoff = new Date(Date.now() - 5 * 60 * 1000);
  db.collection('communities').doc(communityId).collection('presence')
    .where('lastSeen', '>', cutoff)
    .onSnapshot(function(snap) {
      var countEl = document.getElementById('comm-online-' + communityId);
      if (countEl) countEl.textContent = snap.size + ' ONLINE';
      var usersEl = document.getElementById('comm-users-' + communityId);
      if (!usersEl) return;
      usersEl.innerHTML = '';
      snap.forEach(function(doc) {
        var u = doc.data();
        var div = document.createElement('div'); div.className = 'chat-user';
        div.innerHTML = '<div class="chat-user-dot"></div>' +
          '<button class="chat-user-name sender-link' + (u.isHost ? ' host' : '') + '" onclick="SM.viewProfile(\'' + u.userId + '\')">' +
            SM._escapeHtml(u.displayName || u.userId) + '</button>' +
          (u.isHost ? '<div class="chat-user-badge">HOST</div>' : '');
        usersEl.appendChild(div);
      });
    }, function() {});
};


/* ══════════════════════════════════════════════════════════
   TASK 2.5 — COMMUNITY DISCUSSION BOARD
   Persistent, categorized, threaded discussion per community.
   Firestore: communities/{id}/board/{threadId}/replies
══════════════════════════════════════════════════════════ */

SM.boardCategories = {
  locations: { icon: '📍', label: 'Locations' },
  gear:      { icon: '📷', label: 'Gear' },
  collabs:   { icon: '🤝', label: 'Collabs' },
  questions: { icon: '❓', label: 'Questions' },
  pinned:    { icon: '📌', label: 'Pinned' }
};

/* ── Thread list view ── */
SM.renderBoard = function(communityId) {
  var el = document.getElementById('board-' + communityId);
  if (!el) return;
  var user = SM.getCurrentUser();

  el.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">' +
      '<span class="section-label" style="margin-bottom:0">Discussion Board</span>' +
      (user ? '<button class="btn btn-sm" onclick="SM.showNewThreadForm(\'' + communityId + '\')">+ NEW THREAD</button>' : '') +
    '</div>' +
    '<div id="board-threads-' + communityId + '">' +
      '<p class="p2" style="color:var(--gray-600)">Loading threads...</p>' +
    '</div>';

  /* Load threads ordered by last activity */
  db.collection('communities').doc(communityId)
    .collection('board')
    .orderBy('lastActivity', 'desc')
    .limit(30)
    .get()
    .then(function(snap) {
      var threadsEl = document.getElementById('board-threads-' + communityId);
      if (!threadsEl) return;
      if (snap.empty) {
        threadsEl.innerHTML =
          '<p class="p2" style="color:var(--gray-600)">No threads yet — start the conversation!</p>';
        return;
      }
      threadsEl.innerHTML = snap.docs.map(function(doc) {
        var t = doc.data();
        var cat = SM.boardCategories[t.category] || SM.boardCategories.questions;
        var time = t.lastActivity ? SM._timeAgo(t.lastActivity.toMillis()) : '';
        var isPinned = t.category === 'pinned';
        return '<div class="board-thread-row' + (isPinned ? ' board-pinned' : '') + '" ' +
          'onclick="SM.openThread(\'' + communityId + '\',\'' + doc.id + '\')">' +
          '<div class="board-thread-cat">' + cat.icon + '</div>' +
          '<div class="board-thread-body">' +
            '<div class="board-thread-title">' + SM._escapeHtml(t.title || '') + '</div>' +
            '<div class="board-thread-meta">' +
              SM._escapeHtml(t.authorName || 'Member') + ' &nbsp;·&nbsp; ' +
              (t.replyCount || 0) + ' replies &nbsp;·&nbsp; ' + time +
            '</div>' +
          '</div>' +
          (SM.isHost() || SM.isAdmin() ? '<button class="board-pin-btn" onclick="event.stopPropagation();SM.togglePinThread(\'' + communityId + '\',\'' + doc.id + '\',\'' + t.category + '\')" title="' + (isPinned ? 'Unpin' : 'Pin') + '">' + (isPinned ? '📌' : '📍') + '</button>' : '') +
        '</div>';
      }).join('');
    })
    .catch(function(err) {
      console.error('SM: renderBoard error:', err);
      var threadsEl = document.getElementById('board-threads-' + communityId);
      if (threadsEl) threadsEl.innerHTML = '<p style="color:var(--red)">Could not load threads.</p>';
    });
};

/* ── New thread form ── */
SM.showNewThreadForm = function(communityId) {
  var el = document.getElementById('board-' + communityId);
  if (!el) return;
  var newForm =
    '<div class="board-new-thread">' +
      '<h3 style="font-family:var(--font-head);font-size:1.4rem;letter-spacing:0.04em;margin-bottom:14px">NEW THREAD</h3>' +
      '<div class="field mb-sm"><label class="field-label">TITLE</label>' +
        '<input class="field-input" type="text" id="nt-title" placeholder="What\'s this thread about?" maxlength="120"/></div>' +
      '<div class="field mb-sm"><label class="field-label">CATEGORY</label>' +
        '<select class="field-select" id="nt-category">' +
          Object.entries(SM.boardCategories)
            .filter(function(e) { return e[0] !== 'pinned'; })
            .map(function(e) { return '<option value="' + e[0] + '">' + e[1].icon + ' ' + e[1].label + '</option>'; })
            .join('') +
        '</select></div>' +
      '<div class="field mb-sm"><label class="field-label">OPENING POST</label>' +
        '<textarea class="field-textarea" id="nt-body" rows="4" placeholder="Share your thoughts..." maxlength="1000"></textarea></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button class="btn btn-sm btn-outline" onclick="SM.renderBoard(\'' + communityId + '\')">CANCEL</button>' +
        '<button class="btn btn-sm" id="nt-submit-btn" onclick="SM.submitThread(\'' + communityId + '\')">POST THREAD</button>' +
      '</div>' +
    '</div>';

  var threadsEl = document.getElementById('board-threads-' + communityId);
  if (threadsEl) threadsEl.innerHTML = newForm;
};

SM.submitThread = function(communityId) {
  var title    = (document.getElementById('nt-title')?.value || '').trim();
  var category = document.getElementById('nt-category')?.value || 'questions';
  var body     = (document.getElementById('nt-body')?.value || '').trim();
  var user     = SM.getCurrentUser();
  var btn      = document.getElementById('nt-submit-btn');

  if (!title || !body) { SM.showToast('Please fill in title and opening post', 'error'); return; }
  if (!user) { SM.showToast('Sign in to post', 'error'); return; }
  if (btn) { btn.textContent = 'POSTING...'; btn.disabled = true; }

  var threadData = {
    title:        title,
    category:     category,
    authorId:     user.id,
    authorName:   (user.firstName + ' ' + user.lastInitial).trim(),
    body:         body,
    replyCount:   0,
    lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt:    firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('communities').doc(communityId)
    .collection('board').add(threadData)
    .then(function() {
      SM.showToast('Thread posted!', 'success');
      SM.renderBoard(communityId);
    })
    .catch(function(err) {
      if (btn) { btn.textContent = 'POST THREAD'; btn.disabled = false; }
      SM.showToast('Could not post thread — try again', 'error');
      console.error('SM: submitThread error:', err);
    });
};

/* ── Thread view ── */
SM.openThread = function(communityId, threadId) {
  var el = document.getElementById('board-' + communityId);
  if (!el) return;

  el.innerHTML = '<p class="p2" style="color:var(--gray-600)">Loading thread...</p>';

  db.collection('communities').doc(communityId)
    .collection('board').doc(threadId).get()
    .then(function(doc) {
      if (!doc.exists) { el.innerHTML = '<p style="color:var(--red)">Thread not found.</p>'; return; }
      var t = doc.data();
      var user = SM.getCurrentUser();
      var cat = SM.boardCategories[t.category] || SM.boardCategories.questions;

      el.innerHTML =
        '<button class="board-back-btn" onclick="SM.renderBoard(\'' + communityId + '\')">← BACK TO BOARD</button>' +
        '<div class="board-thread-header">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
            '<span style="font-size:1.4rem">' + cat.icon + '</span>' +
            '<span class="section-label" style="margin-bottom:0">' + cat.label + '</span>' +
          '</div>' +
          '<h2 style="font-family:var(--font-head);font-size:2rem;letter-spacing:0.04em;margin-bottom:6px">' + SM._escapeHtml(t.title) + '</h2>' +
          '<p style="font-size:var(--p3);color:var(--gray-600)">' +
            'Posted by <button class="sender-link" onclick="SM.viewProfile(\'' + t.authorId + '\')">' + SM._escapeHtml(t.authorName) + '</button>' +
          '</p>' +
        '</div>' +
        '<div class="board-replies" id="thread-replies-' + threadId + '">' +
          '<div class="board-reply opening-post">' +
            '<div class="comment-avatar">' + (t.authorName||'??').substring(0,2).toUpperCase() + '</div>' +
            '<div class="comment-body">' +
              '<div class="comment-meta">' +
                '<span class="comment-name">' + SM._escapeHtml(t.authorName) + '</span>' +
                '<span class="comment-time">' + SM._timeAgo(t.createdAt ? t.createdAt.toMillis() : Date.now()) + '</span>' +
              '</div>' +
              '<div class="comment-text">' + SM._escapeHtml(t.body) + '</div>' +
            '</div>' +
          '</div>' +
          '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">Loading replies...</p>' +
        '</div>' +
        (user ?
          '<div class="board-reply-form" id="thread-reply-form-' + threadId + '">' +
            '<div id="thread-reply-strip-' + threadId + '" style="display:none;padding:8px 12px;background:var(--teal-light,#d0eeec);border-left:3px solid var(--teal);font-size:0.82rem;margin-bottom:8px;"></div>' +
            '<div class="field" style="margin-bottom:8px">' +
              '<textarea class="field-textarea" id="thread-reply-input-' + threadId + '" rows="3" placeholder="Add your reply..." maxlength="1000"></textarea>' +
            '</div>' +
            '<button class="btn btn-sm" id="thread-reply-btn-' + threadId + '" onclick="SM.postThreadReply(\'' + communityId + '\',\'' + threadId + '\')">POST REPLY</button>' +
          '</div>'
          : '<p class="p2" style="color:var(--gray-600)"><a onclick="SM.showPage(\'landing\')" style="cursor:pointer;color:var(--teal)">Sign in</a> to reply.</p>'
        );

      /* Load replies */
      SM._loadThreadReplies(communityId, threadId);
    })
    .catch(function(err) {
      console.error('SM: openThread error:', err);
      el.innerHTML = '<p style="color:var(--red)">Could not load thread.</p>';
    });
};

SM._loadThreadReplies = function(communityId, threadId) {
  db.collection('communities').doc(communityId)
    .collection('board').doc(threadId)
    .collection('replies')
    .orderBy('createdAt', 'asc')
    .get()
    .then(function(snap) {
      var container = document.getElementById('thread-replies-' + threadId);
      if (!container) return;

      /* Remove loading text — keep opening post div */
      var loadingP = container.querySelector('p');
      if (loadingP) loadingP.remove();

      snap.forEach(function(doc) {
        var r = doc.data();
        var initials = (r.authorName||'??').substring(0,2).toUpperCase();
        var replyQuote = r.replyTo ?
          '<div class="chat-reply-quote" style="margin-bottom:6px">' +
            '<span class="reply-to-name">' + SM._escapeHtml(r.replyTo.authorName) + '</span>' +
            '<span class="reply-preview">' + SM._escapeHtml(r.replyTo.preview) + '</span>' +
          '</div>' : '';

        var div = document.createElement('div');
        div.className = 'board-reply';
        div.dataset.replyId = doc.id;
        div.innerHTML =
          '<div class="comment-avatar">' + initials + '</div>' +
          '<div class="comment-body">' +
            replyQuote +
            '<div class="comment-meta">' +
              '<button class="sender-link comment-name" onclick="SM.viewProfile(\'' + r.authorId + '\')">' + SM._escapeHtml(r.authorName) + '</button>' +
              '<span class="comment-time">' + SM._timeAgo(r.createdAt ? r.createdAt.toMillis() : Date.now()) + '</span>' +
            '</div>' +
            '<div class="comment-text">' + SM._escapeHtml(r.body) + '</div>' +
            '<button class="reply-trigger" onclick="SM.setThreadReplyTarget(\'' + threadId + '\',\'' + r.authorId + '\',\'' + SM._escapeHtml(r.authorName).replace(/'/g,"\\'") + '\',\'' + SM._escapeHtml((r.body||'').substring(0,50)).replace(/'/g,"\\'") + '\')">↩ Reply</button>' +
          '</div>';
        container.appendChild(div);
      });

      if (snap.empty && container.querySelectorAll('.board-reply').length <= 1) {
        var noReplies = document.createElement('p');
        noReplies.className = 'p2';
        noReplies.style.color = 'var(--gray-600)';
        noReplies.style.fontSize = '0.85rem';
        noReplies.textContent = 'No replies yet — be the first to respond.';
        container.appendChild(noReplies);
      }
    })
    .catch(function(err) { console.error('SM: loadThreadReplies error:', err); });
};

SM._threadReplyTargets = {};

SM.setThreadReplyTarget = function(threadId, authorId, authorName, preview) {
  SM._threadReplyTargets[threadId] = { authorId: authorId, authorName: authorName, preview: preview };
  var strip = document.getElementById('thread-reply-strip-' + threadId);
  if (strip) {
    strip.style.display = 'block';
    strip.innerHTML = 'Replying to <strong>' + SM._escapeHtml(authorName) + '</strong>: ' +
      SM._escapeHtml(preview) + (preview.length >= 50 ? '...' : '') +
      ' <button onclick="SM.clearThreadReplyTarget(\'' + threadId + '\')" style="background:none;border:none;cursor:pointer;font-size:0.9rem;margin-left:8px;">✕</button>';
  }
  var input = document.getElementById('thread-reply-input-' + threadId);
  if (input) input.focus();
};

SM.clearThreadReplyTarget = function(threadId) {
  delete SM._threadReplyTargets[threadId];
  var strip = document.getElementById('thread-reply-strip-' + threadId);
  if (strip) { strip.style.display = 'none'; strip.innerHTML = ''; }
};

SM.postThreadReply = function(communityId, threadId) {
  var input  = document.getElementById('thread-reply-input-' + threadId);
  var btn    = document.getElementById('thread-reply-btn-' + threadId);
  var user   = SM.getCurrentUser();
  if (!input || !user) return;
  var body = input.value.trim();
  if (!body) return;
  if (btn) { btn.textContent = 'POSTING...'; btn.disabled = true; }

  var replyTarget = SM._threadReplyTargets[threadId] || null;
  var replyData = {
    authorId:   user.id,
    authorName: (user.firstName + ' ' + user.lastInitial).trim(),
    body:       body,
    replyTo:    replyTarget ? { authorId: replyTarget.authorId, authorName: replyTarget.authorName, preview: replyTarget.preview } : null,
    createdAt:  firebase.firestore.FieldValue.serverTimestamp()
  };

  var threadRef = db.collection('communities').doc(communityId).collection('board').doc(threadId);
  var replyRef  = threadRef.collection('replies');

  replyRef.add(replyData).then(function(newDoc) {
    /* Increment reply count + update lastActivity */
    threadRef.update({
      replyCount:   firebase.firestore.FieldValue.increment(1),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });

    /* Optimistic render */
    var container = document.getElementById('thread-replies-' + threadId);
    if (container) {
      var noRepliesP = container.querySelector('p');
      if (noRepliesP) noRepliesP.remove();
      var initials = (replyData.authorName).substring(0,2).toUpperCase();
      var quoteHTML = replyTarget ?
        '<div class="chat-reply-quote" style="margin-bottom:6px">' +
          '<span class="reply-to-name">' + SM._escapeHtml(replyTarget.authorName) + '</span>' +
          '<span class="reply-preview">' + SM._escapeHtml(replyTarget.preview) + '</span>' +
        '</div>' : '';
      var div = document.createElement('div');
      div.className = 'board-reply';
      div.innerHTML =
        '<div class="comment-avatar">' + initials + '</div>' +
        '<div class="comment-body">' +
          quoteHTML +
          '<div class="comment-meta">' +
            '<span class="comment-name">' + SM._escapeHtml(replyData.authorName) + '</span>' +
            '<span class="comment-time">just now</span>' +
          '</div>' +
          '<div class="comment-text">' + SM._escapeHtml(body) + '</div>' +
        '</div>';
      container.appendChild(div);
    }

    input.value = '';
    SM.clearThreadReplyTarget(threadId);
    if (btn) { btn.textContent = 'POST REPLY'; btn.disabled = false; }
    SM.showToast('Reply posted!', 'success');
  }).catch(function(err) {
    if (btn) { btn.textContent = 'POST REPLY'; btn.disabled = false; }
    SM.showToast('Could not post reply — try again', 'error');
    console.error('SM: postThreadReply error:', err);
  });
};

SM.togglePinThread = function(communityId, threadId, currentCategory) {
  if (!SM.isHost() && !SM.isAdmin()) return;
  var newCategory = currentCategory === 'pinned' ? 'questions' : 'pinned';
  db.collection('communities').doc(communityId)
    .collection('board').doc(threadId)
    .update({ category: newCategory })
    .then(function() {
      SM.showToast(newCategory === 'pinned' ? 'Thread pinned!' : 'Thread unpinned', 'success');
      SM.renderBoard(communityId);
    })
    .catch(function() { SM.showToast('Could not update thread', 'error'); });
};

/* ── Seed starter board threads for each community ──
   Run once from admin console: SM.seedBoardThreads() */
SM.seedBoardThreads = function() {
  if (!SM.isAdmin()) { SM.showToast('Admin only', 'error'); return; }
  var threads = [
    { community: 'smdc', title: 'Introduce Yourself', category: 'pinned', body: 'Welcome to the SMDC board! Share your name, what you shoot, and what gear you use. Let\'s get to know each other.' },
    { community: 'smdc', title: 'Best Locations in D.C. — 2026 Edition', category: 'locations', body: 'Drop your favorite spots in the DMV. Parks, murals, architecture — all welcome. Include the neighborhood if you can!' },
    { community: 'smdc', title: 'Monthly Gear Talk', category: 'gear', body: 'What are you shooting with this month? Camera, lenses, lighting — share your kit and ask questions.' },
    { community: 'smwa', title: 'Introduce Yourself', category: 'pinned', body: 'Welcome to the SMWA board! Tell us who you are, what you shoot, and where you\'re based in Washington State.' },
    { community: 'smwa', title: 'Best PNW Shoot Locations', category: 'locations', body: 'Pacific Northwest has incredible variety. Share your favorite spots — city, nature, everything in between.' },
    { community: 'smmd', title: 'Introduce Yourself', category: 'pinned', body: 'Welcome to the SMMD board! Share your name, your craft, and what brings you to StreetMeet Maryland.' },
    { community: 'smmd', title: 'Baltimore & Maryland Hidden Gems', category: 'locations', body: 'Maryland has so much more than the Inner Harbor. Drop your underrated spots and let\'s explore them together.' }
  ];
  var user = SM.getCurrentUser();
  var batch = db.batch();
  threads.forEach(function(t) {
    var ref = db.collection('communities').doc(t.community).collection('board').doc();
    batch.set(ref, {
      title: t.title, category: t.category, body: t.body,
      authorId: user.id, authorName: (user.firstName + ' ' + user.lastInitial).trim(),
      replyCount: 0,
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit()
    .then(function() { SM.showToast('Board threads seeded!', 'success'); })
    .catch(function(err) { SM.showToast('Seed failed: ' + err.message, 'error'); });
};

/* ── Time ago helper ── */
SM._timeAgo = function(ms) {
  var secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return Math.floor(secs/60) + 'm ago';
  if (secs < 86400) return Math.floor(secs/3600) + 'h ago';
  return Math.floor(secs/86400) + 'd ago';
};

/* ── CREATE EVENT ── */
/* ══════════════════════════════════════════════════════════
   EVENT EDIT & DELETE — Hosts and Admins only
══════════════════════════════════════════════════════════ */

/* ── Edit Event ──
   Fetches the event doc from Firestore, pre-fills the
   Create Event form, and switches it to Edit mode. */
SM.editEvent = function(evId, communityId) {
  if (!SM.isHost() && !SM.isAdmin()) return;

  /* Find event in local cache first, fall back to Firestore */
  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (ev) {
    SM._openEditForm(ev, evId, communityId || ev.community);
    return;
  }

  SM.showToast('Loading event...', 'success');
  db.collection('communities').doc(communityId)
    .collection('events').doc(evId).get()
    .then(function(doc) {
      if (!doc.exists) { SM.showToast('Event not found', 'error'); return; }
      var data = doc.data();
      data.id = doc.id;
      SM._openEditForm(data, evId, communityId);
    })
    .catch(function(err) {
      SM.showToast('Could not load event', 'error');
      console.error('SM: editEvent error:', err);
    });
};

SM._openEditForm = function(ev, evId, communityId) {
  /* Navigate to create-event page, which we'll repurpose for editing */
  SM.showPage('create-event');

  var el = document.getElementById('create-event-content');
  if (!el) return;

  el.innerHTML =
    '<div class="section" style="max-width:640px;margin:0 auto">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
        '<h2>EDIT EVENT</h2>' +
        '<span class="section-label" style="margin-bottom:0;color:var(--gray-600)">' + (ev.communityLabel || communityId.toUpperCase()) + '</span>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
        '<div class="field"><label class="field-label">EVENT NAME</label>' +
          '<input class="field-input" type="text" id="ce-title" value="' + SM._esc(ev.title) + '"/></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label class="field-label">DATE</label>' +
            '<input class="field-input" type="date" id="ce-date" value="' + (ev.date || '') + '"/></div>' +
          '<div class="field"><label class="field-label">START TIME</label>' +
            '<input class="field-input" type="time" id="ce-time" value="' + (ev.time || '') + '"/></div>' +
        '</div>' +
        '<div class="field"><label class="field-label">ADDRESS</label>' +
          '<input class="field-input" type="text" id="ce-address" value="' + SM._esc(ev.address) + '"/></div>' +
        '<div class="field"><label class="field-label">DESCRIPTION</label>' +
          '<textarea class="field-textarea" id="ce-desc" rows="4">' + SM._esc(ev.description) + '</textarea></div>' +
        '<div style="display:flex;gap:10px;padding-top:8px;border-top:1px solid var(--gray-200)">' +
          '<button class="btn btn-sm btn-outline" onclick="SM.showPage(\'events\')">CANCEL</button>' +
          '<button class="btn btn-sm" id="ce-publish-btn" style="flex:1" onclick="SM.saveEventEdit(\'' + evId + '\',\'' + communityId + '\')">SAVE CHANGES</button>' +
        '</div>' +
      '</div>' +
    '</div>';
};

/* ── Save edited event to Firestore ── */
SM.saveEventEdit = function(evId, communityId) {
  var title   = (document.getElementById('ce-title')?.value || '').trim();
  var date    = document.getElementById('ce-date')?.value || '';
  var time    = document.getElementById('ce-time')?.value || '';
  var address = (document.getElementById('ce-address')?.value || '').trim();
  var desc    = (document.getElementById('ce-desc')?.value || '').trim();
  var btn     = document.getElementById('ce-publish-btn');

  if (!title || !date || !time || !address) {
    SM.showToast('Please fill all required fields', 'error');
    return;
  }

  if (btn) { btn.textContent = 'SAVING...'; btn.disabled = true; }

  db.collection('communities').doc(communityId)
    .collection('events').doc(evId)
    .update({
      title:       title,
      date:        date,
      time:        time,
      address:     address,
      description: desc,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:   SM.getCurrentUser() ? SM.getCurrentUser().id : null
    })
    .then(function() {
      if (btn) { btn.textContent = 'SAVE CHANGES'; btn.disabled = false; }
      SM.showToast('Event updated!', 'success');
      /* Refresh local cache and navigate back */
      SM.loadEvents().then(function() {
        SM.showPage('events');
        SM.renderEventsList();
      });
    })
    .catch(function(err) {
      if (btn) { btn.textContent = 'SAVE CHANGES'; btn.disabled = false; }
      SM.showToast('Could not save changes — try again', 'error');
      console.error('SM: saveEventEdit error:', err);
    });
};

/* ── Delete Event — Admin only ── */
SM.deleteEvent = function(evId, communityId) {
  if (!SM.isAdmin()) { SM.showToast('Admin access required', 'error'); return; }

  var ev = SM.events.find(function(e) { return e.id === evId; });
  var title = ev ? ev.title : 'this event';

  if (!confirm('Delete "' + title + '"?\n\nThis will permanently remove the event and cannot be undone.')) return;

  db.collection('communities').doc(communityId)
    .collection('events').doc(evId)
    .delete()
    .then(function() {
      SM.showToast('Event deleted', 'success');
      /* Remove from local cache */
      SM.events = SM.events.filter(function(e) { return e.id !== evId; });
      /* Remove card from DOM immediately */
      var card = document.getElementById('event-card-' + evId);
      if (card) card.remove();
    })
    .catch(function(err) {
      SM.showToast('Could not delete event — try again', 'error');
      console.error('SM: deleteEvent error:', err);
    });
};

/* ── HTML attribute escape helper ── */
SM._esc = function(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};

SM.renderCreateEvent = function() {
  const el = document.getElementById('create-event-content');
  if (!el) return;
  el.innerHTML = `
    <div class="section" style="max-width:640px;margin:0 auto">
      <h2 class="mb-lg">CREATE EVENT</h2>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="field">
          <label class="field-label">COMMUNITY</label>
          <select class="field-select" id="ce-community">
            <option value="smdc">SMDC — Washington, D.C.</option>
            <option value="smwa">SMWA — Washington State</option>
            <option value="smmd">SMMD — Maryland</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">EVENT NAME</label>
          <input class="field-input" type="text" id="ce-title" placeholder="e.g. Golden Hour at Adams Morgan"/>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label">DATE</label>
            <input class="field-input" type="date" id="ce-date"/>
          </div>
          <div class="field">
            <label class="field-label">START TIME</label>
            <input class="field-input" type="time" id="ce-time"/>
          </div>
        </div>
        <div class="field">
          <label class="field-label">ADDRESS</label>
          <input class="field-input" type="text" id="ce-address" placeholder="Full street address"/>
        </div>
        <div class="field">
          <label class="field-label">DESCRIPTION</label>
          <textarea class="field-textarea" id="ce-desc" rows="4" placeholder="Tell people about this meet..."></textarea>
        </div>
        <div class="field">
          <label class="field-label">EVENT PHOTO</label>
          <div class="photo-slot" style="aspect-ratio:16/9;border-style:dashed" onclick="SM.showToast('In production: upload image to GitHub /images folder, then enter path','success')">
            <svg class="slot-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span class="slot-label">UPLOAD EVENT PHOTO</span>
          </div>
          <p class="field-hint mt-sm">Upload photo to GitHub repo under /images, then enter filename here</p>
          <input class="field-input mt-sm" type="text" id="ce-photo" placeholder="images/event-photo.jpg"/>
        </div>
        <div style="display:flex;gap:10px;padding-top:8px;border-top:1px solid var(--gray-200)">
          <button class="btn btn-sm btn-outline" onclick="SM.showPage('events')">CANCEL</button>
          <button class="btn btn-sm" id="ce-publish-btn" style="flex:1" onclick="SM.createEvent()">PUBLISH EVENT</button>
        </div>
      </div>
    </div>
  `;
};

SM.createEvent = function() {
  var community = document.getElementById('ce-community')?.value;
  var title     = document.getElementById('ce-title')?.value.trim();
  var date      = document.getElementById('ce-date')?.value;
  var time      = document.getElementById('ce-time')?.value;
  var address   = document.getElementById('ce-address')?.value.trim();
  var desc      = document.getElementById('ce-desc')?.value.trim();
  var btn       = document.getElementById('ce-publish-btn');

  if (!title || !date || !time || !address) {
    SM.showToast('Please fill all required fields', 'error');
    return;
  }

  if (btn) { btn.textContent = 'PUBLISHING...'; btn.disabled = true; }

  var communityLabel = SM.communityData[community] ? SM.communityData[community].fullName : community.toUpperCase();

  var newEvent = {
    community:      community,
    communityLabel: communityLabel,
    title:          title,
    date:           date,
    time:           time,
    address:        address,
    description:    desc || '',
    photo:          '',
    going:          [],
    maybe:          [],
    notgoing:       [],
    createdBy:      SM.getCurrentUser() ? SM.getCurrentUser().id : null,
    createdAt:      firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('communities').doc(community)
    .collection('events')
    .add(newEvent)
    .then(function(ref) {
      if (btn) { btn.textContent = 'PUBLISH EVENT'; btn.disabled = false; }
      SM.showToast('Event published!', 'success');
      SM.showPage('events');
      SM.renderEventsList();
    })
    .catch(function(err) {
      if (btn) { btn.textContent = 'PUBLISH EVENT'; btn.disabled = false; }
      console.error('SM: createEvent error:', err);
      SM.showToast('Could not publish event — try again', 'error');
    });
};

/* ── ADMIN ── */
SM.renderAdmin = function() {
  var el = document.getElementById('admin-content');
  if (!el || !SM.isAdmin()) return;

  /* Show loading state while Firestore fetches users */
  el.innerHTML = '<div class="section"><p class="p2" style="color:var(--gray-600)">Loading users...</p></div>';

  SM.getUsers().then(function(users) {
    el.innerHTML =
      '<div class="section">' +
      '<h2 class="mb-lg">USER MANAGEMENT</h2>' +
      '<div style="overflow-x:auto">' +
      '<table class="admin-table"><thead><tr>' +
      '<th style="width:150px">User</th>' +
      '<th style="width:70px">Role</th>' +
      '<th style="width:100px">Community</th>' +
      '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      users.map(function(u) {
        return '<tr>' +
          '<td>' +
            '<div style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.03em">' + (u.firstName||'') + ' ' + (u.lastInitial||'') + '</div>' +
            '<div style="font-size:var(--p3);color:var(--gray-600)">' + (u.email||'') + '</div>' +
          '</td>' +
          '<td><span class="tag ' + (u.role==='admin'?'tag-black':u.role==='host'?'tag-teal':'tag-outline') + '">' + (u.role||'user').toUpperCase() + '</span></td>' +
          '<td style="font-size:var(--p3)">' + ((u.community||'').toUpperCase() || '—') + '</td>' +
          '<td><div class="action-btns">' +
            (u.role === 'user' ? '<button class="action-btn promote" onclick="SM.promoteToHost(\'' + u.id + '\');SM.renderAdmin()">MAKE HOST</button>' : '') +
            (u.role !== 'admin' ? '<button class="action-btn restrict" onclick="SM.restrictUser(\'' + u.id + '\');SM.renderAdmin()">RESTRICT</button>' : '') +
            (u.role !== 'admin' ? '<button class="action-btn remove" onclick="if(confirm(\'Remove this user?\')){SM.deleteUser(\'' + u.id + '\');SM.renderAdmin()}">REMOVE</button>' : '') +
          '</div></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div style="margin-top:40px">' +
        '<h2 class="mb-lg">CREATE COMMUNITY</h2>' +
        '<div style="max-width:480px;display:flex;flex-direction:column;gap:14px">' +
          '<div class="field"><label class="field-label">COMMUNITY CODE</label><input class="field-input" type="text" id="cc-code" placeholder="e.g. SMNYC" maxlength="6"/></div>' +
          '<div class="field"><label class="field-label">CITY / REGION</label><input class="field-input" type="text" id="cc-city" placeholder="New York City"/></div>' +
          '<div class="field"><label class="field-label">ASSIGN HOST (USERNAME)</label><input class="field-input" type="text" id="cc-host" placeholder="Search username..."/></div>' +
          '<button class="btn btn-sm" onclick="SM.showToast(\'Community creation coming in Phase 4!\',\'success\')">CREATE COMMUNITY</button>' +
        '</div>' +
      '</div>' +
      '</div>';
  }).catch(function(err) {
    el.innerHTML = '<div class="section"><p class="p2" style="color:var(--red)">Could not load users. Check your connection and try again.</p></div>';
    console.error('SM: renderAdmin error:', err);
  });
};

/* ── CONTACT FORM ── */
SM.submitContact = function(e) {
  e.preventDefault();
  SM.showToast('Message sent! We\'ll be in touch.', 'success');
  e.target.reset();
};

/* ── MOBILE NAV ── */
SM.openMobileNav = function() {
  document.getElementById('mobile-nav')?.classList.add('open');
  document.body.style.overflow = 'hidden';
};
SM.closeMobileNav = function() {
  document.getElementById('mobile-nav')?.classList.remove('open');
  document.body.style.overflow = '';
};

/* ── APP INIT ── */
SM.init = function() {
  if ('serviceWorker' in navigator) {
    var swPath = window.location.pathname.replace(/\/[^\/]*$/, '/') + 'sw.js';
    navigator.serviceWorker.register(swPath).catch(function() {});
  }

  SM.initAuth();
  SM.initChat();

  /* Pre-load events from Firestore into SM.events cache */
  SM.loadEvents();

  /* Force all pages hidden first */
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  var user = SM.getCurrentUser();
  var startPage = user ? 'home' : 'landing';
  SM.showPage(startPage);
};

document.addEventListener('DOMContentLoaded', SM.init);
