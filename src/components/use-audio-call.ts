"use client";

import { useEffect, useRef, useState } from "react";
import { AudioCall, type CallView } from "@/lib/audio-call";
import { api } from "@/lib/client";
import { encryptEvent, keyFingerprint, roomKey } from "@/lib/room-crypto";
import type { Actor, ChatEvent, Room } from "@/lib/protocol";

export function useAudioCall({ actor, rooms, timelines, update, onError }: {
  actor: Actor; rooms: Room[]; timelines: Record<string, { events: ChatEvent[] }>;
  update: (room: Room, event: ChatEvent) => void; onError: (error: unknown) => void;
}) {
  const [view, setView] = useState<CallView | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const engine = useRef<AudioCall | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const latest = useRef({ update, onError }); latest.current = { update, onError };
  useEffect(() => {
    if (!actor.id) return;
    const output = new Audio(); output.autoplay = true; audio.current = output;
    // Store only deduplication IDs, never SDP, in this tab's session storage.
    const storageKey = `gitmsg:calls-seen:${actor.id}`;
    let seen: string[] = []; try { seen = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); if (!Array.isArray(seen)) seen = []; } catch { /* Storage is optional. */ }
    const controller = new AudioCall({
      actor, change: next => { setView(next); if (!next || next.phase === "finished") setBlocked(false); },
      seen: key => seen.includes(key), remember: key => { seen = [...seen.filter(id => id !== key), key].slice(-500); try { sessionStorage.setItem(storageKey, JSON.stringify(seen)); } catch { /* In-memory deduplication remains available. */ } },
      remote: stream => { output.srcObject = stream; if (stream) void output.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); else { output.pause(); output.srcObject = null; } },
      send: async (room, event) => {
        try {
          // Resolve policy for THIS call's room, not whichever chat is currently open.
          const policy = await api<{ enabled: boolean; keyId?: string }>(`/api/security?${new URLSearchParams({ repo: room.id, branch: room.branch })}`, { signal: AbortSignal.timeout(15000) });
          let wire = event;
          if (policy.enabled) {
            const key = await roomKey(room.id);
            if (!key || await keyFingerprint(key) !== policy.keyId) throw new Error("Import the correct room key before calling.");
            wire = await encryptEvent(key, room.id, room.branch, event);
          }
          const result = await api<{ event: ChatEvent }>("/api/chat", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, event: wire }), signal: AbortSignal.timeout(15000) });
          latest.current.update(room, { ...event, sha: result.event.sha, url: result.event.url, encrypted: policy.enabled });
        } catch (error) { latest.current.onError(error); throw error; }
      },
    });
    engine.current = controller;
    const hide = () => { void controller.end(); };
    const unload = (event: BeforeUnloadEvent) => { if (controller.busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("pagehide", hide); window.removeEventListener("beforeunload", unload); controller.dispose(); output.pause(); output.srcObject = null; engine.current = null; audio.current = null; setView(null); };
  }, [actor.id, actor.login]);
  useEffect(() => {
    for (const room of rooms) engine.current?.observe(room, timelines[room.id]?.events || []);
  }, [rooms, timelines, actor.id]);
  return {
    view, busy: !!view && view.phase !== "finished", blocked, quiet,
    start: (room: Room) => { setQuiet(false); if (audio.current) audio.current.muted = false; return engine.current?.start(room); },
    accept: () => { setQuiet(false); if (audio.current) audio.current.muted = false; return engine.current?.accept(); },
    end: () => engine.current?.end(view?.phase === "incoming" ? "declined" : "hangup"),
    mute: () => engine.current?.toggleMute(), dismiss: () => engine.current?.dismiss(),
    output: () => { if (!audio.current) return; if (blocked) void audio.current.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); else { audio.current.muted = !quiet; setQuiet(!quiet); } },
  };
}
