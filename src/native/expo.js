import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { NINAuthIcon } from "./native-icon.js";

const DEFAULT_HOSTED_ORIGIN = "https://ssologin.nimc.gov.ng";

function base64Url(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index++] ?? 0;
    const second = bytes[index++];
    const third = bytes[index++];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabet[(value >>> 18) & 63];
    result += alphabet[(value >>> 12) & 63];
    if (second !== undefined) result += alphabet[(value >>> 6) & 63];
    if (third !== undefined) result += alphabet[value & 63];
  }

  return result;
}

async function randomValue(byteLength) {
  return base64Url(await Crypto.getRandomBytesAsync(byteLength));
}

async function sha256Base64Url(value) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function required(name, value) {
  if (!value) throw new Error(`NINAuth ${name} is required.`);
  return value;
}

export function createAuthorizeUrl(options, transaction) {
  const hostedOrigin = options.hostedOrigin || DEFAULT_HOSTED_ORIGIN;
  const authorizeUrl = options.authorizeUrl || `${hostedOrigin.replace(/\/$/, "")}/oauth/authorize`;
  const url = new URL(authorizeUrl);
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

export async function startSignIn(options) {
  const redirectUri = options.redirectUri || Linking.createURL("ninauth-callback");
  const state = options.state || (await randomValue(24));
  if (state.length < 16) throw new Error("NINAuth state must be at least 16 characters.");

  const codeVerifier = await randomValue(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const authorizeUrl = createAuthorizeUrl({ ...options, redirectUri }, { state, codeChallenge });
  const browserResult = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri, {
    preferEphemeralSession: options.preferEphemeralSession,
  });

  if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
    return { type: "cancel", state, authorizeUrl };
  }
  if (browserResult.type !== "success" || !browserResult.url) {
    throw new Error(`NINAuth sign-in did not complete (${browserResult.type}).`);
  }

  const callback = new URL(browserResult.url);
  const callbackState = callback.searchParams.get("state") || "";
  const oauthError = callback.searchParams.get("error");
  if (oauthError) {
    throw new Error(callback.searchParams.get("error_description") || oauthError);
  }
  if (callbackState !== state) throw new Error("NINAuth callback state did not match.");

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
        ? React.createElement(ActivityIndicator, {
            color: isWhite ? "#059661" : "#ffffff",
            size: "small",
          })
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
