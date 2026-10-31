"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, readLocal, writeLocal } from "@/lib/client";
import { startAdaptivePolling } from "@/lib/polling";
import { decodeEvents } from "@/lib/room-crypto";
import { reconcileEvents, type ChatEvent, type Room } from "@/lib/protocol";
import { observeMessages, parseInboxReads, type InboxReads } from "@/lib/unread";

type Timeline = { events: ChatEvent[]; etag?: string; head?: string | null; older?: string | null; fetched?: boolean };
type Batch = { events: ChatEvent[]; head: string | null; older: string | null };
export function useInbox({ actorId, rooms, active, reading, timelines, updateTimeline, onError, onIncoming, retryAt }: {
  actorId?: number; rooms: Room[]; active: Room; reading: boolean; timelines: Record<string, Timeline>;
  updateTimeline: (id: string, update: (old: Timeline) => Timeline) => void;
  onError: (error: unknown) => void; onIncoming: (room: Room) => void; retryAt: () => number;
}) {
  const [reads, setReads] = useState<{ actorId?: number; rooms: InboxReads }>({ rooms: {} });
  const [visible, setVisible] = useState(false);
  const latest = useRef({ rooms, active, timelines, onError, onIncoming, retryAt }); latest.current = { rooms, active, timelines, onError, onIncoming, retryAt };
  useEffect(() => {
    setReads({ actorId, rooms: actorId ? parseInboxReads(readLocal(`gitmsg:reads:${actorId}`, {})) : {} });
  }, [actorId]);
  useEffect(() => {
    const refresh = () => setVisible(!document.hidden && document.hasFocus());
    refresh(); document.addEventListener("visibilitychange", refresh); window.addEventListener("focus", refresh); window.addEventListener("blur", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("blur", refresh); };
  }, []);
  useEffect(() => {
    if (!actorId) return;
    setReads(previous => {
      if (previous.actorId !== actorId) return previous;
      const next = { ...previous.rooms }; let changed = false;
      for (const [repo, timeline] of Object.entries(timelines)) {
        if (!timeline.fetched) continue;
        const id = repo.toLowerCase(), old = previous.rooms[id];
        const value = observeMessages(old, timeline.events, actorId, visible && reading && active.id.toLowerCase() === id);
        if (!old || JSON.stringify(old) !== JSON.stringify(value)) { next[id] = value; changed = true; }
      }
      return changed ? { actorId, rooms: next } : previous;
    });
  }, [actorId, timelines, active.id, reading, visible]);
  useEffect(() => { if (actorId && reads.actorId === actorId) writeLocal(`gitmsg:reads:${actorId}`, reads.rooms); }, [reads, actorId]);

  useEffect(() => {
    if (!actorId) return;
    let index = 0, failures = 0, nextAt = 0;
    const poller = startAdaptivePolling({
      state: () => ({ hidden: document.hidden, focused: document.hasFocus(), online: navigator.onLine, failures, retryAt: Math.max(latest.current.retryAt(), nextAt) }),
      run: async signal => {
        // One inactive room per turn; never fan out requests to every repository.
        nextAt = Date.now() + 5000;
        const candidates = latest.current.rooms.filter(room => room.id !== latest.current.active.id);
        if (!candidates.length) return;
        const room = candidates[index++ % candidates.length]; const old = latest.current.timelines[room.id];
        try {
          const query = new URLSearchParams({ repo: room.id, branch: room.branch });
          const response = await fetch(`/api/chat?${query}`, { signal, cache: "no-store", headers: old?.etag ? { "If-None-Match": old.etag } : {} });
          if (response.status === 304) { failures = 0; return; }
          const data = await response.json(); if (!response.ok) throw new ApiError(data.error, response.status, data.retryAfter);
          const batch = data as Batch; let events = batch.events;
          if (old?.head && batch.head !== old.head && batch.older && !events.some(event => event.sha === old.head)) {
            let cursor = batch.older, found = false;
            for (let page = 0; cursor && !found; page++) {
              if (page >= 10) throw new ApiError("Open this chat to catch up on its older messages.", 429, 300);
              const more = await api<Batch>(`/api/chat?${new URLSearchParams({ repo: room.id, branch: room.branch, cursor })}`, { signal });
              events = [...more.events, ...events]; found = more.events.some(event => event.sha === old.head); cursor = more.older || "";
            }
          }
          events = await decodeEvents(room.id, room.branch, events);
          if (signal.aborted || latest.current.active.id === room.id || !latest.current.rooms.some(item => item.id === room.id && item.branch === room.branch)) return;
          const fresh = old?.fetched && events.some(event => event.kind === "message" && event.actor.id !== actorId && !old.events.some(known => known.id === event.id));
          updateTimeline(room.id, current => ({ events: reconcileEvents(current.events, events), etag: response.headers.get("etag") || undefined, head: batch.head, older: current.fetched ? current.older : batch.older, fetched: true }));
          if (fresh) latest.current.onIncoming(room);
          failures = 0;
        } catch (error) { if (!signal.aborted) { failures++; if (error instanceof ApiError && (error.status === 429 || error.status === 401)) latest.current.onError(error); } }
      },
    });
    const refresh = () => poller.refresh();
    document.addEventListener("visibilitychange", refresh);
    for (const event of ["focus", "blur", "online", "offline"]) window.addEventListener(event, refresh);
    return () => { poller.stop(); document.removeEventListener("visibilitychange", refresh); for (const event of ["focus", "blur", "online", "offline"]) window.removeEventListener(event, refresh); };
  }, [actorId, updateTimeline]);
  return Object.fromEntries(Object.entries(reads.actorId === actorId ? reads.rooms : {}).map(([repo, value]) => [repo, value.unread.length]));
}
