import type { CSSProperties } from "react";
import type { NINAuthClientConfig } from "./index.js";

export interface NinAuthButtonProps extends NINAuthClientConfig {
  /** Class name applied to the button's container. */
  className?: string;
  /** ID applied to the button's container. */
  id?: string;
  /** Inline styles applied to the button's container. */
  style?: CSSProperties;
  /** Called after the underlying NINAuth button has mounted. */
  onReady?: (button: HTMLButtonElement) => void;
}

export declare function NinAuthButton(props: NinAuthButtonProps): import("react").ReactElement;

export default NinAuthButton;
