# `@ninauth/sdk`

NINAuth browser SDK package for hosted OAuth login flows.

For complete setup and integration instructions, see the
[NINAuth Developer Guide](https://ssologin.nimc.gov.ng/demo-sign-in/developer-guide).

## Install

```bash
pnpm add @ninauth/sdk
```

## Usage

```ts
import "@ninauth/sdk/ninauth.css";
import { createClient, renderButton } from "@ninauth/sdk";

renderButton("#ninauth-button", {
  hostedOrigin: "https://ssologin.nimc.gov.ng",
  clientId: "ENTC393354556C4",
  appId: "APPISGSCGLIF",
  redirectUri: "https://example.com/auth/callback",
  scope: ["firstName", "middleName", "lastName"],
  variant: "green",
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

PKCE verifier records are scoped to the exact returned `state`, stored in
`sessionStorage`, and expire after 15 minutes. If the backend omits `state`,
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

## React Native without Expo

```bash
npm install @ninauth/sdk @noble/hashes react-native-get-random-values react-native-inappbrowser-reborn react-native-svg react-native-url-polyfill
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
