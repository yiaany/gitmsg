import type { CliRenderer } from "@opentui/core";

export type CopyTarget = { x: number; y: number; width: number; height: number; text: string };

/** Only rendered, visible Copy controls; never hidden messages, drafts or keys. */
export function messageCopyTargets(renderer: CliRenderer, messages: readonly { id: string; text?: string; locked?: boolean; deleted?: boolean }[], sanitize: (text: string) => string): CopyTarget[] {
  const viewport = renderer.root.findDescendantById("history");
  if (!viewport) return [];
  const targets: CopyTarget[] = [];
  let bytes = 0;
  for (const message of messages) {
    if (!message.text || message.locked || message.deleted) continue;
    const actions = renderer.root.findDescendantById(`message-${message.id}-actions`);
    const node = renderer.root.findDescendantById(`message-${message.id}-copy`);
    if (!node || !actions || actions.opacity <= 0 || node.width <= 0 || node.height <= 0) continue;
    const x = Math.max(viewport.x, node.x), y = Math.max(viewport.y, node.y);
    const right = Math.min(viewport.x + viewport.width, node.x + node.width), bottom = Math.min(viewport.y + viewport.height, node.y + node.height);
    if (right <= x || bottom <= y) continue;
    const text = sanitize(message.text);
    bytes += Buffer.byteLength(text);
    if (bytes > 128 * 1024 || targets.length >= 64) break;
    targets.push({ x, y, width: right - x, height: bottom - y, text });
  }
  return targets;
}
