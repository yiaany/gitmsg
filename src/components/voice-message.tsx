"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, RefreshCw } from "lucide-react";
import { loadMedia } from "@/lib/media";
import { voiceClock, voiceWaveform } from "@/lib/voice";
import type { Attachment, Room } from "@/lib/protocol";

export function VoiceMessage({ room, attachment }: { room: Room; attachment: Attachment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const alive = useRef(true); const objectUrl = useRef(""); const loading = useRef(false);
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false); const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(attachment.duration || 0);
  const [waveform, setWaveform] = useState(attachment.waveform || []);
  useEffect(() => { alive.current = true; const node = audio.current; return () => { alive.current = false; node?.pause(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  async function play() {
    const node = audio.current;
    if (!node || loading.current) return;
    if (playing) { node.pause(); return; }
    setError("");
    if (!objectUrl.current) {
      loading.current = true; setBusy(true); setError("");
      try {
        const blob = await loadMedia(room, attachment);
        if (!alive.current) return;
        const next = URL.createObjectURL(blob); objectUrl.current = next; setUrl(next); node.src = next;
        if (!attachment.waveform && typeof AudioContext !== "undefined") try {
          const context = new AudioContext();
          void blob.arrayBuffer().then(bytes => context.decodeAudioData(bytes)).then(buffer => {
            if (!alive.current) return;
            setDuration(buffer.duration);
            const samples = buffer.getChannelData(0); const peaks: number[] = [];
            for (let i = 0; i < samples.length; i += 256) { let peak = 0; for (let j = i; j < Math.min(i + 256, samples.length); j++) peak = Math.max(peak, Math.abs(samples[j])); peaks.push(peak); }
            setWaveform(voiceWaveform(peaks));
          }).catch(() => {}).finally(() => { void context.close().catch(() => {}); });
        } catch { /* Audio analysis is optional; playback remains available. */ }
      } catch (error) { if (alive.current) setError((error as Error).message); return; }
      finally { loading.current = false; if (alive.current) setBusy(false); }
    }
    if (alive.current) { try { await node.play(); } catch { if (alive.current) setError("Could not play voice message. Try again."); } }
  }
  const width = Math.min(300, 120 + Math.max(0, (duration - 1) * 3));
  return <div className="voice-message" aria-label="Voice note" style={{ width: width + 60 }}>
    {/* Source is assigned once in play(); a React src update would interrupt the pending play(). */}
    <audio ref={audio} preload="none" onPlay={() => { setPlaying(true); setError(""); }} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setError("Could not load voice message. Try again."); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; setUrl(""); }} onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onLoadedMetadata={() => { const value = audio.current?.duration; if (value && Number.isFinite(value)) setDuration(value); }} onEnded={() => { setPlaying(false); setPosition(0); }} />
    <button type="button" className="voice-message-play" aria-label={busy ? "Loading voice message" : error ? "Retry voice message" : playing ? "Pause audio" : "Play audio"} disabled={busy} onClick={() => void play()}>{busy ? <LoaderCircle className="spin" /> : error ? <RefreshCw /> : playing ? <Pause /> : <Play />}</button>
    <div className="voice-message-body" style={{ width }}>
      <label className="voice-message-track"><span className="sr-only">Voice message position</span><span className="voice-message-wave" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <i key={index} style={{ height: `${Math.max(2, (waveform[Math.floor(index * waveform.length / 40)] || 0) / 31 * 23)}px`, opacity: index / 40 < position / duration ? 1 : .5 }} />)}</span><input type="range" min="0" max={duration || 1} step=".1" value={Math.min(position, duration || 1)} disabled={!url} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setPosition(value); }} /></label>
      <time>{playing || position > 0 ? `${voiceClock(position)} / ` : ""}{voiceClock(duration)}</time>
    </div>
    {error && <span className="voice-message-error" role="alert">{error}</span>}
  </div>;
}
