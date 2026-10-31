"use client";

import { useEffect, useState } from "react";
import { Maximize, Mic, MicOff, Phone, Volume2, VolumeX, X } from "lucide-react";
import type { CallView } from "@/lib/audio-call";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { ConversationAvatar } from "./conversation-list";
import "./audio-call.css";

export function AudioCallPanel({ view, blocked, quiet, onAccept, onEnd, onMute, onOutput, onClose }: {
  view: CallView | null; blocked: boolean; quiet: boolean;
  onAccept: () => void; onEnd: () => void; onMute: () => void; onOutput: () => void; onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [minimized, setMinimized] = useState(false);
  useEffect(() => { setMinimized(false); }, [view?.id]);
  useEffect(() => { if (view?.phase !== "connected") return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [view?.phase]);
  const seconds = Math.max(0, Math.floor((now - (view?.startedAt || now)) / 1000));
  const endedStatus = !view?.detail || view.detail === "Call ended" ? "Call ended" : view.detail.startsWith("Call declined") ? "Call declined" : view.detail.startsWith("Already on") ? "Busy" : view.detail.startsWith("No answer") ? "No answer" : view.detail.startsWith("Microphone unavailable") ? "Microphone unavailable" : "Couldn't connect. Try another network.";
  const status = view?.phase === "connected" ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : view?.phase === "finished" ? endedStatus : ({ incoming: "Incoming call", preparing: "connecting…", ringing: "waiting…", connecting: "connecting…" } as const)[view?.phase || "preparing"];
  return <>
    {view && minimized && <button type="button" className="audio-call-return" onClick={() => setMinimized(false)}><Phone size={18} /><span>{view.room.name}</span><small>{status}</small></button>}
    <Dialog open={!!view && !minimized} onOpenChange={open => { if (!open && view?.phase === "finished") onClose(); }}><DialogContent className="audio-call-panel" viewportClassName="audio-call-viewport" backdropClassName="audio-call-backdrop" showCloseButton={false} style={{ background: `linear-gradient(#fff -300%, ${view?.room.color || "#6c61df"})` }}>
    {view && <>
      {view.room.avatar && <img className="audio-call-background" src={view.room.avatar} alt="" referrerPolicy="no-referrer" />}
      <div className="audio-call-window-controls"><button type="button" aria-label="Toggle fullscreen" onClick={event => { const panel = event.currentTarget.closest<HTMLElement>(".audio-call-panel"); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void panel?.requestFullscreen?.().catch(() => {}); }}><Maximize /></button><button type="button" aria-label={view.phase === "finished" ? "Close call" : "Minimize call"} onClick={() => { if (view.phase === "finished") onClose(); else setMinimized(true); }}><X /></button></div>
      <div className="audio-call-heading"><DialogTitle>{view.room.name}</DialogTitle><p role="status" aria-live="polite">{status}</p></div><DialogDescription className="sr-only">Call with {view.room.name}</DialogDescription>
      {!view.room.avatar && <div className="audio-call-portrait"><ConversationAvatar room={view.room} /></div>}
      <div className="audio-call-controls">
        {view.phase === "incoming" ? <><button type="button" className="call-control call-decline" onClick={onEnd}><span><Phone /></span>decline</button><button type="button" className="call-control call-accept" onClick={onAccept}><span><Phone /></span>accept</button></> : view.phase === "finished" ? <button type="button" className="call-done" onClick={onClose}>Close</button> : <>
          <button type="button" className="call-control" aria-pressed={view.muted} aria-label={view.muted ? "Unmute microphone" : "Mute microphone"} onClick={onMute}><span>{view.muted ? <MicOff /> : <Mic />}</span>{view.muted ? "unmute" : "mute"}</button>
          <button type="button" className="call-control" aria-pressed={quiet} aria-label={blocked ? "Play call audio" : quiet ? "Unmute call audio" : "Mute call audio"} onClick={onOutput}><span>{quiet ? <VolumeX /> : <Volume2 />}</span>{blocked ? "play audio" : "speaker"}</button>
          <button type="button" className="call-control call-decline" onClick={onEnd}><span><Phone /></span>end call</button>
        </>}
      </div></>}
  </DialogContent></Dialog></>;
}
