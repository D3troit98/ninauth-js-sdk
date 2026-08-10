import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { InAppBrowser } from "react-native-inappbrowser-reborn";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { NINAuthIcon } from "./native-icon.js";

const DEFAULT_HOSTED_ORIGIN = "https://ssologin.nimc.gov.ng";

function base64Url(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63];
    if (second !== undefined) result += alphabet[(value >>> 6) & 63];
    if (third !== undefined) result += alphabet[value & 63];
  }
  return result;
}

function randomValue(byteLength) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function required(name, value) {
  if (!value) throw new Error(`NINAuth ${name} is required.`);
  return value;
}

export function createAuthorizeUrl(options, transaction) {
  const origin = options.hostedOrigin || DEFAULT_HOSTED_ORIGIN;
  const url = new URL(options.authorizeUrl || `${origin.replace(/\/$/, "")}/oauth/authorize`);
  url.searchParams.set("client_id", required("clientId", options.clientId));
  url.searchParams.set("app_id", required("appId", options.appId));
  url.searchParams.set("redirect_uri", required("redirectUri", options.redirectUri));
  url.searchParams.set("response_type", options.responseType || "code");
  url.searchParams.set("scope", (options.scope || []).join(" "));
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("code_challenge", transaction.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("type", options.type || "personal");
  return url.toString();
}

function openWithLinking(authorizeUrl, redirectUri, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve(result);
    };
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (url.startsWith(redirectUri)) finish({ type: "success", url });
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.remove();
      reject(new Error("NINAuth sign-in timed out while waiting for the deep link."));
    }, timeoutMs);
    Linking.openURL(authorizeUrl).catch((error) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function openAuthenticationSession(authorizeUrl, redirectUri, options) {
  if (!(await InAppBrowser.isAvailable())) {
    return openWithLinking(authorizeUrl, redirectUri, options.callbackTimeoutMs || 300000);
  }
  return InAppBrowser.openAuth(authorizeUrl, redirectUri, {
    ephemeralWebSession: options.preferEphemeralSession,
    dismissButtonStyle: "cancel",
    showTitle: false,
    enableUrlBarHiding: true,
    enableDefaultShare: false,
    ...options.browserOptions,
  });
}

export async function startSignIn(options) {
  const redirectUri = required("redirectUri", options.redirectUri);
  const state = options.state || randomValue(24);
  if (state.length < 16) throw new Error("NINAuth state must be at least 16 characters.");
  const codeVerifier = randomValue(64);
  const codeChallenge = base64Url(sha256(utf8ToBytes(codeVerifier)));
  const authorizeUrl = createAuthorizeUrl({ ...options, redirectUri }, { state, codeChallenge });
  const browserResult = await openAuthenticationSession(authorizeUrl, redirectUri, options);

  if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
    return { type: "cancel", state, authorizeUrl };
  }
  if (browserResult.type !== "success" || !browserResult.url) {
    throw new Error(`NINAuth sign-in did not complete (${browserResult.type}).`);
  }
  const callback = new URL(browserResult.url);
  const oauthError = callback.searchParams.get("error");
  if (oauthError) throw new Error(callback.searchParams.get("error_description") || oauthError);
  if ((callback.searchParams.get("state") || "") !== state) {
    throw new Error("NINAuth callback state did not match.");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("NINAuth callback did not include an authorization code.");
  const returnedRcNumber = callback.searchParams.get("rc_number");
  return {
    type: "success",
    code,
    state,
    codeVerifier,
    redirectUri,
    callbackUrl: browserResult.url,
    authorizeUrl,
    rcNumber:
      returnedRcNumber && returnedRcNumber.trim() ? returnedRcNumber.trim() : undefined,
  };
}

export function NINAuthButton({
  onSuccess,
  onError,
  onCancel,
  disabled = false,
  buttonText = "Continue with NINAuth",
  loadingText = "Opening NINAuth…",
  variant = "green",
  size = "default",
  style,
  textStyle,
  ...options
}) {
  const [loading, setLoading] = useState(false);
  const isDisabled = disabled || loading;
  const isWhite = variant === "white";
  const sizeButtonStyle =
    size === "large"
      ? styles.largeButton
      : size === "small"
        ? styles.smallButton
        : styles.defaultButton;
  const whitePaddingStyle =
    size === "small" ? styles.smallWhitePadding : styles.defaultWhitePadding;
  const sizeTextStyle = size === "small" ? styles.smallText : styles.defaultText;
  async function handlePress() {
    setLoading(true);
    try {
      const result = await startSignIn(options);
      if (result.type === "cancel") await onCancel?.(result);
      else await onSuccess?.(result);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }
  return React.createElement(
    Pressable,
    {
      accessibilityRole: "button",
      accessibilityLabel: buttonText,
      accessibilityState: { busy: loading, disabled: isDisabled },
      disabled: isDisabled,
      onPress: handlePress,
      style: ({ pressed }) => [
        styles.button,
        sizeButtonStyle,
        isWhite ? styles.whiteButton : styles.greenButton,
        isWhite && whitePaddingStyle,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ],
    },
    React.createElement(
      View,
      { style: styles.content },
      loading
        ? React.createElement(ActivityIndicator, { color: isWhite ? "#059661" : "#ffffff" })
        : React.createElement(NINAuthIcon, { variant }),
      React.createElement(
        Text,
        {
          style: [
            styles.text,
            sizeTextStyle,
            isWhite ? styles.whiteText : styles.greenText,
            textStyle,
          ],
        },
        loading ? loadingText : buttonText,
      ),
    ),
  );
}

export function renderButton(options) {
  return React.createElement(NINAuthButton, options);
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    borderRadius: 9999,
    borderWidth: 0,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  smallButton: { maxWidth: 220, height: 38, paddingHorizontal: 24 },
  defaultButton: { maxWidth: 270, height: 44, paddingHorizontal: 38 },
  largeButton: { height: 44, paddingHorizontal: 38 },
  greenButton: { backgroundColor: "#008643" },
  whiteButton: { backgroundColor: "#ffffff" },
  smallWhitePadding: { paddingHorizontal: 26 },
  defaultWhitePadding: { paddingHorizontal: 40 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  text: { fontWeight: "600", letterSpacing: -0.15 },
  smallText: { fontSize: 14 },
  defaultText: { fontSize: 16 },
  greenText: { color: "#ffffff" },
  whiteText: { color: "#059661" },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  disabled: { opacity: 0.58 },
});

export default { renderButton, NINAuthButton, startSignIn, createAuthorizeUrl };
