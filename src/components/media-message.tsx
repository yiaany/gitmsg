"use client";
import { useEffect, useState } from "react";
import { Download, FileImage, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { loadMedia } from "@/lib/media";
import type { Attachment, Room } from "@/lib/protocol";
import { Button } from "./ui/button";

export function MediaMessage({ room, attachment, onBoard }: { room: Room; attachment: Attachment; onBoard?: () => void }) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const drawing = attachment.mime === "application/vnd.excalidraw+json";
  useEffect(() => {
    if (drawing || !attempt) return;
    let disposed = false; let objectUrl = ""; setBusy(true); setError("");
    loadMedia(room, attachment).then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (!disposed) setError(e.message); }).finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [room.id, room.branch, attachment.id, attempt, drawing]);
  if (drawing) return <Button variant="outline" className="board-message" onClick={onBoard}><FileImage /><span>Whiteboard snapshot<small>{attachment.name}</small></span></Button>;
  return <div className="media-message">
    {!url && <Button variant="outline" loading={busy} onClick={() => setAttempt(n => n + 1)}>{busy ? <LoaderCircle /> : error ? <RefreshCw /> : attachment.mime.startsWith("audio/") ? <Play /> : <FileImage />}{error ? "Retry attachment" : attachment.mime.startsWith("audio/") ? `Voice note${attachment.duration ? ` · ${Math.round(attachment.duration)}s` : ""}` : "Load image"}<small>{Math.ceil(attachment.size / 1024)} KB</small></Button>}
    {url && (attachment.mime.startsWith("image/") ? <a href={url} target="_blank" rel="noreferrer"><img className="chat-image" src={url} alt={attachment.name} loading="lazy" /></a> : <audio controls preload="metadata" src={url} aria-label="Voice message" />)}
    {url && <Button size="xs" variant="ghost" render={<a href={url} download={attachment.name} />}><Download />Download</Button>}
    {error && <p className="fine-print" role="alert">{error}</p>}
  </div>;
}
