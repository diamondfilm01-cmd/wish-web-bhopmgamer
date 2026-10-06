// WishMagic Firebase Authentication Integration Module
// Web SDK v10 (Official Google CDN ESM)
// Project: wish-magic-47944

(function(window) {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyCiZmxmfgyj555EI4af_rt5X_id31F4Vq0",
    authDomain: "wish-magic-47944.firebaseapp.com",
    projectId: "wish-magic-47944",
    storageBucket: "wish-magic-47944.firebasestorage.app",
    messagingSenderId: "281035115213",
    appId: "1:281035115213:web:2af5b3a6f0ceb6c64eb784"
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
          return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk };
        } catch (compatErr) {
          console.warn('[WishFirebaseAuth] Global SDK init note, trying ESM:', compatErr);
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

        console.log('[WishFirebaseAuth] Firebase Auth initialized successfully for wish-magic-47944');
        return {
          app: fbApp,
          auth: fbAuth,
          provider: fbGoogleProvider,
          sdk: authMod
        };
      } catch (err) {
        console.error('[WishFirebaseAuth] Failed to initialize Firebase SDK:', err);
        initPromise = null; // allow retry
        throw err;
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
      const { auth, provider, sdk } = await getFirebase();
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

      const { auth, sdk } = await getFirebase();
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

      const { auth, sdk } = await getFirebase();
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
      const { auth, sdk } = await getFirebase();
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
        const { auth, sdk } = await getFirebase();
        await sdk.signOut(auth);
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
