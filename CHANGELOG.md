# Changelog

Release history for @ninauth/sdk. Dates are npm publication dates (UTC).

## 0.4.0 — 2026-10-22

Business sign-in by RC number

- Added optional rcNumber configuration to browser, React, Expo, and bare React Native sign-in flows. Non-empty values are trimmed and forwarded as rc_number in the authorization request; blank values are omitted.
- Use rcNumber to start the hosted business lookup automatically after authentication. One match proceeds to verification; multiple matches require company selection. Omit it to retain manual company search.
- Added automated coverage for RC-number forwarding across browser and native entry points.

## 0.3.1 — 2026-08-18

Button variants and sizing

- Added outline and icon button variants on web, Expo, and bare React Native alongside the existing green and white variants.
- Added buttonHeight and borderRadius customization and forwarded both options through the React component. Supply accessible buttonText for icon-only buttons.

## 0.3.0 — 2026-08-16

Declarative React integration

- Added the @ninauth/sdk/react entry point with the NinAuthButton component and TypeScript declarations.
- The React component mounts and cleans up the SDK button, removing the need for application-managed selectors, element IDs, and useEffect setup.

## 0.2.18 — 2026-08-14

PKCE recovery across tabs

- Added a short-lived localStorage recovery copy of browser PKCE transactions so callbacks opened in another tab or window can recover the verifier.
- PKCE recovery checks both storage locations and deduplicates matching transactions. Completion and cleanup remove both copies; transactions remain state-scoped and expire after 15 minutes.

## 0.2.17 — 2026-08-10

Business callbacks on mobile

- Expo and bare React Native success results now return the selected business callback rc_number as optional rcNumber, with surrounding whitespace removed.
- Updated native TypeScript declarations and integration examples. Send rcNumber as rc_number when exchanging a business authorization code.

## 0.2.16 — 2026-08-10

Business callbacks in the browser

- Browser handleCallback() now exposes the business callback rc_number as optional rcNumber, with updated TypeScript declarations.
- Forward the returned value as rc_number in the token-exchange payload; personal sign-in uses an empty string.

## 0.2.15 — 2026-08-03

Web and mobile OAuth integration

- Browser, Expo, and bare React Native hosted OAuth integrations with S256 PKCE and TypeScript declarations.
- Added rc_number to token-exchange payloads and optional business RC-number filtering to fetchUserInfo(accessToken, rcNumber).

## 0.2.14 — 2026-08-03

Package release

- Published on npm as @ninauth/sdk.

## 0.2.13 — 2026-08-02

Package release

- Published on npm as @ninauth/sdk.

## 0.2.12 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

## 0.2.11 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

## 0.2.1 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

## 0.2.0 — 2026-08-01

Package release

- Published on npm as @ninauth/sdk.

Publication dates: [npm registry](https://registry.npmjs.org/@ninauth%2Fsdk).
