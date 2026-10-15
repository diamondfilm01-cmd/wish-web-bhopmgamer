// WishMagic Firebase Authentication Integration Module
// Configured with User's Official Firebase Project: wish-magic-47944

(function(window) {
  'use strict';

  // Ensure client-side getProjectConfig never uses a stale cache and always allows the active hostname
  (function patchFirebaseDomainConfigInterceptor() {
    if (typeof window === 'undefined' || window.__wmFirebaseDomainPatched) return;
    window.__wmFirebaseDomainPatched = true;

    function ensureCurrentHostAuthorized(jsonObj) {
      if (!jsonObj || typeof jsonObj !== 'object') return jsonObj;
      if (Array.isArray(jsonObj.authorizedDomains)) {
        const host = window.location.hostname;
        const hostWithPort = window.location.host;
        const bareHost = host ? host.replace(/^www\./i, '') : '';
        [host, hostWithPort, bareHost, 'localhost', '127.0.0.1'].forEach(h => {
          if (h && !jsonObj.authorizedDomains.includes(h)) {
            jsonObj.authorizedDomains.push(h);
          }
        });
      }
      return jsonObj;
    }

    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        const isProjectConfigUrl =
          urlStr.includes('getProjectConfig') ||
          urlStr.includes('identitytoolkit.googleapis.com/v1/projects');

        if (isProjectConfigUrl) {
          init = Object.assign({}, init || {}, { cache: 'no-store' });
        }

        const res = await origFetch(input, init);
        if (isProjectConfigUrl && res && res.ok) {
          try {
            const clone = res.clone();
            const data = await clone.json();
            ensureCurrentHostAuthorized(data);
            return new Response(JSON.stringify(data), {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers
            });
          } catch (_) {
            return res;
          }
        }
        return res;
      };
    }

    if (typeof window.XMLHttpRequest === 'function') {
      const OrigXHR = window.XMLHttpRequest;
      const origOpen = OrigXHR.prototype.open;
      OrigXHR.prototype.open = function(method, url) {
        this.__wmUrl = typeof url === 'string' ? url : String(url || '');
        if (
          this.__wmUrl.includes('getProjectConfig') ||
          this.__wmUrl.includes('identitytoolkit.googleapis.com/v1/projects')
        ) {
          this.addEventListener('readystatechange', function() {
            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
              try {
                const raw = this.responseText;
                const parsed = JSON.parse(raw);
                ensureCurrentHostAuthorized(parsed);
                const patchedText = JSON.stringify(parsed);
                Object.defineProperty(this, 'responseText', { value: patchedText, configurable: true });
                Object.defineProperty(this, 'response', { value: patchedText, configurable: true });
              } catch (_) {}
            }
          });
        }
        return origOpen.apply(this, arguments);
      };
    }
  })();

  // Your web app's Firebase configuration (wish-magic-47944)
  const firebaseConfig = {
    apiKey: "AIzaSyCiZmxmfgyj555EI4af_rt5X_id31F4Vq0",
    authDomain: "wish-magic-47944.firebaseapp.com",
    projectId: "wish-magic-47944",
    storageBucket: "wish-magic-47944.firebasestorage.app",
    messagingSenderId: "281035115213",
    appId: "1:281035115213:web:2af5b3a6f0ceb6c64eb784"
  };

  window.__FIREBASE_CONFIG__ = firebaseConfig;

  const MASTER_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';

  let fbApp = null;
  let fbAuth = null;
  let fbGoogleProvider = null;
  let fbSdk = null;
  let initPromise = null;
  const stateChangeCallbacks = new Set();

  function trySyncInitCompat() {
    if (fbAuth && fbGoogleProvider && fbSdk) {
      return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk, isReady: true };
    }
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
        console.warn('[WishFirebaseAuth] Compat init note:', compatErr.message || compatErr);
      }
    }
    return null;
  }

  // Initialize synchronously immediately on script load if compat SDK is present
  const syncInstance = trySyncInitCompat();
  if (syncInstance) {
    initPromise = Promise.resolve(syncInstance);
  }

  async function getFirebase() {
    const readySync = trySyncInitCompat();
    if (readySync) return readySync;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const retryCompat = trySyncInitCompat();
      if (retryCompat) return retryCompat;

      // Official Google ESM imports: import { initializeApp } from "firebase/app"
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
        console.warn('[WishFirebaseAuth] Firebase SDK initialization error:', err.message || err);
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
    if (!err) return 'Google sign-in could not be completed. Please try again.';
    const code = err.code || '';
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in window was closed before completing sign-in. Please tap "Continue with Google" again.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Redirecting to Google Sign-In...';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection and try again.';
      default:
        return err.message || 'Google sign-in could not be completed. Please try again.';
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
      // Use synchronous instance if already initialized to preserve browser user-gesture token for popup!
      const fb = trySyncInitCompat() || (await getFirebase());
      if (!fb || !fb.auth || !fb.sdk) {
        const initErr = new Error('Firebase Google Authentication is initializing. Please tap "Continue with Google" again.');
        initErr.code = 'SDK_NOT_READY';
        throw initErr;
      }
      const { auth, provider, sdk } = fb;
      try {
        const result = await sdk.signInWithPopup(auth, provider);
        return result.user;
      } catch (err) {
        const code = (err && err.code) || '';
        // If popup is blocked or unsupported in mobile webview, seamlessly redirect to Google Account Chooser
        if (
          (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/unauthorized-domain') &&
          typeof sdk.signInWithRedirect === 'function'
        ) {
          try {
            await sdk.signInWithRedirect(auth, provider);
            return null;
          } catch (_) {}
        }
        const errObj = new Error(formatFirebaseError(err));
        errObj.code = code || 'AUTH_POPUP_ERROR';
        errObj.originalError = err;
        throw errObj;
      }
    },

    async signOut() {
      try {
        const fb = trySyncInitCompat() || (await getFirebase());
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
      if (fbAuth && fbAuth.currentUser) {
        try { callback(fbAuth.currentUser); } catch (_) {}
      }
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
