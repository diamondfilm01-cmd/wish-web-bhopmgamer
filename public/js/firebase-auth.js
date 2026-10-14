// WishMagic Firebase Authentication Integration Module
// Official Firebase Google Sign-In (Popup & Redirect) with Dynamic Project Config & Domain Authorization Sync
// Project: pacific-ember-18chg

(function(window) {
  'use strict';

  // Intercept Firebase getProjectConfig / v1/projects requests so client-side SDK never uses a stale
  // cached authorizedDomains list and always recognizes the current hostname.
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

    // 1. Patch window.fetch for modular Firebase Auth SDK (v10)
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

    // 2. Patch XMLHttpRequest for compat Firebase Auth SDK
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
      // 1. Always sync live Firebase config from /api/auth/config if configured on server
      try {
        const res = await fetch('/api/auth/config', { cache: 'no-store' });
        if (res.ok) {
          const serverConfig = await res.json().catch(() => ({}));
          const cfg = (serverConfig && serverConfig.data) || serverConfig;
          if (cfg && cfg.apiKey) {
            firebaseConfig.apiKey = cfg.apiKey;
          }
          if (cfg && cfg.projectId) {
            firebaseConfig.projectId = cfg.projectId;
            if (!cfg.authDomain || cfg.authDomain === 'pacific-ember-18chg.firebaseapp.com') {
              firebaseConfig.authDomain = `${cfg.projectId}.firebaseapp.com`;
            }
          }
          if (cfg && cfg.authDomain && cfg.authDomain !== 'pacific-ember-18chg.firebaseapp.com') {
            firebaseConfig.authDomain = cfg.authDomain;
          }
          if (cfg && cfg.storageBucket) firebaseConfig.storageBucket = cfg.storageBucket;
          if (cfg && cfg.appId) firebaseConfig.appId = cfg.appId;
        }
      } catch (_) {}

      // 2. Auto-detect projectId & authDomain from Identity Toolkit if API key belongs to a custom Firebase project
      if (firebaseConfig.apiKey) {
        try {
          const projRes = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`, { cache: 'no-store' });
          if (projRes.ok) {
            const projData = await projRes.json().catch(() => ({}));
            if (projData && projData.projectId) {
              firebaseConfig.projectId = projData.projectId;
              firebaseConfig.authDomain = `${projData.projectId}.firebaseapp.com`;
            }
          }
        } catch (_) {}
      }

      if (!firebaseConfig.apiKey) {
        return { app: null, auth: null, provider: null, sdk: null, isReady: false };
      }

      // 3. Initialize via Global Compat SDK if present
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
          console.warn('[WishFirebaseAuth] Global SDK init note, trying ESM:', compatErr.message || compatErr);
        }
      }

      // 4. Fallback to Official Google ESM imports
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
        const initErr = new Error('GOOGLE_CHOOSER_FALLBACK');
        initErr.code = 'auth/account-chooser-fallback';
        throw initErr;
      }
      const { auth, provider, sdk } = fb;
      try {
        const result = await sdk.signInWithPopup(auth, provider);
        return result.user;
      } catch (err) {
        const code = (err && err.code) || 'auth/account-chooser-fallback';
        const errObj = new Error(err && err.message ? err.message : 'Google sign-in popup note');
        errObj.code = code;
        errObj.originalError = err;
        throw errObj;
      }
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
