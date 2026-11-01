import { useEffect, useState } from "react";
import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { imageInfo, NativeImage } from "@opentui/core";
import type { Attachment } from "../../src/lib/protocol";
import type { Rooms, TerminalRoom } from "./rooms";
import { ClientError, publicError, terminalText } from "./safety";
import { useTheme } from "./theme";

export function checkImage(bytes: Uint8Array) {
  try {
    const info = imageInfo(bytes);
    if (info.width < 1 || info.height < 1 || info.width > 8192 || info.height > 8192 || info.width * info.height > 16_000_000) throw new Error();
    return info;
  } catch { throw new ClientError("Image is damaged, unsupported, or exceeds the 16-megapixel preview limit."); }
}

export function ImageView({ bytes, width = 48, maxRows = 16 }: { bytes: Uint8Array; width?: number; maxRows?: number }) {
  const c = useTheme();
  const renderer = useRenderer(), terminal = useTerminalDimensions();
  const [failed, setFailed] = useState(false);
  const [image, setImage] = useState<NativeImage | null>(null);
  useEffect(() => {
    let owned: NativeImage | null = null;
    setFailed(false);
    try {
      const info = checkImage(bytes);
      const decoded = NativeImage.decode(bytes);
      const ratio = Math.min(1, 1600 / info.width, 1200 / info.height);
      if (ratio < 1) {
        try { owned = decoded.resize({ width: Math.max(1, Math.round(info.width * ratio)), height: Math.max(1, Math.round(info.height * ratio)) }); }
        finally { decoded.dispose(); }
      } else owned = decoded;
      setImage(owned);
    } catch { setFailed(true); }
    return () => owned?.dispose();
  }, [bytes]);
  if (failed) return <text fg={c.error}>Image preview unavailable.</text>;
  if (!image) return <text fg={c.muted}>Loading image…</text>;
  const cols = Math.max(4, Math.min(width, 160));
  const resolution = renderer.resolution;
  const cellAspect = resolution ? resolution.height / terminal.height / (resolution.width / terminal.width) : 2;
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(cols * image.height / image.width / cellAspect)));
  return <image id="image-preview" source={image} width={cols} height={rows} flexShrink={0} fit="fit" protocol="auto" onError={() => setFailed(true)} />;
}

const imageCaches = new WeakMap<Rooms, Map<string, Uint8Array<ArrayBuffer>>>();
function imageCache(rooms: Rooms) { let cache = imageCaches.get(rooms); if (!cache) { cache = new Map(); imageCaches.set(rooms, cache); } return cache; }

function useAttachmentImage(rooms: Rooms, room: TerminalRoom, attachment: Attachment, load: boolean) {
  const key = JSON.stringify([room.id.toLowerCase(), room.branch, attachment.sourceRepo, attachment.sourceBranch, attachment.id, attachment.sha256, attachment.iv, attachment.mime, attachment.size]);
  const cache = imageCache(rooms);
  const [bytes, setBytes] = useState<Uint8Array | undefined>(() => cache.get(key));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!load) return;
    const cached = cache.get(key);
    if (cached) { setBytes(cached); return; }
    setBytes(undefined); setError("");
    const controller = new AbortController();
    void rooms.image(room, attachment, controller.signal).then(data => {
      checkImage(data);
      if (!controller.signal.aborted) {
        cache.set(key, data);
        while (cache.size > 8 || [...cache.values()].reduce((sum, bytes) => sum + bytes.length, 0) > 8 * 1024 * 1024) cache.delete(cache.keys().next().value!);
        setBytes(data);
      }
    }).catch(error => { if (!controller.signal.aborted) setError(publicError(error)); });
    return () => controller.abort();
  }, [rooms, key, load]);
  return { bytes, error };
}

export function ChatImage({ rooms, room, attachment, autoLoad, width, onOpen }: { rooms: Rooms; room: TerminalRoom; attachment: Attachment; autoLoad: boolean; width: number; onOpen: () => void }) {
  const c = useTheme(), { bytes, error } = useAttachmentImage(rooms, room, attachment, autoLoad);
  return <box id={`chat-image-${attachment.id}`} flexDirection="column" gap={1} onMouseDown={event => { event.stopPropagation(); onOpen(); }}>
    <text selectable={false} fg={c.muted}>{terminalText(attachment.name, 80)}{!autoLoad && !bytes ? "  [open image]" : !bytes && !error ? "  loading…" : "  ↗"}</text>
    {error ? <text fg={c.error}>{error}</text> : bytes ? <ImageView bytes={bytes} width={width} /> : null}
  </box>;
}

export function ImageLightbox({ rooms, room, attachment, onClose }: { rooms: Rooms; room: TerminalRoom; attachment: Attachment; onClose: () => void }) {
  const c = useTheme(), { width, height } = useTerminalDimensions();
  const { bytes, error } = useAttachmentImage(rooms, room, attachment, true);
  const info = bytes ? checkImage(bytes) : null;
  return <box id="image-lightbox" position="absolute" top={0} bottom={0} left={0} right={0} zIndex={50} backgroundColor={c.bg} padding={height < 24 ? 1 : 2}>
    <box id="image-lightbox-frame" border borderStyle="rounded" borderColor={c.border} backgroundColor={c.panel} flexGrow={1} minHeight={0} flexDirection="column" paddingX={2}>
      <box height={3} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="space-between">
        <text selectable={false} fg={c.text} wrapMode="none" flexShrink={1} minWidth={0}><strong>{terminalText(attachment.name, Math.max(12, width - 25))}</strong></text>
        <box id="image-lightbox-close" paddingX={1} flexShrink={0} onMouseDown={onClose}><text selectable={false} fg={c.accent}>× Close</text></box>
      </box>
      <box flexGrow={1} minHeight={0} alignItems="center" justifyContent="center">
        {error ? <text fg={c.error}>{error}</text> : bytes ? <ImageView bytes={bytes} width={Math.min(128, width - (height < 24 ? 10 : 12))} maxRows={Math.max(1, height - (height < 24 ? 10 : 12))} /> : <text fg={c.muted}>Loading image…</text>}
      </box>
      <box height={3} flexShrink={0} flexDirection="row" justifyContent="space-between" alignItems="center">
        <text selectable={false} fg={c.muted}>{info ? `${info.width} × ${info.height} · ${Math.ceil(bytes!.length / 1024)} KB` : "Image preview"}</text>
        <text selectable={false} fg={c.muted}>Esc to close</text>
      </box>
    </box>
  </box>;
}
