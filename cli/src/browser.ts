import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ClientError } from "./safety";

export const GITHUB_DEVICE_URL = "https://github.com/login/device";
export type OpenBrowser = () => Promise<void>;

/** Explicit sign-in click only. Never passes a code/token or invokes a shell. */
export const openGitHubLogin: OpenBrowser = async () => {
  if (process.connected && process.send) {
    process.send({ type: "gitmsg:open-login" });
    return;
  }
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) throw new ClientError("Open https://github.com/login/device in your local browser. The remote host browser was not opened.");
  const [command, args] = process.platform === "darwin" ? ["/usr/bin/open", [GITHUB_DEVICE_URL]]
    : process.platform === "win32" ? ["rundll32.exe", ["url.dll,FileProtocolHandler", GITHUB_DEVICE_URL]]
    : ["xdg-open", [GITHUB_DEVICE_URL]];
  try { await promisify(execFile)(command, args, { timeout: 10_000, windowsHide: true, maxBuffer: 4096 }); }
  catch { throw new ClientError("Could not open your browser. Open https://github.com/login/device manually."); }
};
