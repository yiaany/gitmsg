"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, Bot, Check, CircleHelp, Code2, Copy, Download, ExternalLink, GitCommitHorizontal, GitFork, GitPullRequest, Hash, Info, LoaderCircle, LockKeyhole, LogOut, Menu, MessageSquare, MoreHorizontal, Pencil, PencilRuler, Plus, Reply, Search, Settings2, ShieldCheck, Smile, Terminal, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Frame, FramePanel } from "./ui/frame";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { SiteHeader } from "./site-blocks";
import { InviteForm } from "./invite-form";
import { JoinChat } from "./join-chat";
import { AuthPanel } from "./auth-panel";
import { MediaComposer } from "./media-composer";
import { MediaMessage } from "./media-message";
import { RoomSecurity, type SecurityInfo } from "./room-security";
import { Whiteboard } from "./whiteboard";
import { Proposals } from "./proposals";
import { ChatQR } from "./chat-qr";
import { BotPanel } from "./bot-panel";
import { OtherClients } from "./other-clients";
import { api, ApiError, readLocal, shortSha, writeLocal } from "@/lib/client";
import { startAdaptivePolling } from "@/lib/polling";
import { decodeEvents, encryptEvent, generateKey, importKey, keyFingerprint, roomKey, storeRoomKey } from "@/lib/room-crypto";
import { loadMedia, uploadMedia } from "@/lib/media";
import { BOTS, BOT_REPLIES, DEMO_ROOMS, DEMO_USER, demoEvents, FORTUNES } from "@/lib/demo";
import { materialize, MAX_TEXT, mergeEvents, reconcileEvents, REACTIONS, validEvent, type Actor, type ChatEvent, type Message, type Reaction, type Room } from "@/lib/protocol";

type SessionInfo = { user: Actor | null; configured: boolean; mode: "app" | "oauth"; installUrl: string | null };
type SyncResult = { events: ChatEvent[]; head: string | null; older: string | null };
type Modal = "connect" | "join" | "new" | "invite" | "help" | "settings" | "inspect" | "delete" | "security" | "board" | "proposals" | "bot" | "clients" | "tools" | null;
type Timeline = { events: ChatEvent[]; etag?: string; head?: string | null; older?: string | null; fetched?: boolean };
const SOUND_KEY = "gitmsg:sound";

function Avatar({ actor, size = "normal" }: { actor: Actor; size?: "normal" | "small" }) {
  return <AvatarRoot className={`avatar ${size}`} aria-label={actor.login}><AvatarFallback>{actor.login.slice(0, 2).toUpperCase()}</AvatarFallback>{actor.avatar?.startsWith("https://avatars.githubusercontent.com/") && <AvatarImage src={actor.avatar} alt="" referrerPolicy="no-referrer" />}</AvatarRoot>;
}
function download(name: string, data: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ping() {
  try {
    const AudioCtx = window.AudioContext;
    const ctx = new AudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.frequency.setValueAtTime(740, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.start(); osc.stop(ctx.currentTime + 0.15); osc.onended = () => void ctx.close();
  } catch { /* Sound is optional. */ }
}
function time(value: string) { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function richText(text: string) {
  const chunks = text.split(/(`[^`\n]+`|https?:\/\/[^\s<>]+|\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, i) => chunk.startsWith("`") && chunk.endsWith("`") ? <code key={i}>{chunk.slice(1, -1)}</code> : chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : /^https?:\/\//.test(chunk) ? <a key={i} href={chunk} target="_blank" rel="noopener noreferrer">{chunk}</a> : chunk);
}

export function Messenger() {
  const [room, setRoom] = useState<Room>(DEMO_ROOMS[0]);
  const [rooms, setRooms] = useState<Room[]>(DEMO_ROOMS);
  const [timelines, setTimelines] = useState<Record<string, Timeline>>({});
  const timelinesRef = useRef(timelines); timelinesRef.current = timelines;
  const roomRef = useRef(room); roomRef.current = room;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [security, setSecurity] = useState<SecurityInfo>({ enabled: false, hasKey: false, loaded: false });
  const securityRef = useRef(security); securityRef.current = security;
  const [modal, setModal] = useState<Modal>(null);
  const [invitedRepo, setInvitedRepo] = useState("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [sound, setSound] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef<AbortController | null>(null);
  const failureStreak = useRef(0);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [toast, setToast] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [reactionPicker, setReactionPicker] = useState<string | null>(null);
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [typingRoom, setTypingRoom] = useState<string | null>(null);
  const botTyping = typingRoom === room.id;
  const [confetti, setConfetti] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<string[]>(["[demo] local simulation · no GitHub requests"]);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const retryEvent = useRef<ChatEvent | null>(null);
  const retryWire = useRef<{ id: string; room: string; event: ChatEvent } | null>(null);
  const actor = room.demo ? DEMO_USER : session?.user || DEMO_USER;
  const timeline = timelines[room.id] || { events: [] };
  const messages = useMemo(() => materialize(timeline.events), [timeline.events]);
  const filtered = useMemo(() => search ? messages.filter(m => `${m.text} ${m.actor.login}`.toLowerCase().includes(search.toLowerCase())) : messages, [messages, search]);
  const snapshots = useMemo(() => messages.filter(m => !m.deleted && !m.locked && m.attachments?.some(a => a.mime === "application/vnd.excalidraw+json")), [messages]);
  const canSend = security.loaded && (!security.enabled || security.hasKey) && (room.demo || !!session?.user);
  const notify = useCallback((value: string) => setToast(value), []);
  const log = useCallback((value: string) => setLogs(old => [...old.slice(-35), value]), []);
  const later = useCallback((fn: () => void, delay: number) => { const timer = setTimeout(fn, delay); timers.current.push(timer); }, []);
  const updateTimeline = useCallback((id: string, update: (old: Timeline) => Timeline) => {
    setTimelines(previous => {
      const next = update(previous[id] || { events: [] });
      return { ...previous, [id]: next };
    });
  }, []);
  const completeJoin = useCallback((joined: Room) => {
    setRooms(old => [...old.filter(r => r.id !== joined.id), joined]);
    setRoom(joined); setModal(null); setInvitedRepo("");
    sessionStorage.removeItem("gitmsg:invite");
    const url = new URL(location.href); url.searchParams.delete("repo");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const loaded: Record<string, Timeline> = {};
    const custom = readLocal<Room[]>("gitmsg:demo-rooms", []).filter(r => r.demo && typeof r.id === "string" && r.id.startsWith("demo/"));
    for (const r of [...DEMO_ROOMS, ...custom]) {
      const saved = readLocal<ChatEvent[] | null>(`gitmsg:demo:${r.id}`, null);
      loaded[r.id] = { events: Array.isArray(saved) ? saved.filter(validEvent) : demoEvents(r.id) };
    }
    setRooms([...DEMO_ROOMS, ...custom]); setTimelines(loaded);
    setSound(readLocal(SOUND_KEY, false));
    setHydrated(true);
    const params = new URLSearchParams(location.search);
    const fragmentKey = new URLSearchParams(location.hash.slice(1)).get("key");
    if (fragmentKey) {
      const recipient = params.get("repo");
      if (recipient && /^[A-Za-z0-9_-]{43}$/.test(fragmentKey)) sessionStorage.setItem("gitmsg:pending-key", JSON.stringify({ repo: recipient, key: fragmentKey }));
      history.replaceState({}, "", `${location.pathname}${location.search}`);
    }
    const invitation = params.get("repo") || sessionStorage.getItem("gitmsg:invite");
    if (invitation) { sessionStorage.setItem("gitmsg:invite", invitation); setInvitedRepo(invitation); }
    if (params.has("auth_error")) setError(params.get("auth_error") === "not-configured" ? "GitHub is not configured on this deployment yet. The demo is ready to use." : "GitHub authorization did not finish. Please try again.");
    if (params.has("connected") || params.has("auth_error")) {
      params.delete("connected"); params.delete("auth_error");
      history.replaceState({}, "", `/${params.size ? `?${params}` : ""}`);
    }
    let disposed = false;
    // The HttpOnly session is authoritative, not a device-local sign-in flag.
    api<SessionInfo>("/api/session").then(async info => {
        if (disposed) return;
        setSession(info);
        writeLocal("gitmsg:connected", Boolean(info.user));
        if (!info.user) { if (invitation) setModal("connect"); return; }
        const saved = readLocal<Room[]>(`gitmsg:rooms:${info.user.id}`, []);
        setRooms(old => [...old.filter(r => r.demo), ...saved.filter(r => !r.demo)]);
        if (invitation) {
          setModal("join");
        }
        else if (saved.length) setRoom(saved[0]);
        else {
          setSyncing(true);
          try {
            const inbox = await api<{ room: Room }>("/api/onboard", { method: "POST" });
            if (disposed) return;
            setRooms(old => [...old.filter(r => r.id !== inbox.room.id), inbox.room]);
            setRoom(inbox.room); setModal(null);
            notify("Your private inbox is ready.");
          } catch (e) { if (!disposed) { setError((e as Error).message); setModal("new"); } }
          finally { if (!disposed) setSyncing(false); }
        }
      }).catch(e => { if (!disposed) { setError(e.message); if (invitation) setModal("connect"); } });
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("gitmsg-demo-v1");
      channel.current.onmessage = e => {
        if (e.data?.room?.startsWith("demo/") && validEvent(e.data.event)) updateTimeline(e.data.room, old => ({ ...old, events: mergeEvents(old.events, [e.data.event]) }));
      };
    }
    return () => { disposed = true; channel.current?.close(); timers.current.forEach(clearTimeout); };
  }, [updateTimeline, notify]);

  const loadSecurity = useCallback(async () => {
    const active = roomRef.current;
    try {
      const policy = active.demo ? readLocal<{ enabled: boolean; keyId?: string }>(`gitmsg:security:${active.id}`, { enabled: false }) : await api<{ enabled: boolean; keyId?: string }>(`/api/security?${new URLSearchParams({ repo: active.id, branch: active.branch })}`);
      const pending = sessionStorage.getItem("gitmsg:pending-key");
      if (pending) {
        const candidate = JSON.parse(pending);
        if (candidate.repo.toLowerCase() === active.id.toLowerCase()) {
          const imported = await importKey(candidate.key);
          if (!policy.enabled || await keyFingerprint(imported) !== policy.keyId) {
            sessionStorage.removeItem("gitmsg:pending-key");
            setError("The secret invite key does not match this room. Import the correct key in Room security.");
          } else {
            await storeRoomKey(active.id, imported); sessionStorage.removeItem("gitmsg:pending-key"); notify("Room key imported on this device. Verify the fingerprint with your friend.");
          }
        }
      }
      const key = await roomKey(active.id).catch(() => null);
      const hasKey = !!key && (!policy.keyId || await keyFingerprint(key) === policy.keyId);
      if (roomRef.current.id !== active.id) return;
      setSecurity({ ...policy, hasKey, loaded: true });
      if (policy.enabled) { writeLocal(`gitmsg:draft:${active.id}`, ""); }
      updateTimeline(active.id, old => ({ ...old, etag: undefined }));
      const events = timelinesRef.current[active.id]?.events || [];
      const unlocked = await decodeEvents(active.id, active.branch, events);
      updateTimeline(active.id, old => ({ ...old, events: mergeEvents(old.events, unlocked), etag: undefined }));
    } catch (e) { if (roomRef.current.id === active.id) { setSecurity({ enabled: true, hasKey: false, loaded: false }); setError((e as Error).message); } }
  }, [notify, updateTimeline]);
  useEffect(() => {
    setSecurity({ enabled: false, hasKey: false, loaded: false });
    if (room.demo || session?.user) void loadSecurity();
  }, [room.id, room.branch, session?.user?.id, loadSecurity]);

  useEffect(() => {
    if (!hydrated) return;
    for (const [id, t] of Object.entries(timelines)) if (id.startsWith("demo/")) writeLocal(`gitmsg:demo:${id}`, t.events.slice(-600));
  }, [timelines, hydrated]);
  useEffect(() => { if (hydrated) writeLocal(SOUND_KEY, sound); }, [sound, hydrated]);
  useEffect(() => { if (session?.user) writeLocal(`gitmsg:rooms:${session.user.id}`, rooms.filter(r => !r.demo)); }, [rooms, session]);
  useEffect(() => { writeLocal("gitmsg:demo-rooms", rooms.filter(r => r.demo && !DEMO_ROOMS.some(d => d.id === r.id))); }, [rooms]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 4200); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (confetti) { const timer = setTimeout(() => setConfetti(false), 2600); return () => clearTimeout(timer); } }, [confetti]);
  useEffect(() => {
    const id = setInterval(() => setCooldown(Math.max(0, Math.ceil((cooldownRef.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const node = feed.current;
    if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 350) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, botTyping]);
  useEffect(() => {
    setText(readLocal<string>(`gitmsg:draft:${room.id}`, "")); setReplyTo(null); setEditing(null); setSearch(""); setError(""); setSyncError(""); retryEvent.current = null;
    later(() => bottom.current?.scrollIntoView({ block: "end" }), 80);
  }, [room.id, later]);
  useEffect(() => {
    let sequence = "";
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setModal(null); setSearchOpen(false); setReactionPicker(null); setEmojiPicker(false); setSidebar(false); }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setSearchOpen(v => !v); }
      if ((event.metaKey || event.ctrlKey) && event.key === "j") { event.preventDefault(); setTerminal(v => !v); }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      sequence = `${sequence} ${event.key}`.slice(-120);
      if (sequence.endsWith("ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a")) { setConfetti(true); notify("Achievement unlocked: Senior Vibe Engineer. ↑↑↓↓←→←→BA"); }
      if (event.key === "?") setModal("help");
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [notify]);

  const onError = useCallback((e: unknown, fromSync = false) => {
    const message = e instanceof Error ? e.message : "Something went wrong.";
    if (fromSync) setSyncError(message); else setError(message);
    if (e instanceof ApiError && e.status === 429) { cooldownRef.current = Date.now() + Math.max(60, e.retryAfter) * 1000; setCooldown(Math.max(60, e.retryAfter)); }
    if (e instanceof ApiError && e.status === 401) { setSession(old => old ? { ...old, user: null } : null); writeLocal("gitmsg:connected", false); }
  }, []);

  const sync = useCallback(async (historyPage = false, signal?: AbortSignal) => {
    const active = roomRef.current;
    if (active.demo || !session?.user || (syncInFlight.current && !syncInFlight.current.signal.aborted) || Date.now() < cooldownRef.current || document.hidden || !navigator.onLine || signal?.aborted) return;
    const controller = new AbortController();
    const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    const current = () => !requestSignal.aborted && roomRef.current.id === active.id && roomRef.current.branch === active.branch;
    syncInFlight.current = controller; setSyncing(true);
    const old = timelinesRef.current[active.id] || { events: [] };
    try {
      const query = new URLSearchParams({ repo: active.id, branch: active.branch });
      if (historyPage && old.older) query.set("cursor", old.older);
      const response = await fetch(`/api/chat?${query}`, { signal: requestSignal, cache: "no-store", headers: old.etag && !historyPage ? { "If-None-Match": old.etag } : {} });
      if (!current()) return;
      if (response.status === 304) { setLastSync(new Date().toISOString()); failureStreak.current = 0; setSyncError(""); return; }
      const data = await response.json();
      if (!current()) return;
      if (!response.ok) throw new ApiError(data.error, response.status, data.retryAfter);
      const result = data as SyncResult;
      let incoming = result.events;
      // Catch up in Git order after being offline, without losing intermediate events.
      if (!historyPage && old.head && result.head !== old.head && result.older && !incoming.some(e => e.sha === old.head)) {
        let cursor = result.older; let found = false;
        for (let page = 0; cursor && !found && page < 10; page++) {
          const more = await api<SyncResult>(`/api/chat?${new URLSearchParams({ repo: active.id, branch: active.branch, cursor })}`, { signal: requestSignal });
          if (!current()) return;
          incoming = [...more.events, ...incoming];
          found = more.events.some(e => e.sha === old.head);
          cursor = more.older || "";
          if (cursor && !found && page === 9) throw new ApiError("More than 1,000 commits happened while you were away. Reload this page to fetch the latest history, then load earlier commits.", 429, 300);
        }
      }
      incoming = await decodeEvents(active.id, active.branch, incoming);
      if (!current()) return;
      updateTimeline(active.id, current => {
        const events = historyPage ? mergeEvents(incoming, current.events) : reconcileEvents(current.events, incoming);
        return { events, etag: historyPage ? current.etag : response.headers.get("etag") || undefined, head: historyPage ? current.head : result.head, older: historyPage || !current.fetched ? result.older : current.older, fetched: true };
      });
      setLastSync(new Date().toISOString()); setSyncError(""); failureStreak.current = 0;
      log(`[fetch] ${historyPage ? "older history" : "origin/" + active.branch} · ${incoming.length} events`);
    } catch (e) { if (current()) { failureStreak.current++; onError(e, true); } }
    finally { if (syncInFlight.current === controller) { syncInFlight.current = null; setSyncing(false); } }
  }, [session, updateTimeline, onError, log]);

  useEffect(() => {
    if (room.demo || !session?.user) return;
    failureStreak.current = 0; setLastSync(null);
    let pageActive = true;
    const poller = startAdaptivePolling({
      run: signal => sync(false, signal),
      state: () => ({ hidden: document.hidden || !pageActive, focused: document.hasFocus(), online: navigator.onLine, failures: failureStreak.current, retryAt: cooldownRef.current }),
    });
    const refresh = () => {
      if (document.hidden || !navigator.onLine || !pageActive) syncInFlight.current?.abort();
      poller.refresh();
    };
    const hide = () => { pageActive = false; refresh(); };
    const show = () => { pageActive = true; refresh(); };
    document.addEventListener("visibilitychange", refresh);
    for (const event of ["focus", "blur", "online", "offline"]) window.addEventListener(event, refresh);
    window.addEventListener("pagehide", hide); window.addEventListener("pageshow", show);
    return () => {
      poller.stop(); syncInFlight.current?.abort();
      document.removeEventListener("visibilitychange", refresh);
      for (const event of ["focus", "blur", "online", "offline"]) window.removeEventListener(event, refresh);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", show);
    };
  }, [room.id, room.branch, room.demo, session, sync]);

  const appendDemo = useCallback((id: string, event: ChatEvent) => {
    updateTimeline(id, old => ({ ...old, events: mergeEvents(old.events, [event]) }));
    channel.current?.postMessage({ room: id, event });
  }, [updateTimeline]);

  async function submitEvent(event: ChatEvent, active = roomRef.current, policy = securityRef.current) {
    if (active.demo) { const saved = { ...event, sha: shortSha() }; appendDemo(active.id, saved); log(`[demo] ${event.kind} ${saved.sha} · local only`); return saved; }
    if (!policy.loaded) throw new Error("Wait for the room security check before sending.");
    let wire = event;
    if (policy.enabled) {
      const key = await roomKey(active.id); if (!key || !policy.hasKey) throw new Error("Import the correct room key before sending.");
      wire = retryWire.current?.id === event.id && retryWire.current.room === active.id ? retryWire.current.event : await encryptEvent(key, active.id, active.branch, event);
      retryWire.current = { id: event.id, room: active.id, event: wire };
    }
    const result = await api<{ event: ChatEvent }>("/api/chat", { method: "POST", body: JSON.stringify({ repo: active.id, branch: active.branch, event: wire }) });
    const confirmed = { ...event, sha: result.event.sha, url: result.event.url, encrypted: policy.enabled };
    updateTimeline(active.id, old => ({ ...old, events: mergeEvents(old.events, [confirmed]) }));
    log(`[commit] ${result.event.sha?.slice(0, 7) || "already committed"} → origin/${active.branch}`);
    return confirmed;
  }
  function makeEvent(kind: ChatEvent["kind"], data: Partial<ChatEvent>): ChatEvent {
    return { v: 1, id: crypto.randomUUID(), kind, actor, createdAt: new Date().toISOString(), ...data };
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || sendingRef.current || cooldown || !canSend || text.length > MAX_TEXT) return;
    if (text.startsWith("/") && !editing) {
      const command = text.trim().toLowerCase();
      if (["/help", "/clear", "/ship", "/fortune", "/sudo", "/panic"].includes(command)) writeLocal(`gitmsg:draft:${room.id}`, "");
      if (command === "/help") { setModal("help"); setText(""); return; }
      if (command === "/clear") { notify("Nice try. Git has receipts. Use Settings to reset the demo."); setText(""); return; }
      if (command === "/ship") { setConfetti(true); notify("🚀 Celebration shipped. No deployment requested — use Actions participant for that."); setText(""); return; }
      if (command === "/fortune") { notify(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]); setText(""); return; }
      if (command === "/sudo") { notify("You are not in the emotional sudoers file. This incident will be reported."); setText(""); return; }
      if (command === "/panic") { setTerminal(true); log("$ git blame --everyone-but-me"); notify("Incident report generated: it worked on my machine."); setText(""); return; }
      if (command === "/shrug") setText("¯\\_(ツ)_/¯");
    }
    const content = text.trim() === "/shrug" ? "¯\\_(ツ)_/¯" : text.trim();
    const pending = retryEvent.current && retryEvent.current.text === content && retryEvent.current.target === editing?.id ? retryEvent.current : makeEvent(editing ? "edit" : "message", { text: content, ...(editing ? { target: editing.id } : {}), ...(replyTo ? { replyTo: replyTo.id } : {}) });
    retryEvent.current = pending;
    sendingRef.current = true; setSending(true); setError("");
    const active = room;
    const submittedText = text;
    try {
      await submitEvent(pending); retryEvent.current = null;
      setText(current => { if (current === submittedText || (submittedText.trim() === "/shrug" && current === "¯\\_(ツ)_/¯")) { writeLocal(`gitmsg:draft:${active.id}`, ""); return ""; } return current; });
      setReplyTo(null); setEditing(null);
      if (sound) ping();
      later(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
      if (active.demo && pending.kind === "message") {
        setTypingRoom(active.id);
        later(() => {
          const bot = BOTS[Math.floor(Math.random() * 2)];
          const response: ChatEvent = { v: 1, id: crypto.randomUUID(), kind: "message", actor: bot, createdAt: new Date().toISOString(), text: /hello|\bhi\b|\bhey\b/i.test(content) ? "Hey! Good to see you." : BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)], sha: shortSha() };
          appendDemo(active.id, response); setTypingRoom(current => current === active.id ? null : current); if (sound) ping();
        }, 1200 + Math.random() * 1000);
      }
    } catch (e) { onError(e); }
    finally { sendingRef.current = false; setSending(false); }
  }
  async function sendMedia(file: Blob, name: string, duration?: number) {
    if (!canSend || sendingRef.current || cooldown) throw new Error("Wait for the current commit or unlock this room first.");
    sendingRef.current = true; setSending(true); setError("");
    const active = roomRef.current;
    const policy = securityRef.current;
    try {
      const attachment = await uploadMedia(active, file, name, policy.enabled, duration);
      await submitEvent(makeEvent("message", { text: file.type === "application/vnd.excalidraw+json" ? "Whiteboard snapshot" : "", attachments: [attachment] }), active, policy);
      notify(file.type === "application/vnd.excalidraw+json" ? "Board snapshot committed." : "Attachment committed.");
    } finally { sendingRef.current = false; setSending(false); }
  }
  async function propose() {
    if (!text.trim() || !canSend || sendingRef.current || room.demo || cooldown) return;
    sendingRef.current = true; setSending(true); setError("");
    try {
      let event = makeEvent("message", { text: text.trim() });
      if (security.enabled) { const key = await roomKey(room.id); if (!key) throw new Error("Room key required."); event = await encryptEvent(key, room.id, room.branch, event); }
      const result = await api<{ number: number }>("/api/proposals", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, event }) });
      setText(""); writeLocal(`gitmsg:draft:${room.id}`, ""); notify(`Pull request #${result.number} created. Awaiting merge.`); setModal("proposals");
    } catch (e) { onError(e); } finally { sendingRef.current = false; setSending(false); }
  }
  async function openSaved() {
    if (!session?.user) { await openConnect(); return; }
    try { const result = await api<{ room: Room }>("/api/saved", { method: "POST" }); setRooms(old => [...old.filter(r => r.id !== result.room.id), result.room]); selectRoom(result.room); setModal(null); }
    catch (e) { onError(e); }
  }
  async function saveToGit(message: Message) {
    if (message.locked || sendingRef.current || !security.loaded) return;
    if (room.demo || !session?.user) { notify("Sign in and use a live chat to save messages to GitHub."); return; }
    sendingRef.current = true; setSending(true);
    const source = room;
    try {
      const { room: destination } = await api<{ room: Room }>("/api/saved", { method: "POST" });
      let policy = await api<{ enabled: boolean; keyId?: string }>(`/api/security?${new URLSearchParams({ repo: destination.id, branch: destination.branch })}`);
      if ((security.enabled || message.encrypted) && !policy.enabled) {
        const key = await roomKey(destination.id) || await generateKey(); await storeRoomKey(destination.id, key);
        policy = await api("/api/security", { method: "POST", body: JSON.stringify({ repo: destination.id, branch: destination.branch, keyId: await keyFingerprint(key) }) });
      }
      const attachments = [];
      for (const attachment of message.attachments || []) { const blob = await loadMedia(source, attachment); attachments.push(await uploadMedia(destination, blob, attachment.name, policy.enabled, attachment.duration)); }
      let event: ChatEvent = { v: 1, id: crypto.randomUUID(), kind: "message", actor: session.user, createdAt: new Date().toISOString(), text: message.text, ...(attachments.length ? { attachments } : {}), savedFrom: { repo: source.id, id: message.id, ...(message.sha ? { sha: message.sha } : {}) } };
      if (policy.enabled) { const key = await roomKey(destination.id); if (!key || await keyFingerprint(key) !== policy.keyId) throw new Error("Import your Saved Messages room key first."); event = await encryptEvent(key, destination.id, destination.branch, event); }
      await api("/api/chat", { method: "POST", body: JSON.stringify({ repo: destination.id, branch: destination.branch, event }) });
      setRooms(old => [...old.filter(r => r.id !== destination.id), destination]); notify(policy.enabled ? "Saved encrypted. Back up the separate Saved Messages key in its security panel." : "Saved to your private gitmsg-saved repository.");
    } catch (e) { onError(e); } finally { sendingRef.current = false; setSending(false); }
  }
  async function react(message: Message, emoji: Reaction) {
    if (sendingRef.current || cooldown) return;
    setReactionPicker(null); sendingRef.current = true;
    try { await submitEvent(makeEvent("reaction", { target: message.id, emoji, active: !message.reactions[emoji]?.some(a => a.id === actor.id) })); }
    catch (e) { onError(e); } finally { sendingRef.current = false; }
  }
  async function removeMessage() {
    if (!selected || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    try { await submitEvent(makeEvent("delete", { target: selected.id })); setModal(null); notify("Hidden from the conversation. Still part of Git history."); }
    catch (e) { onError(e); } finally { sendingRef.current = false; setSending(false); }
  }
  function selectRoom(next: Room) {
    if (sendingRef.current) { notify("Wait for this commit to finish first."); return; }
    if (security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, text); setRoom(next); setSidebar(false);
  }
  async function openConnect() {
    setModal("connect");
    try { const info = await api<SessionInfo>("/api/session"); setSession(info); }
    catch (e) { onError(e); }
  }
  async function copy(value: string, message = "Copied.") {
    try { await navigator.clipboard.writeText(value); notify(message); } catch { notify("Clipboard unavailable. Select and copy the text instead."); }
  }
  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); setSession(null); setRooms(old => old.filter(r => r.demo)); setTimelines(old => Object.fromEntries(Object.entries(old).filter(([id]) => id.startsWith("demo/")))); setRoom(DEMO_ROOMS[0]); writeLocal("gitmsg:connected", false); setModal(null); notify("Disconnected. Your repositories are still yours."); }
    catch (e) { onError(e); }
  }
  const repoUrl = `https://github.com/${room.id}`;
  const currentReply = replyTo || editing;

  return <div className="app">
    <SiteHeader user={session?.user} onConnect={() => void openConnect()} onSettings={() => setModal("settings")} onSecret={() => notify("git blame: you. git praise: also you.")} />
    {confetti && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <span key={i} style={{ left: `${(i * 17.3) % 100}%`, animationDelay: `${(i % 7) * 0.08}s`, background: ["#fff", "#aaa", "#666"][i % 3] }} />)}</div>}
    <main className="main"><Frame className="workspace-frame"><FramePanel className="chat-workspace">
    {sidebar && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="sidebar-top"><span>Chats</span><Button variant="ghost" size="icon-sm" title="New chat" aria-label="New chat" onClick={() => setModal("new")}><Plus /></Button><Button variant="ghost" size="icon-sm" className="close-navigation" aria-label="Close navigation" onClick={() => setSidebar(false)}><X /></Button></div>
      <Button variant="outline" className="sidebar-search" onClick={() => { setSearchOpen(true); setSidebar(false); }}><Search />Search<kbd>⌘ K</kbd></Button>
      <Button variant="ghost" className="saved-room-link" onClick={() => void openSaved()}><Bookmark />Saved Messages</Button>
      <nav className="rooms" aria-label="Chats">{rooms.map(r => <Button key={r.id} variant={room.id === r.id ? "secondary" : "ghost"} onClick={() => selectRoom(r)} aria-current={room.id === r.id ? "page" : undefined} className="room"><Hash /><span>{r.name}</span>{!r.demo && <LockKeyhole />}</Button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom"><Button variant="ghost" size="icon-sm" aria-label="Help" title="Help" onClick={() => setModal("help")}><CircleHelp /></Button><Button variant="ghost" size="icon-sm" aria-label="Settings" title="Settings" onClick={() => setModal("settings")}><Settings2 /></Button></div>
    </aside>

    <section className="workspace-content">
      <header className="channel-header"><div className="channel-title"><Button variant="ghost" size="icon-sm" className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu /></Button><Hash size={18} /><h1>{room.name}</h1>{room.demo ? <span className="room-kind" title="Local demo with simulated replies. No GitHub commits.">Demo</span> : <span className="room-kind"><LockKeyhole size={12} />{security.enabled ? "Secure" : room.private ? "Private" : "Public"}</span>}</div><div className="channel-actions"><Button variant="ghost" size="icon-sm" aria-label="Room security" title="Room security" onClick={() => setModal("security")}><ShieldCheck /></Button><Button variant="ghost" size="icon-sm" aria-label="Chat tools" title="Chat tools" onClick={() => setModal("tools")}><MoreHorizontal /></Button><Button variant="outline" size="sm" onClick={() => setModal("invite")}><Plus />Invite</Button></div></header>

      <div className="conversation-layout"><section className="chat-panel" aria-label="Chat">
        {searchOpen && <div className="search-bar"><Search size={17} /><Input autoFocus placeholder="Search messages…" aria-label="Search conversation" value={search} onChange={e => setSearch(e.target.value)} /><span>{search ? `${filtered.length} results` : "⌘ K"}</span><Button variant="ghost" size="icon-xs" aria-label="Close search" onClick={() => { setSearchOpen(false); setSearch(""); }}><X /></Button></div>}
        <div className="message-feed" ref={feed}>
          <div className="date-divider">{room.demo ? "Today" : "Messages"}</div>
          {timeline.older && !search && <Button variant="ghost" size="sm" className="load-history" loading={syncing} onClick={() => void sync(true)}>Load earlier messages</Button>}
          {!room.demo && syncing && !messages.length && <div className="empty-state"><LoaderCircle className="spin" size={20} />Loading messages…</div>}
          {!syncing && !messages.length && <div className="empty-state"><MessageSquare size={24} />No messages yet</div>}
          {search && !filtered.length && <div className="empty-state"><Search size={25} />No messages found</div>}
          <div className="messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text">{filtered.map((message, index) => {
            const previous = filtered[index - 1]; const grouped = previous?.actor.id === message.actor.id && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 300000;
            const mine = message.actor.id === actor.id;
            const replied = message.replyTo ? messages.find(m => m.id === message.replyTo) : null;
            return <article className={`message ${grouped ? "grouped" : ""} ${mine ? "mine" : ""} ${message.deleted ? "deleted" : ""}`} key={message.id} id={`message-${message.id}`}>
              <div className="message-avatar">{!grouped && <Avatar actor={message.actor} />}</div>
              <div className="message-content">
                {!grouped && <div className="message-meta"><b>{message.actor.login}</b>{message.actor.login === "dependabot" && <span className="bot-label">Bot</span>}<time dateTime={message.createdAt}>{time(message.createdAt)}</time></div>}
                {replied && <Button variant="ghost" size="xs" className="reply-preview" onClick={() => document.getElementById(`message-${replied.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Reply /><b>{replied.actor.login}</b><span>{replied.text.slice(0, 100)}</span></Button>}
                <div className="message-text">{richText(message.text)}{message.edited && <span className="edited-label">edited</span>}</div>
                {message.locked && <Button size="xs" variant="outline" onClick={() => setModal("security")}><LockKeyhole />Import room key</Button>}
                {message.attachments?.map(attachment => <MediaMessage key={attachment.id} room={room} attachment={attachment} onBoard={() => setModal("board")} />)}
                {message.savedFrom && <span className="saved-source"><Bookmark size={11} />Saved from {message.savedFrom.repo}</span>}
                {message.bot?.command === "roll" && Number.isInteger(message.bot.value) && message.bot.value! >= 1 && message.bot.value! <= 6 && <div className="dice-result" role="img" aria-label={`Die result: ${message.bot.value}`}>{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][message.bot.value! - 1]}</div>}
                {Object.entries(message.reactions).some(([, users]) => users.length) && <div className="reactions">{Object.entries(message.reactions).filter(([, users]) => users.length).map(([emoji, users]) => <Button key={emoji} variant={users.some(u => u.id === actor.id) ? "secondary" : "outline"} size="xs" aria-pressed={users.some(u => u.id === actor.id)} title={users.map(u => u.login).join(", ")} onClick={() => void react(message, emoji as Reaction)}>{emoji}<span>{users.length}</span></Button>)}</div>}
              </div>
              {!message.deleted && <div className="message-tools">
                <Button variant="ghost" size="icon-xs" aria-label={`React to message from ${message.actor.login}`} title="React" onClick={() => setReactionPicker(reactionPicker === message.id ? null : message.id)}><Smile /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Reply to message" title="Reply" onClick={() => { setReplyTo(message); setEditing(null); composer.current?.focus(); }}><Reply /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Copy message" title="Copy" onClick={() => void copy(message.text)}><Copy /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Save to Git" title="Save to Git" disabled={message.locked || sending || !security.loaded} onClick={() => void saveToGit(message)}><Bookmark /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Inspect commit" title="Inspect commit" onClick={() => { setSelected(message); setModal("inspect"); }}><GitCommitHorizontal /></Button>
                {mine && !message.locked && <><Button variant="ghost" size="icon-xs" aria-label="Edit message" title="Edit" disabled={!message.text.trim()} onClick={() => { setEditing(message); setReplyTo(null); setText(message.text); composer.current?.focus(); }}><Pencil /></Button><Button variant="ghost" size="icon-xs" aria-label="Delete message" title="Delete" onClick={() => { setSelected(message); setModal("delete"); }}><Trash2 /></Button></>}
              </div>}
              {reactionPicker === message.id && <div className="reaction-picker">{REACTIONS.map(emoji => <Button variant="ghost" size="icon-sm" key={emoji} onClick={() => void react(message, emoji)} aria-label={`React ${emoji}`}>{emoji}</Button>)}<Button variant="ghost" size="icon-sm" aria-label="Close reactions" onClick={() => setReactionPicker(null)}><X /></Button></div>}
            </article>;
          })}</div>
          {botTyping && room.demo && <div className="typing">Typing…</div>}
          <div ref={bottom} className="scroll-anchor" />
        </div>
        <div className="composer-area">
          {(error || syncError) && <div className="error-banner" role="alert"><Info size={16} /><span>{error || syncError}{cooldown > 0 && ` (${cooldown}s)`}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={() => { setError(""); setSyncError(""); }}><X /></Button></div>}
          {security.enabled && !security.hasKey && <Button className="unlock-room" variant="outline" onClick={() => setModal("security")}><LockKeyhole />Import the room key to send and read encrypted messages</Button>}
          {currentReply && <div className="composing-context">{editing ? <Pencil size={13} /> : <Reply size={13} />}<span>{editing ? "Editing your message" : `Replying to ${replyTo!.actor.login}`}<small>{currentReply.text.slice(0, 80)}</small></span><Button variant="ghost" size="icon-xs" aria-label="Cancel reply or edit" onClick={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }}><X /></Button></div>}
          <form className="composer" onSubmit={send}>
            <Textarea ref={composer} aria-label="Message" placeholder={security.enabled && !security.hasKey ? "Import the room key to unlock…" : editing ? "Edit message…" : `Message #${room.name}`} rows={2} maxLength={MAX_TEXT} value={text} onChange={e => { setText(e.target.value); if (security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, e.target.value); }} onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } if (e.key === "ArrowUp" && !text) { const last = [...messages].reverse().find(m => m.actor.id === actor.id && !m.deleted && !m.locked && m.text.trim()); if (last) { setEditing(last); setText(last.text); } } }} />
            <div className="composer-toolbar"><div><MediaComposer key={room.id} disabled={!canSend || sending || cooldown > 0} onSend={sendMedia} onError={onError} /><Button variant="ghost" size="icon-sm" title="Whiteboard" aria-label="Open whiteboard" onClick={() => setModal("board")}><PencilRuler /></Button><Button variant="ghost" size="icon-sm" title="Add emoji" aria-label="Add emoji" onClick={() => setEmojiPicker(v => !v)}><Smile /></Button></div><div>{text.length > 3500 && <span className="character-count">{text.length}/{MAX_TEXT}</span>}{!editing && !room.demo && <Button size="icon-sm" variant="ghost" title="Propose as a real pull request" aria-label="Propose message as pull request" disabled={!text.trim() || !canSend || sending || cooldown > 0} onClick={() => void propose()}><GitPullRequest /></Button>}<Button size="sm" type="submit" loading={sending} disabled={!text.trim() || cooldown > 0 || !canSend} aria-label={editing ? "Save edit" : "Send message"}>{editing ? "Save" : "Send"}<ArrowUpRight /></Button></div></div>
            {emojiPicker && <div className="composer-emoji">{[...REACTIONS, "👋", "🤝", "🫡", "✨", "☕"].map(emoji => <Button variant="ghost" size="icon-sm" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => { setText(t => t + emoji); setEmojiPicker(false); composer.current?.focus(); }}>{emoji}</Button>)}</div>}
          </form>
          <div className="composer-footer">{room.demo ? "Local demo · simulated replies" : security.enabled ? "Browser-encrypted · keys stay on your devices" : "Stored on GitHub · standard mode is not encrypted"}<span>Shift ↵ for a new line</span></div>
        </div>
        {terminal && <div className="terminal-panel"><div><span>Activity log</span><Button variant="ghost" size="icon-xs" aria-label="Close log" onClick={() => setTerminal(false)}><X /></Button></div><pre>{logs.join("\n")}</pre></div>}
      </section>

      </div>
      {!room.demo && <div className="sync-status" role="status">{cooldown ? `Retry in ${cooldown}s` : syncing ? "Syncing…" : lastSync ? `Synced ${time(lastSync)}` : "Connecting…"}</div>}
      </section>
    </FramePanel></Frame></main>

    {toast && <div className="toast" role="status"><Check size={14} /><span>{toast}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={() => setToast("")}><X /></Button></div>}
    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}><DialogContent className={`modal ${modal === "board" ? "board-modal" : modal === "help" ? "wide" : ""}`} aria-describedby="dialog-description"><DialogTitle className="sr-only">{modal === "connect" ? "Sign in with GitHub" : modal === "join" ? "Join chat" : modal === "new" ? "New conversation" : modal === "invite" ? "Invite a collaborator" : modal === "help" ? "README and keyboard shortcuts" : modal === "inspect" ? "Inspect commit" : modal === "delete" ? "Hide message" : modal === "board" ? "Whiteboard" : modal === "security" ? "Room security" : modal === "proposals" ? "Message proposals" : modal === "bot" ? "GitHub Actions participant" : modal === "clients" ? "Other chat clients" : modal === "tools" ? "Chat tools" : "Preferences"}</DialogTitle><DialogDescription id="dialog-description" className="sr-only">{modal === "connect" ? "Authorize GitHub to create and access your chat repositories." : "Manage your gitmsg conversation."}</DialogDescription>
      {modal === "tools" && <><h2>Chat tools</h2><div className="tool-list"><Button variant="ghost" onClick={() => setModal("board")}><PencilRuler /><span>Whiteboard<small>Excalidraw snapshots, real Git history</small></span></Button><Button variant="ghost" onClick={() => setModal("security")}><ShieldCheck /><span>Secure conversation<small>Browser encryption and secret key QR</small></span></Button><Button variant="ghost" onClick={() => setModal("proposals")}><GitPullRequest /><span>Message proposals<small>Review and merge real pull requests</small></span></Button><Button variant="ghost" onClick={() => setModal("bot")}><Bot /><span>Actions participant<small>Dice, standup, configured deploys</small></span></Button><Button variant="ghost" onClick={() => setModal("clients")}><Terminal /><span>Terminal / GitHub<small>Same protocol, same conversation</small></span></Button><Button variant="ghost" onClick={() => void openSaved()}><Bookmark /><span>Saved Messages<small>Your own private Git repository</small></span></Button></div>{!room.demo && <Button variant="link" render={<a href={repoUrl} target="_blank" rel="noreferrer" />}><Github />Open repository</Button>}</>}
      {modal === "security" && <RoomSecurity key={room.id} room={room} security={security} onChange={loadSecurity} />}
      {modal === "board" && <Whiteboard key={room.id} room={room} snapshots={snapshots} disabled={!canSend || sending} onCommit={blob => sendMedia(blob, `board-${new Date().toISOString().slice(0, 10)}.excalidraw`)} />}
      {modal === "proposals" && <Proposals room={room} onMerged={() => { void sync(); notify("Pull request merged. Fetching the new message…"); }} />}
      {modal === "bot" && <BotPanel room={room} secure={security.enabled} />}
      {modal === "clients" && <OtherClients room={room} actor={actor} secure={security.enabled} />}
      {modal === "connect" && <AuthPanel session={session} onContinue={() => setModal(invitedRepo ? "join" : "new")} onClose={() => setModal(null)} />}
      {modal === "join" && session?.user && <JoinChat repo={invitedRepo} login={session.user.login} onDone={completeJoin} />}
      {modal === "new" && <NewRoom session={session} onConnect={() => void openConnect()} onDone={newRoom => { if (newRoom.demo) { setRooms(old => [...old, newRoom]); updateTimeline(newRoom.id, () => ({ events: [] })); selectRoom(newRoom); setModal(null); } else completeJoin(newRoom); notify(newRoom.demo ? "Local chat created." : "Repository connected."); }} />}
      {modal === "invite" && <><h2>Invite to chat</h2><p>{room.demo ? "Sign in to create a shared chat. Demo rooms are local to this browser." : "1. Invite your friend's GitHub username below. 2. Share the room link. They can accept the invitation when they open it. A link alone does not grant access."}</p>{!room.demo ? <><InviteForm repo={room.id} /><ChatQR repo={room.id} />{security.enabled && <Button variant="outline" onClick={() => setModal("security")}><ShieldCheck />Share secret key separately</Button>}<Button variant="link" render={<a href={`${repoUrl}/settings/access`} target="_blank" rel="noreferrer" />}>Manage collaborators on GitHub</Button></> : <Button onClick={() => void openConnect()}><Github />Sign in with GitHub</Button>}</>}
      {modal === "inspect" && selected && <><h2>Receipts</h2><div className="commit-detail"><div><span>SHA</span><code>{selected.sha || "Sync to retrieve SHA"}</code></div><div><span>Author</span><b>@{selected.actor.login}</b></div><div><span>Date</span><span>{new Date(selected.createdAt).toLocaleString("en-US")}</span></div><div><span>Branch</span><code>{room.branch}</code></div></div><h3>Loaded version history</h3>{timeline.events.filter(e => e.id === selected.id || e.target === selected.id).filter(e => e.kind !== "reaction").map(e => <div key={e.id} className="receipt"><small>{e.kind} · {new Date(e.createdAt).toLocaleString()} · {e.sha?.slice(0, 7)}</small><p>{e.text || (e.kind === "delete" ? "Hidden from conversation; old content remains in Git." : "Attachment")}</p></div>)}{room.demo ? <p className="fine-print">Simulated commit. No data was sent to GitHub.</p> : selected.url && <Button render={<a href={selected.url} target="_blank" rel="noreferrer" />}>View on GitHub<ExternalLink /></Button>}<Button variant="outline" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Copy />Copy decrypted JSON</Button></>}
      {modal === "delete" && <><h2>Hide message?</h2><p>The message will be hidden in this chat. Its original text remains in Git history and downloaded copies. This is not secure erasure.</p><Button disabled={sending} loading={sending} onClick={() => void removeMessage()}><Trash2 />Hide message</Button><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button></>}
      {modal === "settings" && <><h2>Settings</h2><div className="settings-list">
        <Button variant="ghost" aria-pressed={sound} onClick={() => setSound(v => !v)}>{sound ? <Volume2 /> : <VolumeX />}Message sound<span className="setting-value">{sound ? "On" : "Off"}</span></Button>
        <Button variant="ghost" onClick={() => { download(`${room.name}-history.json`, JSON.stringify({ app: "gitmsg", demo: Boolean(room.demo), repository: room.id, exportedAt: new Date().toISOString(), events: timeline.events }, null, 2)); notify("Loaded history exported. Unloaded history is not included."); }}><Download />Export loaded history</Button>
        {!room.demo && <Button variant="ghost" onClick={() => void copy(`git clone ${repoUrl}.git`, "Clone command copied.")}><Copy />Copy clone command</Button>}
        {room.demo && <Button variant="ghost" onClick={() => { updateTimeline(room.id, () => ({ events: demoEvents(room.id) })); setModal(null); notify("Demo reset."); }}><GitFork />Reset demo</Button>}
        {session?.user && <Button variant="ghost" onClick={() => void logout()}><LogOut />Sign out</Button>}
      </div></>}
      {modal === "help" && <><h2>Help</h2><p>Each live chat is a GitHub repository. Messages, attachments, drawings and reactions are commits. Use the microphone to record, the image button to send a picture, and Chat tools for everything else.</p><dl className="shortcuts"><dt>Enter</dt><dd>Send message</dd><dt>Shift ↵</dt><dd>New line</dd><dt>⌘ / Ctrl K</dt><dd>Search messages</dd><dt>↑ in empty input</dt><dd>Edit last message</dd><dt>Esc</dt><dd>Close dialog</dd></dl><p className="fine-print">Secure mode encrypts future content in your browser. Standard mode is readable by GitHub. Old plaintext, metadata and Git history remain. Keys need backups; this is not audited high-assurance messaging. Only invite trusted collaborators. Free hosting and Actions have usage limits.</p></>}
    </DialogContent></Dialog>
  </div>;
}

function NewRoom({ session, onConnect, onDone }: { session: SessionInfo | null; onConnect: () => void; onDone: (room: Room) => void }) {
  const [tab, setTab] = useState<"demo" | "connect" | "create">(session?.user ? "create" : "demo");
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [found, setFound] = useState<Room[]>([]);
  const [joining, setJoining] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError("");
    try {
      if (tab === "demo") { const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); if (slug.length < 2) throw new Error("Use at least two letters or numbers."); onDone({ id: `demo/${slug}-${crypto.randomUUID().slice(0, 6)}`, name: slug, description: "Local demo", branch: "main", demo: true }); }
      else if (tab === "connect") { const repo = name.trim().replace(/^https:\/\/github.com\//, "").replace(/\/$/, ""); sessionStorage.setItem("gitmsg:invite", repo); setJoining(repo); }
      else { const result = await api<{ room: Room }>("/api/repos", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); onDone(result.room); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open conversation."); } finally { setBusy(false); }
  }
  async function discover() { setBusy(true); try { const result = await api<{ rooms: Room[] }>("/api/repos"); setFound(result.rooms); if (!result.rooms.length) setError("No gitmsg- repositories found in the 100 most recently pushed repositories. Enter any writable repo above."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (joining && session?.user) return <><JoinChat repo={joining} login={session.user.login} onDone={onDone} /><Button variant="ghost" onClick={() => setJoining("")}>Back</Button></>;
  return <><h2>New chat</h2><div className="room-options" role="group" aria-label="Chat type">{(["demo", "create", "connect"] as const).map(t => <Button key={t} size="sm" variant={tab === t ? "secondary" : "ghost"} aria-pressed={tab === t} onClick={() => { setTab(t); setName(""); setError(""); setFound([]); }}>{t === "demo" ? "Demo" : t === "connect" ? "Connect repo" : "Private chat"}</Button>)}</div>
    {tab !== "demo" && !session?.user ? <><p>Sign in with GitHub to open a shared chat.</p><Button onClick={onConnect}><Github />Sign in with GitHub</Button></> : <form className="new-room-form" onSubmit={submit}>
      <label className="field-label" htmlFor="room-name">{tab === "connect" ? "Repository" : "Chat name"}</label>
      <Input id="room-name" placeholder={tab === "connect" ? "octocat/gitmsg-friends" : "friends"} value={name} onChange={e => setName(e.target.value)} maxLength={tab === "connect" ? 200 : 40} autoComplete="off" required />
      <p className="fine-print">{tab === "demo" ? "Local to this browser. No GitHub repository is created." : tab === "connect" ? "Requires write access to a dedicated chat repository." : "Creates a private gitmsg- repository in your account."}</p>
      {session?.installUrl && tab !== "demo" && <Button variant="link" render={<a href={session.installUrl} target="_blank" rel="noreferrer" />}>Install GitHub App<ExternalLink /></Button>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button type="submit" loading={busy} disabled={!name.trim()}>{tab === "connect" ? "Open chat" : "Create chat"}<ArrowRight /></Button>
      {tab === "connect" && <Button variant="ghost" onClick={() => void discover()} disabled={busy}>Find my repositories</Button>}
      {found.length > 0 && <div className="found-repos">{found.map(r => <Button variant="ghost" key={r.id} onClick={() => onDone(r)}><BookOpen />{r.id}<ArrowRight /></Button>)}</div>}
    </form>}
  </>;
}
