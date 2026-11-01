import { createHostClipboard, type CliRenderer } from "@opentui/core";
import { ClientError } from "./safety";
import { requestClipboard } from "./clipboard-bridge";

export type CopyText = (text: string) => Promise<"copied" | "requested">;

/** Explicit copy only; never reads clipboard data or writes a remote host clipboard. */
export async function copyText(text: string, renderer: CliRenderer): Promise<"copied" | "requested"> {
  if (!text || Buffer.byteLength(text) > 128 * 1024) throw new ClientError("Select up to 128 KiB of text to copy.");
  if (process.connected && process.send) {
    return requestClipboard(text, process as Parameters<typeof requestClipboard>[1]);
  }
  if (!renderer.capabilities?.remote && !process.env.SSH_CONNECTION && !process.env.SSH_TTY && !process.env.SSH_CLIENT) {
    try {
      const clipboard = createHostClipboard({ maxWriteBytes: 128 * 1024, timeoutMs: 3000 });
      try { if ((await clipboard.writeText(text)).status === "written") return "copied"; }
      finally { await clipboard.dispose(); }
    } catch { /* Fall back to the user's terminal, never a remote clipboard. */ }
  }
  if (renderer.copyToClipboardOSC52(text)) return "requested";
  throw new ClientError("Clipboard unavailable. Use your terminal's native selection/copy shortcut.");
}
