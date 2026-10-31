"use client";
import { useEffect, useRef, useState } from "react";
import { Image, Paperclip, Mic, Pause, PauseCircle, Play, Send, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { ComposerPopover } from "./composer-popover";
import { PhotoPreview } from "./photo-preview";
import { MAX_MEDIA } from "@/lib/protocol";
import { voiceClock as clock, voiceWaveform } from "@/lib/voice";

type VoiceClip = { blob: Blob; url: string; duration: number; peaks: number[] };

function VoicePreview({ clip }: { clip: VoiceClip }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  useEffect(() => { const node = audio.current; return () => node?.pause(); }, []);
  return <div className="voice-preview recording-pill">
    <audio ref={audio} src={clip.url} preload="metadata" onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPosition(0); }} />
    <Button size="icon-lg" className="voice-play" variant="ghost" aria-label={playing ? "Pause voice preview" : "Play voice preview"} onClick={() => { const node = audio.current; if (!node) return; if (playing) node.pause(); else void node.play().catch(() => setPlaying(false)); }}>{playing ? <Pause /> : <Play />}</Button>
    <label className="voice-preview-track"><span className="sr-only">Voice preview position</span><span className="voice-preview-wave" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ height: `${3 + (clip.peaks[Math.floor(index * clip.peaks.length / 48)] || 0) * 25}px`, opacity: index / 48 <= position / clip.duration ? 1 : .4 }} />)}</span><input type="range" min="0" max={clip.duration} step="0.1" value={position} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setPosition(value); }} /></label>
    <time>{clock(playing ? position : clip.duration)}</time>
  </div>;
}

export function MediaComposer({ disabled, onSend, onError, onActiveChange }: { disabled: boolean; onSend: (file: Blob, name: string, duration?: number, waveform?: number[], caption?: string) => Promise<void>; onError: (error: unknown) => void; onActiveChange: (active: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false); const [requesting, setRequesting] = useState(false); const [seconds, setSeconds] = useState(0); const [clip, setClip] = useState<VoiceClip | null>(null); const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null); const peaks = useRef<number[]>([]); const cancelled = useRef(false); const starting = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onSendRef = useRef(onSend); onSendRef.current = onSend;
  const elapsed = useRef(0); const sendOnStop = useRef(false); const finishing = useRef(false);
  const duration = () => Math.max(.1, Math.min(60, (elapsed.current + (recorder.current?.state === "recording" ? Date.now() - started.current : 0)) / 1000));
  const started = useRef(0); const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearInterval(timer.current); if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);
  useEffect(() => { onActiveChange(requesting || recording || !!clip || !!photo); }, [requesting, recording, clip, photo, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  useEffect(() => {
    if (!requesting && !recording && !clip) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !finishing.current) cancel(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [requesting, recording, clip]);
  useEffect(() => { if (disabled && (starting.current || recorder.current && recorder.current.state !== "inactive")) cancel(); }, [disabled]);
  useEffect(() => {
    if (!recording || paused || !stream.current || !canvas.current || typeof AudioContext === "undefined") return;
    let context: AudioContext | undefined; let frame = 0; let source: MediaStreamAudioSourceNode | undefined;
    try {
      context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 256;
      void context.resume().catch(() => {});
      source = context.createMediaStreamSource(stream.current); source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize); const node = canvas.current; const paint = node.getContext("2d"); let last = 0;
      const draw = (now: number) => {
        if (now - last >= 80) {
          last = now; analyser.getByteTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length);
          peaks.current.push(Math.min(1, rms * 5));
          if (paint) { paint.clearRect(0, 0, node.width, node.height); paint.fillStyle = getComputedStyle(node).color; const samples = peaks.current.slice(-48); samples.forEach((value, index) => { const height = Math.max(3, value * 28); paint.fillRect(index * 6, (32 - height) / 2, 3, height); }); }
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    } catch { /* Recording still works on browsers without audio analysis. */ }
    return () => { cancelAnimationFrame(frame); source?.disconnect(); if (context && context.state !== "closed") void context.close().catch(() => {}); };
  }, [recording, paused]);
  function pause() {
    const media = recorder.current;
    if (!media || media.state !== "recording") return;
    elapsed.current += Date.now() - started.current;
    media.pause(); media.requestData(); setPaused(true); setSeconds(Math.floor(elapsed.current / 1000));
  }
  function resume() {
    const media = recorder.current;
    if (!media || media.state !== "paused" || elapsed.current >= 60000) return;
    setClip(null); started.current = Date.now(); media.resume(); setPaused(false);
  }
  function cancel() {
    cancelled.current = true; sendOnStop.current = false;
    clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
    setClip(null);
  }
  async function start() {
    if (starting.current || disabled || busy || clip || recorder.current?.state === "recording") return;
    starting.current = true; setRequesting(true); cancelled.current = false; peaks.current = []; elapsed.current = 0; sendOnStop.current = false; finishing.current = false; setPaused(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording is unavailable in this browser. Use a recent browser over HTTPS.");
      const tracks = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!alive.current || cancelled.current || disabledRef.current) { tracks.getTracks().forEach(t => t.stop()); return; }
      stream.current = tracks;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      const media = new MediaRecorder(tracks, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 }); recorder.current = media;
      const chunks: Blob[] = []; let size = 0; started.current = Date.now();
      const snapshot = (): VoiceClip => ({ blob: new Blob(chunks, { type: media.mimeType.split(";")[0] || "audio/webm" }), url: "", duration: duration(), peaks: [...peaks.current] });
      media.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); size += e.data.size; if (size > MAX_MEDIA && media.state !== "inactive") { cancelled.current = true; media.stop(); onError(new Error("Recording is too large. Keep voice notes under 60 seconds.")); } else if (media.state === "paused" && alive.current) { const value = snapshot(); value.url = URL.createObjectURL(value.blob); setClip(value); } } };
      media.onerror = () => { cancelled.current = true; if (alive.current) onError(new Error("Microphone recording failed.")); if (media.state !== "inactive") media.stop(); };
      media.onstop = () => {
        const value = snapshot(); value.url = URL.createObjectURL(value.blob);
        clearInterval(timer.current); tracks.getTracks().forEach(t => t.stop());
        recorder.current = null; stream.current = null;
        if (!alive.current || cancelled.current) { URL.revokeObjectURL(value.url); if (alive.current) { setRecording(false); setPaused(false); } return; }
        setRecording(false); setPaused(true);
        if (!value.blob.size || value.blob.size > MAX_MEDIA) { URL.revokeObjectURL(value.url); onError(new Error("Recording is empty or too large. Keep voice notes under 60 seconds.")); return; }
        setClip(value); if (sendOnStop.current) void sendClip(value);
      };
      media.start(250); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => { const value = duration(); setSeconds(Math.floor(value)); if (value >= 60 && media.state === "recording") pause(); }, 100);
    } catch (error) { stream.current?.getTracks().forEach(t => t.stop()); if (alive.current) onError(error); }
    finally { starting.current = false; if (alive.current) setRequesting(false); }
  }
  async function sendClip(value: VoiceClip) { if (busy || disabledRef.current) { finishing.current = false; return; } finishing.current = true; setBusy(true); try { await onSendRef.current(value.blob, `voice.${value.blob.type === "audio/mp4" ? "m4a" : value.blob.type === "audio/ogg" ? "ogg" : "webm"}`, value.duration, voiceWaveform(value.peaks)); if (alive.current) setClip(null); } catch (e) { if (alive.current) onError(e); } finally { finishing.current = false; if (alive.current) setBusy(false); } }
  function sendVoice() {
    if (busy || disabled || finishing.current) return;
    const media = recorder.current;
    if (media && media.state !== "inactive") { finishing.current = true; sendOnStop.current = true; if (media.state === "recording") elapsed.current += Date.now() - started.current; media.stop(); }
    else if (clip) void sendClip(clip);
  }
  const active = recording || !!clip;
  return <><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file && !disabled && !busy) setPhoto(file); }} />
    {photo && <PhotoPreview file={photo} disabled={disabled} onClose={() => setPhoto(null)} onSend={(blob, caption) => onSendRef.current(blob, "image.webp", undefined, undefined, caption)} />}
    <ComposerPopover label="Add attachment" icon={<Paperclip />} className="image-attach" disabled={disabled || busy || recording || requesting || !!clip} open={attachmentsOpen} onOpenChange={setAttachmentsOpen}><div className="attachment-menu"><button type="button" onClick={() => { setAttachmentsOpen(false); input.current?.click(); }}><Image className="attachment-photo" /><span>Photo or image</span></button><button type="button" onClick={() => { setAttachmentsOpen(false); void start(); }}><Mic className="attachment-audio" /><span>Voice message</span></button></div></ComposerPopover>
    <Button className={`voice-record-button ${active ? "voice-send-active" : ""}`} size="icon-lg" variant="ghost" aria-label={active ? "Send voice message" : "Record voice message"} title={active ? "Send voice message" : "Record voice message"} disabled={disabled || busy || requesting} aria-busy={requesting || busy} onClick={() => active ? sendVoice() : void start()}>{active ? <Send /> : <Mic />}</Button>
    {requesting && <div className="recording-status"><Button size="icon-lg" variant="ghost" className="round-button" aria-label="Cancel recording" onClick={cancel}><Trash2 /></Button><div className="recording-pill" role="status">Waiting for microphone permission…</div></div>}
    {active && <div className="recording-status"><Button size="icon-lg" variant="ghost" className="round-button" aria-label="Cancel recording" disabled={busy} onClick={cancel}><Trash2 /></Button>{paused && clip ? <VoicePreview clip={clip} /> : <div className="recording-pill"><span className="recording-dot" /><canvas ref={canvas} width={288} height={32} className="recording-wave" aria-hidden="true" /><time aria-label="Recording duration">{clock(seconds)}</time></div>}<Button size="icon-lg" variant="ghost" className="round-button recording-pause" aria-label={paused ? "Resume recording" : "Pause recording"} disabled={busy || !recording || (paused && seconds >= 60)} onClick={() => paused ? resume() : pause()}>{paused ? <Mic /> : <PauseCircle />}</Button><span className="sr-only" role="status">{paused ? "Recording paused. Preview, resume or send." : "Recording voice message. Pause to preview, or send directly."}</span></div>}
  </>;
}
