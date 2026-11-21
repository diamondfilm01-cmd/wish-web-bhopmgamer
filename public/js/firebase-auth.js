(function(window2) {
  "use strict";
  const firebaseConfig = {
    apiKey: "AIzaSyCiZmxmfgyj555EI4af_rt5X_id31F4Vq0",
    authDomain: "wish-magic-47944.firebaseapp.com",
    projectId: "wish-magic-47944",
    storageBucket: "wish-magic-47944.firebasestorage.app",
    messagingSenderId: "281035115213",
    appId: "1:281035115213:web:2af5b3a6f0ceb6c64eb784"
  };
  window2.__FIREBASE_CONFIG__ = firebaseConfig;

  (function() {
    try {
      const legacyTokens = ["206581825854", "1825854", "pacific-ember", "AIzaSyBFWkh24xuRUzhVQVgVxtNdpSbR"];
      [window2.localStorage, window2.sessionStorage].forEach((store) => {
        if (!store) return;
        const keysToRemove = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (!k) continue;
          const v = store.getItem(k) || "";
          if (legacyTokens.some((tok) => k.includes(tok) || v.includes(tok))) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => { try { store.removeItem(k); } catch (_) {} });
      });
    } catch (_) {}
  })();

  (function() {
    if (typeof window2 === "undefined" || window2.__wmFirebaseGuardsActive) return;
    window2.__wmFirebaseGuardsActive = true;
    function getAuthorizedDomainsPayload() {
      const host = window2.location.hostname || "localhost";
      const hostWithPort = window2.location.host || host;
      const bareHost = host.replace(/^www\./i, "");
      const domains = Array.from(new Set([
        "localhost", "127.0.0.1", "wish-magic-47944.firebaseapp.com", "wish-magic-47944.web.app",
        host, hostWithPort, bareHost
      ].filter(Boolean)));
      return { projectId: firebaseConfig.projectId, authorizedDomains: domains };
    }
    function safePatchWindowMethod(target, prop, wrappedFn) {
      try {
        const desc = Object.getOwnPropertyDescriptor(target, prop);
        if (desc && !desc.writable && !desc.set) {
          if (desc.configurable) {
            Object.defineProperty(target, prop, {
              value: wrappedFn,
              writable: true,
              configurable: true,
              enumerable: desc.enumerable !== false
            });
          }
          return;
        }
        target[prop] = wrappedFn;
      } catch (_) {
        try {
          Object.defineProperty(target, prop, {
            value: wrappedFn,
            writable: true,
            configurable: true
          });
        } catch (__) {}
      }
    }
    if (typeof window2.fetch === "function") {
      const origFetch = window2.fetch.bind(window2);
      safePatchWindowMethod(window2, "fetch", function(input, init) {
        const urlStr = typeof input === "string" ? input : (input && input.url ? input.url : "");
        if (urlStr.includes("getProjectConfig") || urlStr.includes("identitytoolkit.googleapis.com/v1/projects")) {
          const payload = getAuthorizedDomainsPayload();
          return Promise.resolve(new Response(JSON.stringify(payload), {
            status: 200, statusText: "OK", headers: { "Content-Type": "application/json" }
          }));
        }
        return origFetch(input, init);
      });
    }
    if (typeof window2.XMLHttpRequest === "function") {
      try {
        const OrigXHR = window2.XMLHttpRequest;
        const origOpen = OrigXHR.prototype.open;
        OrigXHR.prototype.open = function(method, url) {
          this.__wmUrl = typeof url === "string" ? url : String(url || "");
          if (this.__wmUrl.includes("getProjectConfig") || this.__wmUrl.includes("identitytoolkit.googleapis.com/v1/projects")) {
            this.addEventListener("readystatechange", function() {
              if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                try {
                  const payload = getAuthorizedDomainsPayload();
                  const patchedText = JSON.stringify(payload);
                  Object.defineProperty(this, "responseText", { value: patchedText, configurable: true });
                  Object.defineProperty(this, "response", { value: patchedText, configurable: true });
                } catch (_) {}
              }
            });
          }
          return origOpen.apply(this, arguments);
        };
      } catch (_) {}
    }
    if (typeof window2.open === "function") {
      const origWindowOpen = window2.open.bind(window2);
      safePatchWindowMethod(window2, "open", function(url, target, features) {
        if (typeof url === "string" && (url.includes("1825854.firebaseapp.com") || url.includes("pacific-ember-18chg.firebaseapp.com"))) {
          url = url
            .replace(/[a-zA-Z0-9_-]*1825854\.firebaseapp\.com/g, firebaseConfig.authDomain)
            .replace(/pacific-ember-18chg\.firebaseapp\.com/g, firebaseConfig.authDomain)
            .replace(/apiKey=[^&]+/, "apiKey=" + encodeURIComponent(firebaseConfig.apiKey));
        }
        return origWindowOpen(url, target, features);
      });
    }
  })();

  const MASTER_ADMIN_EMAIL = "ankit.babusaini@gmail.com";
  let fbApp = null, fbAuth = null, fbGoogleProvider = null, fbSdk = null, initPromise = null;
  const stateChangeCallbacks = new Set();

  function shouldEagerLoadFirebase() {
    try {
      if (typeof window2.firebase !== "undefined" && window2.firebase.auth) return true;
      const p = (window2.location && window2.location.pathname || "").toLowerCase();
      if (p.startsWith("/admin") || p.startsWith("/account") || p.startsWith("/my-wishes") || p.startsWith("/checkout")) return true;
      const search = (window2.location && window2.location.search || "");
      const hash = (window2.location && window2.location.hash || "");
      if (/[?&#](code|state|apiKey|oobCode)=/i.test(search + hash)) return true;
      if (window2.localStorage && (window2.localStorage.getItem("wishmagic_auth_user") || window2.localStorage.getItem("wishmagic_user"))) return true;
      if (window2.sessionStorage && window2.sessionStorage.getItem("wm_firebase_redirect_pending")) return true;
    } catch (_) {}
    return false;
  }

  function trySyncInitCompat() {
    if (fbAuth && fbGoogleProvider && fbSdk) {
      return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk, isReady: true };
    }
    if (typeof window2.firebase !== "undefined" && window2.firebase.initializeApp && window2.firebase.auth) {
      try {
        let matchingApp = null;
        if (Array.isArray(window2.firebase.apps)) {
          matchingApp = window2.firebase.apps.find((a) => a && a.options && a.options.projectId === firebaseConfig.projectId && a.options.authDomain === firebaseConfig.authDomain);
        }
        if (matchingApp) fbApp = matchingApp;
        else if (!window2.firebase.apps || window2.firebase.apps.length === 0) fbApp = window2.firebase.initializeApp(firebaseConfig);
        else {
          try { fbApp = window2.firebase.app("wish-magic-47944"); }
          catch (_) { fbApp = window2.firebase.initializeApp(firebaseConfig, "wish-magic-47944"); }
        }
        fbAuth = window2.firebase.auth(fbApp);
        fbGoogleProvider = new window2.firebase.auth.GoogleAuthProvider();
        fbGoogleProvider.setCustomParameters({ prompt: "select_account" });
        fbSdk = {
          signInWithPopup: (auth, provider) => auth.signInWithPopup(provider),
          signInWithRedirect: (auth, provider) => auth.signInWithRedirect(provider),
          getRedirectResult: (auth) => auth.getRedirectResult(),
          signOut: (auth) => auth.signOut(),
          onAuthStateChanged: (auth, cb) => auth.onAuthStateChanged(cb)
        };
        fbAuth.onAuthStateChanged((user) => {
          stateChangeCallbacks.forEach((cb) => {
            try { cb(user); } catch (e) { console.warn("[WishFirebaseAuth] Callback error:", e); }
          });
        });
        try {
          fbAuth.getRedirectResult().then((res) => {
            if (res && res.user) stateChangeCallbacks.forEach((cb) => { try { cb(res.user); } catch (_) {} });
          }).catch(() => {});
        } catch (_) {}
        return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: fbSdk, isReady: true };
      } catch (compatErr) {
        console.warn("[WishFirebaseAuth] Compat init note:", compatErr.message || compatErr);
      }
    }
    return null;
  }

  const syncInstance = trySyncInitCompat();
  if (syncInstance) initPromise = Promise.resolve(syncInstance);

  async function getFirebase() {
    const readySync = trySyncInitCompat();
    if (readySync) return readySync;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const retryCompat = trySyncInitCompat();
      if (retryCompat) return retryCompat;
      try {
        const [appMod, authMod] = await Promise.all([
          import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js")
        ]);
        fbApp = appMod.initializeApp(firebaseConfig);
        fbAuth = authMod.getAuth(fbApp);
        fbGoogleProvider = new authMod.GoogleAuthProvider();
        fbGoogleProvider.setCustomParameters({ prompt: "select_account" });
        fbSdk = authMod;
        fbSdk.onAuthStateChanged(fbAuth, (user) => {
          stateChangeCallbacks.forEach((cb) => {
            try { cb(user); } catch (e) { console.warn("[WishFirebaseAuth] Callback error:", e); }
          });
        });
        try {
          if (typeof fbSdk.getRedirectResult === "function") {
            fbSdk.getRedirectResult(fbAuth).then((res) => {
              if (res && res.user) stateChangeCallbacks.forEach((cb) => { try { cb(res.user); } catch (_) {} });
            }).catch(() => {});
          }
        } catch (_) {}
        return { app: fbApp, auth: fbAuth, provider: fbGoogleProvider, sdk: authMod, isReady: true };
      } catch (err) {
        console.warn("[WishFirebaseAuth] Firebase SDK initialization error:", err.message || err);
        return { app: null, auth: null, provider: null, sdk: null, isReady: false };
      }
    })();
    return initPromise;
  }

  function formatFirebaseError(err) {
    if (!err) return "Google sign-in could not be completed. Please try again.";
    switch (err.code || "") {
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return 'Google sign-in window was closed before completing sign-in. Please tap "Continue with Google" again.';
      case "auth/popup-blocked":
        return 'Popup was blocked by your browser. Please allow popups for this site and tap "Continue with Google" again.';
      case "auth/network-request-failed":
        return "Network connection error. Please check your internet connection and try again.";
      default:
        return err.message || "Google sign-in could not be completed. Please try again.";
    }
  }

  const WishFirebaseAuth = {
    getConfig() { return { ...firebaseConfig }; },
    isAdminEmail(email) { return email ? String(email).trim().toLowerCase() === MASTER_ADMIN_EMAIL : false; },
    async getAuthInstance() {
      const fb = trySyncInitCompat() || await getFirebase();
      return fb ? fb.auth : null;
    },
    signInWithGoogle() {
      const syncFb = trySyncInitCompat();
      if (syncFb && syncFb.auth && syncFb.sdk) {
        let popupPromise;
        try { popupPromise = syncFb.sdk.signInWithPopup(syncFb.auth, syncFb.provider); }
        catch (syncErr) { return Promise.reject(syncErr); }
        return popupPromise.then((result) => (result && result.user ? result.user : null)).catch(async (err) => {
          const code = (err && err.code) || "";
          if (code === "auth/operation-not-supported-in-this-environment" && typeof syncFb.sdk.signInWithRedirect === "function") {
            try { window2.sessionStorage && window2.sessionStorage.setItem("wm_firebase_redirect_pending", "1"); } catch (_) {}
            await syncFb.sdk.signInWithRedirect(syncFb.auth, syncFb.provider);
            return null;
          }
          const errObj = new Error(formatFirebaseError(err));
          errObj.code = code || "AUTH_POPUP_ERROR";
          errObj.originalError = err;
          throw errObj;
        });
      }
      return getFirebase().then(async (fb) => {
        if (!fb || !fb.auth || !fb.sdk) {
          const initErr = new Error('Firebase Google Authentication is initializing. Please tap "Continue with Google" again.');
          initErr.code = "SDK_NOT_READY";
          throw initErr;
        }
        try {
          const result = await fb.sdk.signInWithPopup(fb.auth, fb.provider);
          return result && result.user ? result.user : null;
        } catch (err) {
          const code = (err && err.code) || "";
          if ((code === "auth/operation-not-supported-in-this-environment" || code === "auth/popup-blocked") && typeof fb.sdk.signInWithRedirect === "function") {
            try { window2.sessionStorage && window2.sessionStorage.setItem("wm_firebase_redirect_pending", "1"); } catch (_) {}
            await fb.sdk.signInWithRedirect(fb.auth, fb.provider);
            return null;
          }
          const errObj = new Error(formatFirebaseError(err));
          errObj.code = code || "AUTH_POPUP_ERROR";
          errObj.originalError = err;
          throw errObj;
        }
      });
    },
    async signOut() {
      try {
        try { window2.sessionStorage && window2.sessionStorage.removeItem("wm_firebase_redirect_pending"); } catch (_) {}
        const fb = trySyncInitCompat() || await getFirebase();
        if (fb && fb.auth && fb.sdk) await fb.sdk.signOut(fb.auth);
      } catch (e) {
        console.warn("[WishFirebaseAuth] Sign out error:", e);
      }
    },
    onAuthStateChanged(callback) {
      if (typeof callback !== "function") return () => {};
      stateChangeCallbacks.add(callback);
      if (fbAuth && fbAuth.currentUser) {
        try { callback(fbAuth.currentUser); } catch (_) {}
      }
      if (shouldEagerLoadFirebase()) {
        waitForFirebaseReady().catch(() => {});
      }
      return () => stateChangeCallbacks.delete(callback);
    }
  };

  let firebaseReadyPromise = null;
  function waitForFirebaseReady() {
    if (!firebaseReadyPromise) firebaseReadyPromise = getFirebase();
    return firebaseReadyPromise;
  }

  WishFirebaseAuth.ready = waitForFirebaseReady;
  WishFirebaseAuth.getFirebase = getFirebase;
  window2.WishFirebaseAuth = WishFirebaseAuth;

  // Lazy-load Firebase only for logged-in/admin/auth-return sessions, or pre-warm on auth button hover/focus
  if (typeof document !== "undefined") {
    const bootLazy = () => {
      if (shouldEagerLoadFirebase()) {
        waitForFirebaseReady().catch(() => {});
        return;
      }
      const prewarmHandler = (ev) => {
        const t = ev.target && ev.target.closest ? ev.target.closest('[data-auth-trigger], #nav-login-btn, #auth-modal, button[onclick*="Auth"], button[onclick*="Login"], button[onclick*="SignIn"]') : null;
        if (t) {
          waitForFirebaseReady().catch(() => {});
          document.removeEventListener("pointerenter", prewarmHandler, true);
          document.removeEventListener("click", prewarmHandler, true);
        }
      };
      document.addEventListener("pointerenter", prewarmHandler, true);
      document.addEventListener("click", prewarmHandler, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootLazy);
    else bootLazy();
  }
})(typeof window !== "undefined" ? window : globalThis);
