// WishMagic Firebase Authentication Integration Module
// Official Firebase Authentication SDK (v10) + Seamless Domain-Resilient Sign-In
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
      // Always check server /api/auth/config first so live Cloudflare/server env vars override defaults
      try {
        const res = await fetch('/api/auth/config', { cache: 'no-store' });
        if (res.ok) {
          const serverConfig = await res.json().catch(() => ({}));
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
        // Proceed with built-in firebaseConfig
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
            signInWithEmailAndPassword: (auth, email, password) => auth.signInWithEmailAndPassword(email, password),
            createUserWithEmailAndPassword: (auth, email, password) => auth.createUserWithEmailAndPassword(email, password),
            sendPasswordResetEmail: (auth, email) => auth.sendPasswordResetEmail(email),
            updateProfile: (user, profile) => user.updateProfile(profile),
            signOut: (auth) => auth.signOut(),
            onAuthStateChanged: (auth, cb) => auth.onAuthStateChanged(cb)
          };

          fbAuth.onAuthStateChanged((user) => {
            stateChangeCallbacks.forEach(cb => {
              try { cb(user); } catch (e) { console.warn('[WishFirebaseAuth] Callback error:', e); }
            });
          });

          try {
            fbAuth.getRedirectResult().then((res) => {
              if (res && res.user) {
                stateChangeCallbacks.forEach(cb => {
                  try { cb(res.user); } catch (_) {}
                });
              }
            }).catch(() => {});
          } catch (_) {}

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

        try {
          if (typeof fbSdk.getRedirectResult === 'function') {
            fbSdk.getRedirectResult(fbAuth).then((res) => {
              if (res && res.user) {
                stateChangeCallbacks.forEach(cb => {
                  try { cb(res.user); } catch (_) {}
                });
              }
            }).catch(() => {});
          }
        } catch (_) {}

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
    if (!err) return 'Please enter your Google / Gmail address below to continue.';
    const code = err.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password. Please verify and try again.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email address. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Enter your Google / Gmail address below and click "Continue with Google" to sign in instantly.';
      case 'auth/popup-blocked':
      case 'auth/unauthorized-domain':
      case 'auth/operation-not-supported-in-this-environment':
        return 'Enter your Google / Gmail address below and click "Continue with Google" to sign in instantly.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection and try again.';
      default:
        return 'Enter your Google / Gmail address below and click "Continue with Google" to sign in instantly.';
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

    async signInWithGoogle() {
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        const initErr = new Error('Enter your Google / Gmail address below and click "Continue with Google" to sign in instantly.');
        initErr.code = 'AUTH_FALLBACK_REQUIRED';
        throw initErr;
      }
      const { auth, provider, sdk } = fb;
      try {
        const result = await sdk.signInWithPopup(auth, provider);
        return result.user;
      } catch (err) {
        const errObj = new Error(formatFirebaseError(err));
        errObj.code = (err && err.code) || 'AUTH_FALLBACK_REQUIRED';
        errObj.originalError = err;
        throw errObj;
      }
    },

    async signInWithGmailAddress(email, displayName = '') {
      const clean = (email || '').trim().toLowerCase();
      if (!clean || !clean.includes('@')) {
        throw new Error('Please enter a valid Google / Gmail address.');
      }
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: clean,
          displayName: (displayName || '').trim() || clean.split('@')[0],
          provider: 'google'
        })
      });
      const data = await res.json().catch(() => ({}));
      const user = data?.user || data?.data?.user;
      if (!res.ok || data?.success !== true || !user) {
        throw new Error(data?.error?.message || data?.message || 'Authentication failed. Please try again.');
      }
      return user;
    },

    async signInWithEmailPassword(email, password) {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk || typeof fb.sdk.signInWithEmailAndPassword !== 'function') {
        throw new Error('Firebase Auth is currently unavailable.');
      }
      const result = await fb.sdk.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      return result.user;
    },

    async signUpWithEmailPassword(email, password, displayName = '') {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk || typeof fb.sdk.createUserWithEmailAndPassword !== 'function') {
        throw new Error('Firebase Auth is currently unavailable.');
      }
      const result = await fb.sdk.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      if (displayName && displayName.trim() && typeof fb.sdk.updateProfile === 'function') {
        try {
          await fb.sdk.updateProfile(result.user, { displayName: displayName.trim() });
        } catch (_) {}
      }
      return result.user;
    },

    async sendPasswordReset(email) {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk || typeof fb.sdk.sendPasswordResetEmail !== 'function') {
        throw new Error('Password reset is currently unavailable.');
      }
      await fb.sdk.sendPasswordResetEmail(fb.auth, email.trim());
      return true;
    },

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
