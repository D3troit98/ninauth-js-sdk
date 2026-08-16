import { createElement, useEffect, useRef } from "react";

/**
 * Declarative React wrapper for the NINAuth hosted sign-in button.
 * The component owns the DOM mount/unmount lifecycle for renderButton.
 */
export function NinAuthButton({ className, id, style, onReady, ...config }) {
  const containerRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;

  const scopeKey = JSON.stringify(config.scope ?? []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let button;
    let disposed = false;

    void import("./index.js").then(({ renderButton }) => {
      if (disposed) return;
      button = renderButton(container, configRef.current);
      onReady?.(button);
    });

    return () => {
      disposed = true;
      if (button?.parentNode === container) button.remove();
    };
  }, [
    config.baseUrl,
    config.loginUrl,
    config.authorizeUrl,
    config.clientId,
    config.appId,
    config.redirectUri,
    config.responseType,
    scopeKey,
    config.codeChallenge,
    config.codeChallengeMethod,
    config.hostedOrigin,
    config.buttonText,
    config.variant,
    config.requestId,
    config.state,
    config.pkceKey,
    config.type,
    onReady,
  ]);

  return createElement("div", { ref: containerRef, className, id, style });
}

export default NinAuthButton;
