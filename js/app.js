/* ============================================================
   STREETMEET — MAIN APP
   Page routing, nav, events, RSVP, profile management
   ============================================================ */

const SM = window.SM = window.SM || {};

/* ── EVENTS DATA ── */
SM.events = [
  {
    id: 'ev_001', community: 'smdc', communityLabel: 'StreetMeet DC',
    title: 'Golden Hour Edition — Adams Morgan',
    date: '2026-04-26', time: '17:30',
    address: 'Columbia Rd NW & 18th St NW, Washington, DC 20009',
    description: "We're looking forward to seeing everyone at the next StreetMeet. RSVP to receive updates! Golden hour hits around 7:30 — bring your wide glass and come ready to create.",
    photo: null,
    going: ['k3vinwayne','devantecapers','jordanm','micaelb','lenapr'],
    maybe: ['tashar','swaysview'],
    notgoing: ['pnwframes'],
    comments: [
      { user: 'damienh', text: "What's parking like for this meet?", time: '2h ago', replies: 4 },
      { user: 'juliant', text: 'Where we grabbing food after?', time: '1h ago', replies: 7 },
      { user: 'anthonyA', text: 'My first StreetMeet, any tips?', time: '45m ago', replies: 15 },
    ]
  },
  {
    id: 'ev_002', community: 'smdc', communityLabel: 'StreetMeet DC',
    title: 'Navy Yard Shoot — May Edition',
    date: '2026-05-17', time: '14:00',
    address: '1239 1st St SE, Washington, DC 20003',
    description: 'Join us at the waterfront for our May meet. Lots of great architectural shots and people watching. All skill levels welcome.',
    photo: null,
    going: ['k3vinwayne','jordanm'],
    maybe: ['tashar'],
    notgoing: [],
    comments: []
  },
  {
    id: 'ev_003', community: 'smwa', communityLabel: 'StreetMeet WA',
    title: 'Capitol Hill Street Session',
    date: '2026-05-03', time: '16:00',
    address: 'Broadway & E Pike St, Seattle, WA 98122',
    description: 'Pacific Northwest creatives come together on Capitol Hill. Rain gear optional, good vibes mandatory.',
    photo: null,
    going: ['pacificleo','seattleshooter'],
    maybe: ['rainierrach'],
    notgoing: [],
    comments: []
  },
  {
    id: 'ev_004', community: 'smmd', communityLabel: 'StreetMeet MD',
    title: 'Inner Harbor Golden Hour',
    date: '2026-05-10', time: '18:00',
    address: '201 E Pratt St, Baltimore, MD 21202',
    description: "Baltimore's Inner Harbor at golden hour is something special. Come through and let's create together.",
    photo: null,
    going: ['baltframes'],
    maybe: ['crabcakecam','mdcreates'],
    notgoing: [],
    comments: []
  }
];

SM.rsvpState = {};

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
    case 'home': SM.renderHomeEvents(); break;
    case 'events': SM.renderEventsList(); break;
    case 'chat': SM.initChat(); SM.renderChatRoom(SM.currentRoom || 'smdc'); break;
    case 'profile': SM.renderProfile(); break;
    case 'edit-profile': SM.renderEditProfile(); break;
    case 'admin': SM.renderAdmin(); break;
    case 'smdc': SM.renderCommunityPage('smdc'); break;
    case 'smwa': SM.renderCommunityPage('smwa'); break;
    case 'smmd': SM.renderCommunityPage('smmd'); break;
  }
};

/* ── NAV ── */
SM.updateNav = function(activePageId) {
  const user = SM.getCurrentUser();
  const navLinksEl = document.getElementById('nav-links');
  const navUserEl = document.getElementById('nav-user');
  if (!navLinksEl) return;

  navLinksEl.innerHTML = '';
  if (navUserEl) navUserEl.innerHTML = '';

  if (!user) {
    navLinksEl.innerHTML = `
      <a class="nav-link" onclick="SM.showPage('landing')">Welcome</a>
    `;
    if (navUserEl) navUserEl.innerHTML = `
      <button class="btn btn-sm btn-outline-white" onclick="SM.showPage('landing')">SIGN IN</button>
    `;
    return;
  }

  // Base links for all users
  let links = `
    <a class="nav-link${activePageId === 'home' ? ' active' : ''}" onclick="SM.showPage('home')">Home</a>
    <div class="nav-dropdown">
      <a class="nav-link">Communities ▾</a>
      <div class="nav-dropdown-menu">
        <a class="nav-dropdown-item" onclick="SM.showPage('smdc')">SMDC — Washington D.C.</a>
        <a class="nav-dropdown-item" onclick="SM.showPage('smwa')">SMWA — Washington State</a>
        <a class="nav-dropdown-item" onclick="SM.showPage('smmd')">SMMD — Maryland</a>
      </div>
    </div>
    <a class="nav-link${activePageId === 'events' ? ' active' : ''}" onclick="SM.showPage('events')">Events</a>
    <a class="nav-link${activePageId === 'chat' ? ' active' : ''}" onclick="SM.showPage('chat')">Chat</a>
  `;
  if (SM.isHost()) {
    links += `<a class="nav-link" onclick="SM.showPage('create-event')">+ Event</a>`;
  }
  if (SM.isAdmin()) {
    links += `<a class="nav-link${activePageId === 'admin' ? ' active' : ''}" onclick="SM.showPage('admin')">Admin</a>`;
  }
  navLinksEl.innerHTML = links;

  if (navUserEl) {
    const initials = (user.firstName[0] + (user.lastInitial[0] || '')).toUpperCase();
    navUserEl.innerHTML = `
      <div class="nav-dropdown">
        <div class="nav-avatar">${initials}</div>
        <div class="nav-dropdown-menu" style="right:0;left:auto">
          <a class="nav-dropdown-item" onclick="SM.showPage('profile')">My Profile</a>
          <a class="nav-dropdown-item" onclick="SM.showPage('edit-profile')">Edit Profile</a>
          <a class="nav-dropdown-item" onclick="SM.logout()" style="color:rgba(255,100,100,0.8)">Sign Out</a>
        </div>
      </div>
    `;
  }
};

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
  const user = SM.getCurrentUser();
  if (!user) return;
  const container = document.getElementById('home-events');
  if (!container) return;
  const communityEvents = SM.events.filter(e => e.community === user.community);
  container.innerHTML = communityEvents.length ? communityEvents.map(SM.renderEventCard).join('') : '<p class="p2" style="color:var(--gray-600)">No upcoming events. Check back soon.</p>';
};

/* ── RENDER EVENTS LIST ── */
SM.renderEventsList = function() {
  const container = document.getElementById('all-events');
  if (!container) return;
  container.innerHTML = SM.events.map(SM.renderEventCard).join('');
};

/* ── EVENT CARD HTML ── */
SM.renderEventCard = function(ev) {
  const d = new Date(ev.date + 'T' + ev.time);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const rsvpState = SM.rsvpState[ev.id] || '';
  const calLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${ev.date.replace(/-/g,'')}T${ev.time.replace(':','')}00/${ev.date.replace(/-/g,'')}T200000&details=${encodeURIComponent(ev.description)}&location=${encodeURIComponent(ev.address)}`;
  const mapLink = `https://maps.google.com/?q=${encodeURIComponent(ev.address)}`;
  return `
    <div class="event-card" id="event-card-${ev.id}">
      <div class="event-card-img">
        <div class="event-card-img-placeholder">
          <div style="font-family:var(--font-head);font-size:4rem;color:rgba(255,255,255,0.08);letter-spacing:0.1em">${ev.community.toUpperCase()}</div>
        </div>
        <div class="event-card-badge"><span class="tag tag-red">UPCOMING</span></div>
      </div>
      <div class="event-card-body">
        <div class="event-card-community">${ev.communityLabel}</div>
        <div class="event-card-title">${ev.title}</div>
        <div class="event-meta-item">
          <svg class="event-meta-icon" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          <div>
            <div style="font-size:var(--p3)">${ev.address}</div>
            <button class="event-meta-link" onclick="window.open('${mapLink}','_blank')">Open in Maps →</button>
          </div>
        </div>
        <div class="event-meta-item">
          <svg class="event-meta-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <div style="font-size:var(--p3)">${dateStr} · ${timeStr}</div>
            <a class="event-meta-link" href="${calLink}" target="_blank">+ Save to Calendar</a>
          </div>
        </div>
        <div class="rsvp-counts">
          <div class="rsvp-count-item"><strong id="going-${ev.id}">${ev.going.length}</strong> I'm Down</div>
          <div class="rsvp-count-item"><strong id="maybe-${ev.id}">${ev.maybe.length}</strong> Just Might</div>
          <div class="rsvp-count-item"><strong id="notgoing-${ev.id}">${ev.notgoing.length}</strong> Missing Out</div>
          <button class="event-meta-link" onclick="SM.showAttendeesModal('${ev.id}')" style="margin-left:auto">Who's going →</button>
        </div>
        <div class="rsvp-btns">
          <button class="rsvp-btn${rsvpState==='going'?' going':''}" id="rsvp-going-${ev.id}" onclick="SM.setRsvp('${ev.id}','going')">I'M DOWN</button>
          <button class="rsvp-btn${rsvpState==='maybe'?' maybe':''}" id="rsvp-maybe-${ev.id}" onclick="SM.setRsvp('${ev.id}','maybe')">JUST MIGHT</button>
          <button class="rsvp-btn${rsvpState==='notgoing'?' notgoing':''}" id="rsvp-notgoing-${ev.id}" onclick="SM.setRsvp('${ev.id}','notgoing')">MISSING OUT</button>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--gray-200)">
          <div style="font-family:var(--font-head);font-size:1.2rem;letter-spacing:0.04em;margin-bottom:10px">DISCUSSION</div>
          <div class="comment-thread" id="comments-${ev.id}">
            ${ev.comments.map(c => `
              <div class="comment">
                <div class="comment-avatar">${c.user.substring(0,2).toUpperCase()}</div>
                <div class="comment-body">
                  <div class="comment-meta">
                    <span class="comment-name">${c.user}</span>
                    <span class="comment-time">${c.time}</span>
                  </div>
                  <div class="comment-text">${c.text}</div>
                  <div style="font-size:0.8rem;color:var(--gray-600);margin-top:4px">${c.replies} replies</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="comment-input-row">
            <input class="field-input" type="text" placeholder="Add a comment..." id="comment-input-${ev.id}" onkeydown="if(event.key==='Enter')SM.postComment('${ev.id}')"/>
            <button class="btn btn-sm btn-black" onclick="SM.postComment('${ev.id}')">POST</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

/* ── RSVP ── */
SM.setRsvp = function(evId, state) {
  const user = SM.getCurrentUser();
  if (!user) { SM.showToast('Sign in to RSVP', 'error'); return; }
  const ev = SM.events.find(e => e.id === evId);
  if (!ev) return;
  const prev = SM.rsvpState[evId];
  if (prev) {
    ev[prev] = ev[prev].filter(u => u !== user.id);
  }
  SM.rsvpState[evId] = state;
  if (!ev[state].includes(user.id)) ev[state].push(user.id);
  document.getElementById('going-' + evId).textContent = ev.going.length;
  document.getElementById('maybe-' + evId).textContent = ev.maybe.length;
  document.getElementById('notgoing-' + evId).textContent = ev.notgoing.length;
  ['going','maybe','notgoing'].forEach(s => {
    const btn = document.getElementById('rsvp-'+s+'-'+evId);
    if (btn) btn.className = 'rsvp-btn' + (s === state ? ' ' + s : '');
  });
  SM.showToast('RSVP updated!', 'success');
};

/* ── COMMENTS ── */
SM.postComment = function(evId) {
  const inp = document.getElementById('comment-input-' + evId);
  const user = SM.getCurrentUser();
  if (!inp || !user) return;
  const text = inp.value.trim();
  if (!text) return;
  const container = document.getElementById('comments-' + evId);
  if (!container) return;
  const initials = (user.firstName[0] + (user.lastInitial[0] || '')).toUpperCase();
  const div = document.createElement('div');
  div.className = 'comment';
  div.innerHTML = `
    <div class="comment-avatar">${initials}</div>
    <div class="comment-body">
      <div class="comment-meta">
        <span class="comment-name">${user.firstName} ${user.lastInitial}</span>
        <span class="comment-time">just now</span>
      </div>
      <div class="comment-text">${text}</div>
    </div>
  `;
  container.appendChild(div);
  inp.value = '';
};

/* ── ATTENDEES MODAL ── */
SM.showAttendeesModal = function(evId) {
  const ev = SM.events.find(e => e.id === evId);
  if (!ev) return;
  const modal = document.getElementById('attendees-modal');
  const list = document.getElementById('attendees-list');
  if (!modal || !list) return;
  list.innerHTML = ev.going.map(u => `
    <div class="attendee-row" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--gray-200)">
      <div class="comment-avatar" style="width:36px;height:36px">${u.substring(0,2).toUpperCase()}</div>
      <div style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.03em">${u}</div>
    </div>
  `).join('') || '<div style="padding:16px;font-size:var(--p3);color:var(--gray-600)">No one has RSVP\'d yet.</div>';
  modal.classList.add('open');
};
SM.closeAttendeesModal = function(e) {
  if (e.target === document.getElementById('attendees-modal')) {
    document.getElementById('attendees-modal').classList.remove('open');
  }
};

/* ── PROFILE ── */
SM.renderProfile = function() {
  const user = SM.getCurrentUser();
  if (!user) { SM.showPage('landing'); return; }
  const el = document.getElementById('profile-content');
  if (!el) return;
  const initials = (user.firstName[0] + (user.lastInitial[0] || '')).toUpperCase();
  el.innerHTML = `
    <div class="profile-header">
      <div class="flex items-center gap-md" style="gap:20px;max-width:var(--max-w);margin:0 auto">
        <div class="profile-avatar-lg" style="background:var(--teal);display:flex;align-items:center;justify-content:center">
          <span style="font-family:var(--font-head);font-size:2.5rem;color:var(--white)">${initials}</span>
        </div>
        <div>
          <div class="profile-name">${user.firstName} ${user.lastInitial}</div>
          <div class="profile-role">${user.creatorType}</div>
          <div class="profile-community">${SM.communityName(user.community)}</div>
        </div>
        <button class="btn btn-sm btn-outline-white" style="margin-left:auto" onclick="SM.showPage('edit-profile')">EDIT PROFILE</button>
      </div>
    </div>
    <div class="section">
      <div class="two-col">
        <div>
          <h3 class="mb-md">ABOUT</h3>
          <p class="p2 mb-lg">${user.bio || 'No bio yet.'}</p>
          ${user.website ? `<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">PORTFOLIO</span><br><a href="https://${user.website}" target="_blank" class="event-meta-link">${user.website}</a></div>` : ''}
          ${user.instagram ? `<div class="mb-sm"><span style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.04em">INSTAGRAM</span><br><a href="https://instagram.com/${user.instagram}" target="_blank" class="event-meta-link">@${user.instagram}</a></div>` : ''}
        </div>
        <div>
          <h3 class="mb-md">PHOTOS</h3>
          <div class="profile-photos-grid">
            ${[0,1,2,3].map(i => `
              <div class="photo-slot${user.photos && user.photos[i] ? ' filled' : ''}">
                ${user.photos && user.photos[i]
                  ? `<img src="${user.photos[i]}" alt="Photo ${i+1}"/>`
                  : `<svg class="slot-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="slot-label">ADD PHOTO</span>`
                }
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
};

/* ── EDIT PROFILE ── */
SM.renderEditProfile = function() {
  const user = SM.getCurrentUser();
  if (!user) { SM.showPage('landing'); return; }
  const el = document.getElementById('edit-profile-content');
  if (!el) return;
  el.innerHTML = `
    <div class="section" style="max-width:640px;margin:0 auto">
      <h2 class="mb-lg">EDIT PROFILE</h2>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="form-grid">
          <div class="field">
            <label class="field-label">FIRST NAME</label>
            <input class="field-input" type="text" id="ep-fname" value="${user.firstName}"/>
          </div>
          <div class="field">
            <label class="field-label">LAST INITIAL</label>
            <input class="field-input" type="text" id="ep-linitial" value="${user.lastInitial}" maxlength="2" style="width:80px"/>
          </div>
        </div>
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label class="field-label">BIO</label>
            <span class="char-count" id="ep-char-ct">${user.bio ? user.bio.length : 0} / 200</span>
          </div>
          <textarea class="field-textarea" id="ep-bio" maxlength="200" rows="3" oninput="document.getElementById('ep-char-ct').textContent=this.value.length+' / 200'">${user.bio || ''}</textarea>
        </div>
        <div class="field">
          <label class="field-label">I AM A...</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px" id="ep-roles">
            ${['Photographer','Model','Videographer','Content Creator'].map(r => `
              <div class="role-chip${user.creatorType===r?' selected':''}" onclick="SM.pickRole(this,'ep-roles')">${r}</div>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field-label">HOME COMMUNITY</label>
          <select class="field-select" id="ep-community">
            <option value="smdc"${user.community==='smdc'?' selected':''}>SMDC — Washington, D.C.</option>
            <option value="smwa"${user.community==='smwa'?' selected':''}>SMWA — Washington State</option>
            <option value="smmd"${user.community==='smmd'?' selected':''}>SMMD — Maryland</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">PORTFOLIO WEBSITE</label>
          <input class="field-input" type="text" id="ep-website" value="${user.website || ''}" placeholder="yourportfolio.com"/>
        </div>
        <div class="field">
          <label class="field-label">INSTAGRAM</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:var(--p2);color:var(--gray-600);white-space:nowrap">@</span>
            <input class="field-input" type="text" id="ep-instagram" value="${user.instagram || ''}" placeholder="yourhandle"/>
          </div>
        </div>
        <div class="field">
          <label class="field-label">PORTFOLIO PHOTOS (UP TO 4)</label>
          <div class="profile-photos-grid" style="margin-top:8px">
            ${[0,1,2,3].map(i => `
              <div class="photo-slot" title="Upload photo ${i+1}">
                <svg class="slot-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span class="slot-label">ADD</span>
              </div>
            `).join('')}
          </div>
          <p class="field-hint mt-sm">To add photos: upload them to your GitHub repo's /images folder, then enter the path like images/my-photo.jpg</p>
        </div>
        <div style="display:flex;gap:10px;padding-top:8px;border-top:1px solid var(--gray-200)">
          <button class="btn btn-sm btn-outline" onclick="SM.showPage('profile')">CANCEL</button>
          <button class="btn btn-sm" style="flex:1" onclick="SM.saveProfile()">SAVE PROFILE</button>
        </div>
      </div>
    </div>
  `;
};

SM.pickRole = function(el, containerId) {
  document.querySelectorAll('#'+containerId+' .role-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
};

SM.saveProfile = function() {
  const fname = document.getElementById('ep-fname')?.value.trim();
  const linitial = document.getElementById('ep-linitial')?.value.trim();
  const bio = document.getElementById('ep-bio')?.value.trim();
  const community = document.getElementById('ep-community')?.value;
  const website = document.getElementById('ep-website')?.value.trim();
  const instagram = document.getElementById('ep-instagram')?.value.trim();
  const roleEl = document.querySelector('#ep-roles .role-chip.selected');
  const creatorType = roleEl ? roleEl.textContent : 'Photographer';
  if (!fname) { SM.showToast('First name is required', 'error'); return; }
  SM.updateProfile({ firstName: fname, lastInitial: linitial, bio, community, website, instagram, creatorType });
  SM.showToast('Profile saved!', 'success');
  SM.showPage('profile');
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

SM.communityName = function(id) {
  return SM.communityData[id] ? SM.communityData[id].fullName : id.toUpperCase();
};

SM.renderCommunityPage = function(communityId) {
  const el = document.getElementById('community-content-' + communityId);
  const data = SM.communityData[communityId];
  if (!el || !data) return;
  const events = SM.events.filter(e => e.community === communityId);
  el.innerHTML = `
    <div class="community-hero">
      <div class="community-code">${data.code}</div>
      <div class="community-city">${data.name}</div>
      <p class="community-sub">${data.tagline}</p>
    </div>
    <div class="section">
      <div class="two-col">
        <div>
          <h2 class="mb-md">${data.fullName.toUpperCase()}</h2>
          <p class="p2 mb-lg">${data.description}</p>
          <a class="btn btn-sm" href="https://instagram.com/${data.instagram}" target="_blank">FOLLOW @${data.instagram.toUpperCase()}</a>
        </div>
        <div>
          <h3 class="mb-lg">COMMUNITY HOSTS</h3>
          <div style="display:flex;flex-direction:column;gap:24px">
            ${data.hosts.map(h => `
              <div class="host-card">
                <div class="host-img-placeholder">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--gray-400)"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div class="host-name">${h.name.toUpperCase()}</div>
                  <div class="host-handle"><a href="https://instagram.com/${h.handle}" target="_blank">@${h.handle}</a></div>
                  <div class="host-bio">${h.bio}</div>
                  <a class="host-link" href="${h.link}" target="_blank">LEARN MORE →</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
    <div style="background:var(--gray-100);padding:var(--space-2xl) 24px">
      <div style="max-width:var(--max-w);margin:0 auto">
        <h2 class="mb-lg">UPCOMING MEETS</h2>
        ${events.length
          ? `<div class="three-col">${events.map(SM.renderEventCard).join('')}</div>`
          : `<p class="p2" style="color:var(--gray-600)">No upcoming events. Check back soon.</p>`
        }
      </div>
    </div>
    <div class="section">
      <h2 class="mb-lg">COMMUNITY CHAT</h2>
      <div class="chat-shell">
        <div class="chat-titlebar">
          <div><div class="chat-title">STREETMEET INSTANT MESSENGER</div><div class="chat-room-label">#${communityId}-general</div></div>
          <div class="chat-controls">
            <div class="chat-ctrl" style="background:#4CAF50"></div>
            <div class="chat-ctrl" style="background:#F5A623"></div>
            <div class="chat-ctrl" style="background:var(--red)"></div>
          </div>
        </div>
        <div class="chat-online-bar">
          <div class="chat-online-dot"></div>
          <span class="chat-online-text">${SM.chatRooms[communityId]?.onlineCount || '0'} ONLINE</span>
        </div>
        <div class="chat-layout">
          <div class="chat-messages" id="community-chat-msgs-${communityId}">
            ${(SM.chatMessageData?.[communityId] || SM.chatRooms[communityId]?.messages || []).map(m =>
              m.sys
                ? `<div class="chat-msg"><span class="sys">${m.text}</span></div>`
                : `<div class="chat-msg"><span class="sender${m.host?' host':''}">${m.sender}:</span> ${m.text}</div>`
            ).join('')}
          </div>
          <div class="chat-users">
            <div class="chat-users-title">ONLINE</div>
            ${(SM.chatRooms[communityId]?.users || []).map(u => `
              <div class="chat-user">
                <div class="chat-user-dot${u.online?'':' away'}"></div>
                <div class="chat-user-name">${u.name}</div>
                ${u.host?'<div class="chat-user-badge">HOST</div>':''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="chat-input-bar">
          <input class="chat-input" type="text" placeholder="Say something to the community..." id="community-chat-input-${communityId}" onkeydown="if(event.key==='Enter')SM.sendCommunityChatMsg('${communityId}')"/>
          <button class="chat-send" onclick="SM.sendCommunityChatMsg('${communityId}')">SEND</button>
        </div>
      </div>
    </div>
  `;
  if (!SM.chatMessageData) SM.chatMessageData = {};
  if (!SM.chatMessageData[communityId]) SM.chatMessageData[communityId] = [...(SM.chatRooms[communityId]?.messages || [])];
};

SM.sendCommunityChatMsg = function(communityId) {
  const inp = document.getElementById('community-chat-input-' + communityId);
  const user = SM.getCurrentUser();
  if (!inp || !user) return;
  const text = inp.value.trim();
  if (!text) return;
  if (!SM.chatMessageData) SM.chatMessageData = {};
  if (!SM.chatMessageData[communityId]) SM.chatMessageData[communityId] = [];
  const msg = { sender: (user.firstName + user.lastInitial.replace('.','')).toLowerCase(), host: SM.isHost(), text };
  SM.chatMessageData[communityId].push(msg);
  const msgsEl = document.getElementById('community-chat-msgs-' + communityId);
  if (msgsEl) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="sender${msg.host?' host':''}">${msg.sender}:</span> ${msg.text}`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  inp.value = '';
};

/* ── CREATE EVENT ── */
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
          <button class="btn btn-sm" style="flex:1" onclick="SM.createEvent()">PUBLISH EVENT</button>
        </div>
      </div>
    </div>
  `;
};

SM.createEvent = function() {
  const community = document.getElementById('ce-community')?.value;
  const title = document.getElementById('ce-title')?.value.trim();
  const date = document.getElementById('ce-date')?.value;
  const time = document.getElementById('ce-time')?.value;
  const address = document.getElementById('ce-address')?.value.trim();
  const desc = document.getElementById('ce-desc')?.value.trim();
  if (!title || !date || !time || !address) { SM.showToast('Please fill all required fields', 'error'); return; }
  const newEvent = {
    id: 'ev_' + Date.now(), community, communityLabel: SM.communityData[community].fullName,
    title, date, time, address, description: desc, photo: null,
    going: [], maybe: [], notgoing: [], comments: []
  };
  SM.events.unshift(newEvent);
  SM.showToast('Event published!', 'success');
  SM.showPage('events');
};

/* ── ADMIN ── */
SM.renderAdmin = function() {
  const el = document.getElementById('admin-content');
  if (!el || !SM.isAdmin()) return;
  const users = SM.getUsers();
  el.innerHTML = `
    <div class="section">
      <h2 class="mb-lg">USER MANAGEMENT</h2>
      <div style="overflow-x:auto">
        <table class="admin-table">
          <thead><tr>
            <th style="width:150px">User</th>
            <th style="width:70px">Role</th>
            <th style="width:100px">Community</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>
                  <div style="font-family:var(--font-head);font-size:1rem;letter-spacing:0.03em">${u.firstName} ${u.lastInitial}</div>
                  <div style="font-size:var(--p3);color:var(--gray-600)">${u.email}</div>
                </td>
                <td><span class="tag ${u.role==='admin'?'tag-black':u.role==='host'?'tag-teal':'tag-outline'}">${u.role.toUpperCase()}</span></td>
                <td style="font-size:var(--p3)">${u.community?.toUpperCase() || '—'}</td>
                <td><div class="action-btns">
                  ${u.role === 'user' ? `<button class="action-btn promote" onclick="SM.promoteToHost('${u.id}');SM.renderAdmin()">MAKE HOST</button>` : ''}
                  ${u.role !== 'admin' ? `<button class="action-btn restrict" onclick="SM.restrictUser('${u.id}');SM.renderAdmin()">RESTRICT</button>` : ''}
                  ${u.role !== 'admin' ? `<button class="action-btn remove" onclick="if(confirm('Remove this user?')){SM.deleteUser('${u.id}');SM.renderAdmin()}">REMOVE</button>` : ''}
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:40px">
        <h2 class="mb-lg">CREATE COMMUNITY</h2>
        <div style="max-width:480px;display:flex;flex-direction:column;gap:14px">
          <div class="field"><label class="field-label">COMMUNITY CODE</label><input class="field-input" type="text" id="cc-code" placeholder="e.g. SMNYC" maxlength="6"/></div>
          <div class="field"><label class="field-label">CITY / REGION</label><input class="field-input" type="text" id="cc-city" placeholder="New York City"/></div>
          <div class="field"><label class="field-label">ASSIGN HOST (USERNAME)</label><input class="field-input" type="text" id="cc-host" placeholder="Search username..."/></div>
          <button class="btn btn-sm" onclick="SM.showToast('Community created! Add a new community page HTML file for it.','success')">CREATE COMMUNITY</button>
        </div>
      </div>
    </div>
  `;
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  SM.initAuth();
  SM.initChat();
  const user = SM.getCurrentUser();
  if (user) {
    SM.showPage('home');
  } else {
    SM.showPage('landing');
  }
};

document.addEventListener('DOMContentLoaded', SM.init);
