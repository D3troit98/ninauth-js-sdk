(function () {
  const OAUTH_CONTEXT_INIT_PREFIX = "ninauth:oauth-init:";
  const OAUTH_CONTEXT_REQUEST_PREFIX = "ninauth:oauth-context:";
  const PKCE_PREFIX = "ninauth-sdk-pkce:";
  const TRANSACTION_TTL_MS = 15 * 60 * 1000;
  const MIN_CUSTOM_STATE_LENGTH = 16;
  const KNOWN_BACKEND_ORIGINS = ["https://sso.ninauth.nimc.gov.ng", "https://sso.nimc.gov.ng"];
  function joinUrl(baseUrl, path) {
    return String(baseUrl || "").replace(/\/$/, "") + path;
  }

  function apiBaseUrl(config) {
    return new URL(config.baseUrl || "/api/v1", config.hostedOrigin || window.location.origin)
      .toString()
      .replace(/\/$/, "");
  }

  function base64UrlEncode(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function isExpired(record) {
    return !record || !record.createdAt || Date.now() - record.createdAt > TRANSACTION_TTL_MS;
  }

  function compactRecord(record) {
    return Object.fromEntries(
      Object.entries(record || {}).filter(function ([, value]) {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== "";
      }),
    );
  }

  function applyOptionalParams(urlValue, baseOrigin, params, ownedKeys) {
    const url = new URL(urlValue, baseOrigin || window.location.origin);
    Object.entries(params || {}).forEach(function ([key, value]) {
      if (Array.isArray(value)) {
        if (value.length || (ownedKeys || []).indexOf(key) >= 0)
          url.searchParams.set(key, value.join(" "));
      } else if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      } else if ((ownedKeys || []).indexOf(key) >= 0) {
        url.searchParams.delete(key);
      }
    });
    return url;
  }

  async function parseJsonResponse(res, fallbackMessage) {
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const message =
        body && typeof body === "object"
          ? body.message || body.error || fallbackMessage
          : body || fallbackMessage;
      const error = new Error(message);
      error.status = res.status;
      error.body = body;
      throw error;
    }

    return body;
  }

  function buildHeaders(headers) {
    return Object.assign({ "Content-Type": "application/json" }, headers || {});
  }

  function isDevLikeHost(hostname) {
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost") ||
      hostname.indexOf("dev.") === 0 ||
      hostname.indexOf(".dev.") >= 0 ||
      hostname.indexOf("staging.") === 0 ||
      hostname.indexOf(".staging.") >= 0
    );
  }

  function isDebugLoggingEnabled(config) {
    if (config && config.debugLogs === true) return true;
    try {
      if (window.localStorage.getItem("ninauth:debugLogs") === "true") return true;
    } catch {
      // Storage may be unavailable in private browsing or embedded contexts.
    }
    try {
      return isDevLikeHost(window.location.hostname);
    } catch {
      return false;
    }
  }

  function requireValue(name, value) {
    if (value === undefined || value === null || value === "") {
      throw new Error("NINAuth " + name + " is required.");
    }
    return value;
  }

  function normalizePkceKey(value) {
    if (!value) return undefined;
    let next = String(value).trim();
    for (let index = 0; index < 3; index += 1) {
      try {
        const decoded = decodeURIComponent(next);
        if (decoded === next) break;
        next = decoded;
      } catch {
        break;
      }
    }
    const marker = "ninauth-sdk-pkce:";
    const markerIndex = next.indexOf(marker);
    if (markerIndex >= 0) return next.slice(markerIndex);
    if (next.indexOf("253A") === 0) return marker + next.slice(4);
    if (next.indexOf("%3A") === 0) return marker + next.slice(3);
    return next;
  }

  function oauthInitKey(state) {
    return OAUTH_CONTEXT_INIT_PREFIX + state;
  }

  function oauthRequestKey(requestId) {
    return OAUTH_CONTEXT_REQUEST_PREFIX + requestId;
  }

  function storageRecordIsExpired(raw) {
    if (!raw) return true;
    try {
      return isExpired(JSON.parse(raw));
    } catch {
      var timestamp = Number(raw);
      return Number.isFinite(timestamp) && Date.now() - timestamp > TRANSACTION_TTL_MS;
    }
  }

  function cleanupOauthSessionStorage() {
    try {
      var expiredStates = new Set();
      Object.keys(window.sessionStorage).forEach(function (key) {
        if (key.indexOf(OAUTH_CONTEXT_INIT_PREFIX) === 0) {
          var initRaw = window.sessionStorage.getItem(key);
          var state = key.slice(OAUTH_CONTEXT_INIT_PREFIX.length);
          if (storageRecordIsExpired(initRaw)) {
            expiredStates.add(state);
            window.sessionStorage.removeItem(key);
          }
        }
        if (key.indexOf(OAUTH_CONTEXT_REQUEST_PREFIX) === 0) {
          var requestRaw = window.sessionStorage.getItem(key);
          if (storageRecordIsExpired(requestRaw)) window.sessionStorage.removeItem(key);
        }
        if (key.indexOf("ninauth-demo-completed:") === 0) {
          var completedRaw = window.sessionStorage.getItem(key);
          if (storageRecordIsExpired(completedRaw)) window.sessionStorage.removeItem(key);
        }
      });
      expiredStates.forEach(function (state) {
        window.sessionStorage.removeItem("ninauth-authorize-call-count:" + state);
        window.sessionStorage.removeItem("ninauth-authorize-restarted:" + state);
        window.sessionStorage.removeItem("ninauth-demo-token-exchange:" + state);
      });
    } catch {
      // Storage may be unavailable in private browsing or embedded contexts.
    }
  }

  function persistOauthRequestContext(context, config) {
    try {
      cleanupOauthSessionStorage();
      const next = compactRecord(
        Object.assign({}, context || {}, {
          createdAt: context && context.createdAt ? context.createdAt : Date.now(),
        }),
      );
      if (!next.state) return;
      const key = next.requestId ? oauthRequestKey(next.requestId) : oauthInitKey(next.state);
      window.sessionStorage.setItem(key, JSON.stringify(next));
      debugLog("persisted oauth context", {
        sessionStorageKey: key,
        context: next,
      }, config);
    } catch (error) {
      debugLog("oauth context persist failed", {
        error: error instanceof Error ? error.message : String(error),
      }, config);
    }
  }

  function backendOrigins(config) {
    const origins = new Set(KNOWN_BACKEND_ORIGINS);
    try {
      origins.add(new URL(apiBaseUrl(config || {}), window.location.origin).origin);
    } catch {
      // ignore invalid configured origins
    }
    return origins;
  }

  function normalizeProxyUrl(value, config) {
    if (!value) return value;
    try {
      const url = new URL(value, window.location.origin);
      if (backendOrigins(config).has(url.origin) && /\/api\/v\d+\//.test(url.pathname)) {
        return url.pathname.replace(/^.*?\/api\/v\d+(?=\/oauth\/)/, "") + url.search + url.hash;
      }
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
      return value;
    } catch {
      return value;
    }
  }

  // Reduce any backend API base that precedes an /oauth/ route down to the bare
  // hosted route. Handles "/api/v1/oauth/…", "/provider/api/v1/oauth/…", and the
  // same on an absolute backend host (e.g. https://sso.…/provider/api/v1/…).
  var OAUTH_API_PREFIX = /^.*?\/api\/v\d+(?=\/oauth\/)/;

  function normalizeBrowserOauthUrl(value, config) {
    if (!value) return value;
    try {
      const url = new URL(value, window.location.origin);
      if (backendOrigins(config).has(url.origin)) {
        url.pathname = url.pathname.replace(OAUTH_API_PREFIX, "");
      }
      if (url.pathname.replace(/\/$/, "").endsWith("/qr-code")) {
        const returnTo = url.searchParams.get("return_to");
        if (returnTo) return normalizeBrowserOauthUrl(returnTo, config);
      }
      if (url.pathname === "/" && url.searchParams.get("return_to")) {
        return url.pathname + url.search + url.hash;
      }
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
      if (backendOrigins(config).has(url.origin) && url.pathname.indexOf("/oauth/") === 0) {
        return url.pathname + url.search + url.hash;
      }
      return url.toString();
    } catch {
      return value.replace(OAUTH_API_PREFIX, "");
    }
  }

  function readHtmlRedirectUrl(text) {
    if (!text) return null;
    const match = String(text).match(/href=["']([^"']+)["']/i);
    return match ? match[1].replace(/&amp;/g, "&") : null;
  }

  function debugLog(label, details, config) {
    if (isDebugLoggingEnabled(config) && typeof console !== "undefined") {
      console.log("[NINAuth SDK] " + label, details);
    }
  }

  function createState() {
    const stateBytes = new Uint8Array(16);
    window.crypto.getRandomValues(stateBytes);
    return base64UrlEncode(stateBytes);
  }

  function validateState(state) {
    if (state !== undefined && state !== null) {
      if (typeof state !== "string" || state.trim().length < MIN_CUSTOM_STATE_LENGTH) {
        throw new Error("NINAuth state must be an unpredictable string of at least 16 characters.");
      }
      return state;
    }
    return createState();
  }

  async function createPkce() {
    const verifierBytes = new Uint8Array(32);
    window.crypto.getRandomValues(verifierBytes);
    const verifier = base64UrlEncode(verifierBytes);
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return {
      verifier: verifier,
      challenge: base64UrlEncode(digest),
    };
  }

  function pkceStorageKey(state) {
    return PKCE_PREFIX + state;
  }

  function resolvePkceState(value) {
    if (!value) return null;
    const normalized = normalizePkceKey(value);
    if (!normalized) return null;
    return normalized.indexOf(PKCE_PREFIX) === 0
      ? normalized.slice(PKCE_PREFIX.length)
      : normalized;
  }

  function readCallbackState(value) {
    try {
      const params = value
        ? new URL(value, window.location.origin).searchParams
        : new URL(window.location.href).searchParams;
      return params.get("state");
    } catch {
      return null;
    }
  }

  function writePkceTransaction(transaction) {
    const key = pkceStorageKey(transaction.state);
    const value = JSON.stringify(transaction);
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      debugLog("pkce write failed", {
        storage: "sessionStorage",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // OAuth callbacks can be opened in a new tab/window by an identity provider.
    // That browsing context does not share sessionStorage with the tab that
    // started PKCE. Keep the same short-lived, state-scoped transaction in
    // localStorage so the callback can recover it, then delete it on completion.
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      debugLog("pkce write failed", {
        storage: "localStorage",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function readPkceTransaction(stateOrPkceKey) {
    const state = resolvePkceState(stateOrPkceKey) || readCallbackState();
    if (!state) return null;
    const key = pkceStorageKey(state);
    try {
      const sessionRaw = window.sessionStorage.getItem(key);
      const localRaw = window.localStorage.getItem(key);
      const raw = sessionRaw || localRaw;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.state !== state || !parsed.verifier) return null;
      if (isExpired(parsed)) {
        window.sessionStorage.removeItem(key);
        window.localStorage.removeItem(key);
        return null;
      }
      if (!sessionRaw) window.sessionStorage.setItem(key, raw);
      return parsed;
    } catch (error) {
      debugLog("pkce read failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  function eachStorageKey(storage, callback) {
    if (!storage) return;
    if (typeof storage.length === "number" && typeof storage.key === "function") {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) callback(key);
      }
      return;
    }
    Object.keys(storage).forEach(callback);
  }

  function recoverCallbackState(config) {
    const configuredRedirectUri =
      config.redirectUri || window.location.origin + window.location.pathname;
    const candidates = [];
    try {
      function collectCandidate(storage) {
        eachStorageKey(storage, function (key) {
          if (key.indexOf(PKCE_PREFIX) !== 0) return;
          const raw = storage.getItem(key);
          if (!raw) return;
          let transaction = null;
          try {
            transaction = JSON.parse(raw);
          } catch {
            storage.removeItem(key);
            return;
          }
          if (!transaction || typeof transaction !== "object" || !transaction.state) return;
          if (isExpired(transaction)) {
            storage.removeItem(key);
            return;
          }
          if (transaction.clientId && config.clientId && transaction.clientId !== config.clientId) {
            return;
          }
          if (
            transaction.redirectUri &&
            configuredRedirectUri &&
            transaction.redirectUri !== configuredRedirectUri
          ) {
            return;
          }
          if (candidates.indexOf(transaction.state) < 0) candidates.push(transaction.state);
        });
      }
      collectCandidate(window.sessionStorage);
      collectCandidate(window.localStorage);
    } catch (error) {
      debugLog("pkce recovery failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function clearPkceStorage() {
    try {
      [window.sessionStorage, window.localStorage].forEach(function (storage) {
        eachStorageKey(storage, function (key) {
          if (key.indexOf(PKCE_PREFIX) === 0) storage.removeItem(key);
        });
      });
    } catch (error) {
      debugLog("pkce cleanup skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function getCodeVerifier(stateOrPkceKey) {
    try {
      const transaction = readPkceTransaction(stateOrPkceKey);
      return transaction ? transaction.verifier : null;
    } catch (error) {
      debugLog("pkce read failed", {
        error: error instanceof Error ? error.message : String(error),
        key: stateOrPkceKey,
      });
      return null;
    }
  }

  function clearCodeVerifier(stateOrPkceKey) {
    try {
      const state = resolvePkceState(stateOrPkceKey) || readCallbackState();
      if (state) {
        window.sessionStorage.removeItem(pkceStorageKey(state));
        window.localStorage.removeItem(pkceStorageKey(state));
      }
    } catch (error) {
      debugLog("pkce clear failed", {
        error: error instanceof Error ? error.message : String(error),
        key: stateOrPkceKey,
      });
    }
  }

  async function readRedirectUrl(res) {
    const headerLocation = res.headers.get("Location");
    if (headerLocation) {
      debugLog("redirect header", {
        status: res.status,
        url: res.url,
        location: headerLocation,
      });
      return headerLocation;
    }

    try {
      const text = await res.text();
      const bodyLocation = readHtmlRedirectUrl(text);
      debugLog("redirect body", {
        status: res.status,
        url: res.url,
        location: bodyLocation,
        bodyPreview: text.slice(0, 240),
      });
      return bodyLocation;
    } catch {
      debugLog("redirect unavailable", {
        status: res.status,
        url: res.url,
      });
      return null;
    }
  }

  function createClient(options) {
    const config = Object.assign(
      {
        baseUrl: "/api/v1",
        loginUrl: "/oauth/login",
        authorizeUrl: "/oauth/authorize",
        clientId: "",
        appId: "",
        redirectUri: window.location.origin + window.location.pathname,
        responseType: "code",
        scope: ["firstName", "lastName"],
        codeChallengeMethod: "S256",
        hostedOrigin: window.location.origin,
        buttonText: "Continue with NINAuth",
        variant: "green",
        type: "personal",
      },
      options || {},
    );

    let inFlightSignIn = null;

    const client = {
      config: config,
      authorizeUrl: function (overrides) {
        const next = Object.assign({}, config, overrides || {});
        const url = applyOptionalParams(
          normalizeBrowserOauthUrl(
            next.authorizeUrl || joinUrl(next.baseUrl, "/oauth/authorize"),
            next,
          ),
          next.hostedOrigin || window.location.origin,
          {
            client_id: next.clientId,
            app_id: next.appId,
            redirect_uri: next.redirectUri,
            response_type: next.responseType,
            code_challenge: next.codeChallenge,
            code_challenge_method: next.codeChallengeMethod,
            scope: next.scope,
            request_id: next.requestId,
            state: next.state,
            pkce_key: next.pkceKey,
            type: next.type,
          },
          [
            "client_id",
            "app_id",
            "redirect_uri",
            "response_type",
            "code_challenge",
            "code_challenge_method",
            "scope",
            "request_id",
            "state",
            "pkce_key",
            "type",
          ],
        );
        return url.toString();
      },
      loginPageUrl: function (overrides) {
        const next = Object.assign({}, config, overrides || {});
        const url = applyOptionalParams(
          next.loginUrl,
          next.hostedOrigin || window.location.origin,
          { return_to: normalizeProxyUrl(this.authorizeUrl(overrides), next) },
          ["return_to"],
        );
        return url.toString();
      },
      signIn: async function (overrides) {
        if (inFlightSignIn) return inFlightSignIn;
        inFlightSignIn = this.startSignIn(overrides).finally(function () {
          inFlightSignIn = null;
        });
        return inFlightSignIn;
      },
      startSignIn: async function (overrides) {
        const next = Object.assign({}, overrides || {});
        const resolved = Object.assign({}, config, next);
        const state = validateState(next.state);
        const pkce = await createPkce();
        const pkceKey = pkceStorageKey(state);
        const pkceTransaction = {
          state: state,
          verifier: pkce.verifier,
          challenge: pkce.challenge,
          clientId: resolved.clientId,
          redirectUri: resolved.redirectUri,
          createdAt: Date.now(),
        };
        try {
          writePkceTransaction(pkceTransaction);
          window.dispatchEvent(
            new CustomEvent("ninauth:pkce", {
              detail: {
                state: state,
                pkceKey: pkceKey,
                codeChallenge: pkce.challenge,
              },
            }),
          );
        } catch (error) {
          debugLog("pkce storage failed", {
            error: error instanceof Error ? error.message : String(error),
          }, resolved);
        }
        const authorizeUrl = this.authorizeUrl(
          Object.assign({}, next, {
            state: state,
            pkceKey: pkceKey,
            codeChallenge: pkce.challenge,
          }),
        );
        const loginUrl = this.loginPageUrl(
          Object.assign({}, next, {
            state: state,
            pkceKey: pkceKey,
            codeChallenge: pkce.challenge,
          }),
        );
        persistOauthRequestContext({
          clientId: resolved.clientId,
          appId: resolved.appId,
          redirectUri: resolved.redirectUri,
          state: state,
          pkceKey: pkceKey,
          scope: resolved.scope,
          codeChallenge: pkce.challenge,
          requestId: resolved.requestId,
          type: resolved.type,
        }, resolved);
        debugLog("button sign-in redirect", {
          state: state,
          pkceKey: pkceKey,
          authorizeUrl: authorizeUrl,
          anticipatedLoginUrl: loginUrl,
          location: authorizeUrl,
          redirectUri: resolved.redirectUri,
        }, resolved);
        window.location.assign(authorizeUrl);
        return {
          state: state,
          pkceKey: pkceKey,
          authorizeUrl: authorizeUrl,
          anticipatedLoginUrl: loginUrl,
          location: authorizeUrl,
          requestId: next.requestId || config.requestId,
        };
      },
      signOut: async function (signOutOptions) {
        const next = Object.assign({}, signOutOptions || {});
        const logoutUrl = applyOptionalParams(
          joinUrl(apiBaseUrl(config), "/oauth/logout"),
          window.location.origin,
          {
            post_logout_redirect_uri:
              next.postLogoutRedirectUri || config.redirectUri || window.location.origin,
          },
          ["post_logout_redirect_uri"],
        ).toString();
        const res = await fetch(logoutUrl, {
          method: "POST",
          credentials: "include",
          redirect: "manual",
          headers: {
            Accept: "application/json",
          },
        });
        return {
          ok: res.ok || res.status === 0 || res.status === 302,
          location: normalizeBrowserOauthUrl(await readRedirectUrl(res), config),
          status: res.status,
        };
      },
      handleCallback: function (urlValue) {
        const url = new URL(urlValue || window.location.href, window.location.origin);
        const error = url.searchParams.get("error");
        if (error) {
          const description = url.searchParams.get("error_description");
          throw new Error(description ? error + ": " + description : error);
        }
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const rcNumber = url.searchParams.get("rc_number");
        const pkceKey = normalizePkceKey(url.searchParams.get("pkce_key"));
        const pkceState = resolvePkceState(pkceKey);
        const state = returnedState || pkceState || recoverCallbackState(config);
        if (!code) throw new Error("NINAuth callback is missing code.");
        if (!state) {
          throw new Error(
            "NINAuth callback is missing state and no matching PKCE transaction could be recovered.",
          );
        }
        const transactionKey = pkceStorageKey(pkceState || state);
        const transaction = readPkceTransaction(pkceState || state);
        if (!transaction) {
          debugLog(
            "callback PKCE transaction missing",
            {
              returnedState: returnedState,
              pkceKey: pkceKey,
              resolvedState: state,
              transactionKey: transactionKey,
              sessionRecordPresent: Boolean(window.sessionStorage.getItem(transactionKey)),
              localRecordPresent: Boolean(window.localStorage.getItem(transactionKey)),
              callbackUrl: url.origin + url.pathname,
            },
            config,
          );
          throw new Error("NINAuth callback state is unknown or expired.");
        }
        if (transaction.clientId && config.clientId && transaction.clientId !== config.clientId) {
          throw new Error("NINAuth callback state does not belong to this client.");
        }
        const configuredRedirectUri =
          config.redirectUri || window.location.origin + window.location.pathname;
        if (
          transaction.redirectUri &&
          configuredRedirectUri &&
          transaction.redirectUri !== configuredRedirectUri
        ) {
          throw new Error("NINAuth callback state does not belong to this redirect URI.");
        }
        return {
          code: code,
          state: state,
          codeVerifier: transaction.verifier,
          pkceKey: pkceKey || pkceStorageKey(state),
          rcNumber: rcNumber && rcNumber.trim() ? rcNumber.trim() : undefined,
        };
      },
      completeCallback: function (state) {
        clearCodeVerifier(state);
        clearCodeVerifier(
          normalizePkceKey(new URL(window.location.href).searchParams.get("pkce_key")),
        );
      },
      exchangeToken: async function (payload) {
        const res = await fetch(joinUrl(apiBaseUrl(config), "/oauth/token"), {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            client_id: requireValue("client_id", payload && payload.client_id),
            app_id: requireValue("app_id", payload && payload.app_id),
            redirect_uri: requireValue("redirect_uri", payload && payload.redirect_uri),
            grant_type: (payload && payload.grant_type) || "authorization_code",
            code: requireValue("code", payload && payload.code),
            code_verifier: requireValue("code_verifier", payload && payload.code_verifier),
            rc_number: (payload && payload.rc_number) || "",
          }),
        });
        const body = await parseJsonResponse(res, "Unable to exchange NINAuth authorization code.");
        if (payload && payload.state) clearCodeVerifier(payload.state);
        return body;
      },
      fetchUserInfo: async function (accessToken, rcNumber) {
        const userInfoUrl = new URL(
          joinUrl(apiBaseUrl(config), "/oauth/userinfo"),
          window.location.origin,
        );
        if (rcNumber && String(rcNumber).trim()) {
          userInfoUrl.searchParams.set("rc_number", String(rcNumber).trim());
        }
        const res = await fetch(userInfoUrl.toString(), {
          headers: { Authorization: "Bearer " + requireValue("accessToken", accessToken) },
        });
        return parseJsonResponse(res, "Unable to fetch NINAuth user info.");
      },
    };

    return client;
  }

  function buttonIcon() {
    return (
      '<svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M6.62808 0C10.2887 0 13.2562 2.87896 13.2562 6.43033C13.2562 9.98178 10.2887 12.8607 6.62808 12.8607C2.96746 12.8607 0 9.98178 0 6.43033C0 2.87896 2.96746 0 6.62808 0ZM7.86894 10.0184H5.39477C4.8279 10.0327 4.36527 9.47585 4.49961 8.94148L5.23542 6.53393C4.6258 6.03445 4.34775 5.24662 4.52248 4.4679C4.69757 3.68809 5.35659 3.05359 6.16225 2.88915C6.81378 2.75579 7.47866 2.90915 7.98634 3.30867C8.49401 3.70844 8.78526 4.30117 8.78526 4.93479C8.78526 5.55493 8.50325 6.13758 8.02088 6.53347L8.7584 8.91909C8.90168 9.47764 8.44828 10.0264 7.8692 10.0184H7.86898H7.86894Z"/>' +
      '<path d="M6.53854 15.9999C4.43654 15.9999 2.33458 15.2244 0.733529 13.6733C0.426466 13.3801 0.40687 12.9014 0.696301 12.5855C0.995148 12.2593 1.50955 12.2299 1.84577 12.5197L1.84624 12.5201C1.85813 12.5304 1.86977 12.541 1.88104 12.5519C4.44683 15.041 8.61996 15.0436 11.1888 12.5589C11.3366 12.4117 11.5432 12.3203 11.7718 12.3203C12.2215 12.3203 12.5862 12.6738 12.5862 13.1102C12.5862 13.3197 12.5004 13.521 12.3476 13.6692C10.746 15.223 8.64229 15.9999 6.53854 15.9999H6.5385L6.53854 15.9999Z"/>' +
      '<path d="M11.7712 12.3205C11.5426 12.3205 11.336 12.4119 11.1881 12.559C9.90486 13.8003 8.22128 14.4208 6.5376 14.4207V16.0001L6.53789 16.0001C8.64163 16.0001 10.7454 15.2232 12.347 13.6694C12.4997 13.5212 12.5855 13.3199 12.5855 13.1103C12.5855 12.6739 12.2209 12.3204 11.7712 12.3204V12.3205Z"/>' +
      "</svg>"
    );
  }

  function renderButton(selector, options) {
    const root = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!root) throw new Error("NINAuth button target was not found.");

    const client = createClient(options);
    const variant = client.config.variant === "white" ? "white" : "green";
    const isBusiness = client.config.type === "business";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ninauth-launch-button ninauth-launch-button--" + variant;

    const iconContainer = document.createElement("span");
    iconContainer.innerHTML = buttonIcon();

    const label = document.createElement("span");
    const buttonText = options && options.buttonText ? options.buttonText : client.config.buttonText;
    const displayButtonText =
      isBusiness && !(options && options.buttonText) ? buttonText + " Business" : buttonText;
    label.textContent = displayButtonText;

    button.append(iconContainer, label);

    button.addEventListener("click", async function () {
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-loading");
      label.textContent = "Preparing...";
      try {
        await client.signIn(options);
      } catch (error) {
        button.disabled = false;
        button.classList.remove("is-loading");
        label.textContent = displayButtonText;
        console.error("[NINAuth SDK] button sign-in failed", error);
        window.dispatchEvent(
          new CustomEvent("ninauth:error", {
            detail:
              error instanceof Error ? { message: error.message } : { message: String(error) },
          }),
        );
      }
    });

    root.innerHTML = "";
    root.appendChild(button);
    return button;
  }

  window.NINAuth = {
    createClient: createClient,
    renderButton: renderButton,
    signOut: function (options) {
      return createClient(options).signOut(options);
    },
    getCodeVerifier: getCodeVerifier,
    clearCodeVerifier: clearCodeVerifier,
    clearPkceStorage: clearPkceStorage,
  };
})();
