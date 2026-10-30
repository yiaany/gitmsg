"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Check, CircleHelp, Code2, Copy, Download, ExternalLink, GitCommitHorizontal, GitFork, Hash, Info, LoaderCircle, LockKeyhole, LogOut, Menu, MessageSquare, Pencil, Plus, Reply, Search, Settings2, Smile, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Frame, FramePanel } from "./ui/frame";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { SiteHeader } from "./site-blocks";
import { InviteForm } from "./invite-form";
import { AuthPanel } from "./auth-panel";
import { api, ApiError, readLocal, shortSha, writeLocal } from "@/lib/client";
import { BOTS, BOT_REPLIES, DEMO_ROOMS, DEMO_USER, demoEvents, FORTUNES } from "@/lib/demo";
import { materialize, MAX_TEXT, mergeEvents, reconcileEvents, REACTIONS, validEvent, type Actor, type ChatEvent, type Message, type Reaction, type Room } from "@/lib/protocol";

type SessionInfo = { user: Actor | null; configured: boolean; mode: "app" | "oauth"; installUrl: string | null };
type SyncResult = { events: ChatEvent[]; head: string | null; older: string | null };
type Modal = "connect" | "new" | "invite" | "help" | "settings" | "inspect" | "delete" | null;
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
  const [modal, setModal] = useState<Modal>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [sound, setSound] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const failureStreak = useRef(0);
  const [error, setError] = useState("");
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
  const idleSince = useRef(Date.now());
  const actor = room.demo ? DEMO_USER : session?.user || DEMO_USER;
  const timeline = timelines[room.id] || { events: [] };
  const messages = useMemo(() => materialize(timeline.events), [timeline.events]);
  const filtered = useMemo(() => search ? messages.filter(m => `${m.text} ${m.actor.login}`.toLowerCase().includes(search.toLowerCase())) : messages, [messages, search]);
  const notify = useCallback((value: string) => setToast(value), []);
  const log = useCallback((value: string) => setLogs(old => [...old.slice(-35), value]), []);
  const later = useCallback((fn: () => void, delay: number) => { const timer = setTimeout(fn, delay); timers.current.push(timer); }, []);
  const updateTimeline = useCallback((id: string, update: (old: Timeline) => Timeline) => {
    setTimelines(previous => {
      const next = update(previous[id] || { events: [] });
      return { ...previous, [id]: next };
    });
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
    if (params.has("auth_error")) { setError(params.get("auth_error") === "not-configured" ? "GitHub is not configured on this deployment yet. The demo is ready to use." : "GitHub authorization did not finish. Please try again."); history.replaceState({}, "", "/"); }
    if (params.has("connected") || readLocal("gitmsg:connected", false)) {
      writeLocal("gitmsg:connected", true);
      if (params.has("connected")) history.replaceState({}, "", "/");
      api<SessionInfo>("/api/session").then(async info => {
        setSession(info);
        if (!info.user) { writeLocal("gitmsg:connected", false); return; }
        const saved = readLocal<Room[]>(`gitmsg:rooms:${info.user.id}`, []);
        setRooms(old => [...old.filter(r => r.demo), ...saved.filter(r => !r.demo)]);
        const invitation = sessionStorage.getItem("gitmsg:invite");
        if (invitation) {
          try {
            const joined = await api<{ room: Room }>(`/api/repos?repo=${encodeURIComponent(invitation)}`);
            setRooms(old => [...old.filter(r => r.id !== joined.room.id), joined.room]);
            setRoom(joined.room); setModal(null); sessionStorage.removeItem("gitmsg:invite");
          } catch { setModal("new"); }
        }
        else if (saved.length) setRoom(saved[0]);
        else {
          setSyncing(true);
          try {
            const inbox = await api<{ room: Room }>("/api/onboard", { method: "POST" });
            setRooms(old => [...old.filter(r => r.id !== inbox.room.id), inbox.room]);
            setRoom(inbox.room); setModal(null);
            notify("Your private inbox is ready.");
          } catch (e) { setError((e as Error).message); setModal("new"); }
          finally { setSyncing(false); }
        }
      }).catch(e => setError(e.message));
    }
    const invited = params.get("repo");
    if (invited) { sessionStorage.setItem("gitmsg:invite", invited); setModal("connect"); }
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("gitmsg-demo-v1");
      channel.current.onmessage = e => {
        if (e.data?.room?.startsWith("demo/") && validEvent(e.data.event)) updateTimeline(e.data.room, old => ({ ...old, events: mergeEvents(old.events, [e.data.event]) }));
      };
    }
    return () => { channel.current?.close(); timers.current.forEach(clearTimeout); };
  }, [updateTimeline, notify]);

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
    setText(readLocal<string>(`gitmsg:draft:${room.id}`, "")); setReplyTo(null); setEditing(null); setSearch(""); setError(""); retryEvent.current = null;
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

  const onError = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : "Something went wrong.";
    setError(message);
    if (e instanceof ApiError && e.status === 429) { cooldownRef.current = Date.now() + Math.max(60, e.retryAfter) * 1000; setCooldown(Math.max(60, e.retryAfter)); }
    if (e instanceof ApiError && e.status === 401) { setSession(old => old ? { ...old, user: null } : null); writeLocal("gitmsg:connected", false); }
  }, []);

  const sync = useCallback(async (historyPage = false) => {
    const active = roomRef.current;
    if (active.demo || !session?.user || syncInFlight.current || Date.now() < cooldownRef.current || document.hidden) return;
    syncInFlight.current = true; setSyncing(true);
    const old = timelinesRef.current[active.id] || { events: [] };
    try {
      const query = new URLSearchParams({ repo: active.id, branch: active.branch });
      if (historyPage && old.older) query.set("cursor", old.older);
      const response = await fetch(`/api/chat?${query}`, { headers: old.etag && !historyPage ? { "If-None-Match": old.etag } : {} });
      if (response.status === 304) { setLastSync(new Date().toISOString()); failureStreak.current = 0; setError(""); return; }
      const data = await response.json();
      if (!response.ok) throw new ApiError(data.error, response.status, data.retryAfter);
      const result = data as SyncResult;
      let incoming = result.events;
      // Catch up in Git order after being offline, without losing intermediate events.
      if (!historyPage && old.head && result.head !== old.head && result.older && !incoming.some(e => e.sha === old.head)) {
        let cursor = result.older; let found = false;
        for (let page = 0; cursor && !found && page < 10; page++) {
          const more = await api<SyncResult>(`/api/chat?${new URLSearchParams({ repo: active.id, branch: active.branch, cursor })}`);
          incoming = [...more.events, ...incoming];
          found = more.events.some(e => e.sha === old.head);
          cursor = more.older || "";
          if (cursor && !found && page === 9) throw new ApiError("More than 1,000 commits happened while you were away. Reload this page to fetch the latest history, then load earlier commits.", 429, 300);
        }
      }
      updateTimeline(active.id, current => {
        const events = historyPage ? mergeEvents(incoming, current.events) : reconcileEvents(current.events, incoming);
        return { events, etag: historyPage ? current.etag : response.headers.get("etag") || undefined, head: historyPage ? current.head : result.head, older: historyPage || !current.fetched ? result.older : current.older, fetched: true };
      });
      setLastSync(new Date().toISOString()); setError(""); failureStreak.current = 0;
      log(`[fetch] ${historyPage ? "older history" : "origin/" + active.branch} · ${incoming.length} events`);
    } catch (e) { failureStreak.current++; onError(e); }
    finally { syncInFlight.current = false; setSyncing(false); }
  }, [session, updateTimeline, onError, log]);

  useEffect(() => {
    if (room.demo || !session?.user) return;
    let disposed = false; let timeout: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await sync();
      if (!disposed) timeout = setTimeout(tick, Math.max(Math.min(300000, 15000 * 2 ** Math.min(failureStreak.current, 5)), document.hidden || Date.now() - idleSince.current > 120000 ? 60000 : 15000) + Math.random() * 3000);
    };
    void tick();
    const visible = () => { if (!document.hidden) { idleSince.current = Date.now(); void sync(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearTimeout(timeout); document.removeEventListener("visibilitychange", visible); };
  }, [room.id, room.demo, session, sync]);

  const appendDemo = useCallback((id: string, event: ChatEvent) => {
    updateTimeline(id, old => ({ ...old, events: mergeEvents(old.events, [event]) }));
    channel.current?.postMessage({ room: id, event });
  }, [updateTimeline]);

  async function submitEvent(event: ChatEvent) {
    const active = roomRef.current;
    if (active.demo) { const saved = { ...event, sha: shortSha() }; appendDemo(active.id, saved); log(`[demo] ${event.kind} ${saved.sha} · local only`); return saved; }
    const result = await api<{ event: ChatEvent }>("/api/chat", { method: "POST", body: JSON.stringify({ repo: active.id, branch: active.branch, event }) });
    updateTimeline(active.id, old => ({ ...old, events: mergeEvents(old.events, [result.event]), etag: undefined }));
    log(`[commit] ${result.event.sha?.slice(0, 7) || "already committed"} → origin/${active.branch}`);
    return result.event;
  }
  function makeEvent(kind: ChatEvent["kind"], data: Partial<ChatEvent>): ChatEvent {
    return { v: 1, id: crypto.randomUUID(), kind, actor, createdAt: new Date().toISOString(), ...data };
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || sendingRef.current || cooldown || text.length > MAX_TEXT) return;
    idleSince.current = Date.now();
    if (text.startsWith("/") && !editing) {
      const command = text.trim().toLowerCase();
      if (["/help", "/clear", "/ship", "/fortune", "/sudo", "/panic"].includes(command)) writeLocal(`gitmsg:draft:${room.id}`, "");
      if (command === "/help") { setModal("help"); setText(""); return; }
      if (command === "/clear") { notify("Nice try. Git has receipts. Use Settings to reset the demo."); setText(""); return; }
      if (command === "/ship") { setConfetti(true); notify("🚀 Deployed to production. Thoughts and prayers."); setText(""); return; }
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
    writeLocal(`gitmsg:draft:${room.id}`, text); setRoom(next); setSidebar(false);
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

  return <div className="app" onPointerDown={() => { idleSince.current = Date.now(); }}>
    <SiteHeader user={session?.user} onConnect={() => void openConnect()} onSettings={() => setModal("settings")} onSecret={() => notify("git blame: you. git praise: also you.")} />
    {confetti && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <span key={i} style={{ left: `${(i * 17.3) % 100}%`, animationDelay: `${(i % 7) * 0.08}s`, background: ["#fff", "#aaa", "#666"][i % 3] }} />)}</div>}
    <main className="main"><Frame className="workspace-frame"><FramePanel className="chat-workspace">
    {sidebar && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="sidebar-top"><span>Chats</span><Button variant="ghost" size="icon-sm" title="New chat" aria-label="New chat" onClick={() => setModal("new")}><Plus /></Button><Button variant="ghost" size="icon-sm" className="close-navigation" aria-label="Close navigation" onClick={() => setSidebar(false)}><X /></Button></div>
      <Button variant="outline" className="sidebar-search" onClick={() => { setSearchOpen(true); setSidebar(false); }}><Search />Search<kbd>⌘ K</kbd></Button>
      <nav className="rooms" aria-label="Chats">{rooms.map(r => <Button key={r.id} variant={room.id === r.id ? "secondary" : "ghost"} onClick={() => selectRoom(r)} aria-current={room.id === r.id ? "page" : undefined} className="room"><Hash /><span>{r.name}</span>{!r.demo && <LockKeyhole />}</Button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom"><Button variant="ghost" size="icon-sm" aria-label="Help" title="Help" onClick={() => setModal("help")}><CircleHelp /></Button><Button variant="ghost" size="icon-sm" aria-label="Settings" title="Settings" onClick={() => setModal("settings")}><Settings2 /></Button></div>
    </aside>

    <section className="workspace-content">
      <header className="channel-header"><div className="channel-title"><Button variant="ghost" size="icon-sm" className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu /></Button><Hash size={18} /><h1>{room.name}</h1>{room.demo ? <span className="room-kind" title="Local demo with simulated replies. No GitHub commits.">Demo</span> : <span className="room-kind"><LockKeyhole size={12} />{room.private ? "Private" : "Public"}</span>}</div><div className="channel-actions"><Button variant="ghost" size="icon-sm" aria-label="Search messages" title="Search messages" onClick={() => setSearchOpen(v => !v)}><Search /></Button>{!room.demo && <Button variant="ghost" size="icon-sm" render={<a href={repoUrl} target="_blank" rel="noreferrer" />} aria-label="Open repository" title="Open repository"><Github /></Button>}<Button variant="outline" size="sm" onClick={() => setModal("invite")}><Plus />Invite</Button></div></header>

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
                {Object.entries(message.reactions).some(([, users]) => users.length) && <div className="reactions">{Object.entries(message.reactions).filter(([, users]) => users.length).map(([emoji, users]) => <Button key={emoji} variant={users.some(u => u.id === actor.id) ? "secondary" : "outline"} size="xs" aria-pressed={users.some(u => u.id === actor.id)} title={users.map(u => u.login).join(", ")} onClick={() => void react(message, emoji as Reaction)}>{emoji}<span>{users.length}</span></Button>)}</div>}
              </div>
              {!message.deleted && <div className="message-tools">
                <Button variant="ghost" size="icon-xs" aria-label={`React to message from ${message.actor.login}`} title="React" onClick={() => setReactionPicker(reactionPicker === message.id ? null : message.id)}><Smile /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Reply to message" title="Reply" onClick={() => { setReplyTo(message); setEditing(null); composer.current?.focus(); }}><Reply /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Copy message" title="Copy" onClick={() => void copy(message.text)}><Copy /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Inspect commit" title="Inspect commit" onClick={() => { setSelected(message); setModal("inspect"); }}><GitCommitHorizontal /></Button>
                {mine && <><Button variant="ghost" size="icon-xs" aria-label="Edit message" title="Edit" onClick={() => { setEditing(message); setReplyTo(null); setText(message.text); composer.current?.focus(); }}><Pencil /></Button><Button variant="ghost" size="icon-xs" aria-label="Delete message" title="Delete" onClick={() => { setSelected(message); setModal("delete"); }}><Trash2 /></Button></>}
              </div>}
              {reactionPicker === message.id && <div className="reaction-picker">{REACTIONS.map(emoji => <Button variant="ghost" size="icon-sm" key={emoji} onClick={() => void react(message, emoji)} aria-label={`React ${emoji}`}>{emoji}</Button>)}<Button variant="ghost" size="icon-sm" aria-label="Close reactions" onClick={() => setReactionPicker(null)}><X /></Button></div>}
            </article>;
          })}</div>
          {botTyping && room.demo && <div className="typing">Typing…</div>}
          <div ref={bottom} className="scroll-anchor" />
        </div>
        <div className="composer-area">
          {error && <div className="error-banner" role="alert"><Info size={16} /><span>{error}{cooldown > 0 && ` (${cooldown}s)`}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={() => setError("")}><X /></Button></div>}
          {currentReply && <div className="composing-context">{editing ? <Pencil size={13} /> : <Reply size={13} />}<span>{editing ? "Editing your message" : `Replying to ${replyTo!.actor.login}`}<small>{currentReply.text.slice(0, 80)}</small></span><Button variant="ghost" size="icon-xs" aria-label="Cancel reply or edit" onClick={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }}><X /></Button></div>}
          <form className="composer" onSubmit={send}>
            <Textarea ref={composer} aria-label="Message" placeholder={editing ? "Edit message…" : `Message #${room.name}`} rows={2} maxLength={MAX_TEXT} value={text} onChange={e => { setText(e.target.value); writeLocal(`gitmsg:draft:${room.id}`, e.target.value); }} onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } if (e.key === "ArrowUp" && !text) { const last = [...messages].reverse().find(m => m.actor.id === actor.id && !m.deleted); if (last) { setEditing(last); setText(last.text); } } }} />
            <div className="composer-toolbar"><div><Button variant="ghost" size="icon-sm" title="Add emoji" aria-label="Add emoji" onClick={() => setEmojiPicker(v => !v)}><Smile /></Button><Button variant="ghost" size="icon-sm" title="Insert code" aria-label="Insert code formatting" onClick={() => { setText(v => `${v}\`code\``); composer.current?.focus(); }}><Code2 /></Button></div><div>{text.length > 3500 && <span className="character-count">{text.length}/{MAX_TEXT}</span>}<Button size="sm" type="submit" loading={sending} disabled={!text.trim() || cooldown > 0 || (!room.demo && !session?.user)} aria-label={editing ? "Save edit" : "Send message"}>{editing ? "Save" : "Send"}<ArrowUpRight /></Button></div></div>
            {emojiPicker && <div className="composer-emoji">{[...REACTIONS, "👋", "🤝", "🫡", "✨", "☕"].map(emoji => <Button variant="ghost" size="icon-sm" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => { setText(t => t + emoji); setEmojiPicker(false); composer.current?.focus(); }}>{emoji}</Button>)}</div>}
          </form>
          <div className="composer-footer">{room.demo ? "Local demo · simulated replies" : "Stored on GitHub · not end-to-end encrypted"}<span>Shift ↵ for a new line</span></div>
        </div>
        {terminal && <div className="terminal-panel"><div><span>Activity log</span><Button variant="ghost" size="icon-xs" aria-label="Close log" onClick={() => setTerminal(false)}><X /></Button></div><pre>{logs.join("\n")}</pre></div>}
      </section>

      </div>
      {!room.demo && <div className="sync-status" role="status">{cooldown ? `Retry in ${cooldown}s` : syncing ? "Syncing…" : lastSync ? `Synced ${time(lastSync)}` : "Connecting…"}</div>}
      </section>
    </FramePanel></Frame></main>

    {toast && <div className="toast" role="status"><Check size={14} /><span>{toast}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={() => setToast("")}><X /></Button></div>}
    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}><DialogContent className={`modal ${modal === "help" ? "wide" : ""}`} aria-describedby="dialog-description"><DialogTitle className="sr-only">{modal === "connect" ? "Sign in with GitHub" : modal === "new" ? "New conversation" : modal === "invite" ? "Invite a collaborator" : modal === "help" ? "README and keyboard shortcuts" : modal === "inspect" ? "Inspect commit" : modal === "delete" ? "Hide message" : "Preferences"}</DialogTitle><DialogDescription id="dialog-description" className="sr-only">{modal === "connect" ? "Authorize GitHub to create and access your chat repositories." : "Manage your gitmsg conversation."}</DialogDescription>
      {modal === "connect" && <AuthPanel session={session} onContinue={() => setModal("new")} onClose={() => setModal(null)} />}
      {modal === "new" && <NewRoom session={session} onConnect={() => void openConnect()} onDone={newRoom => { setRooms(old => old.some(r => r.id === newRoom.id) ? old : [...old, newRoom]); if (newRoom.demo) updateTimeline(newRoom.id, () => ({ events: [] })); selectRoom(newRoom); setModal(null); notify(newRoom.demo ? "Local chat created." : "Repository connected."); }} />}
      {modal === "invite" && <><h2>Invite to chat</h2><p>{room.demo ? "Sign in to create a shared chat. Demo rooms are local to this browser." : "Invite a GitHub user, then share the room link after they accept."}</p>{!room.demo ? <><InviteForm repo={room.id} /><Button variant="outline" onClick={() => void copy(`${location.origin}/?repo=${encodeURIComponent(room.id)}`, "Room link copied. GitHub invitation must be accepted first.")}><Copy />Copy room link</Button><Button variant="link" render={<a href={`${repoUrl}/settings/access`} target="_blank" rel="noreferrer" />}>Manage collaborators on GitHub</Button></> : <Button onClick={() => void openConnect()}><Github />Sign in with GitHub</Button>}</>}
      {modal === "inspect" && selected && <><h2>Commit</h2><div className="commit-detail"><div><span>SHA</span><code>{selected.sha || "Sync to retrieve SHA"}</code></div><div><span>Author</span><b>@{selected.actor.login}</b></div><div><span>Date</span><span>{new Date(selected.createdAt).toLocaleString("en-US")}</span></div><div><span>Branch</span><code>{room.branch}</code></div></div><pre className="json-preview">{JSON.stringify({ id: selected.id, from: selected.actor.login, text: selected.text, timestamp: selected.createdAt }, null, 2)}</pre>{room.demo ? <p className="fine-print">Simulated commit. No data was sent to GitHub.</p> : selected.url && <Button render={<a href={selected.url} target="_blank" rel="noreferrer" />}>View on GitHub<ExternalLink /></Button>}<Button variant="outline" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Copy />Copy JSON</Button></>}
      {modal === "delete" && <><h2>Hide message?</h2><p>The message will be hidden in this chat. Its original text remains in Git history and downloaded copies. This is not secure erasure.</p><Button disabled={sending} loading={sending} onClick={() => void removeMessage()}><Trash2 />Hide message</Button><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button></>}
      {modal === "settings" && <><h2>Settings</h2><div className="settings-list">
        <Button variant="ghost" aria-pressed={sound} onClick={() => setSound(v => !v)}>{sound ? <Volume2 /> : <VolumeX />}Message sound<span className="setting-value">{sound ? "On" : "Off"}</span></Button>
        <Button variant="ghost" onClick={() => { download(`${room.name}-history.json`, JSON.stringify({ app: "gitmsg", demo: Boolean(room.demo), repository: room.id, exportedAt: new Date().toISOString(), events: timeline.events }, null, 2)); notify("Loaded history exported. Unloaded history is not included."); }}><Download />Export loaded history</Button>
        {!room.demo && <Button variant="ghost" onClick={() => void copy(`git clone ${repoUrl}.git`, "Clone command copied.")}><Copy />Copy clone command</Button>}
        {room.demo && <Button variant="ghost" onClick={() => { updateTimeline(room.id, () => ({ events: demoEvents(room.id) })); setModal(null); notify("Demo reset."); }}><GitFork />Reset demo</Button>}
        {session?.user && <Button variant="ghost" onClick={() => void logout()}><LogOut />Sign out</Button>}
      </div></>}
      {modal === "help" && <><h2>Help</h2><p>Each live chat is a GitHub repository. Messages, edits, and reactions are stored as commits.</p><dl className="shortcuts"><dt>Enter</dt><dd>Send message</dd><dt>Shift ↵</dt><dd>New line</dd><dt>⌘ / Ctrl K</dt><dd>Search messages</dd><dt>↑ in empty input</dt><dd>Edit last message</dd><dt>Esc</dt><dd>Close dialog</dd></dl><p className="fine-print">Demo messages stay in this browser. Live messages are not end-to-end encrypted. Edits and deletions preserve Git history. Only invite trusted collaborators. Free hosting has usage limits.</p></>}
    </DialogContent></Dialog>
  </div>;
}

function NewRoom({ session, onConnect, onDone }: { session: SessionInfo | null; onConnect: () => void; onDone: (room: Room) => void }) {
  const [tab, setTab] = useState<"demo" | "connect" | "create">(session?.user ? "create" : "demo");
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [found, setFound] = useState<Room[]>([]);
  useEffect(() => { const invited = sessionStorage.getItem("gitmsg:invite"); if (invited) { setName(invited); if (session?.user) setTab("connect"); sessionStorage.removeItem("gitmsg:invite"); } }, [session]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError("");
    try {
      if (tab === "demo") { const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); if (slug.length < 2) throw new Error("Use at least two letters or numbers."); onDone({ id: `demo/${slug}-${crypto.randomUUID().slice(0, 6)}`, name: slug, description: "Local demo", branch: "main", demo: true }); }
      else { const result = await api<{ room: Room }>(tab === "connect" ? `/api/repos?repo=${encodeURIComponent(name.trim().replace(/^https:\/\/github.com\//, "").replace(/\/$/, ""))}` : "/api/repos", tab === "create" ? { method: "POST", body: JSON.stringify({ name: name.trim() }) } : undefined); onDone(result.room); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open conversation."); } finally { setBusy(false); }
  }
  async function discover() { setBusy(true); try { const result = await api<{ rooms: Room[] }>("/api/repos"); setFound(result.rooms); if (!result.rooms.length) setError("No gitmsg- repositories found in the 100 most recently pushed repositories. Enter any writable repo above."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
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
