"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { compressImage } from "@/lib/media";
import { MAX_MEDIA, MAX_TEXT } from "@/lib/protocol";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

export function PhotoPreview({ file, disabled, onClose, onSend }: { file: File; disabled: boolean; onClose: () => void; onSend: (blob: Blob, caption: string) => Promise<void> }) {
  const [url, setUrl] = useState(""); const [blob, setBlob] = useState<Blob | null>(null);
  const [caption, setCaption] = useState(""); const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  const locked = useRef(false); const alive = useRef(true);
  useEffect(() => {
    alive.current = true; let disposed = false; let preview = "";
    compressImage(file).then(value => { if (value.size > MAX_MEDIA) throw new Error("The compressed photo is larger than 2 MiB. Choose a smaller image."); if (!disposed) { preview = URL.createObjectURL(value); setUrl(preview); setBlob(value); } }).catch(error => { if (!disposed) setError(error.message); });
    return () => { alive.current = false; disposed = true; if (preview) URL.revokeObjectURL(preview); };
  }, [file]);
  return <Dialog open onOpenChange={open => { if (!open && !locked.current) onClose(); }}><DialogContent className="photo-preview-dialog" showCloseButton={false}>
    <header><Button variant="ghost" size="icon-lg" className="round-button" aria-label="Cancel photo" disabled={sending} onClick={onClose}><X /></Button><DialogTitle>Send Photo</DialogTitle></header>
    <DialogDescription className="sr-only">Preview your photo and add a caption. Nothing is uploaded until you press Send.</DialogDescription>
    <div className="photo-preview-image">{url ? <img src={url} alt="Photo to send" /> : <p role="status">{error ? "Could not prepare photo" : "Preparing your photo…"}</p>}</div>
    <form onSubmit={async event => { event.preventDefault(); if (!blob || disabled || locked.current) return; locked.current = true; setSending(true); setError(""); try { await onSend(blob, caption.trim()); if (alive.current) onClose(); } catch (error) { if (alive.current) setError((error as Error).message); } finally { locked.current = false; if (alive.current) setSending(false); } }}>
      <label className="sr-only" htmlFor="photo-caption">Caption</label><textarea id="photo-caption" aria-label="Photo caption" placeholder="Add a caption…" value={caption} maxLength={MAX_TEXT} rows={2} disabled={sending} onChange={event => setCaption(event.target.value)} />
      {error && <p className="notice error" role="alert">{error}</p>}<footer><small>{blob ? `${Math.ceil(blob.size / 1024)} KB · photo` : "Preview before sending"}</small><Button type="submit" loading={sending} disabled={!blob || disabled || sending}><Send />Send</Button></footer>
    </form>
  </DialogContent></Dialog>;
}
