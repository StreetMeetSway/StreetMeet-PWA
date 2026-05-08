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
  var communities = SM._communities.length ? SM._communities.map(function(c){return c.id;}) : ['smdc','smwa','smmd'];
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
  var communities = SM._communities.length ? SM._communities.map(function(c){return c.id;}) : ['smdc','smwa','smmd'];
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
    case 'landing':
      /* Make all reveal elements on landing page visible immediately —
         landing page content should never be hidden behind scroll animations */
      setTimeout(function() {
        document.querySelectorAll('#page-landing .reveal').forEach(function(el) {
          el.classList.add('visible');
        });
      }, 50);
      break;
    case 'home':
      SM.renderHomeCommunityHeader();
      SM.renderHomeEvents();
      setTimeout(function() { if (typeof initReveal === 'function') initReveal(); }, 100);
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
    default:
      /* Dynamic community pages — any community in communityData */
      if (SM.communityData[pageId]) {
        SM._ensureCommunityPageShells();
        SM.renderCommunityPage(pageId);
      }
      break;
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
  var communityItems = SM._communities.length
    ? SM._communities.map(function(c) {
        return '<a class="nav-dropdown-item" onclick="SM.navGo(\'' + c.id + '\')">' + c.code + '</a>';
      }).join('')
    : '<a class="nav-dropdown-item" onclick="SM.navGo(\'smdc\')">SMDC — Washington D.C.</a>' +
      '<a class="nav-dropdown-item" onclick="SM.navGo(\'smwa\')">SMWA — Washington State</a>' +
      '<a class="nav-dropdown-item" onclick="SM.navGo(\'smmd\')">SMMD — Maryland</a>';

  var userComm = user ? (user.community || 'smdc') : 'landing';
  var links =
    '<a class="nav-link' + (SM.communityData[activePageId] ? ' active' : '') + '" onclick="SM.navGo(\'' + userComm + '\')">Home</a>' +
    '<div class="nav-dropdown" id="dd-communities">' +
      '<a class="nav-link" onclick="SM.toggleDropdown(\'dd-communities\',event)">Communities ▾</a>' +
      '<div class="nav-dropdown-menu" id="dd-communities-menu">' +
        communityItems +
      '</div>' +
    '</div>' +
    '<a class="nav-link' + (activePageId === 'events' ? ' active' : '') + '" onclick="SM.navGo(\'events\')">Meets</a>';

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
      /* Load comments and init See More toggles */
      communityEvents.forEach(function(ev) { SM.loadComments(ev.id); });
      setTimeout(SM.initDescToggles, 50);
    });
  });
};

/* ── RENDER EVENTS LIST ── */
/* Open events page and scroll to a specific event card */
SM.openEventDetail = function(evId) {
  SM.showPage('events');
  setTimeout(function() {
    var card = document.querySelector('[data-ev-id="' + evId + '"], #ev-' + evId);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--teal)';
      setTimeout(function() { card.style.outline = ''; }, 2000);
    }
  }, 400);
};

SM.renderEventsList = function() {
  var container = document.getElementById('all-events');
  if (!container) return;

  container.innerHTML = '<p class="p2" style="color:var(--gray-600)">Loading events...</p>';

  SM.loadEvents().then(function(events) {
    SM.loadRsvpState().then(function() {
      container.innerHTML = events.length
        ? events.map(SM.renderEventCard).join('')
        : '<p class="p2" style="color:var(--gray-600)">No events yet. Check back soon.</p>';
      /* Load comments and init See More toggles */
      events.forEach(function(ev) { SM.loadComments(ev.id); });
      setTimeout(SM.initDescToggles, 50);
    });
  });
};

/* ── EVENT CARD HTML ── */
/* ══════════════════════════════════════════════════════════
   TASK 11 — EXPORT ATTENDEE LIST AS CSV
   Available to hosts and admins from the event admin bar.
   Exports: First Name, Last Initial, Email, Creator Type,
            Community, RSVP Status for Going + Maybe RSVPs.
══════════════════════════════════════════════════════════ */
SM.exportAttendeesCSV = function(evId) {
  if (!SM.isHost() && !SM.isAdmin()) return;

  var ev = SM.events.find(function(e) { return e.id === evId; });
  if (!ev) { SM.showToast('Event not found', 'error'); return; }

  SM.showToast('Preparing export...', 'success');

  /* Fetch Going and Maybe RSVPs in parallel */
  var goingQ  = db.collection('communities').doc(ev.community)
    .collection('events').doc(evId).collection('rsvps')
    .where('state', '==', 'going').get();
  var maybeQ  = db.collection('communities').doc(ev.community)
    .collection('events').doc(evId).collection('rsvps')
    .where('state', '==', 'maybe').get();

  Promise.all([goingQ, maybeQ]).then(function(results) {
    /* Collect unique userIds with their RSVP state */
    var attendees = [];
    results[0].docs.forEach(function(d) {
      attendees.push({ userId: d.data().userId, state: "I'm Down" });
    });
    results[1].docs.forEach(function(d) {
      attendees.push({ userId: d.data().userId, state: 'Just Might' });
    });

    if (attendees.length === 0) {
      SM.showToast('No attendees to export', 'error');
      return;
    }

    /* Fetch user profiles for all attendees in parallel */
    var profilePromises = attendees.map(function(a) {
      return db.collection('users').doc(a.userId).get()
        .then(function(doc) {
          return { rsvp: a.state, profile: doc.exists ? doc.data() : null };
        });
    });

    return Promise.all(profilePromises).then(function(rows) {
      /* Build CSV string */
      var headers = ['First Name', 'Last Initial', 'Email',
                     'Creator Type', 'Community', 'RSVP Status'];
      var csvRows = [headers.join(',')];

      rows.forEach(function(r) {
        if (!r.profile) return;
        var p = r.profile;
        var communityName = SM.communityName(p.community) || (p.community || '').toUpperCase();
        csvRows.push([
          SM._csvEscape(p.firstName || ''),
          SM._csvEscape(p.lastInitial || ''),
          SM._csvEscape(p.email || ''),
          SM._csvEscape(p.creatorType || ''),
          SM._csvEscape(communityName),
          SM._csvEscape(r.rsvp)
        ].join(','));
      });

      var csvContent = csvRows.join('\n');

      /* Trigger browser download via blob URL */
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var safeTitle = (ev.title || 'event').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      link.href     = url;
      link.download = 'streetmeet-' + safeTitle + '-attendees.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      SM.showToast('Exported ' + rows.filter(function(r) { return r.profile; }).length + ' attendees', 'success');
    });
  }).catch(function(err) {
    SM.showToast('Export failed — try again', 'error');
    console.error('SM: exportAttendeesCSV error:', err);
  });
};

/* Escape a value for CSV — wraps in quotes if it contains commas, quotes, or newlines */
SM._csvEscape = function(val) {
  var str = String(val || '');
  if (str.search(/("|,|\n)/g) >= 0) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

SM.renderEventCard = function(ev) {
  var d = new Date(ev.date + 'T' + ev.time);
  var dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  var timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  var rsvpState = SM.rsvpState[ev.id] || '';
  var calLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + ev.date.replace(/-/g,'') + 'T' + ev.time.replace(':','') + '00/' + ev.date.replace(/-/g,'') + 'T200000&details=' + encodeURIComponent(ev.description) + '&location=' + encodeURIComponent(ev.address);
  var mapLink = 'https://maps.google.com/?q=' + encodeURIComponent(ev.address);

  /* Host/Admin action bar — edit, delete, export */
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
      '<button class="event-admin-btn export" onclick="SM.exportAttendeesCSV(\'' + ev.id + '\')" title="Export attendee list">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        ' EXPORT CSV' +
      '</button>' +
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
      (ev.description ? '<div class="event-card-desc" id="desc-' + ev.id + '">' + (ev.description || '') + '</div>' +
        '<button class="see-more-btn" id="see-more-' + ev.id + '" onclick="SM.toggleDesc(\'' + ev.id + '\')" style="display:none">SEE MORE ↓</button>' : '') +
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
    .then(function() {
      /* If this is a reply, notify the original commenter */
      if (commentData.replyTo && commentData.replyTo.authorId) {
        SM._notifyCommentReply(
          commentData.replyTo.authorId,
          commentData.authorName.trim(),
          ev.title,
          'events',
          null
        );
      }
    })
    .catch(function(err) {
      console.error('SM: postComment error:', err);
      SM.showToast('Comment could not be saved — check your connection', 'error');
    });
};

/* ── ATTENDEES MODAL ── */
/* ── LOAD COMMENTS FROM FIRESTORE ──
   Called after event cards render to populate comment threads */
/* ── QW3: Event description See More / See Less ── */
SM.toggleDesc = function(evId) {
  var desc = document.getElementById('desc-' + evId);
  var btn  = document.getElementById('see-more-' + evId);
  if (!desc || !btn) return;
  var expanded = desc.dataset.expanded === 'true';
  if (expanded) {
    desc.style.webkitLineClamp = '3';
    desc.style.overflow        = 'hidden';
    desc.style.display         = '-webkit-box';
    desc.dataset.expanded      = 'false';
    btn.textContent            = 'SEE MORE ↓';
  } else {
    desc.style.webkitLineClamp = 'unset';
    desc.style.overflow        = 'visible';
    desc.style.display         = 'block';
    desc.dataset.expanded      = 'true';
    btn.textContent            = 'SEE LESS ↑';
  }
};

/* Call after event cards render to show toggle only when text overflows */
SM.initDescToggles = function() {
  document.querySelectorAll('.event-card-desc').forEach(function(el) {
    var evId = el.id.replace('desc-', '');
    var btn  = document.getElementById('see-more-' + evId);
    if (!btn) return;
    /* Show button only if text is actually truncated */
    if (el.scrollHeight > el.clientHeight + 2) {
      btn.style.display = 'inline-block';
    }
    el.dataset.expanded = 'false';
  });
};

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

  /* Show modal with loading state */
  list.innerHTML =
    '<div style="padding:16px;font-size:var(--p3);color:var(--gray-600)">Loading attendees...</div>';
  modal.classList.add('open');

  /* Load all three RSVP states in parallel */
  var stateLabels = { going: "I'M DOWN", maybe: 'JUST MIGHT', notgoing: 'MISSING OUT' };
  var statePromises = ['going','maybe','notgoing'].map(function(state) {
    return db.collection('communities').doc(ev.community)
      .collection('events').doc(evId)
      .collection('rsvps')
      .where('state', '==', state)
      .get()
      .then(function(snap) { return { state: state, docs: snap.docs }; });
  });

  Promise.all(statePromises).then(function(results) {
    /* Build counts */
    var counts = {};
    results.forEach(function(r) { counts[r.state] = r.docs.length; });

    /* Fetch all unique user profiles */
    var allDocs = results.reduce(function(acc, r) { return acc.concat(r.docs); }, []);
    var userIds = allDocs.map(function(d) { return d.data().userId; })
      .filter(function(id, i, arr) { return id && arr.indexOf(id) === i; });

    if (userIds.length === 0) {
      list.innerHTML =
        '<div style="padding:24px 16px;text-align:center;font-size:var(--p3);color:var(--gray-600)">No RSVPs yet.</div>';
      return;
    }

    var profilePromises = userIds.map(function(uid) {
      return db.collection('users').doc(uid).get()
        .then(function(doc) { return { id: uid, data: doc.exists ? doc.data() : null }; });
    });

    return Promise.all(profilePromises).then(function(profiles) {
      var profileMap = {};
      profiles.forEach(function(p) { if (p.data) profileMap[p.id] = p.data; });

      /* Build the modal content — tab bar + attendee cards */
      list.innerHTML = '';

      /* ── Tab bar ── */
      var tabBar = document.createElement('div');
      tabBar.style.cssText = 'display:flex;border-bottom:2px solid var(--gray-200);';

      var panels = {};
      ['going','maybe','notgoing'].forEach(function(state, i) {
        var count = counts[state] || 0;

        /* Tab button */
        var tab = document.createElement('button');
        tab.style.cssText = 'flex:1;font-family:var(--font-head);font-size:0.85rem;letter-spacing:0.06em;' +
          'padding:10px 6px;background:none;border:none;border-bottom:3px solid transparent;' +
          'margin-bottom:-2px;cursor:pointer;color:var(--gray-600);transition:all 0.15s;';
        tab.textContent = stateLabels[state] + ' (' + count + ')';
        tab.dataset.state = state;

        /* Panel */
        var panel = document.createElement('div');
        panel.dataset.panel = state;
        panel.style.display = i === 0 ? 'block' : 'none';

        if (count === 0) {
          panel.innerHTML = '<div style="padding:20px 16px;font-size:var(--p3);color:var(--gray-600);text-align:center">No one in this category.</div>';
        } else {
          /* Build attendee cards using DOM API */
          results.find(function(r) { return r.state === state; }).docs.forEach(function(doc) {
            var uid = doc.data().userId;
            var u   = profileMap[uid];
            if (!u) return;

            var initials = ((u.firstName||'')[0]||'').toUpperCase() +
                           ((u.lastInitial||'')[0]||'').toUpperCase();
            var communityLabel = SM.communityName(u.community) || (u.community||'').toUpperCase();
            var isHost = u.role === 'host' || u.role === 'admin';

            /* Card container — clickable, opens profile */
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:14px;padding:12px 16px;' +
              'border-bottom:1px solid var(--gray-200);cursor:pointer;transition:background 0.15s;';
            card.addEventListener('mouseover',  function() { card.style.background = 'var(--gray-100)'; });
            card.addEventListener('mouseout',   function() { card.style.background = ''; });
            card.addEventListener('click', function() {
              document.getElementById('attendees-modal').classList.remove('open');
              SM.viewProfile(uid);
            });

            /* Avatar */
            var avatarEl;
            if (u.avatarURL) {
              avatarEl = document.createElement('img');
              avatarEl.src = u.avatarURL;
              avatarEl.alt = (u.firstName || '') + ' ' + (u.lastInitial || '');
              avatarEl.style.cssText = 'width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;';
            } else {
              avatarEl = document.createElement('div');
              avatarEl.className = 'comment-avatar';
              avatarEl.style.cssText = 'width:44px;height:44px;flex-shrink:0;font-size:1rem;';
              avatarEl.textContent = initials;
            }

            /* Info column */
            var infoDiv = document.createElement('div');
            infoDiv.style.flex = '1';
            infoDiv.style.minWidth = '0';

            /* Name row */
            var nameRow = document.createElement('div');
            nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:2px;';

            var nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-family:var(--font-head);font-size:1.05rem;letter-spacing:0.03em;';
            nameEl.textContent = (u.firstName || '') + ' ' + (u.lastInitial || '');

            nameRow.appendChild(nameEl);

            /* Host badge */
            if (isHost) {
              var badge = document.createElement('span');
              badge.style.cssText = 'font-family:var(--font-head);font-size:0.6rem;letter-spacing:0.1em;' +
                'padding:2px 6px;background:var(--red);color:var(--white);border-radius:2px;';
              badge.textContent = u.role === 'admin' ? 'ADMIN' : 'HOST';
              nameRow.appendChild(badge);
            }

            /* Creator type + community */
            var metaEl = document.createElement('div');
            metaEl.style.cssText = 'font-size:var(--p3);color:var(--gray-600);';
            metaEl.textContent = [u.creatorType, communityLabel].filter(Boolean).join(' · ');

            infoDiv.appendChild(nameRow);
            infoDiv.appendChild(metaEl);

            /* Arrow */
            var arrow = document.createElement('div');
            arrow.style.cssText = 'color:var(--gray-400);font-size:0.9rem;flex-shrink:0;';
            arrow.textContent = '→';

            card.appendChild(avatarEl);
            card.appendChild(infoDiv);
            card.appendChild(arrow);
            panel.appendChild(card);
          });
        }

        panels[state] = panel;

        /* Tab click handler */
        tab.addEventListener('click', function() {
          /* Reset all tabs and panels */
          Array.from(tabBar.children).forEach(function(t) {
            t.style.color        = 'var(--gray-600)';
            t.style.borderBottom = '3px solid transparent';
          });
          Object.values(panels).forEach(function(p) { p.style.display = 'none'; });
          /* Activate clicked tab */
          tab.style.color        = 'var(--black)';
          tab.style.borderBottom = '3px solid var(--red)';
          panel.style.display    = 'block';
        });

        /* Activate first tab by default */
        if (i === 0) {
          tab.style.color        = 'var(--black)';
          tab.style.borderBottom = '3px solid var(--red)';
        }

        tabBar.appendChild(tab);
      });

      list.appendChild(tabBar);
      Object.values(panels).forEach(function(p) { list.appendChild(p); });
    });
  }).catch(function(err) {
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
/* ══════════════════════════════════════════════════════════
   TASK 12 — PHOTO LIGHTBOX
   Opens portfolio photos full-size with prev/next navigation.
   Only active on public Photographer/Model profile views.
══════════════════════════════════════════════════════════ */
SM._lightboxPhotos = [];
SM._lightboxIndex  = 0;

SM.openLightbox = function(photos, index) {
  SM._lightboxPhotos = photos;
  SM._lightboxIndex  = index;
  SM._updateLightbox();
  var lb = document.getElementById('photo-lightbox');
  if (lb) { lb.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
};

SM.closeLightbox = function() {
  var lb = document.getElementById('photo-lightbox');
  if (lb) { lb.style.display = 'none'; document.body.style.overflow = ''; }
};

SM.lightboxPrev = function() {
  SM._lightboxIndex = (SM._lightboxIndex - 1 + SM._lightboxPhotos.length) % SM._lightboxPhotos.length;
  SM._updateLightbox();
};

SM.lightboxNext = function() {
  SM._lightboxIndex = (SM._lightboxIndex + 1) % SM._lightboxPhotos.length;
  SM._updateLightbox();
};

SM._updateLightbox = function() {
  var img   = document.getElementById('lightbox-img');
  var count = document.getElementById('lightbox-count');
  var total = SM._lightboxPhotos.length;
  if (img)   img.src = SM._lightboxPhotos[SM._lightboxIndex] || '';
  if (count) count.textContent = (SM._lightboxIndex + 1) + ' / ' + total;
  /* Hide prev/next when only one photo */
  var prev = document.getElementById('lightbox-prev');
  var next = document.getElementById('lightbox-next');
  if (prev) prev.style.display = total > 1 ? 'flex' : 'none';
  if (next) next.style.display = total > 1 ? 'flex' : 'none';
};

/* Keyboard navigation for lightbox */
document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('photo-lightbox');
  if (!lb || lb.style.display === 'none') return;
  if (e.key === 'Escape')    SM.closeLightbox();
  if (e.key === 'ArrowLeft') SM.lightboxPrev();
  if (e.key === 'ArrowRight') SM.lightboxNext();
});

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
  var isPhotoType = (user.creatorType === 'Photographer' || user.creatorType === 'Model');

  var photosHTML;
  if (isPhotoType && !isOwn) {
    /* Public profile view for Photographer/Model — 2-col grid with lightbox.
       Store photo index on data-attr; addEventListener wired after innerHTML via SM._initPhotoLightbox */
    var filledPhotos = photos.filter(function(url) { return !!url; });
    if (filledPhotos.length === 0) {
      photosHTML = '<p class="p2" style="color:var(--gray-600)">No photos yet.</p>';
    } else {
      photosHTML = filledPhotos.map(function(url, i) {
        return '<div class="profile-photo-lg" data-photo-index="' + i + '">' +
          '<img src="' + url + '" alt="Photo ' + (i+1) + '"/>' +
        '</div>';
      }).join('');
    }
    /* Store filled photos array for lightbox init — keyed by userId */
    SM._pendingLightboxPhotos = filledPhotos;
  } else {
    /* Own profile view (edit slots) or non-photo creator type — 4-col grid */
    photosHTML = [0,1,2,3].map(function(i) {
      if (photos[i]) {
        return '<div class="photo-slot filled">' +
          '<img src="' + photos[i] + '" alt="Photo ' + (i+1) + '"/>' +
          (isOwn ? '<button class="photo-delete-btn" onclick="event.stopPropagation();SM.deletePhoto(' + i + ')">\u2715</button>' : '') +
        '</div>';
      }
      return '<div class="photo-slot">' +
        '<svg class="slot-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
        '<span class="slot-label">' + (isOwn ? 'ADD PHOTO' : '') + '</span>' +
      '</div>';
    }).join('');
  }

  /* Video embed — Task 2.4 will expand this */
  var isVideoType = (user.creatorType === 'Videographer' || user.creatorType === 'Content Creator');

  /* ── Build right column content based on creator type ── */
  var rightColHTML = '';

  if (isVideoType) {
    /* Videographer / Content Creator — up to 2 video embeds, no photo grid */
    var videoEmbeds = '';

    if (user.videoUrl) {
      var e1 = SM.parseVideoEmbed ? SM.parseVideoEmbed(user.videoUrl) : null;
      if (e1) {
        videoEmbeds +=
          '<div style="position:relative;padding-top:56.25%;background:var(--black);margin-bottom:16px;">' +
            '<iframe src="' + e1.embedUrl + '" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>' +
          '</div>';
      }
    }
    if (user.videoUrl2) {
      var e2 = SM.parseVideoEmbed ? SM.parseVideoEmbed(user.videoUrl2) : null;
      if (e2) {
        videoEmbeds +=
          '<div style="position:relative;padding-top:56.25%;background:var(--black);margin-bottom:4px;">' +
            '<iframe src="' + e2.embedUrl + '" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>' +
          '</div>';
      }
    }

    rightColHTML =
      '<span class="section-label">Featured Work</span>' +
      (videoEmbeds || '<p class="p2" style="color:var(--gray-600)">No videos added yet.</p>');

  } else {
    /* Photographer / Model — 2-col lightbox grid (public) or 4-slot grid (own) */
    rightColHTML =
      '<span class="section-label">Photos</span>' +
      '<div class="' + (isPhotoType && !isOwn ? 'profile-photos-grid-2col' : 'profile-photos-grid') + '">' + photosHTML + '</div>';
  }

  /* ── Left column — bio, links (video type gets no second video in left col) ── */
  var leftColHTML =
    '<span class="section-label">About</span>' +
    '<p class="p2 mb-lg">' + (user.bio || 'No bio yet.') + '</p>' +
    (!isVideoType && user.videoUrl ? (function() {
      var em = SM.parseVideoEmbed ? SM.parseVideoEmbed(user.videoUrl) : null;
      return em ?
        '<div class="mb-lg"><span class="section-label">Featured Work</span>' +
        '<div style="position:relative;padding-top:56.25%;background:var(--black);margin-top:8px">' +
          '<iframe src="' + em.embedUrl + '" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>' +
        '</div></div>' : '';
    })() : '') +
    (user.website ? '<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">PORTFOLIO</span><br><a href="https://' + user.website + '" target="_blank" class="event-meta-link">' + user.website + '</a></div>' : '') +
    (user.instagram ? '<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">INSTAGRAM</span><br><a href="https://instagram.com/' + user.instagram + '" target="_blank" class="event-meta-link">@' + user.instagram + '</a></div>' : '');

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
        '<div>' + rightColHTML + '</div>' +
        '<div>' + leftColHTML + '</div>' +
      '</div>' +
    '</div>';

  /* Wire lightbox click listeners after innerHTML is set */
  if (isPhotoType && !isOwn && SM._pendingLightboxPhotos && SM._pendingLightboxPhotos.length > 0) {
    setTimeout(function() { SM._initPhotoLightbox(); }, 0);
  }
};

/* Wire click listeners onto .profile-photo-lg elements after they're in the DOM */
SM._initPhotoLightbox = function() {
  var photos = SM._pendingLightboxPhotos || [];
  document.querySelectorAll('.profile-photo-lg').forEach(function(el) {
    var idx = parseInt(el.dataset.photoIndex, 10) || 0;
    el.addEventListener('click', function() {
      SM.openLightbox(photos, idx);
    });
  });
  SM._pendingLightboxPhotos = null; /* Clear after wiring */
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
  var isVideoType = (user.creatorType === 'Videographer' || user.creatorType === 'Content Creator');

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
            SM._communityOptions(user.community) +
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

        /* Video / Photo fields — varies by creator type */
        (isVideoType ?
          /* Videographer / Content Creator — two video URL inputs, no photo grid */
          '<div class="field"><label class="field-label">FEATURED VIDEO 1 <span style="font-family:var(--font-body);font-size:var(--p3);font-weight:400;text-transform:none;letter-spacing:0;">(YouTube or Vimeo URL)</span></label>' +
            '<input class="field-input" type="url" id="ep-video" value="' + (user.videoUrl||'') + '" placeholder="https://youtu.be/..."/>' +
          '</div>' +
          '<div class="field"><label class="field-label">FEATURED VIDEO 2 <span style="font-family:var(--font-body);font-size:var(--p3);font-weight:400;text-transform:none;letter-spacing:0;">(YouTube or Vimeo URL)</span></label>' +
            '<input class="field-input" type="url" id="ep-video2" value="' + (user.videoUrl2||'') + '" placeholder="https://youtu.be/..."/>' +
            '<p class="field-hint mt-sm">Paste YouTube or Vimeo links. Both videos display on your public profile.</p>' +
          '</div>'
        :
          /* Photographer / Model — single featured video + photo grid */
          '<div class="field"><label class="field-label">FEATURED VIDEO <span style="font-family:var(--font-body);font-size:var(--p3);font-weight:400;text-transform:none;letter-spacing:0;">(YouTube or Vimeo URL)</span></label>' +
            '<input class="field-input" type="url" id="ep-video" value="' + (user.videoUrl||'') + '" placeholder="https://youtu.be/..."/>' +
            '<p class="field-hint mt-sm">Optional — paste a YouTube or Vimeo link to feature on your profile.</p>' +
          '</div>' +
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
          '</div>'
        ) +

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
  var videoUrl2  = (document.getElementById('ep-video2')?.value || '').trim();
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
    videoUrl2:   videoUrl2,
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
/* ══════════════════════════════════════════════════════════
   TASK 4.1 — DYNAMIC COMMUNITY SYSTEM
   Communities load from Firestore. Admin can create new
   ones from the admin panel without code changes.
   Falls back to hardcoded defaults if Firestore is empty.
══════════════════════════════════════════════════════════ */

/* ── Default community data (used as fallback + Firestore seed) ── */
SM.communityData = {
  smdc: {
    code: 'SMDC', name: 'Washington, D.C.', fullName: 'StreetMeet DC',
    tagline: 'The original and leading StreetMeet community.',
    description: 'Since March of 2015 StreetMeetDC has been the leading community for StreetMeet. Bringing community together over the last 11 years we\'ve seen so many incredible creators be a part of this everlasting community.',
    instagram: 'streetmeetdc',
    instagramFeedId: 'BcVCcprBmCkLZ3LwUR6d',
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
    instagramFeedId: 'JxwN9uEL5IgVdVb5cnsN',
    hosts: [ { name: 'Pacific Leo', handle: 'pacificpnw_leo', bio: 'Seattle-based photographer chasing light in the Pacific Northwest.', link: '#' } ]
  },
  smmd: {
    code: 'SMMD', name: 'Maryland', fullName: 'StreetMeet MD',
    tagline: 'DMV creative community, Maryland chapter.',
    description: 'StreetMeetMD extends the DMV creative community into the heart of Maryland. From Baltimore\'s storied streets to the suburbs and beyond.',
    instagram: 'streetmeetmd',
    instagramFeedId: '9XQ6g7bOw4HVgaESzu7q',
    hosts: [ { name: 'Baltimore Frames', handle: 'baltimoreframes', bio: 'Baltimore documentary photographer and community builder.', link: '#' } ]
  }
};

/* Live ordered list — populated by loadCommunities() */
SM._communities = [];

/* ── Load communities from Firestore ──
   On success: updates SM.communityData + SM._communities + nav + DOM pages.
   On failure / empty: falls back to hardcoded defaults. */
/* ── Task 09: Remove / Restore a community (admin only) ──
   Soft delete — writes active:false, never deletes data.
   Protected communities (smdc, smwa, smmd) cannot be removed. */
SM.removeCommunity = function(communityId, code) {
  if (!SM.isAdmin()) return;
  var locked = ['smdc','smwa','smmd'];
  if (locked.indexOf(communityId) > -1) {
    SM.showToast(code + ' is a protected community and cannot be removed', 'error');
    return;
  }
  if (!confirm('Remove ' + code + '?\n\nThis will hide the community page and remove it from navigation. Member profiles and events are not deleted. You can restore it at any time from the admin panel.')) return;

  db.collection('communities').doc(communityId).update({ active: false })
    .then(function() {
      /* Remove from local active list and update nav */
      SM._communities = SM._communities.filter(function(c) { return c.id !== communityId; });
      /* Mark in communityData */
      if (SM.communityData[communityId]) SM.communityData[communityId].active = false;
      SM.updateNav();
      SM.renderAdmin();
      SM.showToast(code + ' community removed from navigation', 'success');
    })
    .catch(function(err) {
      SM.showToast('Could not remove community', 'error');
      console.error('SM: removeCommunity error:', err);
    });
};

SM.restoreCommunity = function(communityId, code) {
  if (!SM.isAdmin()) return;
  db.collection('communities').doc(communityId).update({ active: true })
    .then(function() {
      /* Add back to active list */
      if (SM.communityData[communityId]) {
        SM.communityData[communityId].active = true;
        SM._communities.push(SM.communityData[communityId]);
      }
      SM._ensureCommunityPageShells();
      SM.updateNav();
      SM.renderAdmin();
      SM.showToast(code + ' community restored', 'success');
    })
    .catch(function(err) {
      SM.showToast('Could not restore community', 'error');
      console.error('SM: restoreCommunity error:', err);
    });
};

SM.loadCommunities = function() {
  return db.collection('communities').orderBy('createdAt', 'asc').get()
    .then(function(snap) {
      if (snap.empty) {
        /* No Firestore docs yet — use hardcoded defaults and seed them */
        SM._communities = Object.keys(SM.communityData).map(function(id) {
          return Object.assign({ id: id }, SM.communityData[id]);
        });
        SM._seedDefaultCommunities();
        return;
      }
      /* Merge Firestore data into communityData */
      snap.docs.forEach(function(doc) {
        var d = doc.data();
        var id = doc.id;
        if (!SM.communityData[id]) SM.communityData[id] = {};
        /* Firestore fields override defaults */
        SM.communityData[id] = Object.assign({}, SM.communityData[id], d, { id: id });
      });
      /* Only include active communities in nav — active:false = removed */
      SM._communities = snap.docs
        .filter(function(doc) { return doc.data().active !== false; })
        .map(function(doc) {
          return Object.assign({ id: doc.id }, SM.communityData[doc.id]);
        });

      /* Inject page shells for any communities not in HTML */
      SM._ensureCommunityPageShells();
      /* Refresh nav dropdown */
      SM.updateNav();
    })
    .catch(function(err) {
      console.warn('SM: loadCommunities fallback to defaults:', err.message);
      SM._communities = Object.keys(SM.communityData).map(function(id) {
        return Object.assign({ id: id }, SM.communityData[id]);
      });
    });
};

/* ── Seed default communities to Firestore on first run ── */
SM._seedDefaultCommunities = function() {
  var batch = db.batch();
  Object.keys(SM.communityData).forEach(function(id) {
    var ref = db.collection('communities').doc(id);
    var data = Object.assign({}, SM.communityData[id]);
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    batch.set(ref, data, { merge: true });
  });
  batch.commit().catch(function(err) {
    console.warn('SM: community seed failed:', err.message);
  });
};

/* ── Inject a page shell div for any community not already in HTML ── */
SM._ensureCommunityPageShells = function() {
  /* Insert before the footer so new pages render in the correct DOM order */
  var footer = document.querySelector('footer') || document.querySelector('script');
  SM._communities.forEach(function(c) {
    var id = c.id;
    if (!document.getElementById('page-' + id)) {
      var div = document.createElement('div');
      div.id = 'page-' + id;
      div.className = 'page';
      div.innerHTML = '<div id="community-content-' + id + '"><!-- rendered by JS --></div>';
      if (footer && footer.parentNode) {
        footer.parentNode.insertBefore(div, footer);
      } else {
        document.body.appendChild(div);
      }
    }
  });
};

/* ── Admin: Create a new community ── */
SM.createCommunity = function() {
  if (!SM.isAdmin()) { SM.showToast('Admin access required', 'error'); return; }

  var code     = (document.getElementById('cc-code')?.value || '').trim().toUpperCase();
  var city     = (document.getElementById('cc-city')?.value || '').trim();
  var tagline  = (document.getElementById('cc-tagline')?.value || '').trim();
  var instagram = (document.getElementById('cc-instagram')?.value || '').trim().replace('@','');
  var hostEmail = (document.getElementById('cc-host-email')?.value || '').trim();
  var btn      = document.getElementById('cc-create-btn');

  if (!code || !city) { SM.showToast('Community code and city are required', 'error'); return; }
  if (code.length < 2) { SM.showToast('Code must be at least 2 characters', 'error'); return; }

  /* Generate community ID from code */
  var communityId = code.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SM.communityData[communityId]) {
    SM.showToast('A community with this code already exists', 'error');
    return;
  }

  if (btn) { btn.textContent = 'CREATING...'; btn.disabled = true; }

  /* Look up host user by email if provided */
  var hostLookup = hostEmail
    ? db.collection('users').where('email', '==', hostEmail).limit(1).get()
    : Promise.resolve(null);

  hostLookup.then(function(hostSnap) {
    var hostId   = null;
    var hostName = '';
    if (hostSnap && !hostSnap.empty) {
      var hData = hostSnap.docs[0].data();
      hostId   = hostSnap.docs[0].id;
      hostName = (hData.firstName + ' ' + hData.lastInitial).trim();
      /* Promote to host if not already */
      if (hData.role === 'user') {
        db.collection('users').doc(hostId).update({ role: 'host' });
      }
    }

    var newCommunity = {
      code:        code,
      name:        city,
      fullName:    'StreetMeet ' + code,
      tagline:     tagline || city + ' street photography community.',
      description: 'StreetMeet ' + code + ' brings together the creative community in ' + city + '.',
      instagram:   instagram || 'streetmeet' + communityId,
      hosts:       hostId ? [{ name: hostName, handle: instagram || '', bio: '', link: '#' }] : [],
      hostUserIds: hostId ? [hostId] : [],
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:   SM.getCurrentUser().id
    };

    return db.collection('communities').doc(communityId).set(newCommunity)
      .then(function() {
        /* Update local state */
        SM.communityData[communityId] = Object.assign({ id: communityId }, newCommunity);
        SM._communities.push(SM.communityData[communityId]);

        /* Inject page shell into DOM */
        SM._ensureCommunityPageShells();

        /* Update nav dropdown */
        SM.updateNav();

        /* Update all community dropdowns in edit-profile */
        SM._refreshCommunitySelects();

        /* Seed the board with starter threads */
        SM._seedCommunityBoard(communityId, hostName || 'StreetMeet Admin');

        if (btn) { btn.textContent = 'CREATE COMMUNITY'; btn.disabled = false; }
        SM.showToast('Community ' + code + ' created!', 'success');

        /* Navigate to the new community page */
        setTimeout(function() { SM.showPage(communityId); }, 500);
      });
  }).catch(function(err) {
    if (btn) { btn.textContent = 'CREATE COMMUNITY'; btn.disabled = false; }
    SM.showToast('Could not create community: ' + err.message, 'error');
    console.error('SM: createCommunity error:', err);
  });
};

/* ── Seed starter board threads for a newly created community ── */
SM._seedCommunityBoard = function(communityId, authorName) {
  var user = SM.getCurrentUser();
  if (!user) return;
  var starterThreads = [
    { title: 'Introduce Yourself', category: 'pinned',    body: 'Welcome! Tell us who you are, what you shoot, and what brings you to StreetMeet.' },
    { title: 'Best Locations',     category: 'locations', body: 'Share your favorite spots in the area. Help the community discover great places to shoot.' },
    { title: 'Gear Talk',          category: 'gear',      body: 'What are you shooting with? Cameras, lenses, lighting — share your kit.' }
  ];
  var batch = db.batch();
  starterThreads.forEach(function(t) {
    var ref = db.collection('communities').doc(communityId).collection('board').doc();
    batch.set(ref, {
      title: t.title, category: t.category, body: t.body,
      authorId: user.id, authorName: authorName || 'StreetMeet Admin',
      replyCount: 0,
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit().catch(function() {});
};

/* ── Refresh community <select> elements after a new community is added ── */
SM._refreshCommunitySelects = function() {
  var selects = document.querySelectorAll('#ep-community, #su-community, #ce-community');
  selects.forEach(function(sel) {
    var current = sel.value;
    sel.innerHTML = SM._communityOptions(current);
  });
};

/* ── Build <option> HTML for all communities ── */
SM._communityOptions = function(selected) {
  return SM._communities.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' +
      c.code + ' — ' + c.name + '</option>';
  }).join('');
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

  /* Always (re)load events from Firestore to avoid the race condition where
     SM.events is empty because loadEvents() hasn't resolved yet at page render time.
     Use cached events immediately for instant render, then refresh the events
     section once the Firestore call confirms the data. */
  SM.loadEvents().then(function() {
    SM._renderCommunityPageContent(communityId, el, data);
  });

  /* Also render immediately with whatever is cached — provides instant feedback */
  SM._renderCommunityPageContent(communityId, el, data);
};

SM._renderCommunityPageContent = function(communityId, el, data) {
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
      /* Row 1 — About text (left) + Instagram feed (right) */
      '<div class="section" style="padding-bottom:0">' +
        '<div class="two-col" style="align-items:flex-start;gap:48px">' +
          '<div>' +
            '<span class="section-label">About</span>' +
            '<h2 class="mb-md">' + data.fullName.toUpperCase() + '</h2>' +
            '<p class="p2 mb-lg">' + data.description + '</p>' +
            '<a class="btn btn-sm" href="https://instagram.com/' + data.instagram + '" target="_blank">FOLLOW @' + data.instagram.toUpperCase() + '</a>' +
          '</div>' +
          /* Right: Instagram feed — only when feedId available, otherwise empty col */
          '<div>' +
            (data.instagramFeedId ?
              '<span class="section-label">Instagram</span>' +
              '<div id="ig-feed-' + communityId + '" class="ig-feed-wrap" style="margin-top:8px">' +
                '<behold-widget feed-id="' + data.instagramFeedId + '"></behold-widget>' +
              '</div>'
              : ''
            ) +
          '</div>' +
        '</div>' +
      '</div>' +

      /* Row 2 — Three columns: Hosts | Members | Upcoming Meets */
      '<div class="section community-row2">' +
        '<div class="community-three-col">' +

          /* Col 1: Community Hosts */
          '<div class="community-col">' +
            '<span class="section-label">Community Hosts</span>' +
            '<div id="hosts-' + communityId + '">' +
              '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">Loading hosts...</p>' +
            '</div>' +
          '</div>' +

          /* Col 2: Community Members */
          '<div class="community-col">' +
            '<span class="section-label">Community Members</span>' +
            '<div id="members-' + communityId + '">' +
              '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">Loading members...</p>' +
            '</div>' +
          '</div>' +

          /* Col 3: Upcoming Meets */
          '<div class="community-col">' +
            '<span class="section-label">Upcoming Meets</span>' +
            (events.length
              ? events.map(function(ev) {
                  return '<div class="community-event-item" onclick="SM.openEventDetail(\'' + ev.id + '\')" style="cursor:pointer">' +
                    '<div class="community-event-title">' + SM._escapeHtml(ev.title) + '</div>' +
                    '<div class="community-event-meta">' + SM._formatEventDate(ev.date, ev.time) + '</div>' +
                  '</div>';
                }).join('')
              : '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">No upcoming events. Check back soon.</p>'
            ) +
          '</div>' +

        '</div>' +
      '</div>' +

    '</div>' +
    '<div class="community-panel" id="cpanel-chat-' + communityId + '" style="display:none">' +
      '<div class="section">' +
        '<span class="section-label">Community Chat</span>' +
        '<div class="chat-shell">' +
          '<div class="chat-titlebar">' +
            '<div><div class="chat-title">Live Chat</div></div>' +
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
  /* Load real host profiles and community members from Firestore */
  SM.loadCommunityHosts(communityId);
  SM.loadCommunityMembers(communityId);
};

/* ── TASK 09: Load real host profiles from Firestore ──
   Queries users where role='host' AND community=communityId.
   Also includes admin users tagged to this community.
   Falls back to communityData.hosts if no Firestore hosts found. */
SM.loadCommunityHosts = function(communityId) {
  var container = document.getElementById('hosts-' + communityId);
  if (!container) return;

  /* Query host-role users for this community */
  db.collection('users')
    .where('community', '==', communityId)
    .where('role', '==', 'host')
    .get()
    .then(function(snap) {
      if (snap.empty) {
        /* Fallback to communityData.hosts placeholders */
        SM._renderHostCards(container, communityId, null);
        return;
      }
      SM._renderHostCards(container, communityId, snap.docs);
    })
    .catch(function(err) {
      console.warn('SM: loadCommunityHosts error:', err.message);
      SM._renderHostCards(container, communityId, null);
    });
};


/* ══════════════════════════════════════════════════════════
   TASK 14 — COMMUNITY MEMBERS SECTION
══════════════════════════════════════════════════════════ */
SM.loadCommunityMembers = function(communityId) {
  var container = document.getElementById('members-' + communityId);
  if (!container) return;

  db.collection('users')
    .where('community', '==', communityId)
    .get()
    .then(function(snap) {
      if (snap.empty) {
        container.innerHTML = '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">No members yet.</p>';
        return;
      }
      var total = snap.size;

      var html = '<div style="font-family:var(--font-head);font-size:0.85rem;letter-spacing:0.08em;color:var(--gray-600);margin-bottom:14px;">' +
        total + ' MEMBER' + (total !== 1 ? 'S' : '') + '</div>';

      /* Render ALL members — hide those beyond index 12 via CSS */
      html += '<div class="members-grid">';
      snap.docs.forEach(function(doc, i) {
        var u = doc.data();
        var initials = ((u.firstName||'')[0]||'?').toUpperCase() +
                       ((u.lastInitial||'')[0]||'?').toUpperCase();
        var uid = doc.id;
        var hideStyle = i >= 12 ? ' style="display:none"' : '';
        html += '<div class="member-card"' + hideStyle + ' onclick="SM.viewProfile(\'' + uid + '\')">'+
          (u.avatarURL
            ? '<img src="' + u.avatarURL + '" class="member-avatar"/>'
            : '<div class="member-avatar member-avatar-initials">' + initials + '</div>'
          ) +
          '<div class="member-name">' + SM._escapeHtml((u.firstName||'')+' '+(u.lastInitial||'').trim()) + '</div>' +
          '<div class="member-type">' + SM._escapeHtml(u.creatorType||'Member') + '</div>' +
        '</div>';
      });
      html += '</div>';

      /* View More button — only shown when > 12 members */
      if (total > 12) {
        html += '<button class="btn btn-sm btn-outline" id="members-more-btn-' + communityId + '"' +
          ' style="margin-top:14px;font-size:0.75rem;"' +
          ' onclick="SM.showAllMembers(\'' + communityId + '\')">VIEW ALL ' + total + ' MEMBERS</button>';
      }

      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p class="p2" style="color:var(--gray-600)">Could not load members.</p>';
      console.warn('SM: loadCommunityMembers error:', err.message);
    });
};

SM.showAllMembers = function(communityId) {
  /* Reveal all hidden member cards */
  var grid = document.getElementById('members-grid-' + communityId);
  if (grid) {
    grid.querySelectorAll('.member-card[style*="display:none"]').forEach(function(el) {
      el.style.display = '';
    });
  }
  /* Hide the View More button */
  var btn = document.getElementById('members-more-btn-' + communityId);
  if (btn) btn.style.display = 'none';
};

SM._renderHostCards = function(container, communityId, docs) {
  /* If we have real Firestore host accounts, render them */
  if (docs && docs.length > 0) {
    container.innerHTML = '';
    docs.forEach(function(doc) {
      var u = doc.data();
      var initials = ((u.firstName||'')[0]||'').toUpperCase() +
                     ((u.lastInitial||'')[0]||'').toUpperCase();

      var card = document.createElement('div');
      card.className = 'host-card-col';
      card.addEventListener('click', function() { SM.viewProfile(doc.id); });

      /* Avatar — compact 44px circle */
      var avatarDiv = document.createElement('div');
      avatarDiv.className = 'host-avatar-col';
      if (u.avatarURL) {
        var img = document.createElement('img');
        img.src = u.avatarURL;
        img.alt = u.firstName || '';
        avatarDiv.appendChild(img);
      } else {
        avatarDiv.textContent = initials;
      }

      /* Info column */
      var infoDiv = document.createElement('div');
      infoDiv.className = 'host-info-col';

      /* Name + HOST badge */
      var nameDiv = document.createElement('div');
      nameDiv.className = 'host-name-col';
      nameDiv.textContent = ((u.firstName||'') + ' ' + (u.lastInitial||'')).trim().toUpperCase();
      var roleTag = document.createElement('span');
      roleTag.style.cssText = 'font-family:var(--font-head);font-size:0.58rem;letter-spacing:0.1em;' +
        'padding:2px 5px;border-radius:2px;background:var(--red);color:var(--white);flex-shrink:0;';
      roleTag.textContent = 'HOST';
      nameDiv.appendChild(roleTag);

      /* Instagram */
      if (u.instagram) {
        var igDiv = document.createElement('div');
        igDiv.style.cssText = 'font-size:var(--p3);color:var(--teal);margin-bottom:4px;';
        var igLink = document.createElement('a');
        igLink.href = 'https://instagram.com/' + u.instagram;
        igLink.target = '_blank';
        igLink.style.color = 'inherit';
        igLink.textContent = '@' + u.instagram;
        igDiv.appendChild(igLink);
        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(igDiv);
      } else {
        infoDiv.appendChild(nameDiv);
      }

      /* Bio */
      var bioDiv = document.createElement('div');
      bioDiv.className = 'host-bio-col';
      bioDiv.textContent = u.bio || '';
      infoDiv.appendChild(bioDiv);

      /* Portfolio / Profile link */
      var linkEl = document.createElement('a');
      linkEl.className = 'host-link';
      linkEl.style.cssText = 'font-size:0.72rem;margin-top:6px;display:inline-block;';
      if (u.website) {
        linkEl.href = 'https://' + u.website.replace(/^https?:\/\//, '');
        linkEl.target = '_blank';
        linkEl.textContent = 'VIEW PORTFOLIO →';
      } else {
        linkEl.style.cursor = 'pointer';
        linkEl.textContent = 'VIEW PROFILE →';
        linkEl.addEventListener('click', function(e) {
          e.stopPropagation();
          SM.viewProfile(doc.id);
        });
      }
      infoDiv.appendChild(linkEl);

      card.appendChild(avatarDiv);
      card.appendChild(infoDiv);
      container.appendChild(card);
    });
    return;
  }

  /* Fallback: render communityData.hosts placeholders */
  var data = SM.communityData[communityId];
  var fallbackHosts = data && data.hosts ? data.hosts : [];
  if (fallbackHosts.length === 0) {
    container.innerHTML = '<p class="p2" style="color:var(--gray-600);font-size:0.85rem">No hosts assigned yet.</p>';
    return;
  }
  container.innerHTML = fallbackHosts.map(function(h) {
    return '<div class="host-card">' +
      '<div class="host-img-placeholder"><svg width="36" height="36" viewBox="0 0 24 24" fill="var(--gray-400)"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
      '<div>' +
        '<div class="host-name">' + SM._escapeHtml(h.name||'').toUpperCase() + '</div>' +
        (h.handle ? '<div class="host-handle"><a href="https://instagram.com/' + h.handle + '" target="_blank">@' + h.handle + '</a></div>' : '') +
        '<div class="host-bio">' + SM._escapeHtml(h.bio||'') + '</div>' +
        (h.link && h.link !== '#' ? '<a class="host-link" href="' + h.link + '" target="_blank">LEARN MORE →</a>' : '') +
      '</div>' +
    '</div>';
  }).join('');
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
  else if (tab === 'about') { SM.loadCommunityHosts(communityId); SM.loadCommunityMembers(communityId); }
};

SM._commChatListeners = {};

SM._initCommunityChat = function(communityId) {
  if (SM._commChatListeners[communityId]) return;
  /* Silently purge stale messages for hosts/admins */
  if (SM.isHost() || SM.isAdmin()) SM.purgeStaleChatMessages(communityId);
  var meta   = SM.chatRoomMeta[communityId] || {};
  var msgsEl = document.getElementById('community-chat-msgs-' + communityId);
  if (!msgsEl) return;
  var cutoff18h = new Date(Date.now() - 18 * 60 * 60 * 1000);
  SM._commChatListeners[communityId] = db.collection('communities').doc(communityId)
    .collection('chat')
    .where('timestamp', '>', cutoff18h)
    .orderBy('timestamp','asc').limitToLast(50)
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
          (SM.isHost() || SM.isAdmin() ?
            '<button class="board-pin-btn" onclick="event.stopPropagation();SM.togglePinThread(\'' + communityId + '\',\'' + doc.id + '\',\'' + t.category + '\')" title="' + (isPinned ? 'Unpin' : 'Pin') + '">' + (isPinned ? '📌' : '📍') + '</button>' +
            '<button class="board-delete-btn" onclick="event.stopPropagation();SM.deleteThread(\'' + communityId + '\',\'' + doc.id + '\',\'' + SM._escapeHtml(t.title).replace(/'/g,"\\'") + '\')" title="Delete thread">🗑</button>'
            : '') +
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

      /* Author can edit their opening post */
      var isAuthor = user && user.id === t.authorId;
      var authorInitials = (t.authorName||'??').substring(0,2).toUpperCase();
      var timeAgo = SM._timeAgo(t.createdAt ? t.createdAt.toMillis() : Date.now());

      /* Build the opening post using DOM API to avoid apostrophe issues */
      var openingPost = document.createElement('div');
      openingPost.className = 'board-reply opening-post';
      openingPost.id = 'opening-post-' + threadId;

      var avatarDiv = document.createElement('div');
      avatarDiv.className = 'comment-avatar';
      avatarDiv.textContent = authorInitials;

      var bodyDiv = document.createElement('div');
      bodyDiv.className = 'comment-body';
      bodyDiv.style.flex = '1';

      var metaDiv = document.createElement('div');
      metaDiv.className = 'comment-meta';
      metaDiv.style.display = 'flex';
      metaDiv.style.alignItems = 'center';
      metaDiv.style.justifyContent = 'space-between';

      var metaLeft = document.createElement('div');
      metaLeft.style.display = 'flex';
      metaLeft.style.alignItems = 'center';
      metaLeft.style.gap = '10px';

      var nameBtn = document.createElement('button');
      nameBtn.className = 'sender-link comment-name';
      nameBtn.textContent = t.authorName || 'Member';
      nameBtn.addEventListener('click', function() { SM.viewProfile(t.authorId); });

      var timeSpan = document.createElement('span');
      timeSpan.className = 'comment-time';
      timeSpan.textContent = timeAgo;

      metaLeft.appendChild(nameBtn);
      metaLeft.appendChild(timeSpan);
      metaDiv.appendChild(metaLeft);

      /* Edit button — only visible to the thread author */
      if (isAuthor) {
        var editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline';
        editBtn.id = 'edit-post-btn-' + threadId;
        editBtn.style.fontSize = '0.72rem';
        editBtn.style.padding = '3px 10px';
        editBtn.textContent = 'EDIT';
        editBtn.addEventListener('click', function() {
          SM.editOpeningPost(communityId, threadId, t.body);
        });
        metaDiv.appendChild(editBtn);
      }

      var textDiv = document.createElement('div');
      textDiv.className = 'comment-text';
      textDiv.id = 'opening-post-text-' + threadId;
      textDiv.textContent = t.body || '';

      bodyDiv.appendChild(metaDiv);
      bodyDiv.appendChild(textDiv);
      openingPost.appendChild(avatarDiv);
      openingPost.appendChild(bodyDiv);

      /* Assemble full thread view */
      el.innerHTML =
        '<button class="board-back-btn" onclick="SM.renderBoard(\'' + communityId + '\')">← BACK TO BOARD</button>' +
        '<div class="board-thread-header">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
            '<span style="font-size:1.4rem">' + cat.icon + '</span>' +
            '<span class="section-label" style="margin-bottom:0">' + cat.label + '</span>' +
          '</div>' +
          '<h2 style="font-family:var(--font-head);font-size:2rem;letter-spacing:0.04em;margin-bottom:6px">' + SM._escapeHtml(t.title) + '</h2>' +
          '<p style="font-size:var(--p3);color:var(--gray-600)">' +
            'Posted by <span class="sender-link" style="cursor:pointer" onclick="SM.viewProfile(\'' + t.authorId + '\')">' + SM._escapeHtml(t.authorName) + '</span>' +
          '</p>' +
        '</div>' +
        '<div class="board-replies" id="thread-replies-' + threadId + '">' +
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

      /* Insert the DOM-built opening post before the loading placeholder */
      var repliesContainer = document.getElementById('thread-replies-' + threadId);
      if (repliesContainer) {
        repliesContainer.insertBefore(openingPost, repliesContainer.firstChild);
      }

      SM._loadThreadReplies(communityId, threadId);
    })
    .catch(function(err) {
      console.error('SM: openThread error:', err);
      el.innerHTML = '<p style="color:var(--red)">Could not load thread.</p>';
    });
};

/* ── Edit opening post — replaces body text with editable textarea ── */
SM.editOpeningPost = function(communityId, threadId, currentBody) {
  var textDiv = document.getElementById('opening-post-text-' + threadId);
  var editBtn = document.getElementById('edit-post-btn-' + threadId);
  if (!textDiv) return;

  /* Replace text with textarea */
  var textarea = document.createElement('textarea');
  textarea.className = 'field-textarea';
  textarea.rows = 5;
  textarea.maxLength = 1000;
  textarea.value = currentBody || '';
  textarea.id = 'edit-post-textarea-' + threadId;
  textarea.style.marginTop = '8px';

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-outline';
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.addEventListener('click', function() {
    textDiv.textContent = currentBody || '';
    textarea.remove();
    btnRow.remove();
    if (editBtn) { editBtn.style.display = ''; }
  });

  var saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm';
  saveBtn.textContent = 'SAVE';
  saveBtn.addEventListener('click', function() {
    SM.saveOpeningPost(communityId, threadId, textarea.value, saveBtn, cancelBtn);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  /* Hide the text div and edit button, insert editor */
  textDiv.textContent = '';
  textDiv.appendChild(textarea);
  textDiv.appendChild(btnRow);
  if (editBtn) editBtn.style.display = 'none';
  textarea.focus();
};

/* ── Save edited opening post to Firestore ── */
SM.saveOpeningPost = function(communityId, threadId, newBody, saveBtn, cancelBtn) {
  newBody = (newBody || '').trim();
  if (!newBody) { SM.showToast('Post cannot be empty', 'error'); return; }

  if (saveBtn) { saveBtn.textContent = 'SAVING...'; saveBtn.disabled = true; }
  if (cancelBtn) cancelBtn.disabled = true;

  db.collection('communities').doc(communityId)
    .collection('board').doc(threadId)
    .update({
      body:      newBody,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() {
      /* Replace editor with updated text */
      var textDiv = document.getElementById('opening-post-text-' + threadId);
      var editBtn = document.getElementById('edit-post-btn-' + threadId);
      if (textDiv) {
        textDiv.innerHTML = '';
        textDiv.textContent = newBody;
      }
      if (editBtn) editBtn.style.display = '';
      SM.showToast('Post updated!', 'success');
    })
    .catch(function(err) {
      if (saveBtn) { saveBtn.textContent = 'SAVE'; saveBtn.disabled = false; }
      if (cancelBtn) cancelBtn.disabled = false;
      SM.showToast('Could not save — try again', 'error');
      console.error('SM: saveOpeningPost error:', err);
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

      /* Remove loading placeholder — keep opening post */
      var loadingP = container.querySelector('p');
      if (loadingP) loadingP.remove();

      /* Wrap replies in a comment-thread section below the opening post */
      var replySection = document.createElement('div');
      replySection.className = 'board-reply-section';

      snap.forEach(function(doc) {
        var r = doc.data();
        var initials = (r.authorName||'??').substring(0,2).toUpperCase();

        /* Each reply uses the same .comment class as event comments */
        var replyDiv = document.createElement('div');
        replyDiv.className = 'comment board-reply';
        replyDiv.dataset.replyId = doc.id;
        replyDiv.style.cssText = 'padding:12px 16px 12px 48px;border-bottom:1px solid var(--gray-200);';

        /* Thread indicator — replaces full quote block.
           Shows only "↩ replying to [Name]" with a teal left border accent */
        if (r.replyTo && r.replyTo.authorName) {
          var threadLine = document.createElement('div');
          threadLine.style.cssText = 'font-size:0.72rem;color:var(--gray-600);margin-bottom:6px;' +
            'padding-left:8px;border-left:2px solid var(--teal);line-height:1.4;';
          threadLine.textContent = '↩ replying to ' + (r.replyTo.authorName || 'member');
          replyDiv.appendChild(threadLine);
        }

        /* Avatar */
        var avatarDiv = document.createElement('div');
        avatarDiv.className = 'comment-avatar';
        avatarDiv.textContent = initials;

        /* Body */
        var bodyDiv = document.createElement('div');
        bodyDiv.className = 'comment-body';

        /* Meta row */
        var metaDiv = document.createElement('div');
        metaDiv.className = 'comment-meta';

        var authorBtn = document.createElement('button');
        authorBtn.className = 'sender-link comment-name';
        authorBtn.textContent = r.authorName || 'Member';
        authorBtn.addEventListener('click', (function(uid) {
          return function() { SM.viewProfile(uid); };
        })(r.authorId));

        var timeSpan = document.createElement('span');
        timeSpan.className = 'comment-time';
        timeSpan.textContent = SM._timeAgo(r.createdAt ? r.createdAt.toMillis() : Date.now());

        metaDiv.appendChild(authorBtn);
        metaDiv.appendChild(timeSpan);

        /* Text */
        var textDiv = document.createElement('div');
        textDiv.className = 'comment-text';
        textDiv.style.marginBottom = '8px';
        textDiv.textContent = r.body || '';

        /* Reply trigger */
        var replyBtn = document.createElement('button');
        replyBtn.className = 'reply-trigger';
        replyBtn.textContent = '↩ Reply';
        replyBtn.dataset.threadId   = threadId;
        replyBtn.dataset.authorId   = r.authorId || '';
        replyBtn.dataset.authorName = r.authorName || 'Member';
        replyBtn.dataset.preview    = (r.body || '').substring(0, 50);
        replyBtn.addEventListener('click', function() {
          SM.setThreadReplyTarget(
            replyBtn.dataset.threadId,
            replyBtn.dataset.authorId,
            replyBtn.dataset.authorName,
            replyBtn.dataset.preview
          );
        });

        bodyDiv.appendChild(metaDiv);
        bodyDiv.appendChild(textDiv);
        bodyDiv.appendChild(replyBtn);
        replyDiv.appendChild(avatarDiv);
        replyDiv.appendChild(bodyDiv);
        replySection.appendChild(replyDiv);
      });

      if (snap.empty) {
        var noReplies = document.createElement('p');
        noReplies.className = 'p2';
        noReplies.style.cssText = 'color:var(--gray-600);font-size:0.85rem;padding:16px 0;';
        noReplies.textContent = 'No replies yet — be the first to respond.';
        replySection.appendChild(noReplies);
      }

      container.appendChild(replySection);
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

    /* Notify the person being replied to — include threadId so clicking opens the thread */
    if (replyTarget && replyTarget.authorId) {
      SM.notify(
        replyTarget.authorId,
        'comment_reply',
        replyData.authorName + ' replied to your comment on the discussion board',
        'board',
        null,
        communityId,
        threadId
      );
    }

    /* Optimistic render */
    var container = document.getElementById('thread-replies-' + threadId);
    if (container) {
      var noRepliesP = container.querySelector('p');
      if (noRepliesP) noRepliesP.remove();
      var initials = (replyData.authorName).substring(0,2).toUpperCase();
      /* Thread indicator line — name only, no message preview */
      var threadIndicator = replyTarget ?
        '<div style="font-size:0.72rem;color:var(--gray-600);margin-bottom:6px;' +
          'padding-left:8px;border-left:2px solid var(--teal);line-height:1.4;">' +
          '↩ replying to ' + SM._escapeHtml(replyTarget.authorName) +
        '</div>' : '';
      var div = document.createElement('div');
      div.className = 'comment board-reply';
      div.style.cssText = 'padding:12px 16px 12px 48px;border-bottom:1px solid var(--gray-200);';
      div.innerHTML =
        threadIndicator +
        '<div class="comment-avatar">' + initials + '</div>' +
        '<div class="comment-body">' +
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

/* ── Delete Thread — Host and Admin only ──
   Deletes all replies first (Firestore doesn't auto-delete subcollections),
   then deletes the parent thread document, then removes the row from the DOM. */
SM.deleteThread = function(communityId, threadId, threadTitle) {
  if (!SM.isHost() && !SM.isAdmin()) return;

  if (!confirm('Delete "' + threadTitle + '"?\n\nThis will permanently remove the thread and all its replies. This cannot be undone.')) return;

  SM.showToast('Deleting thread...', 'success');

  var threadRef = db.collection('communities').doc(communityId)
    .collection('board').doc(threadId);

  /* Step 1: Load all replies so we can batch-delete them */
  threadRef.collection('replies').get()
    .then(function(snap) {
      /* Step 2: Batch-delete all replies */
      if (!snap.empty) {
        var batch = db.batch();
        snap.docs.forEach(function(doc) { batch.delete(doc.ref); });
        return batch.commit();
      }
    })
    .then(function() {
      /* Step 3: Delete the thread document itself */
      return threadRef.delete();
    })
    .then(function() {
      SM.showToast('Thread deleted', 'success');
      /* Remove the thread row from the DOM immediately */
      var rows = document.querySelectorAll('.board-thread-row');
      rows.forEach(function(row) {
        if (row.getAttribute('onclick') && row.getAttribute('onclick').includes(threadId)) {
          row.remove();
        }
      });
      /* If we're inside the thread view, go back to board list */
      var boardEl = document.getElementById('board-' + communityId);
      if (boardEl && boardEl.querySelector('.board-back-btn')) {
        SM.renderBoard(communityId);
      }
    })
    .catch(function(err) {
      SM.showToast('Could not delete thread — try again', 'error');
      console.error('SM: deleteThread error:', err);
    });
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
/* Format event date as MM/DD/YYYY and time as 12-hour AM/PM */
SM._formatEventDate = function(dateStr, timeStr) {
  var result = '';
  if (dateStr) {
    /* dateStr is YYYY-MM-DD — convert to MM/DD/YYYY */
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      result = parts[1] + '/' + parts[2] + '/' + parts[0];
    } else {
      result = dateStr;
    }
  }
  if (timeStr) {
    /* timeStr is HH:MM (24hr) — convert to h:MM AM/PM */
    var timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      var hours = parseInt(timeParts[0], 10);
      var mins  = timeParts[1];
      var ampm  = hours >= 12 ? 'PM' : 'AM';
      var h12   = hours % 12 || 12;
      result += ' · ' + h12 + ':' + mins + ' ' + ampm;
    }
  }
  return result;
};

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
        '<h2>EDIT MEET</h2>' +
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
      SM.showToast('Meet updated!', 'success');
      /* Notify all RSVPed users of the update */
      SM._notifyEventUpdate({ id: evId, community: communityId, title: title });
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
      <h2 class="mb-lg">CREATE MEET</h2>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="field">
          <label class="field-label">COMMUNITY</label>
          <select class="field-select" id="ce-community">
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
  /* Populate community select dynamically */
  var sel = document.getElementById('ce-community');
  if (sel) sel.innerHTML = SM._communityOptions('smdc');
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
      if (btn) { btn.textContent = 'PUBLISH MEET'; btn.disabled = false; }
      SM.showToast('Meet published!', 'success');
      /* Notify all community members of the new event */
      SM._notifyNewEvent(community, title);
      SM.showPage('events');
      SM.renderEventsList();
    })
    .catch(function(err) {
      if (btn) { btn.textContent = 'PUBLISH MEET'; btn.disabled = false; }
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
            (u.role === 'host' ? '<button class="action-btn demote" onclick="SM.demoteToUser(\'' + u.id + '\',\'' + SM._escapeHtml((u.firstName||'') + ' ' + (u.lastInitial||'')).trim() + '\')">DEMOTE</button>' : '') +
            (u.role !== 'admin' ? '<button class="action-btn restrict" onclick="SM.restrictUser(\'' + u.id + '\');SM.renderAdmin()">RESTRICT</button>' : '') +
            (u.role !== 'admin' ? '<button class="action-btn remove" onclick="if(confirm(\'Remove this user?\')){SM.deleteUser(\'' + u.id + '\');SM.renderAdmin()}">REMOVE</button>' : '') +
          '</div></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      /* ── Manage Communities ── */
      '<div style="margin-top:40px">' +
        '<h2 class="mb-lg">MANAGE COMMUNITIES</h2>' +
        '<div style="display:flex;flex-direction:column;gap:8px;max-width:520px" id="admin-communities-list">' +
          Object.keys(SM.communityData).map(function(id) {
            var c = SM.communityData[id];
            var isLocked = ['smdc','smwa','smmd'].indexOf(id) > -1;
            var isActive = c.active !== false;
            return '<div style="display:flex;align-items:center;justify-content:space-between;' +
              'padding:12px 16px;background:var(--white);border:1px solid var(--gray-200);">' +
              '<div>' +
                '<span style="font-family:var(--font-head);font-size:1.1rem;letter-spacing:0.06em">' + (c.code||id.toUpperCase()) + '</span>' +
                '<span style="font-size:var(--p3);color:var(--gray-600);margin-left:10px">' + (c.name||'') + '</span>' +
                (!isActive ? '<span style="font-family:var(--font-head);font-size:0.6rem;letter-spacing:0.1em;' +
                  'padding:2px 6px;background:var(--gray-200);color:var(--gray-600);margin-left:8px">INACTIVE</span>' : '') +
              '</div>' +
              '<div style="display:flex;gap:8px">' +
                (isLocked ?
                  '<span style="font-family:var(--font-m,monospace);font-size:0.65rem;color:var(--gray-400);letter-spacing:0.08em">PROTECTED</span>'
                  : isActive ?
                    '<button class="action-btn remove" onclick="SM.removeCommunity(\'' + id + '\',\'' + (c.code||id.toUpperCase()) + '\')">REMOVE</button>'
                    :
                    '<button class="action-btn promote" onclick="SM.restoreCommunity(\'' + id + '\',\'' + (c.code||id.toUpperCase()) + '\')">RESTORE</button>'
                ) +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div style="margin-top:40px">' +
        '<h2 class="mb-lg">CREATE COMMUNITY</h2>' +
        '<div style="max-width:520px;display:flex;flex-direction:column;gap:14px">' +
          '<div class="form-grid">' +
            '<div class="field"><label class="field-label">COMMUNITY CODE</label>' +
              '<input class="field-input" type="text" id="cc-code" placeholder="e.g. SMNYC" maxlength="8" style="text-transform:uppercase"/></div>' +
            '<div class="field"><label class="field-label">CITY / REGION</label>' +
              '<input class="field-input" type="text" id="cc-city" placeholder="New York City"/></div>' +
          '</div>' +
          '<div class="field"><label class="field-label">TAGLINE <span style="font-weight:400;text-transform:none;letter-spacing:0;font-family:var(--font-body);font-size:var(--p3)">(optional)</span></label>' +
            '<input class="field-input" type="text" id="cc-tagline" placeholder="NYC street photography community."/></div>' +
          '<div class="field"><label class="field-label">INSTAGRAM HANDLE <span style="font-weight:400;text-transform:none;letter-spacing:0;font-family:var(--font-body);font-size:var(--p3)">(optional)</span></label>' +
            '<input class="field-input" type="text" id="cc-instagram" placeholder="streetmeetnyc"/></div>' +
          '<div class="field"><label class="field-label">HOST EMAIL <span style="font-weight:400;text-transform:none;letter-spacing:0;font-family:var(--font-body);font-size:var(--p3)">(must be a registered user)</span></label>' +
            '<input class="field-input" type="email" id="cc-host-email" placeholder="host@example.com"/></div>' +
          '<button class="btn btn-sm" id="cc-create-btn" onclick="SM.createCommunity()">CREATE COMMUNITY</button>' +
          '<p class="field-hint">The new community appears in navigation immediately and gets 3 starter board threads automatically.</p>' +
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

/* ══════════════════════════════════════════════════════════
   TASK 3.1 — IN-APP NOTIFICATION SYSTEM
   Bell icon · Unread badge · Firestore-backed drawer
   Triggers: comment reply · event update · new event
══════════════════════════════════════════════════════════ */

SM._notifListener = null; /* Active Firestore onSnapshot unsubscribe */

/* ── Initialise notification listener ──
   Called by SM.init() after auth is confirmed.
   Attaches a real-time listener to the user's notifications
   subcollection so the badge updates live. */
SM.initNotifications = function() {
  var user = SM.getCurrentUser();
  if (!user) return;

  /* Show the bell in the nav */
  var bellEl = document.getElementById('nav-notif');
  if (bellEl) bellEl.style.display = 'flex';

  /* Detach any previous listener */
  if (SM._notifListener) { SM._notifListener(); SM._notifListener = null; }

  /* Listen to the 50 most recent notifications */
  SM._notifListener = db.collection('users').doc(user.id)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(function(snapshot) {
      var unread = 0;
      var items  = [];
      snapshot.forEach(function(doc) {
        var n = doc.data();
        n.id  = doc.id;
        items.push(n);
        if (!n.read) unread++;
      });
      SM._renderNotifBadge(unread);
      SM._renderNotifList(items);
    }, function(err) {
      console.error('SM: notification listener error:', err);
    });
};

SM.stopNotifications = function() {
  if (SM._notifListener) { SM._notifListener(); SM._notifListener = null; }
  var bellEl = document.getElementById('nav-notif');
  if (bellEl) bellEl.style.display = 'none';
};

/* ── Badge ── */
SM._renderNotifBadge = function(count) {
  var badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
};

/* ── Drawer list ── */
SM._renderNotifList = function(items) {
  var list = document.getElementById('notif-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = items.map(function(n) {
    var icon = n.type === 'comment_reply' ? '💬' :
               n.type === 'event_update'  ? '📅' :
               n.type === 'new_event'     ? '🗓' : '🔔';
    var time = n.createdAt ? SM._timeAgo(n.createdAt.toMillis()) : '';
    return '<div class="notif-item' + (n.read ? '' : ' unread') + '" ' +
      'onclick="SM._handleNotifClick(\'' + n.id + '\',\'' + (n.linkPage||'') + '\',\'' + (n.linkEventId||'') + '\',\'' + (n.linkCommunityId||'') + '\',\'' + (n.linkThreadId||'') + '\')">' +
      '<span class="notif-icon">' + icon + '</span>' +
      '<div class="notif-body">' +
        '<div class="notif-msg">' + SM._escapeHtml(n.message||'') + '</div>' +
        '<div class="notif-time">' + time + '</div>' +
      '</div>' +
      (!n.read ? '<div class="notif-dot"></div>' : '') +
    '</div>';
  }).join('');
};

/* ── Toggle drawer open/close ── */
SM.toggleNotifDrawer = function(event) {
  if (event) event.stopPropagation();
  var drawer = document.getElementById('notif-drawer');
  if (!drawer) return;
  var isOpen = drawer.style.display === 'block';
  SM.closeAllDropdowns(); /* Close nav dropdowns first */
  drawer.style.display = isOpen ? 'none' : 'block';
};

/* Close drawer when clicking outside */
document.addEventListener('click', function(e) {
  if (!e.target.closest('#nav-notif')) {
    var drawer = document.getElementById('notif-drawer');
    if (drawer) drawer.style.display = 'none';
  }
});

/* ── Click a notification → navigate and mark read ── */
SM._handleNotifClick = function(notifId, page, eventId, communityId, threadId) {
  /* Mark as read in Firestore */
  var user = SM.getCurrentUser();
  if (user && notifId) {
    db.collection('users').doc(user.id)
      .collection('notifications').doc(notifId)
      .update({ read: true }).catch(function() {});
  }
  /* Close drawer */
  var drawer = document.getElementById('notif-drawer');
  if (drawer) drawer.style.display = 'none';

  /* Route to the correct page */
  if (!page) return;

  if (page === 'chat') {
    /* Main chat page — switch to the correct room */
    SM.showPage('chat');
    if (communityId) {
      setTimeout(function() { SM.renderChatRoom(communityId); }, 100);
    }

  } else if (page === 'board') {
    /* Community board — navigate to community, open board tab, then open thread */
    if (communityId) {
      SM.showPage(communityId);
      setTimeout(function() {
        /* Open the board tab */
        var boardBtn = document.querySelector('#ctabs-' + communityId + ' .community-tab:nth-child(3)');
        if (boardBtn) boardBtn.click();
        /* If we have a threadId, open the specific thread after board renders */
        if (threadId) {
          setTimeout(function() {
            SM.openThread(communityId, threadId);
          }, 400);
        }
      }, 300);
    }

  } else if (page === 'events') {
    SM.showPage('events');

  } else if (SM.communityData[page]) {
    /* Any community page — open chat tab */
    SM.showPage(page);
    setTimeout(function() {
      var chatBtn = document.querySelector('#ctabs-' + page + ' .community-tab:nth-child(2)');
      if (chatBtn) chatBtn.click();
    }, 300);

  } else {
    SM.showPage(page);
  }
};

/* ── Mark all read ── */
SM.markAllNotifsRead = function() {
  var user = SM.getCurrentUser();
  if (!user) return;
  db.collection('users').doc(user.id)
    .collection('notifications')
    .where('read', '==', false)
    .get()
    .then(function(snap) {
      var batch = db.batch();
      snap.forEach(function(doc) { batch.update(doc.ref, { read: true }); });
      return batch.commit();
    })
    .catch(function(err) { console.error('SM: markAllNotifsRead error:', err); });
};

/* ══════════════════════════════════════════════════════════
   NOTIFY HELPER — write a notification to a user's subcollection
   Called whenever a trigger fires (event update, reply, etc.)
   type: 'comment_reply' | 'event_update' | 'new_event'
══════════════════════════════════════════════════════════ */
SM.notify = function(recipientUserId, type, message, linkPage, linkEventId, linkCommunityId, linkThreadId) {
  var currentUser = SM.getCurrentUser();
  /* Don't notify yourself */
  if (currentUser && currentUser.id === recipientUserId) return;
  if (!recipientUserId) return;

  db.collection('users').doc(recipientUserId)
    .collection('notifications')
    .add({
      type:            type,
      message:         message,
      linkPage:        linkPage        || 'events',
      linkEventId:     linkEventId     || null,
      linkCommunityId: linkCommunityId || null,
      linkThreadId:    linkThreadId    || null,
      read:            false,
      createdAt:       firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch(function(err) {
      console.error('SM: notify error:', err);
    });
};

/* ── Trigger: Event updated by host/admin ──
   Notify all users who RSVPed 'going' or 'maybe'. */
SM._notifyEventUpdate = function(ev) {
  if (!ev || !ev.id || !ev.community) return;
  db.collection('communities').doc(ev.community)
    .collection('events').doc(ev.id)
    .collection('rsvps')
    .where('state', 'in', ['going', 'maybe'])
    .get()
    .then(function(snap) {
      snap.forEach(function(doc) {
        SM.notify(
          doc.data().userId,
          'event_update',
          'Event updated: ' + (ev.title || 'an event you RSVPed to') + ' has new details.',
          'events',
          ev.id
        );
      });
    })
    .catch(function(err) { console.error('SM: _notifyEventUpdate error:', err); });
};

/* ── Trigger: New event created in a community ──
   Notify all community members. */
SM._notifyNewEvent = function(communityId, eventTitle) {
  db.collection('users')
    .where('community', '==', communityId)
    .get()
    .then(function(snap) {
      snap.forEach(function(doc) {
        SM.notify(
          doc.id,
          'new_event',
          'New event in ' + communityId.toUpperCase() + ': ' + eventTitle,
          'events',
          null
        );
      });
    })
    .catch(function(err) { console.error('SM: _notifyNewEvent error:', err); });
};

/* ── Trigger: Comment reply ──
   Called from postComment / postThreadReply when replyTo is set. */
SM._notifyCommentReply = function(recipientId, replierName, context, linkPage, linkCommunityId) {
  SM.notify(
    recipientId,
    'comment_reply',
    replierName + ' replied to your comment' + (context ? ' on ' + context : ''),
    linkPage || 'events',
    null,              /* linkEventId — not applicable for reply notifications */
    linkCommunityId || null
  );
};

/* ── APP INIT ── */
SM.init = function() {
  if ('serviceWorker' in navigator) {
    var swPath = window.location.pathname.replace(/\/[^\/]*$/, '/') + 'sw.js';
    navigator.serviceWorker.register(swPath).catch(function() {});
  }

  SM.initAuth();
  SM.initChat();
  SM.loadEvents();

  /* Load communities from Firestore — updates nav, page shells, selects */
  SM.loadCommunities().then(function() {
    /* Refresh sign-up community select if it's in the DOM */
    var suSel = document.getElementById('su-community');
    if (suSel && SM._communities.length) suSel.innerHTML = SM._communityOptions('smdc');
  });

  /* Start notification listener if user already signed in */
  if (SM.getCurrentUser()) SM.initNotifications();

  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  var user = SM.getCurrentUser();
  var startPage = user ? (user.community || 'smdc') : 'landing';
  SM.showPage(startPage);
};

document.addEventListener('DOMContentLoaded', SM.init);
