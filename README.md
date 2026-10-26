# `@ninauth/sdk`

NINAuth browser SDK package for hosted OAuth login flows.

For complete setup and integration instructions, see the
[NINAuth Developer Guide](https://ssologin.nimc.gov.ng/demo-sign-in/developer-guide).

## Install

```bash
pnpm add @ninauth/sdk@0.4.0
```

## Usage

### React

React applications should use the declarative component. It mounts and cleans up
the SDK button for you; your application does not need a `useEffect`, selector,
or generated element ID.

```tsx
import "@ninauth/sdk/ninauth.css";
import { NinAuthButton } from "@ninauth/sdk/react";

export function SignIn() {
  return (
    <NinAuthButton
      hostedOrigin="https://ssologin.nimc.gov.ng"
      clientId="ENTC393354556C4"
      appId="APPISGSCGLIF"
      redirectUri={`${window.location.origin}/auth/callback`}
      scope={["firstName", "middleName", "lastName"]}
      variant="green"
      type="business"
    />
  );
}
```

For business sign-in, pass `rcNumber="3483294"` to search by RC automatically
after authentication. One match is verified with the returned classification
name; multiple matches require the user to choose a company before verification.
No matches or failed requests offer a retry. Omit it or leave it blank to let
the user search and select a company. The same `rcNumber` option is available
to `createClient`, `renderButton`, and the native components. Verification must
succeed before the app receives its callback.

### Browser JavaScript (without React)

```ts
import "@ninauth/sdk/ninauth.css";
import { createClient, renderButton } from "@ninauth/sdk";

renderButton("#ninauth-button", {
  hostedOrigin: "https://ssologin.nimc.gov.ng",
  clientId: "ENTC393354556C4",
  appId: "APPISGSCGLIF",
  redirectUri: "https://example.com/auth/callback",
  scope: ["firstName", "middleName", "lastName"],
  variant: "outline",
  buttonHeight: 52,
  borderRadius: 12,
});
```

On your OAuth callback route:

```ts
const client = createClient({
  clientId: "ENTC393354556C4",
  appId: "APPISGSCGLIF",
  redirectUri: "https://example.com/auth/callback",
});

const { code, state, codeVerifier, rcNumber } = client.handleCallback();

await client.exchangeToken({
  client_id: "ENTC393354556C4",
  app_id: "APPISGSCGLIF",
  redirect_uri: "https://example.com/auth/callback",
  code,
  code_verifier: codeVerifier,
  state,
  // Returned for business sign-in; undefined for personal sign-in.
  rc_number: rcNumber || "",
});

// Clear only this transaction after a successful backend token exchange.
client.completeCallback(state);
```

For business sign-in, NINAuth adds `rc_number` to the callback URL and
`handleCallback()` returns it as `rcNumber`. Send that value as `rc_number` in
the token-exchange payload. For personal sign-in, send an empty string.

UserInfo follows the same distinction:

```ts
// Personal sign-in: no rc_number query parameter.
await client.fetchUserInfo(accessToken);

// Business sign-in: GET /oauth/userinfo?rc_number=RC_NUMBER
await client.fetchUserInfo(accessToken, "RC_NUMBER");
```

PKCE verifier records are scoped to the exact returned `state` and expire after
15 minutes. The SDK stores the primary record in `sessionStorage` and a
short-lived recovery copy in `localStorage`. This lets an OAuth callback opened
in a new tab or window recover the original transaction, since browsing contexts
do not share `sessionStorage`. `completeCallback(state)`, `clearCodeVerifier()`,
and `clearPkceStorage()` remove both copies. If the backend omits `state`,
`handleCallback()` recovers only when exactly one unexpired SDK transaction
matches the configured client ID and redirect URI. Custom `state` values must be
unpredictable strings of at least 16 characters.

The package also exposes the browser global typings for `window.NINAuth`.

## React Native and Expo

```bash
npx expo install expo-crypto expo-linking expo-web-browser react-native-svg
```

Import the native entry point. `renderButton` returns a native React element and
opens the OAuth flow in the secure system authentication browser when pressed.

```tsx
import { renderButton } from "@ninauth/sdk/expo";

export function SignInScreen() {
  return renderButton({
    clientId: "ENTC393354556C4",
    appId: "APPISGSCGLIF",
    redirectUri: "yourapp://ninauth-callback",
    scope: ["firstName", "middleName", "lastName"],
    type: "personal",
    variant: "green",
    size: "default",
    onSuccess: ({ code, state, codeVerifier, redirectUri, rcNumber }) => {
      // Send grant_type: "authorization_code" and these values to your backend.
      // For business sign-in, send rc_number: rcNumber || "".
    },
    onError: console.error,
  });
}
```

Register the exact deep-link callback in both the Expo app configuration and the
NINAuth client setup. The native API creates an S256 PKCE transaction, validates
the callback state, and never requires a client secret in the application.

Native button sizes are `small` (up to 220px), `default` (up to 270px), and
`large` (the full width of its parent). The default is `default`. The `style`
prop can override these presets.

### Button variants and sizing

`variant` controls the button treatment, not just its color:

- `green`: filled green button with white icon and text (default)
- `white`: filled white button with green icon and text
- `outline`: transparent button with a green border
- `icon`: square icon-only button; provide an accessible `buttonText` even though it is not displayed

Web and native buttons accept `buttonHeight` (CSS length on web, number of
points on native) and `borderRadius` (same units). Native also supports the
existing `size` presets. Example: `variant: "outline", buttonHeight: 52,
borderRadius: 12`.

## React Native without Expo

```bash
npm install @ninauth/sdk@0.4.0 @noble/hashes react-native-get-random-values react-native-inappbrowser-reborn react-native-svg react-native-url-polyfill
npx pod-install
```

Use the same API from the bare React Native entry point:

```tsx
import { renderButton } from "@ninauth/sdk/react-native";

export function SignInScreen() {
  return renderButton({
    clientId: "ENTC393354556C4",
    appId: "APPISGSCGLIF",
    redirectUri: "yourapp://ninauth-callback",
    scope: ["firstName", "middleName", "lastName"],
    variant: "white",
    size: "large",
    onSuccess: ({ code, state, codeVerifier, redirectUri, rcNumber }) => {
      // Send grant_type: "authorization_code" and these values to your backend.
      // For business sign-in, send rc_number: rcNumber || "".
    },
    onError: console.error,
  });
}
```

The bare entry point has no Expo imports. Configure the callback scheme in
`Info.plist`, the Android manifest, and NINAuth client setup.

## Changelog

Release history for @ninauth/sdk. Dates are npm publication dates (UTC).

See also the [developer guide changelog](https://ssologin.nimc.gov.ng/demo-sign-in/developer-guide/changelog).

### 0.4.0 — 2026-10-22

Business sign-in by RC number

- Added optional rcNumber configuration to browser, React, Expo, and bare React Native sign-in flows. Non-empty values are trimmed and forwarded as rc_number in the authorization request; blank values are omitted.
- Use rcNumber to start the hosted business lookup automatically after authentication. One match proceeds to verification; multiple matches require company selection. Omit it to retain manual company search.
- Added automated coverage for RC-number forwarding across browser and native entry points.

### 0.3.1 — 2026-08-18

Button variants and sizing

- Added outline and icon button variants on web, Expo, and bare React Native alongside the existing green and white variants.
- Added buttonHeight and borderRadius customization and forwarded both options through the React component. Supply accessible buttonText for icon-only buttons.

### 0.3.0 — 2026-08-16

Declarative React integration

- Added the @ninauth/sdk/react entry point with the NinAuthButton component and TypeScript declarations.
- The React component mounts and cleans up the SDK button, removing the need for application-managed selectors, element IDs, and useEffect setup.

### 0.2.18 — 2026-08-14

PKCE recovery across tabs

- Added a short-lived localStorage recovery copy of browser PKCE transactions so callbacks opened in another tab or window can recover the verifier.
- PKCE recovery checks both storage locations and deduplicates matching transactions. Completion and cleanup remove both copies; transactions remain state-scoped and expire after 15 minutes.

### 0.2.17 — 2026-08-10

Business callbacks on mobile

- Expo and bare React Native success results now return the selected business callback rc_number as optional rcNumber, with surrounding whitespace removed.
- Updated native TypeScript declarations and integration examples. Send rcNumber as rc_number when exchanging a business authorization code.

### 0.2.16 — 2026-08-10

Business callbacks in the browser

- Browser handleCallback() now exposes the business callback rc_number as optional rcNumber, with updated TypeScript declarations.
- Forward the returned value as rc_number in the token-exchange payload; personal sign-in uses an empty string.

### 0.2.15 — 2026-08-03

Web and mobile OAuth integration

- Browser, Expo, and bare React Native hosted OAuth integrations with S256 PKCE and TypeScript declarations.
- Added rc_number to token-exchange payloads and optional business RC-number filtering to fetchUserInfo(accessToken, rcNumber).

### 0.2.14 — 2026-08-03

Package release

- Published on npm as @ninauth/sdk.

### 0.2.13 — 2026-08-02

Package release

- Published on npm as @ninauth/sdk.

### 0.2.12 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

### 0.2.11 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

### 0.2.1 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

### 0.2.0 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

Publication dates: [npm registry](https://registry.npmjs.org/@ninauth%2Fsdk).
