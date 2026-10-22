import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const sdkSource = readFileSync(
  new URL("../src/browser/ninauth.js", import.meta.url),
  "utf8",
);

function createStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
  };
}

function createElement(tagName) {
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: "",
    disabled: false,
    innerHTML: "",
    textContent: "",
    type: "",
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    classList: {
      add() {},
      remove() {},
    },
  };
  return element;
}

function createDocument() {
  const targets = new Map();
  return {
    createElement,
    createTarget(selector) {
      const target = createElement("div");
      targets.set(selector, target);
      return target;
    },
    querySelector(selector) {
      return targets.get(selector) || null;
    },
  };
}

function loadSdk(href = "https://app.example/callback") {
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  const document = createDocument();
  const assigned = [];
  const locationUrl = new URL(href);
  const window = {
    document,
    sessionStorage,
    localStorage,
    crypto: globalThis.crypto,
    TextEncoder,
    URL,
    URLSearchParams,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    fetch: async () => {
      throw new Error("fetch was not stubbed");
    },
    addEventListener() {},
    dispatchEvent(event) {
      this.lastEvent = event;
      return true;
    },
    CustomEvent: function CustomEvent(type, init) {
      return { type, detail: init?.detail };
    },
    location: {
      href: locationUrl.href,
      origin: locationUrl.origin,
      pathname: locationUrl.pathname,
      search: locationUrl.search,
      hash: locationUrl.hash,
      assign(value) {
        assigned.push(value);
      },
    },
    navigator: { userAgent: "node-test" },
    console,
  };

  const context = vm.createContext({
    window,
    globalThis: { window },
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    btoa: window.btoa,
    CustomEvent: window.CustomEvent,
    fetch: window.fetch,
    document,
  });
  vm.runInContext(sdkSource, context);
  return { window, document, assigned };
}

function parseGlobalKeys() {
  const match = sdkSource.match(/window\.NINAuth\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(match, "window.NINAuth assignment should be parseable");
  return [...match[1].matchAll(/^\s*([A-Za-z_$][\w$]*):/gm)].map((entry) => entry[1]).sort();
}

test("browser global, npm wrapper, and declarations expose the same top-level API", () => {
  const globalKeys = parseGlobalKeys();
  const wrapper = readFileSync(
    new URL("../scripts/build.mjs", import.meta.url),
    "utf8",
  );
  const declarations = readFileSync(
    new URL("../src/browser/ninauth.d.ts", import.meta.url),
    "utf8",
  );

  const wrapperKeys = [...wrapper.matchAll(/export const ([A-Za-z_$][\w$]*) = sdk\.\1;/g)]
    .map((entry) => entry[1])
    .sort();
  const declarationKeys = [...declarations.matchAll(/export declare const ([A-Za-z_$][\w$]*):/g)]
    .map((entry) => entry[1])
    .sort();

  assert.deepEqual(wrapperKeys, globalKeys);
  assert.deepEqual(declarationKeys, globalKeys);
});

test("renderButton labels business sign-in without changing personal or custom labels", () => {
  const { window, document } = loadSdk();

  document.createTarget("#personal-button");
  const personalButton = window.NINAuth.renderButton("#personal-button", {
    type: "personal",
  });
  assert.equal(personalButton.children[1].textContent, "Continue with NINAuth");

  document.createTarget("#business-button");
  const businessButton = window.NINAuth.renderButton("#business-button", {
    type: "business",
    variant: "white",
  });
  assert.equal(businessButton.children[1].textContent, "Continue with NINAuth Business");

  document.createTarget("#custom-business-button");
  const customBusinessButton = window.NINAuth.renderButton("#custom-business-button", {
    type: "business",
    buttonText: "Sign in with Example",
  });
  assert.equal(customBusinessButton.children[1].textContent, "Sign in with Example");
});

test("signIn stores a short-lived state-scoped PKCE recovery record", async () => {
  const { window, assigned } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });

  const result = await client.signIn();
  assert.equal(result.location, result.authorizeUrl);
  assert.equal(result.anticipatedLoginUrl.includes("return_to="), true);
  assert.equal("codeVerifier" in result, false);
  assert.equal(assigned[0], result.authorizeUrl);
  assert.equal(window.lastEvent.detail.verifier, undefined);

  const storageKey = `ninauth-sdk-pkce:${result.state}`;
  const record = JSON.parse(window.sessionStorage.getItem(storageKey));
  assert.equal(record.state, result.state);
  assert.equal(record.clientId, "client-a");
  assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), record);
  assert.equal(window.NINAuth.getCodeVerifier(result.state), record.verifier);
  assert.equal(window.NINAuth.getCodeVerifier("missing-state"), null);
});

test("handleCallback recovers PKCE when the callback has a fresh sessionStorage", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });
  const result = await client.signIn();
  const storageKey = `ninauth-sdk-pkce:${result.state}`;

  window.sessionStorage.clear();
  const callback = client.handleCallback(
    `https://app.example/callback?code=abc&state=${encodeURIComponent(result.state)}&pkce_key=${encodeURIComponent(result.pkceKey)}`,
  );

  assert.equal(callback.state, result.state);
  assert.equal(typeof callback.codeVerifier, "string");
  assert.notEqual(window.sessionStorage.getItem(storageKey), null);
  client.completeCallback(result.state);
  assert.equal(window.sessionStorage.getItem(storageKey), null);
  assert.equal(window.localStorage.getItem(storageKey), null);
});

test("handleCallback rejects unknown state and returns the exact verifier for matching state", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });
  const result = await client.signIn();

  assert.throws(
    () => client.handleCallback("https://app.example/callback?code=abc&state=unknown-state"),
    /unknown or expired/,
  );

  const callback = client.handleCallback(
    `https://app.example/callback?code=abc&state=${encodeURIComponent(result.state)}`,
  );
  assert.equal(callback.code, "abc");
  assert.equal(callback.state, result.state);
  assert.equal(callback.codeVerifier, window.NINAuth.getCodeVerifier(result.state));
});

test("handleCallback recovers missing callback state from one matching PKCE transaction", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });
  const result = await client.signIn();

  const callback = client.handleCallback("https://app.example/callback?code=abc");
  assert.equal(callback.code, "abc");
  assert.equal(callback.state, result.state);
  assert.equal(callback.codeVerifier, window.NINAuth.getCodeVerifier(result.state));
});

test("handleCallback uses pkce_key when backend returns a different callback state", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });
  const result = await client.signIn();

  const callback = client.handleCallback(
    `https://app.example/callback?code=abc&state=backend-state&pkce_key=${encodeURIComponent(result.pkceKey)}`,
  );
  assert.equal(callback.code, "abc");
  assert.equal(callback.state, "backend-state");
  assert.equal(callback.pkceKey, result.pkceKey);
  assert.equal(callback.codeVerifier, window.NINAuth.getCodeVerifier(result.state));
});

test("handleCallback returns rcNumber from a business callback", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
    type: "business",
  });
  const result = await client.signIn();

  const callback = client.handleCallback(
    `https://app.example/callback?code=abc&state=${encodeURIComponent(result.state)}&rc_number=${encodeURIComponent("RC 12345")}`,
  );

  assert.equal(callback.rcNumber, "RC 12345");
});

test("handleCallback does not recover missing state when multiple transactions match", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://app.example/callback",
  });
  await client.signIn();
  await client.signIn({ state: "abcdefghijklmnop" });

  assert.throws(
    () => client.handleCallback("https://app.example/callback?code=abc"),
    /no matching PKCE transaction could be recovered/,
  );
});

test("custom authorize and login URLs preserve query strings, hashes, and encoded redirect URIs", () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    redirectUri: "https://client.example/cb?next=%2Fdashboard%3Fx%3D1",
    authorizeUrl: "https://sso.example/oauth/authorize?existing=one&mode=two#top",
    loginUrl: "https://host.example/oauth/login?screen=compact#login",
  });

  const authorizeUrl = new URL(
    client.authorizeUrl({ state: "abcdefghijklmnop", codeChallenge: "challenge" }),
  );
  assert.equal(authorizeUrl.searchParams.get("existing"), "one");
  assert.equal(authorizeUrl.searchParams.get("mode"), "two");
  assert.equal(authorizeUrl.searchParams.get("redirect_uri"), client.config.redirectUri);
  assert.equal(authorizeUrl.hash, "#top");

  const loginUrl = new URL(
    client.loginPageUrl({ state: "abcdefghijklmnop", codeChallenge: "challenge" }),
  );
  assert.equal(loginUrl.searchParams.get("screen"), "compact");
  assert.equal(loginUrl.hash, "#login");
  assert.equal(loginUrl.toString().includes("??"), false);
});

test("OAuth URL normalization only rewrites trusted backend origins", () => {
  const { window } = loadSdk("https://app.example/oauth/login");
  const client = window.NINAuth.createClient({
    baseUrl: "https://sso.nimc.gov.ng/api/v1",
    clientId: "client-a",
    appId: "app-a",
  });

  assert.equal(
    client
      .authorizeUrl({
        authorizeUrl: "https://sso.nimc.gov.ng/api/v1/oauth/login",
        state: "abcdefghijklmnop",
        codeChallenge: "challenge",
      })
      .startsWith("https://app.example/oauth/login?"),
    true,
  );
  assert.equal(
    client
      .authorizeUrl({
        authorizeUrl: "https://sso.nimc.gov.ng/oauth/consent",
        state: "abcdefghijklmnop",
        codeChallenge: "challenge",
      })
      .startsWith("https://app.example/oauth/consent?"),
    true,
  );
  assert.equal(
    client
      .authorizeUrl({
        authorizeUrl: "https://client.example/oauth/callback",
        state: "abcdefghijklmnop",
        codeChallenge: "challenge",
      })
      .startsWith("https://client.example/oauth/callback?"),
    true,
  );
});

test("business sign-in forwards a supplied RC number through authorize, login and stored context", async () => {
  const { window } = loadSdk();
  const client = window.NINAuth.createClient({
    clientId: "client-a",
    appId: "app-a",
    type: "business",
    rcNumber: " 3483294 ",
  });
  const result = await client.signIn();
  assert.equal(new URL(result.authorizeUrl).searchParams.get("rc_number"), "3483294");
  const returnTo = new URL(result.anticipatedLoginUrl).searchParams.get("return_to");
  assert.equal(new URL(returnTo, "https://app.example").searchParams.get("rc_number"), "3483294");
  const stored = JSON.parse(window.sessionStorage.getItem(`ninauth:oauth-init:${result.state}`));
  assert.equal(stored.rcNumber, "3483294");
  assert.equal(
    new URL(client.authorizeUrl({ rcNumber: "7219458" })).searchParams.get("rc_number"),
    "7219458",
  );
  assert.equal(
    new URL(client.authorizeUrl({ rcNumber: " " })).searchParams.has("rc_number"),
    false,
  );
});
