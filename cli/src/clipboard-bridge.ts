import { randomUUID } from "node:crypto";
import { ClientError } from "./safety";

type Channel = Pick<NodeJS.Process, "on" | "off" | "once"> & { send(value: object): unknown };
/** An IPC write request is not success: wait for the device-local clipboard result. */
export function requestClipboard(text: string, channel: Channel): Promise<"copied"> {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (copied: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); channel.off("message", listener); channel.off("disconnect", disconnected);
      if (copied) resolve("copied");
      else reject(new ClientError("Clipboard did not confirm the copy. Try Copy again with this window focused."));
    };
    const listener = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const event = value as { type?: string; id?: string; copied?: boolean };
      if (event.type === "gitmsg:copy-result" && event.id === id && typeof event.copied === "boolean") finish(event.copied);
    };
    const disconnected = () => finish(false);
    const timer = setTimeout(() => finish(false), 30_000);
    channel.on("message", listener); channel.once("disconnect", disconnected);
    try { channel.send({ type: "gitmsg:copy", id, text }); } catch { finish(false); }
  });
}
