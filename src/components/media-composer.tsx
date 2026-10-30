"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, Pause, Send, Square, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { compressImage } from "@/lib/media";
import { MAX_MEDIA } from "@/lib/protocol";

export function MediaComposer({ disabled, onSend, onError }: { disabled: boolean; onSend: (file: Blob, name: string, duration?: number) => Promise<void>; onError: (error: unknown) => void }) {
  const input = useRef<HTMLInputElement>(null); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false); const [seconds, setSeconds] = useState(0); const [clip, setClip] = useState<{ blob: Blob; url: string; duration: number } | null>(null); const [busy, setBusy] = useState(false);
  const started = useRef(0); const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearInterval(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);
  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording is unavailable in this browser. Use a recent browser over HTTPS.");
      const tracks = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!alive.current) { tracks.getTracks().forEach(t => t.stop()); return; }
      stream.current = tracks;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      const media = new MediaRecorder(tracks, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 }); recorder.current = media;
      const chunks: Blob[] = []; let size = 0; started.current = Date.now();
      media.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); size += e.data.size; if (size > MAX_MEDIA && media.state === "recording") media.stop(); } };
      media.onerror = () => { onError(new Error("Microphone recording failed.")); media.stop(); };
      media.onstop = () => {
        clearInterval(timer.current); tracks.getTracks().forEach(t => t.stop());
        if (!alive.current) return;
        setRecording(false); const blob = new Blob(chunks, { type: media.mimeType.split(";")[0] || "audio/webm" });
        if (!blob.size || blob.size > MAX_MEDIA) { onError(new Error("Recording is empty or too large. Keep voice notes under 60 seconds.")); return; }
        setClip({ blob, url: URL.createObjectURL(blob), duration: Math.min(60, (Date.now() - started.current) / 1000) });
      };
      media.start(250); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started.current) / 1000); setSeconds(elapsed); if (elapsed >= 60 && media.state === "recording") media.stop(); }, 250);
    } catch (error) { stream.current?.getTracks().forEach(t => t.stop()); onError(error); }
  }
  async function image(file: File) { setBusy(true); try { await onSend(await compressImage(file), "image.webp"); } catch (e) { onError(e); } finally { if (alive.current) setBusy(false); } }
  async function sendClip() { if (!clip) return; setBusy(true); try { await onSend(clip.blob, `voice.${clip.blob.type === "audio/mp4" ? "m4a" : clip.blob.type === "audio/ogg" ? "ogg" : "webm"}`, clip.duration); setClip(null); } catch (e) { onError(e); } finally { if (alive.current) setBusy(false); } }
  return <><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void image(file); }} />
    <Button size="icon-sm" variant="ghost" aria-label="Send image" title="Send image" disabled={disabled || busy || recording} onClick={() => input.current?.click()}><ImagePlus /></Button>
    <Button size="icon-sm" variant="ghost" aria-label={recording ? "Stop recording" : "Record voice message"} title={recording ? "Stop recording" : "Record voice message"} disabled={disabled || busy || !!clip} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? <Square /> : <Mic />}</Button>
    {recording && <span className="recording-status" role="status"><span className="recording-dot" />{seconds}s / 60s</span>}
    {clip && <div className="voice-preview"><audio src={clip.url} controls aria-label="Preview voice message" /><Button size="icon-sm" variant="ghost" aria-label="Discard recording" disabled={busy} onClick={() => setClip(null)}><Trash2 /></Button><Button size="sm" loading={busy} disabled={disabled} onClick={() => void sendClip()}><Send />Send voice</Button></div>}
  </>;
}
