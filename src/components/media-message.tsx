"use client";
import { useEffect, useRef, useState } from "react";
import { Download, File, FileImage, LoaderCircle, RefreshCw } from "lucide-react";
import { loadMedia } from "@/lib/media";
import type { Attachment, Room } from "@/lib/protocol";
import { Button } from "./ui/button";
import { VoiceMessage } from "./voice-message";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { photoDisplaySize } from "@/lib/photo";

export function MediaMessage({ room, attachment, compact = false }: { room: Room; attachment: Attachment; compact?: boolean }) {
  const tile = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const image = attachment.mime.startsWith("image/"); const audio = attachment.mime.startsWith("audio/");
  useEffect(() => {
    if (!image || !tile.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setAttempt(1); observer.disconnect(); } });
    observer.observe(tile.current);
    return () => observer.disconnect();
  }, [compact, image]);
  useEffect(() => {
    if (!attempt) return;
    let disposed = false; let objectUrl = ""; setBusy(true); setError("");
    loadMedia(room, attachment).then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (!disposed) setError(e.message); }).finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [room.id, room.branch, attachment.id, attempt]);
  if (audio) return <VoiceMessage room={room} attachment={attachment} />;
  return <div ref={tile} className={`media-message ${image ? "is-photo" : ""} ${compact ? "shared-media-tile" : ""}`}>
    {!url && <Button className={image ? "photo-loading" : undefined} variant="outline" loading={busy} onClick={() => setAttempt(n => n + 1)}>{busy ? <LoaderCircle /> : error ? <RefreshCw /> : image ? <FileImage /> : <File />}{error ? "Retry attachment" : image ? "Load image" : `Load ${attachment.name}`}<small>{Math.ceil(attachment.size / 1024)} KB</small></Button>}
    {url && image && <button type="button" className="photo-open" aria-label="Open photo" onClick={() => setExpanded(true)}><img className="chat-image" src={url} alt={attachment.name} loading="lazy" onLoad={event => { if (compact) return; const node = event.currentTarget, bubble = tile.current?.closest<HTMLElement>(".message-content"); const size = photoDisplaySize(node.naturalWidth, node.naturalHeight); bubble?.style.setProperty("--photo-width", `${size.width}px`); }} /></button>}
    {url && image && expanded && <Dialog open onOpenChange={setExpanded}><DialogContent className="photo-viewer" ><DialogTitle className="sr-only">Photo</DialogTitle><DialogDescription className="sr-only">{attachment.name}</DialogDescription><img src={url} alt={attachment.name} /><Button variant="ghost" render={<a href={url} download={attachment.name} />}><Download />Download photo</Button></DialogContent></Dialog>}
    {url && !image && !audio && <span>{attachment.name}</span>}
    {url && !compact && !image && <Button size="xs" variant="ghost" render={<a href={url} download={attachment.name} />}><Download />Download</Button>}
    {error && <p className="fine-print" role="alert">{error}</p>}
  </div>;
}
