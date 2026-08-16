import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserDir = path.join(rootDir, "src", "browser");
const nativeDir = path.join(rootDir, "src", "native");
const reactDir = path.join(rootDir, "src", "react");
const assetsDir = path.join(rootDir, "assets");
const distDir = path.join(rootDir, "dist");

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

for (const fileName of ["ninauth.js", "ninauth.css", "ninauth.d.ts"]) {
  cpSync(path.join(browserDir, fileName), path.join(distDir, fileName));
}

for (const fileName of ["app-store.svg", "google-play.svg"]) {
  cpSync(path.join(assetsDir, fileName), path.join(distDir, fileName));
}

cpSync(path.join(nativeDir, "bare-react-native.js"), path.join(distDir, "react-native.js"));
cpSync(path.join(nativeDir, "react-native.d.ts"), path.join(distDir, "react-native.d.ts"));
cpSync(path.join(nativeDir, "expo.js"), path.join(distDir, "expo.js"));
cpSync(path.join(nativeDir, "react-native.d.ts"), path.join(distDir, "expo.d.ts"));
cpSync(path.join(nativeDir, "native-icon.js"), path.join(distDir, "native-icon.js"));
cpSync(path.join(reactDir, "react.js"), path.join(distDir, "react.js"));
cpSync(path.join(reactDir, "react.d.ts"), path.join(distDir, "react.d.ts"));

const runtimeWrapper = `import "./ninauth.js";

const sdk = globalThis.window?.NINAuth ?? globalThis.NINAuth;

if (!sdk) {
  throw new Error("NINAuth SDK failed to initialize.");
}

export const createClient = sdk.createClient;
export const renderButton = sdk.renderButton;
export const signOut = sdk.signOut;
export const getCodeVerifier = sdk.getCodeVerifier;
export const clearCodeVerifier = sdk.clearCodeVerifier;
export const clearPkceStorage = sdk.clearPkceStorage;

export default sdk;
`;

writeFileSync(path.join(distDir, "index.js"), runtimeWrapper);
writeFileSync(
  path.join(distDir, "index.d.ts"),
  readFileSync(path.join(browserDir, "ninauth.d.ts"), "utf8"),
);
