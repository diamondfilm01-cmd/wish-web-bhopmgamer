// WishMagic Firebase Authentication Integration Module
// Pure Google Sign-In via Official Firebase Authentication SDK (v10)
// Project: pacific-ember-18chg

(function(window) {
  'use strict';

  const firebaseConfig = {
    apiKey: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.apiKey) || (window.ENV && window.ENV.FIREBASE_API_KEY) || "AIzaSyBFWkh24xuRUzhVQVgVxtNdpSbR-4Abbfc",
    authDomain: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.authDomain) || "pacific-ember-18chg.firebaseapp.com",
    projectId: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.projectId) || "pacific-ember-18chg",
    storageBucket: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.storageBucket) || "pacific-ember-18chg.firebasestorage.app",
    messagingSenderId: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.messagingSenderId) || "206581825854",
    appId: (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.appId) || "1:206581825854:web:9e195a82e2a31c359c6c6f"
  };

  const MASTER_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';

  let fbApp = null;
  let fbAuth = null;
  let fbGoogleProvider = null;
  let fbSdk = null;
  let initPromise = null;
  const stateChangeCallbacks = new Set();

  async function getFirebase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!firebaseConfig.apiKey) {
        try {
          const res = await fetch('/api/auth/config');
          if (res.ok) {
            const serverConfig = await res.json();
            const cfg = (serverConfig && serverConfig.data) || serverConfig;
            if (cfg && cfg.apiKey) {
              firebaseConfig.apiKey = cfg.apiKey;
              if (cfg.projectId) firebaseConfig.projectId = cfg.projectId;
              if (cfg.authDomain) firebaseConfig.authDomain = cfg.authDomain;
              if (cfg.storageBucket) firebaseConfig.storageBucket = cfg.storageBucket;
              if (cfg.appId) firebaseConfig.appId = cfg.appId;
            }
          }
        } catch (e) {
          console.warn('[WishFirebaseAuth] Config fetch note:', e);
        }
      }

      if (!firebaseConfig.apiKey) {
        return { app: null, auth: null, provider: null, sdk: null, isReady: false };
      }

      // 1. Check if global compat SDK is present
      if (typeof window.firebase !== 'undefined' && window.firebase.initializeApp && window.firebase.auth) {
        try {
          if (!window.firebase.apps || window.firebase.apps.length === 0) {
            fbApp = window.firebase.initializeApp(firebaseConfig);
          } else {
            fbApp = window.firebase.app();
          }
          fbAuth = window.firebase.auth();
          fbGoogleProvider = new window.firebase.auth.GoogleAuthProvider();
          fbGoogleProvider.setCustomParameters({ prompt: 'select_account' });
          fbSdk = {
            signInWithPopup: (auth, provider) => auth.signInWithPopup(provider),
            signInWithRedirect: (auth, provider) => auth.signInWithRedirect(provider),
            getRedirectResult: (auth) => auth.getRedirectResult(),
            signOut: (auth) => auth.signOut(),
            onAuthStateChanged: (auth, cb) => auth.onAuthStateChanged(cb)
          };

          fbAuth.onAuthStateChanged((user) => {
            stateChangeCallbacks.forEach(cb => {
              try { cb(user); } catch (e) { console.warn('[WishFirebaseAuth] Callback error:', e); }
            });
          });

          return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk, isReady: true };
        } catch (compatErr) {
          console.warn('[WishFirebaseAuth] Global SDK init note, trying ESM:', compatErr.message || compatErr);
        }
      }

      // 2. Official Google ESM imports
      try {
        const [appMod, authMod] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js')
        ]);

        fbApp = appMod.initializeApp(firebaseConfig);
        fbAuth = authMod.getAuth(fbApp);
        fbGoogleProvider = new authMod.GoogleAuthProvider();
        fbGoogleProvider.setCustomParameters({ prompt: 'select_account' });
        fbSdk = authMod;

        fbSdk.onAuthStateChanged(fbAuth, (user) => {
          stateChangeCallbacks.forEach(cb => {
            try { cb(user); } catch (e) { console.warn('[WishFirebaseAuth] Callback error:', e); }
          });
        });

        return {
          app: fbApp,
          auth: fbAuth,
          provider: fbGoogleProvider,
          sdk: authMod,
          isReady: true
        };
      } catch (err) {
        console.warn('[WishFirebaseAuth] Firebase SDK initialization unavailable:', err.message || err);
        return {
          app: null,
          auth: null,
          provider: null,
          sdk: null,
          isReady: false
        };
      }
    })();
    return initPromise;
  }

  function formatFirebaseError(err) {
    if (!err) return 'Google authentication failed. Please try again.';
    const code = err.code || '';
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in window was closed before completing sign-in. Please click "Continue with Google" again.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups for this site and click "Continue with Google".';
      case 'auth/unauthorized-domain':
        return 'This domain is not yet authorized in Firebase Authentication settings. Please add this domain in Firebase Console -> Authentication -> Settings -> Authorized domains.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection and try again.';
      default:
        return err.message || 'Google authentication could not be completed. Please try again.';
    }
  }

  const WishFirebaseAuth = {
    getConfig() {
      return { ...firebaseConfig };
    },

    isAdminEmail(email) {
      if (!email) return false;
      return String(email).trim().toLowerCase() === MASTER_ADMIN_EMAIL;
    },

    async getAuthInstance() {
      const fb = await getFirebase();
      return fb.auth;
    },

    // Official Firebase Google Sign-In Only
    async signInWithGoogle() {
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        const initErr = new Error('Firebase Google Authentication is initializing. Please wait a moment and try again.');
        initErr.code = 'SDK_NOT_READY';
        throw initErr;
      }
      const { auth, provider, sdk } = fb;
      try {
        const result = await sdk.signInWithPopup(auth, provider);
        return result.user;
      } catch (err) {
        if (err && err.code === 'auth/popup-blocked' && typeof sdk.signInWithRedirect === 'function') {
          await sdk.signInWithRedirect(auth, provider);
          return null;
        }
        const errObj = new Error(formatFirebaseError(err));
        errObj.code = err.code || 'AUTH_POPUP_ERROR';
        errObj.originalError = err;
        throw errObj;
      }
    },

    // Sign Out
    async signOut() {
      try {
        const fb = await getFirebase();
        if (fb && fb.auth && fb.sdk) {
          await fb.sdk.signOut(fb.auth);
        }
      } catch (e) {
        console.warn('[WishFirebaseAuth] Sign out error:', e);
      }
    },

    // Listen to Firebase auth state
    onAuthStateChanged(callback) {
      if (typeof callback !== 'function') return () => {};
      stateChangeCallbacks.add(callback);
      waitForFirebaseReady().catch(() => {});
      return () => stateChangeCallbacks.delete(callback);
    }
  };

  let firebaseReadyPromise = null;
  function waitForFirebaseReady() {
    if (firebaseReadyPromise) {
      return firebaseReadyPromise;
    }
    firebaseReadyPromise = getFirebase();
    return firebaseReadyPromise;
  }

  WishFirebaseAuth.ready = waitForFirebaseReady;
  WishFirebaseAuth.getFirebase = getFirebase;
  window.WishFirebaseAuth = WishFirebaseAuth;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        waitForFirebaseReady().catch(() => {});
      });
    } else {
      waitForFirebaseReady().catch(() => {});
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
