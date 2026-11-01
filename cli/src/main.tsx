import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { secrets } from "bun";
import { App } from "./app";
import { forgetCredential } from "./credentials";
import { loadRoomKey } from "./rooms";
import { ClientError, publicError } from "./safety";
import { roomLink } from "./commands";
import { DEFAULT_CLIENT_ID } from "./config";

try {
  const args = process.argv.slice(2);
  if (args.join(" ") === "auth logout") {
    await forgetCredential(secrets);
    console.log("Local credential removed. Revoke app access separately in GitHub Settings → Applications.");
  } else {
    if (args.length > 1 || args.some(arg => arg.startsWith("-"))) throw new ClientError("Use gitmsg [owner/repo] or gitmsg auth logout. Credentials and messages do not belong in command arguments.");
    const initialRepo = args[0] ? roomLink(args[0]) : undefined;
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new ClientError("The interactive messenger needs a terminal. Use gitmsg --help for setup information.");
    const roomKey = await loadRoomKey(process.env.GITMSG_KEY_FILE);
    const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 60, maxFps: 60 });
    const stop = () => renderer.destroy();
    process.once("SIGTERM", stop);
    try {
      createRoot(renderer).render(<App vault={secrets} initialRepo={initialRepo} initialClientId={process.env.GITMSG_CLIENT_ID ?? DEFAULT_CLIENT_ID} initialToken={process.env.GITMSG_TOKEN} roomKey={roomKey} reducedMotion={process.env.GITMSG_REDUCED_MOTION === "1"} initialTheme={process.env.GITMSG_THEME} />);
      await renderer.closed;
    } finally { process.removeListener("SIGTERM", stop); renderer.destroy(); }
  }
} catch (error) { console.error(publicError(error)); process.exitCode = 1; }
