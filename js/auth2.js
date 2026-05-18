/* ============================================================
   STREETMEET — AUTH & USER STATE  (Task 1.3)
   Firebase Auth + Firestore — replaces localStorage login
   ============================================================ */

window.SM = window.SM || {};
var SM = window.SM;

/* ══════════════════════════════════════════════════════════
   GETTERS
   All other JS files call these — signatures unchanged
══════════════════════════════════════════════════════════ */

SM.getCurrentUser = function() {
  var stored = localStorage.getItem('sm_current_user');
  return stored ? JSON.parse(stored) : null;
};

SM.isLoggedIn = function() { return !!SM.getCurrentUser(); };

SM.isAdmin = function() {
  var u = SM.getCurrentUser();
  return u && u.role === 'admin';
};

SM.isHost = function() {
  var u = SM.getCurrentUser();
  return u && (u.role === 'host' || u.role === 'admin');
};

/* ══════════════════════════════════════════════════════════
   REGISTER — Email / Password
   Creates Firebase Auth account + Firestore profile doc
══════════════════════════════════════════════════════════ */

SM.register = function(data) {
  return auth.createUserWithEmailAndPassword(data.email, data.password)
    .then(function(credential) {
      /* Task 05: Send verification email immediately after account creation */
      credential.user.sendEmailVerification().catch(function(e) {
        console.warn('SM: sendEmailVerification error:', e.message);
      });
      var uid  = credential.user.uid;
      var profile = {
        id:           uid,
        email:        data.email,
        role:         'user',
        firstName:    data.firstName    || '',
        lastInitial:  data.lastInitial  || '',
        bio:          data.bio          || '',
        community:    data.community    || 'smdc',
        creatorType:  data.creatorType  || 'Photographer',
        instagram:    data.instagram    || '',
        website:      data.website      || '',
        videoUrl:     '',
        avatarURL:    '',
        photoURLs:    [],
        createdAt:    firebase.firestore.FieldValue.serverTimestamp()
      };

      /* Write profile to Firestore users/{uid} */
      return db.collection('users').doc(uid).set(profile)
        .then(function() {
          localStorage.setItem('sm_current_user', JSON.stringify(profile));
          return { ok: true, user: profile };
        });
    })
    .catch(function(err) {
      return { ok: false, error: SM._authError(err.code) };
    });
};

/* ══════════════════════════════════════════════════════════
   LOGIN — Email / Password
══════════════════════════════════════════════════════════ */

SM.login = function(email, password) {
  return auth.signInWithEmailAndPassword(email, password)
    .then(function(credential) {
      /* firebase-config.js onAuthStateChanged will sync the profile —
         return ok immediately so the UI can respond */
      return { ok: true };
    })
    .catch(function(err) {
      return { ok: false, error: SM._authError(err.code) };
    });
};

/* ══════════════════════════════════════════════════════════
   GOOGLE SIGN-IN
   One-tap sign in / register with Google account
══════════════════════════════════════════════════════════ */

SM.loginWithGoogle = function() {
  var provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider)
    .then(function(result) {
      var uid  = result.user.uid;
      var gUser = result.user;

      /* Check if this Google user already has a Firestore profile */
      return db.collection('users').doc(uid).get()
        .then(function(doc) {
          if (!doc.exists) {
            /* First time Google sign-in — create profile doc */
            var nameParts = (gUser.displayName || '').split(' ');
            var profile = {
              id:           uid,
              email:        gUser.email,
              role:         'user',
              firstName:    nameParts[0] || '',
              lastInitial:  nameParts.length > 1 ? nameParts[nameParts.length - 1][0] + '.' : '',
              bio:          '',
              community:    'smdc',
              creatorType:  'Photographer',
              instagram:    '',
              website:      '',
              videoUrl:     '',
              avatarURL:    gUser.photoURL || '',
              photoURLs:    [],
              createdAt:    firebase.firestore.FieldValue.serverTimestamp()
            };
            return db.collection('users').doc(uid).set(profile)
              .then(function() {
                localStorage.setItem('sm_current_user', JSON.stringify(profile));
                return { ok: true, user: profile, isNew: true };
              });
          } else {
            /* Returning Google user — sync profile from Firestore */
            var profile = doc.data();
            profile.id = uid;
            localStorage.setItem('sm_current_user', JSON.stringify(profile));
            return { ok: true, user: profile, isNew: false };
          }
        });
    })
    .catch(function(err) {
      if (err.code === 'auth/popup-closed-by-user') {
        return { ok: false, error: null }; /* User closed popup — not an error */
      }
      return { ok: false, error: SM._authError(err.code) };
    });
};

/* ══════════════════════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════════════════════ */

SM.logout = function() {
  /* Capture current page before signing out */
  var currentPage = document.querySelector('.page.active');
  var currentPageId = currentPage ? currentPage.id.replace('page-', '') : '';
  /* Pages that require auth — must redirect to landing */
  var authRequired = ['home','profile','edit-profile','admin','create-event',
                      'smdc','smwa','smmd','chat','events'];
  var needsRedirect = authRequired.indexOf(currentPageId) > -1;

  auth.signOut().then(function() {
    localStorage.removeItem('sm_current_user');
    localStorage.removeItem('sm_last_page'); /* QW9: clear last page on sign-out */
    localStorage.removeItem('sm_last_profile_uid'); /* Task 14: clear viewed profile on sign-out */
    if (typeof SM.closeAllDropdowns === 'function') SM.closeAllDropdowns();
    SM.updateNav();
    if (needsRedirect) SM.showPage('landing');
  });
};

/* ══════════════════════════════════════════════════════════
   PASSWORD RESET
   Firebase sends the reset email automatically
══════════════════════════════════════════════════════════ */

SM.sendPasswordReset = function(email) {
  return auth.sendPasswordResetEmail(email)
    .then(function() {
      return { ok: true };
    })
    .catch(function(err) {
      return { ok: false, error: SM._authError(err.code) };
    });
};

/* ══════════════════════════════════════════════════════════
   UPDATE PROFILE
   Writes changes to Firestore + updates local session cache
══════════════════════════════════════════════════════════ */

SM.updateProfile = function(updates) {
  var current = SM.getCurrentUser();
  if (!current) return Promise.resolve({ ok: false, error: 'Not logged in.' });

  return db.collection('users').doc(current.id).update(updates)
    .then(function() {
      var updated = Object.assign({}, current, updates);
      localStorage.setItem('sm_current_user', JSON.stringify(updated));
      return { ok: true, user: updated };
    })
    .catch(function(err) {
      console.error('SM: updateProfile error:', err);
      return { ok: false, error: 'Could not save profile. Please try again.' };
    });
};

/* ══════════════════════════════════════════════════════════
   FETCH ANY USER PROFILE  (for profile-linked usernames)
   Returns Firestore doc data for any userId
══════════════════════════════════════════════════════════ */

SM.fetchUserProfile = function(userId) {
  return db.collection('users').doc(userId).get()
    .then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        data.id = doc.id;
        return { ok: true, user: data };
      }
      return { ok: false, error: 'User not found.' };
    })
    .catch(function(err) {
      return { ok: false, error: err.message };
    });
};

/* ══════════════════════════════════════════════════════════
   ADMIN — USER MANAGEMENT
   All writes go to Firestore; role is stored on user doc
══════════════════════════════════════════════════════════ */

SM.promoteToHost = function(userId) {
  db.collection('users').doc(userId).update({ role: 'host' })
    .then(function() { SM.showToast('User promoted to Host', 'success'); })
    .catch(function() { SM.showToast('Could not update user', 'error'); });
};

SM.promoteToAdmin = function(userId, userName) {
  if (!SM.isAdmin()) return;
  if (!confirm('Promote ' + (userName || 'this user') + ' to Admin?\n\nThey will have full admin access including user management and community controls.')) return;
  db.collection('users').doc(userId).update({ role: 'admin' })
    .then(function() {
      SM.showToast((userName || 'User') + ' is now an Admin', 'success');
      SM.renderAdmin();
    })
    .catch(function() { SM.showToast('Could not update user', 'error'); });
};

SM.demoteToUser = function(userId, userName) {
  if (!SM.isAdmin()) return;
  if (!confirm('Demote ' + (userName || 'this host') + ' to a regular user account?\n\nThey will no longer appear as a community host.')) return;
  db.collection('users').doc(userId).update({ role: 'user' })
    .then(function() {
      SM.showToast('Host demoted to User', 'success');
      SM.renderAdmin();
    })
    .catch(function() { SM.showToast('Could not update user', 'error'); });
};

SM.restrictUser = function(userId) {
  /* Toggle restricted flag */
  db.collection('users').doc(userId).get()
    .then(function(doc) {
      if (!doc.exists) return;
      var isRestricted = !doc.data().restricted;
      return doc.ref.update({ restricted: isRestricted })
        .then(function() {
          SM.showToast(isRestricted ? 'User restricted' : 'User unrestricted', 'success');
        });
    })
    .catch(function() { SM.showToast('Could not update user', 'error'); });
};

SM.deleteUser = function(userId) {
  /* Removes Firestore profile — Auth account cleanup done server-side via Cloud Functions in Phase 3 */
  db.collection('users').doc(userId).delete()
    .then(function() { SM.showToast('User removed', 'success'); })
    .catch(function() { SM.showToast('Could not remove user', 'error'); });
};

SM.getUsers = function() {
  /* Admin panel — returns promise of all users from Firestore */
  return db.collection('users').get()
    .then(function(snapshot) {
      return snapshot.docs.map(function(doc) {
        var d = doc.data();
        d.id = doc.id;
        return d;
      });
    });
};

/* ══════════════════════════════════════════════════════════
   INIT AUTH
   Called by SM.init() — Firebase auth state is handled by
   the onAuthStateChanged observer in firebase-config.js
   This function now just confirms Firebase is ready
══════════════════════════════════════════════════════════ */

SM.initAuth = function() {
  /* Nothing to seed — Firebase Auth + Firestore are the source of truth.
     The onAuthStateChanged observer in firebase-config.js handles
     session sync automatically on every page load. */
  console.log('SM: Auth ready — using Firebase Auth');
};

/* ══════════════════════════════════════════════════════════
   HELPER — Friendly error messages for Firebase Auth codes
══════════════════════════════════════════════════════════ */

SM._authError = function(code) {
  var messages = {
    'auth/email-already-in-use':    'An account with this email already exists.',
    'auth/invalid-email':           'Please enter a valid email address.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/user-not-found':          'Incorrect email or password.',
    'auth/wrong-password':          'Incorrect email or password.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/too-many-requests':       'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed':  'Connection error. Please check your internet and try again.',
    'auth/popup-blocked':           'Popup was blocked. Please allow popups for this site and try again.',
    'auth/user-disabled':           'This account has been disabled. Please contact StreetMeet support.'
  };
  return messages[code] || 'Something went wrong. Please try again.';
};
