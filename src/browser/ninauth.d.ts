export type NINAuthButtonVariant = "green" | "white";

export type NINAuthMountTarget = string | Element;

export interface NINAuthClientConfig {
  baseUrl?: string;
  loginUrl?: string;
  authorizeUrl?: string;
  clientId?: string;
  appId?: string;
  redirectUri?: string;
  responseType?: string;
  scope?: string[];
  codeChallenge?: string;
  codeChallengeMethod?: string;
  hostedOrigin?: string;
  buttonText?: string;
  variant?: NINAuthButtonVariant;
  requestId?: string;
  state?: string;
  pkceKey?: string;
  /** Sign-in journey to launch. Defaults to "personal". */
  type?: "personal" | "business" | string;
}

export interface NINAuthSignInResult {
  state: string;
  pkceKey: string;
  authorizeUrl: string;
  anticipatedLoginUrl: string;
  location: string;
  requestId?: string;
}

export interface NINAuthExchangeTokenPayload {
  client_id: string;
  app_id: string;
  redirect_uri: string;
  grant_type?: string;
  code: string;
  code_verifier: string;
  state?: string;
  /** Selected company RC number for business sign-in; use an empty string for personal sign-in. */
  rc_number?: string;
}

export interface NINAuthCallbackResult {
  code: string;
  state: string;
  codeVerifier: string;
  pkceKey: string;
  /** Selected company RC number returned by a business sign-in callback. */
  rcNumber?: string;
}

export interface NINAuthClient {
  config: NINAuthClientConfig;
  authorizeUrl(overrides?: NINAuthClientConfig): string;
  loginPageUrl(overrides?: NINAuthClientConfig): string;
  signIn(overrides?: NINAuthClientConfig): Promise<NINAuthSignInResult>;
  signOut(options?: NINAuthSignOutOptions): Promise<NINAuthSignOutResult>;
  handleCallback(url?: string): NINAuthCallbackResult;
  completeCallback(state: string): void;
  exchangeToken(payload: NINAuthExchangeTokenPayload): Promise<unknown>;
  fetchUserInfo(accessToken: string, rcNumber?: string): Promise<unknown>;
}

export interface NINAuthSignOutOptions {
  postLogoutRedirectUri?: string;
}

export interface NINAuthSignOutResult {
  ok: boolean;
  location: string | null;
  status: number;
}

export interface NINAuthGlobal {
  createClient(options?: NINAuthClientConfig): NINAuthClient;
  renderButton(selector: NINAuthMountTarget, options?: NINAuthClientConfig): HTMLButtonElement;
  signOut(options?: NINAuthClientConfig & NINAuthSignOutOptions): Promise<NINAuthSignOutResult>;
  getCodeVerifier(stateOrPkceKey: string): string | null;
  clearCodeVerifier(stateOrPkceKey: string): void;
  clearPkceStorage(): void;
}

export declare const createClient: NINAuthGlobal["createClient"];
export declare const renderButton: NINAuthGlobal["renderButton"];
export declare const signOut: NINAuthGlobal["signOut"];
export declare const getCodeVerifier: NINAuthGlobal["getCodeVerifier"];
export declare const clearCodeVerifier: NINAuthGlobal["clearCodeVerifier"];
export declare const clearPkceStorage: NINAuthGlobal["clearPkceStorage"];

declare const NINAuth: NINAuthGlobal;

declare global {
  interface Window {
    NINAuth: NINAuthGlobal;
  }
}

export default NINAuth;
