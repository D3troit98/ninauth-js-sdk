import type { ReactElement } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

export type NINAuthNativeVariant = "green" | "white";
export type NINAuthNativeSize = "small" | "default" | "large";
export type NINAuthNativeType = "personal" | "business";

export interface NINAuthNativeConfig {
  clientId: string;
  appId: string;
  redirectUri?: string;
  hostedOrigin?: string;
  authorizeUrl?: string;
  responseType?: string;
  scope?: string[];
  state?: string;
  type?: NINAuthNativeType;
  preferEphemeralSession?: boolean;
  callbackTimeoutMs?: number;
  browserOptions?: Record<string, unknown>;
}

export interface NINAuthNativeSuccessResult {
  type: "success";
  code: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  callbackUrl: string;
  authorizeUrl: string;
  /** Selected company RC number returned by a business sign-in callback. */
  rcNumber?: string;
}

export interface NINAuthNativeCancelResult {
  type: "cancel";
  state: string;
  authorizeUrl: string;
}

export type NINAuthNativeResult = NINAuthNativeSuccessResult | NINAuthNativeCancelResult;

export interface NINAuthNativeButtonProps extends NINAuthNativeConfig {
  onSuccess: (result: NINAuthNativeSuccessResult) => void | Promise<void>;
  onError?: (error: Error) => void;
  onCancel?: (result: NINAuthNativeCancelResult) => void | Promise<void>;
  disabled?: boolean;
  buttonText?: string;
  loadingText?: string;
  variant?: NINAuthNativeVariant;
  /** Button width preset. Defaults to "default". */
  size?: NINAuthNativeSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export declare function createAuthorizeUrl(
  options: NINAuthNativeConfig & { redirectUri: string },
  transaction: { state: string; codeChallenge: string },
): string;
export declare function startSignIn(options: NINAuthNativeConfig): Promise<NINAuthNativeResult>;
export declare function NINAuthButton(props: NINAuthNativeButtonProps): ReactElement;
export declare function renderButton(options: NINAuthNativeButtonProps): ReactElement;

declare const NINAuthNative: {
  renderButton: typeof renderButton;
  NINAuthButton: typeof NINAuthButton;
  startSignIn: typeof startSignIn;
  createAuthorizeUrl: typeof createAuthorizeUrl;
};

export default NINAuthNative;
