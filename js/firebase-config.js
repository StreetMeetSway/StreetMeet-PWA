/* ============================================================
   STREETMEET — FIREBASE CONFIGURATION
   Initializes Firebase and exposes db, auth, storage refs
   ============================================================ */

var firebaseConfig = {
  apiKey:            "AIzaSyCSaM_0LKWn8opm_eYsZa3eYsw7dmnuKD8",
  authDomain:        "streetmeet-pwa.firebaseapp.com",
  projectId:         "streetmeet-pwa",
  storageBucket:     "streetmeet-pwa.firebasestorage.app",
  messagingSenderId: "934545590624",
  appId:             "1:934545590624:web:0b9c98f68e114a2537f605"
};

/* ── Initialize Firebase ── */
firebase.initializeApp(firebaseConfig);

/* ── Service references used throughout the app ── */
var db      = firebase.firestore();   // Firestore database
var auth    = firebase.auth();        // Authentication
var storage = firebase.storage();     // Cloud Storage for photos

/* ── Firestore settings ── */
/* Enable offline persistence so the app works even with poor signal */
db.enablePersistence({ synchronizeTabs: true })
  .catch(function(err) {
    if (err.code === 'failed-precondition') {
      /* Multiple tabs open — persistence only works in one tab at a time */
      console.warn('SM: Firestore persistence unavailable (multiple tabs open)');
    } else if (err.code === 'unimplemented') {
      /* Browser does not support persistence */
      console.warn('SM: Firestore persistence not supported in this browser');
    }
  });

/* ── Auth state observer ── */
/* Keeps SM.currentUser in sync whenever login/logout happens */
auth.onAuthStateChanged(function(user) {
  if (user) {
    /* User is signed in — fetch their Firestore profile */
    db.collection('users').doc(user.uid).get()
      .then(function(doc) {
        if (doc.exists) {
          var profile = doc.data();
          profile.id = user.uid;
          profile.email = user.email;
          localStorage.setItem('sm_current_user', JSON.stringify(profile));
        } else {
          /* New user — profile doc not yet created (happens during registration) */
          localStorage.setItem('sm_current_user', JSON.stringify({
            id:    user.uid,
            email: user.email,
            role:  'user'
          }));
        }
        /* Update nav and start notifications */
        if (typeof SM !== 'undefined' && SM.updateNav) {
          SM.updateNav();
        }
        if (typeof SM !== 'undefined' && SM.initNotifications) {
          SM.initNotifications();
        }
      })
      .catch(function(err) {
        console.error('SM: Error fetching user profile:', err);
      });
  } else {
    /* User signed out — clear local session and stop notifications */
    localStorage.removeItem('sm_current_user');
    if (typeof SM !== 'undefined' && SM.updateNav) {
      SM.updateNav();
    }
    if (typeof SM !== 'undefined' && SM.stopNotifications) {
      SM.stopNotifications();
    }
  }
});

console.log('SM: Firebase initialized — project:', firebaseConfig.projectId);
