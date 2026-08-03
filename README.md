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

const { code, state, codeVerifier } = client.handleCallback();
// Exchange code + codeVerifier, then clear only this transaction after success.
client.completeCallback(state);
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
    onSuccess: ({ code, state, codeVerifier, redirectUri }) => {
      // Send these values to your backend token-exchange endpoint.
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
    onSuccess: ({ code, state, codeVerifier, redirectUri }) => {
      // Send these values to your backend token-exchange endpoint.
    },
    onError: console.error,
  });
}
```

The bare entry point has no Expo imports. Configure the callback scheme in
`Info.plist`, the Android manifest, and NINAuth client setup.
