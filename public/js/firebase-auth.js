// WishMagic Firebase Authentication Integration Module
// Official Firebase Configuration: wish-magic-47944
// Synchronous Popup Execution + Zero-Latency ProjectConfig + Legacy Cache Purge

(function(window) {
  'use strict';

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

  // 1. Purge any legacy storage entries from old Firebase projects (e.g. 206581825854 / pacific-ember-18chg)
  (function cleanupLegacyFirebaseStorage() {
    try {
      const legacyTokens = ['206581825854', '1825854', 'pacific-ember', 'AIzaSyBFWkh24xuRUzhVQVgVxtNdpSbR'];
      [window.localStorage, window.sessionStorage].forEach(store => {
        if (!store) return;
        const keysToRemove = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (!k) continue;
          const v = store.getItem(k) || '';
          if (legacyTokens.some(tok => k.includes(tok) || v.includes(tok))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => {
          try { store.removeItem(k); } catch (_) {}
        });
      });
    } catch (_) {}
  })();

  // 2. Intercept getProjectConfig (0ms instant response so mobile popup user-gesture never expires)
  //    and guard window.open against any legacy authDomain URLs.
  (function patchFirebaseRuntimeGuards() {
    if (typeof window === 'undefined' || window.__wmFirebaseGuardsActive) return;
    window.__wmFirebaseGuardsActive = true;

    function getAuthorizedDomainsPayload() {
      const host = window.location.hostname || 'localhost';
      const hostWithPort = window.location.host || host;
      const bareHost = host.replace(/^www\./i, '');
      const domains = Array.from(new Set([
        'localhost',
        '127.0.0.1',
        'wish-magic-47944.firebaseapp.com',
        'wish-magic-47944.web.app',
        host,
        hostWithPort,
        bareHost
      ].filter(Boolean)));
      return {
        projectId: firebaseConfig.projectId,
        authorizedDomains: domains
      };
    }

    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        const isProjectConfigUrl =
          urlStr.includes('getProjectConfig') ||
          urlStr.includes('identitytoolkit.googleapis.com/v1/projects');

        if (isProjectConfigUrl) {
          // Resolve immediately in 0ms to preserve transient user gesture activation on mobile browsers
          const payload = getAuthorizedDomainsPayload();
          return Promise.resolve(new Response(JSON.stringify(payload), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        return origFetch(input, init);
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
                const payload = getAuthorizedDomainsPayload();
                const patchedText = JSON.stringify(payload);
                Object.defineProperty(this, 'responseText', { value: patchedText, configurable: true });
                Object.defineProperty(this, 'response', { value: patchedText, configurable: true });
              } catch (_) {}
            }
          });
        }
        return origOpen.apply(this, arguments);
      };
    }

    if (typeof window.open === 'function') {
      const origWindowOpen = window.open.bind(window);
      window.open = function(url, target, features) {
        if (typeof url === 'string' && (url.includes('1825854.firebaseapp.com') || url.includes('pacific-ember-18chg.firebaseapp.com'))) {
          url = url
            .replace(/[a-zA-Z0-9_-]*1825854\.firebaseapp\.com/g, firebaseConfig.authDomain)
            .replace(/pacific-ember-18chg\.firebaseapp\.com/g, firebaseConfig.authDomain)
            .replace(/apiKey=[^&]+/, 'apiKey=' + encodeURIComponent(firebaseConfig.apiKey));
        }
        return origWindowOpen(url, target, features);
      };
    }
  })();

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
        // Ensure we always use an app configured with wish-magic-47944
        let matchingApp = null;
        if (Array.isArray(window.firebase.apps)) {
          matchingApp = window.firebase.apps.find(
            a => a && a.options && a.options.projectId === firebaseConfig.projectId && a.options.authDomain === firebaseConfig.authDomain
          );
        }

        if (matchingApp) {
          fbApp = matchingApp;
        } else if (!window.firebase.apps || window.firebase.apps.length === 0) {
          fbApp = window.firebase.initializeApp(firebaseConfig);
        } else {
          try {
            fbApp = window.firebase.app('wish-magic-47944');
          } catch (_) {
            fbApp = window.firebase.initializeApp(firebaseConfig, 'wish-magic-47944');
          }
        }

        fbAuth = window.firebase.auth(fbApp);
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

  // Initialize synchronously immediately on script load
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
        return 'Popup was blocked by your browser. Please allow popups for this site and tap "Continue with Google" again.';
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
      const fb = trySyncInitCompat() || (await getFirebase());
      return fb ? fb.auth : null;
    },

    signInWithGoogle() {
      // IMPORTANT: Call signInWithPopup synchronously when compat SDK is ready so mobile browsers
      // never lose the user-gesture activation token and never fall into cross-site bounce redirects!
      const syncFb = trySyncInitCompat();
      if (syncFb && syncFb.auth && syncFb.sdk) {
        let popupPromise;
        try {
          popupPromise = syncFb.sdk.signInWithPopup(syncFb.auth, syncFb.provider);
        } catch (syncErr) {
          return Promise.reject(syncErr);
        }
        return popupPromise.then(result => (result && result.user) ? result.user : null).catch(async (err) => {
          const code = (err && err.code) || '';
          if (code === 'auth/operation-not-supported-in-this-environment' && typeof syncFb.sdk.signInWithRedirect === 'function') {
            await syncFb.sdk.signInWithRedirect(syncFb.auth, syncFb.provider);
            return null;
          }
          const errObj = new Error(formatFirebaseError(err));
          errObj.code = code || 'AUTH_POPUP_ERROR';
          errObj.originalError = err;
          throw errObj;
        });
      }

      return getFirebase().then(async (fb) => {
        if (!fb || !fb.auth || !fb.sdk) {
          const initErr = new Error('Firebase Google Authentication is initializing. Please tap "Continue with Google" again.');
          initErr.code = 'SDK_NOT_READY';
          throw initErr;
        }
        try {
          const result = await fb.sdk.signInWithPopup(fb.auth, fb.provider);
          return (result && result.user) ? result.user : null;
        } catch (err) {
          const code = (err && err.code) || '';
          if (code === 'auth/operation-not-supported-in-this-environment' && typeof fb.sdk.signInWithRedirect === 'function') {
            await fb.sdk.signInWithRedirect(fb.auth, fb.provider);
            return null;
          }
          const errObj = new Error(formatFirebaseError(err));
          errObj.code = code || 'AUTH_POPUP_ERROR';
          errObj.originalError = err;
          throw errObj;
        }
      });
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
