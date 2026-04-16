/* ============================================================
   STREETMEET — AUTH & USER STATE
   Handles login state, role checks, profile data
   In production: replace localStorage with your backend API
   ============================================================ */

const SM = window.SM = window.SM || {};

/* ── DEFAULT MOCK USER DATA ── */
SM.defaultUsers = [
  {
    id: 'user_001', email: 'admin@streetmeet.com', password: 'admin123',
    role: 'admin', firstName: 'Admin', lastInitial: 'S',
    bio: 'StreetMeet administrator.', community: 'smdc',
    creatorType: 'Photographer', instagram: 'streetmeet',
    website: 'streetmeet.com', photos: [], profilePhoto: null
  },
  {
    id: 'user_002', email: 'kevin@streetmeet.com', password: 'host123',
    role: 'host', firstName: 'Kevin', lastInitial: 'W',
    bio: 'D.C.-born photographer and visual storyteller. 15+ years behind the camera.',
    community: 'smdc', creatorType: 'Photographer',
    instagram: 'k3vin.wayne', website: 'dreamcityphotodept.com',
    photos: [], profilePhoto: null
  },
  {
    id: 'user_003', email: 'user@streetmeet.com', password: 'user123',
    role: 'user', firstName: 'Jordan', lastInitial: 'M',
    bio: 'Street photographer chasing light across all five boroughs. Film + digital.',
    community: 'smdc', creatorType: 'Photographer',
    instagram: 'jordanm', website: '', photos: [], profilePhoto: null
  }
];

/* ── INIT ── */
SM.initAuth = function() {
  if (!localStorage.getItem('sm_users')) {
    localStorage.setItem('sm_users', JSON.stringify(SM.defaultUsers));
  }
};

/* ── GETTERS ── */
SM.getUsers = () => JSON.parse(localStorage.getItem('sm_users') || '[]');
SM.getCurrentUser = () => JSON.parse(localStorage.getItem('sm_current_user') || 'null');
SM.isLoggedIn = () => !!SM.getCurrentUser();
SM.isAdmin = () => { const u = SM.getCurrentUser(); return u && u.role === 'admin'; };
SM.isHost = () => { const u = SM.getCurrentUser(); return u && (u.role === 'host' || u.role === 'admin'); };

/* ── REGISTER ── */
SM.register = function(data) {
  const users = SM.getUsers();
  if (users.find(u => u.email === data.email)) {
    return { ok: false, error: 'An account with this email already exists.' };
  }
  const user = {
    id: 'user_' + Date.now(),
    email: data.email,
    password: data.password,
    role: 'user',
    firstName: data.firstName,
    lastInitial: data.lastInitial,
    bio: data.bio || '',
    community: data.community || 'smdc',
    creatorType: data.creatorType || 'Photographer',
    instagram: data.instagram || '',
    website: data.website || '',
    photos: [],
    profilePhoto: null
  };
  users.push(user);
  localStorage.setItem('sm_users', JSON.stringify(users));
  localStorage.setItem('sm_current_user', JSON.stringify(user));
  return { ok: true, user };
};

/* ── LOGIN ── */
SM.login = function(email, password) {
  const users = SM.getUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return { ok: false, error: 'Incorrect email or password.' };
  localStorage.setItem('sm_current_user', JSON.stringify(user));
  return { ok: true, user };
};

/* ── LOGOUT ── */
SM.logout = function() {
  localStorage.removeItem('sm_current_user');
  SM.showPage('landing');
  SM.updateNav();
};

/* ── UPDATE PROFILE ── */
SM.updateProfile = function(updates) {
  const current = SM.getCurrentUser();
  if (!current) return { ok: false, error: 'Not logged in.' };
  const users = SM.getUsers();
  const idx = users.findIndex(u => u.id === current.id);
  if (idx === -1) return { ok: false, error: 'User not found.' };
  const updated = { ...users[idx], ...updates };
  users[idx] = updated;
  localStorage.setItem('sm_users', JSON.stringify(users));
  localStorage.setItem('sm_current_user', JSON.stringify(updated));
  return { ok: true, user: updated };
};

/* ── ADMIN: MANAGE USERS ── */
SM.promoteToHost = function(userId) {
  const users = SM.getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  users[idx].role = 'host';
  localStorage.setItem('sm_users', JSON.stringify(users));
  SM.showToast('User promoted to Host', 'success');
};

SM.restrictUser = function(userId) {
  const users = SM.getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  users[idx].restricted = !users[idx].restricted;
  localStorage.setItem('sm_users', JSON.stringify(users));
  SM.showToast(users[idx].restricted ? 'User restricted' : 'User unrestricted', 'success');
};

SM.deleteUser = function(userId) {
  let users = SM.getUsers();
  users = users.filter(u => u.id !== userId);
  localStorage.setItem('sm_users', JSON.stringify(users));
  SM.showToast('User removed', 'success');
};
