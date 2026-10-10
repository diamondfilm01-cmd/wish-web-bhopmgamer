// WishMagic Firebase Authentication Integration Module
// Web SDK v10 (Official Google CDN ESM)
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

  const ADMIN_EMAILS = [
    'ankit.babusaini@gmail.com'
  ];

  let fbApp = null;
  let fbAuth = null;
  let fbGoogleProvider = null;
  let fbSdk = null;
  let initPromise = null;
  const stateChangeCallbacks = new Set();

  async function getFirebase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      // 0. Fetch config from server if missing or incomplete
      if (!firebaseConfig.apiKey) {
        try {
          const res = await fetch('/api/auth/config');
          if (res.ok) {
            const serverConfig = await res.json();
            if (serverConfig && serverConfig.apiKey) {
              firebaseConfig.apiKey = serverConfig.apiKey;
              if (serverConfig.projectId) firebaseConfig.projectId = serverConfig.projectId;
              if (serverConfig.authDomain) firebaseConfig.authDomain = serverConfig.authDomain;
              if (serverConfig.storageBucket) firebaseConfig.storageBucket = serverConfig.storageBucket;
              if (serverConfig.appId) firebaseConfig.appId = serverConfig.appId;
              console.log('[WishFirebaseAuth] Configuration loaded from server');
            }
          }
        } catch (e) {
          console.warn('[WishFirebaseAuth] Failed to load config from server:', e);
        }
      }

      if (!firebaseConfig.apiKey) {
        console.warn('[WishFirebaseAuth] Firebase API key not present, skipping SDK initialization');
        return { app: null, auth: null, provider: null, sdk: null, isReady: false };
      }

      // 1. Check if global compat SDK is present (e.g. via script tags)
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
            signInWithEmailAndPassword: (auth, email, password) => auth.signInWithEmailAndPassword(email, password),
            createUserWithEmailAndPassword: (auth, email, password) => auth.createUserWithEmailAndPassword(email, password),
            sendPasswordResetEmail: (auth, email) => auth.sendPasswordResetEmail(email),
            signOut: (auth) => auth.signOut(),
            onAuthStateChanged: (auth, cb) => auth.onAuthStateChanged(cb),
            updateProfile: (user, profile) => user.updateProfile(profile)
          };

          fbAuth.onAuthStateChanged((user) => {
            stateChangeCallbacks.forEach(cb => {
              try { cb(user); } catch (e) { console.warn('[WishFirebaseAuth] Callback error:', e); }
            });
          });

          console.log('[WishFirebaseAuth] Initialized via global Firebase SDK');
          return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk, isReady: true };
        } catch (compatErr) {
          console.warn('[WishFirebaseAuth] Global SDK init note, trying ESM:', compatErr.message || compatErr);
        }
      }

      // 2. Fallback to official Google ESM imports
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

        // Set up global auth state observer
        fbSdk.onAuthStateChanged(fbAuth, (user) => {
          stateChangeCallbacks.forEach(cb => {
            try { cb(user); } catch (e) { console.warn('[WishFirebaseAuth] Callback error:', e); }
          });
        });

        console.log('[WishFirebaseAuth] Firebase Auth initialized successfully for pacific-ember-18chg');
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

  // Friendly user-facing error message translator
  function formatFirebaseError(err) {
    if (!err) return 'Authentication failed';
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
        return 'Google sign-in popup was closed before completion.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
      case 'auth/unauthorized-domain':
        return 'Domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please wait a moment or reset your password.';
      default:
        return err.message || 'Authentication error occurred.';
    }
  }

  const WishFirebaseAuth = {
    getConfig() {
      return { ...firebaseConfig };
    },

    isAdminEmail(email) {
      if (!email) return false;
      const clean = email.trim().toLowerCase();
      return ADMIN_EMAILS.some(adm => adm.toLowerCase() === clean);
    },

    async getAuthInstance() {
      const fb = await getFirebase();
      return fb.auth;
    },

    // Sign in with Google Popup
    async signInWithGoogle() {
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        throw new Error('Google Sign-In is currently unavailable. Please sign in with email and password.');
      }
      const { auth, provider, sdk } = fb;
      try {
        const result = await sdk.signInWithPopup(auth, provider);
        return result.user;
      } catch (err) {
        throw new Error(formatFirebaseError(err));
      }
    },

    // Sign in with Email and Password
    async signInWithEmailPassword(email, password) {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        throw new Error('Firebase Auth is currently unavailable. Please try again.');
      }
      const { auth, sdk } = fb;
      try {
        const result = await sdk.signInWithEmailAndPassword(auth, email.trim(), password);
        return result.user;
      } catch (err) {
        throw new Error(formatFirebaseError(err));
      }
    },

    // Sign up / Create Account with Email and Password
    async signUpWithEmailPassword(email, password, displayName = '') {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        throw new Error('Firebase Auth is currently unavailable. Please try again.');
      }
      const { auth, sdk } = fb;
      try {
        const result = await sdk.createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName && displayName.trim()) {
          try {
            await sdk.updateProfile(result.user, { displayName: displayName.trim() });
          } catch (e) {}
        }
        return result.user;
      } catch (err) {
        throw new Error(formatFirebaseError(err));
      }
    },

    // Send Password Reset Email
    async sendPasswordReset(email) {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      const fb = await getFirebase();
      if (!fb || !fb.auth || !fb.sdk) {
        throw new Error('Password reset is currently unavailable. Please try again later.');
      }
      const { auth, sdk } = fb;
      try {
        await sdk.sendPasswordResetEmail(auth, email.trim());
        return true;
      } catch (err) {
        throw new Error(formatFirebaseError(err));
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

      // Start Firebase initialization if not started
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

  // Background warm-up
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
