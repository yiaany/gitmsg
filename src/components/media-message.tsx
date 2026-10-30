"use client";
import { useEffect, useState } from "react";
import { Download, File, FileImage, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { loadMedia } from "@/lib/media";
import type { Attachment, Room } from "@/lib/protocol";
import { Button } from "./ui/button";

export function MediaMessage({ room, attachment }: { room: Room; attachment: Attachment }) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const image = attachment.mime.startsWith("image/"); const audio = attachment.mime.startsWith("audio/");
  useEffect(() => {
    if (!attempt) return;
    let disposed = false; let objectUrl = ""; setBusy(true); setError("");
    loadMedia(room, attachment).then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (!disposed) setError(e.message); }).finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [room.id, room.branch, attachment.id, attempt]);
  return <div className="media-message">
    {!url && <Button variant="outline" loading={busy} onClick={() => setAttempt(n => n + 1)}>{busy ? <LoaderCircle /> : error ? <RefreshCw /> : audio ? <Play /> : image ? <FileImage /> : <File />}{error ? "Retry attachment" : audio ? `Voice note${attachment.duration ? ` · ${Math.round(attachment.duration)}s` : ""}` : image ? "Load image" : `Load ${attachment.name}`}<small>{Math.ceil(attachment.size / 1024)} KB</small></Button>}
    {url && image && <a href={url} target="_blank" rel="noreferrer"><img className="chat-image" src={url} alt={attachment.name} loading="lazy" /></a>}
    {url && audio && <audio controls preload="metadata" src={url} aria-label="Voice message" />}
    {url && !image && !audio && <span>{attachment.name}</span>}
    {url && <Button size="xs" variant="ghost" render={<a href={url} download={attachment.name} />}><Download />Download</Button>}
    {error && <p className="fine-print" role="alert">{error}</p>}
  </div>;
}
