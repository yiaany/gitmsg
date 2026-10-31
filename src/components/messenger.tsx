"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import CommandButton from "./kokonutui/command-button";
import ParticleButton from "./kokonutui/particle-button";
import Loader from "./kokonutui/loader";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Bookmark, Bot, Camera, Check, Copy, ExternalLink, GitPullRequest, Info, LockKeyhole, MessageSquare, Pencil, Phone, Pin, Plus, Reply, Search, Send, ShieldCheck, Terminal, Trash2, X } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Frame, FramePanel } from "./ui/frame";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { ConversationAvatar, ConversationList } from "./conversation-list";
import { AccountSettings, SettingsActions } from "./account-settings";
import { NavigationMenu } from "./navigation-menu";
import { ChatMenu } from "./chat-menu";
import { EmojiPicker } from "./emoji-picker";
import { MessageMenu } from "./message-menu";
import { SidebarScreen } from "./sidebar-screen";
import { RoomInfo } from "./room-info";
import { avatarImage } from "@/lib/avatar-image";
import { roomRepositoryName } from "@/lib/room-document";
import type { ConversationKind } from "./new-conversation-menu";
import { ProfileSettings } from "./profile-settings";
import { DEFAULT_PROFILE, parseMutedRooms, parsePins, pinnedMessages, toggleMessagePin, type MessagePins } from "@/lib/view-preferences";
import { libraryRooms, type GitHubProfile } from "@/lib/github-models";
import { dayLabel, isGrouped, sameDay } from "@/lib/conversation-view";
import { InviteForm } from "./invite-form";
import { JoinChat } from "./join-chat";
import { AuthPanel } from "./auth-panel";
import { LoginScreen } from "./login-screen";
import { PersonProfile } from "./person-profile";
import { MediaComposer } from "./media-composer";
import { MediaMessage } from "./media-message";
import { WelcomeChannel } from "./welcome-channel";
import { useInbox } from "./use-inbox";
import { useAudioCall } from "./use-audio-call";
import { AudioCallPanel } from "./audio-call-panel";
import { callableRoom } from "@/lib/call-protocol";
import { RoomSecurity, type SecurityInfo } from "./room-security";
import { Proposals } from "./proposals";
import { ChatQR } from "./chat-qr";
import { BotPanel } from "./bot-panel";
import { OtherClients } from "./other-clients";
import { api, ApiError, readLocal, writeLocal } from "@/lib/client";
import { startAdaptivePolling } from "@/lib/polling";
import { decodeEvents, encryptEvent, generateKey, importKey, keyFingerprint, roomKey, storeRoomKey } from "@/lib/room-crypto";
import { loadMedia, uploadMedia } from "@/lib/media";
import { materialize, MAX_TEXT, mergeEvents, reconcileEvents, type Actor, type ChatEvent, type Message, type Reaction, type Room } from "@/lib/protocol";

type SessionInfo = { user: Actor | null; configured: boolean; mode: "app" | "oauth"; installUrl: string | null };
type SyncResult = { events: ChatEvent[]; head: string | null; older: string | null };
type Modal = "connect" | "join" | "new" | "profile" | "person" | "invite" | "help" | "settings" | "inspect" | "delete" | "security" | "proposals" | "bot" | "clients" | "tools" | null;
type Timeline = { events: ChatEvent[]; etag?: string; head?: string | null; older?: string | null; fetched?: boolean };
const SOUND_KEY = "gitmsg:sound";
const EMPTY_ROOM: Room = { id: "", name: "", branch: "main", description: "" };

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
  const reduceMotion = useReducedMotion();
  const [room, setRoom] = useState<Room>(EMPTY_ROOM);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [timelines, setTimelines] = useState<Record<string, Timeline>>({});
  const timelinesRef = useRef(timelines); timelinesRef.current = timelines;
  const roomRef = useRef(room); roomRef.current = room;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [security, setSecurity] = useState<SecurityInfo>({ enabled: false, hasKey: false, loaded: false });
  const securityRef = useRef(security); securityRef.current = security;
  const [modal, setModal] = useState<Modal>(null);
  const [newKind, setNewKind] = useState<ConversationKind>("chat");
  const [roomInfo, setRoomInfo] = useState(false);
  const [mutedRooms, setMutedRooms] = useState<string[]>([]);
  const [invitedRepo, setInvitedRepo] = useState("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [guide, setGuide] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [terminal, setTerminal] = useState(false);
  const [sound, setSound] = useState(false);
  const notificationPreferences = useRef({ sound, mutedRooms }); notificationPreferences.current = { sound, mutedRooms };
  const [sending, setSending] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const activeCallRef = useRef(false);
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
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [pins, setPins] = useState<MessagePins>({});
  const [pinIndex, setPinIndex] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [profile, setProfile] = useState<GitHubProfile>(DEFAULT_PROFILE);
  const [profilePublished, setProfilePublished] = useState(false);
  const [person, setPerson] = useState<Actor | null>(null);
  const [profileBack, setProfileBack] = useState<"settings" | null>(null);
  const [settingsQuery, setSettingsQuery] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const libraryChanged = useRef(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const scrollIntentUntil = useRef(0);
  const composerArea = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const retryEvent = useRef<ChatEvent | null>(null);
  const retryWire = useRef<{ id: string; room: string; event: ChatEvent } | null>(null);
  const actor = session?.user || { id: 0, login: "" };
  const timeline = timelines[room.id] || { events: [] };
  const messages = useMemo(() => materialize(timeline.events), [timeline.events]);
  const filtered = useMemo(() => search ? messages.filter(m => `${m.text} ${m.actor.login}`.toLowerCase().includes(search.toLowerCase())) : messages, [messages, search]);
  const pinned = pinnedMessages(messages, pins[room.id]);
  const activePin = pinned[pinIndex % Math.max(1, pinned.length)];
  const profileActor = actor;
  const actorName = (user: Actor) => user.id === actor.id ? profile.name || user.login : user.id === room.peer?.id ? room.name : user.login;
  const sidebarModal = modal !== null && modal !== "connect" && modal !== "join" && modal !== "delete" && modal !== "inspect";
  const sidebarScreen = sidebarModal ? modal : searchOpen ? "search" : null;
  const canSend = !!room.id && !!session?.user && room.canWrite === true && security.loaded && (!security.enabled || security.hasKey);
  const notify = useCallback((value: string) => setToast(value), []);
  const log = useCallback((value: string) => setLogs(old => [...old.slice(-35), value]), []);
  const later = useCallback((fn: () => void, delay: number) => { const timer = setTimeout(fn, delay); timers.current.push(timer); }, []);
  const scrollToLatest = useCallback((animated = true) => {
    const node = feed.current;
    node?.scrollTo({ top: node.scrollHeight, behavior: animated && !reduceMotion ? "smooth" : "instant" });
  }, [reduceMotion]);
  const updateTimeline = useCallback((id: string, update: (old: Timeline) => Timeline) => {
    setTimelines(previous => {
      const next = update(previous[id] || { events: [] });
      return { ...previous, [id]: next };
    });
  }, []);
  const completeJoin = useCallback((joined: Room) => {
    if (activeCallRef.current) { notify("End your call before opening another conversation."); return; }
    libraryChanged.current = true;
    roomRef.current = joined; setSecurity({ enabled: false, hasKey: false, loaded: false });
    setRooms(old => [...old.filter(r => r.id !== joined.id), joined]);
    setRoom(joined); setGuide(false); setSidebar(false); setModal(null); setInvitedRepo("");
    sessionStorage.removeItem("gitmsg:invite");
    const url = new URL(location.href); url.searchParams.delete("repo");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void api<{ room: Room }>("/api/library", { method: "POST", body: JSON.stringify({ repo: joined.id, action: joined.kind === "channel" && !joined.canWrite ? "subscribe" : "add" }) }).then(result => { if (result.room) { setRooms(old => old.map(item => item.id.toLowerCase() === result.room.id.toLowerCase() ? result.room : item)); if (roomRef.current.id === joined.id) setRoom(result.room); } }).catch(error => notify(`Chat opened, but its GitHub chat-list backup failed: ${error.message}`));
  }, [notify]);
  const openUser = useCallback((user: Actor) => { if (user.id === actor.id) { setProfileBack(null); setModal("profile"); } else { setPerson(user); setModal("person"); } setSidebar(true); }, [actor.id]);

  useEffect(() => {
    setSound(readLocal(SOUND_KEY, false));
    setPins(parsePins(readLocal("gitmsg:pins", {})));
    setMutedRooms(parseMutedRooms(readLocal("gitmsg:muted-rooms", [])));
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
    if (params.has("auth_error")) setError(params.get("auth_error") === "not-configured" ? "GitHub sign-in is not configured on this deployment yet." : "GitHub authorization did not finish. Please try again.");
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
         if (!info.user) return;
         if (!invitation) setSidebar(false);
         const saved = libraryRooms(readLocal(`gitmsg:rooms:${info.user.id}`, [])); setRooms(saved);
         if (invitation) setModal("join");
          try { const library = await api<{ rooms: Room[] }>("/api/library"); if (!disposed && !libraryChanged.current) setRooms(libraryRooms(library.rooms)); } catch (error) { if (!disposed) setError((error as Error).message); }
         try { const result = await api<{ profile: GitHubProfile; published: boolean }>("/api/profile"); if (!disposed) { setProfile(result.profile); setProfilePublished(result.published); } } catch (error) { if (!disposed) setError((error as Error).message); }
      }).catch(e => { if (!disposed) { setError(e.message); if (invitation) setModal("connect"); } });
    return () => { disposed = true; timers.current.forEach(clearTimeout); };
  }, [updateTimeline, notify]);

  const loadSecurity = useCallback(async () => {
    const active = roomRef.current;
    if (!active.id || !session?.user) return;
    try {
      const policy = await api<{ enabled: boolean; keyId?: string }>(`/api/security?${new URLSearchParams({ repo: active.id, branch: active.branch })}`);
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
  }, [notify, updateTimeline, session?.user?.id]);
  useEffect(() => {
    setSecurity({ enabled: false, hasKey: false, loaded: false });
    if (room.id && session?.user) void loadSecurity();
  }, [room.id, room.branch, session?.user?.id, loadSecurity]);

  useEffect(() => { if (hydrated) writeLocal(SOUND_KEY, sound); }, [sound, hydrated]);
  useEffect(() => { if (hydrated) writeLocal("gitmsg:pins", pins); }, [pins, hydrated]);
  useEffect(() => { if (hydrated) writeLocal("gitmsg:muted-rooms", mutedRooms); }, [mutedRooms, hydrated]);
  useEffect(() => { if (sidebarModal || searchOpen) setSidebar(true); }, [sidebarModal, searchOpen]);
  useEffect(() => { if (highlight) { const timer = setTimeout(() => setHighlight(null), 1600); return () => clearTimeout(timer); } }, [highlight]);
  useEffect(() => { if (session?.user) writeLocal(`gitmsg:rooms:${session.user.id}`, rooms); }, [rooms, session]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 4200); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (confetti) { const timer = setTimeout(() => setConfetti(false), 2600); return () => clearTimeout(timer); } }, [confetti]);
  useEffect(() => {
    const id = setInterval(() => setCooldown(Math.max(0, Math.ceil((cooldownRef.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const resize = () => {
      setMobile(window.innerWidth <= 600);
      const mobile = window.innerWidth <= 600 && viewport.scale === 1;
      if (mobile) root.style.setProperty("--app-height", `${viewport.height}px`);
      else root.style.removeProperty("--app-height");
      root.classList.toggle("keyboard-visible", mobile && window.innerHeight - viewport.height > 120);
    };
    resize(); viewport.addEventListener("resize", resize); window.addEventListener("resize", resize);
    return () => { viewport.removeEventListener("resize", resize); window.removeEventListener("resize", resize); root.style.removeProperty("--app-height"); root.classList.remove("keyboard-visible"); };
  }, []);
  useEffect(() => {
    const node = feed.current;
    if (node && atBottom) scrollToLatest();
  }, [messages.length, scrollToLatest, atBottom]);
  useEffect(() => {
    const content = feed.current?.querySelector(".messages");
    if (!content) return;
    // Photo decoding can resize history after the message-count effect ran.
    const observer = new ResizeObserver(() => { if (followingLatest.current) scrollToLatest(false); });
    observer.observe(content);
    return () => observer.disconnect();
  }, [room.id, scrollToLatest]);
  useEffect(() => {
    const node = composerArea.current;
    if (!node) return;
    const resize = () => node.closest<HTMLElement>(".chat-panel")?.style.setProperty("--composer-reserve", `${node.getBoundingClientRect().height + 32}px`);
    resize();
    const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, [room.id, session?.user?.id]);
  useEffect(() => {
    setText(readLocal<string>(`gitmsg:draft:${room.id}`, "")); setReplyTo(null); setEditing(null); setSearch(""); setPinIndex(0); setHighlight(null); setError(""); setSyncError(""); retryEvent.current = null;
    setAtBottom(true);
    followingLatest.current = true;
    scrollToLatest(false);
  }, [room.id, scrollToLatest]);
  useEffect(() => {
    let sequence = "";
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
       if (event.key === "Escape") { setModal(null); setSearchOpen(false); setSearch(""); setEmojiPicker(false); setRoomInfo(false); }
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

  const callRooms = useMemo(() => [...rooms.filter(item => item.id !== room.id), ...(room.id ? [room] : [])], [rooms, room]);
  const calls = useAudioCall({ actor, rooms: callRooms, timelines, onError, update: (active, event) => updateTimeline(active.id, old => ({ ...old, events: mergeEvents(old.events, [event]), etag: undefined })) });
  activeCallRef.current = calls.busy;
  useEffect(() => {
    const view = calls.view;
    if (view?.phase === "incoming" && sound && !mutedRooms.includes(view.room.id.toLowerCase())) ping();
  }, [calls.view?.id, calls.view?.phase, sound, mutedRooms]);
  function requestCall(active: Room) {
    if (calls.busy || voiceActive || cooldown || sending) { notify("Finish the current call, recording, or commit first."); return; }
    if (!callableRoom(active, actor)) return;
    void calls.start(active);
  }

  const unread = useInbox({ actorId: session?.user?.id, rooms, active: room, reading: atBottom && !modal && !searchOpen && !roomInfo && !guide && (!mobile || !sidebar), timelines, updateTimeline, onError, retryAt: () => cooldownRef.current, onIncoming: active => { const preferences = notificationPreferences.current; if (preferences.sound && !preferences.mutedRooms.includes(active.id.toLowerCase())) ping(); } });

  const sync = useCallback(async (historyPage = false, signal?: AbortSignal) => {
    const active = roomRef.current;
    if (!active.id || !session?.user || (syncInFlight.current && !syncInFlight.current.signal.aborted) || Date.now() < cooldownRef.current || document.hidden || !navigator.onLine || signal?.aborted) return;
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
      const preferences = notificationPreferences.current;
      if (!historyPage && old.fetched && preferences.sound && !preferences.mutedRooms.includes(active.id.toLowerCase()) && incoming.some(event => event.kind === "message" && event.actor.id !== session.user!.id && !old.events.some(previous => previous.id === event.id))) ping();
      setLastSync(new Date().toISOString()); setSyncError(""); failureStreak.current = 0;
      log(`[fetch] ${historyPage ? "older history" : "origin/" + active.branch} · ${incoming.length} events`);
    } catch (e) { if (current()) { failureStreak.current++; onError(e, true); } }
    finally { if (syncInFlight.current === controller) { syncInFlight.current = null; setSyncing(false); } }
  }, [session, updateTimeline, onError, log]);

  useEffect(() => {
    if (!room.id || !session?.user) return;
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
  }, [room.id, room.branch, session, sync]);

  async function submitEvent(event: ChatEvent, active = roomRef.current, policy = securityRef.current) {
    if (!session?.user || !active.id || active.canWrite !== true) throw new Error("You need publishing access to this conversation.");
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
    if (voiceActive || !text.trim() || sendingRef.current || cooldown || !canSend || text.length > MAX_TEXT) return;
    if (text.startsWith("/") && !editing) {
      const command = text.trim().toLowerCase();
      if (["/help", "/clear", "/ship", "/fortune", "/sudo", "/panic"].includes(command)) writeLocal(`gitmsg:draft:${room.id}`, "");
      if (command === "/help") { setModal("help"); setText(""); return; }
       if (command === "/clear") { notify("Git has receipts. Hide individual messages instead; history is not erased."); setText(""); return; }
      if (command === "/ship") { setConfetti(true); notify("🚀 Celebration shipped. No deployment requested — use Actions participant for that."); setText(""); return; }
       if (command === "/fortune") { notify("Everything is a feature if you write the README confidently enough."); setText(""); return; }
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
        if (sound && !mutedRooms.includes(active.id.toLowerCase())) ping();
      later(() => scrollToLatest(), 50);
    } catch (e) { onError(e); }
    finally { sendingRef.current = false; setSending(false); }
  }
  async function sendMedia(file: Blob, name: string, duration?: number, waveform?: number[], caption = "") {
    if (!canSend || sendingRef.current || cooldown) throw new Error("Wait for the current commit or unlock this room first.");
    sendingRef.current = true; setSending(true); setError("");
    const active = roomRef.current;
    const policy = securityRef.current;
    try {
      const attachment = await uploadMedia(active, file, name, policy.enabled, duration, waveform);
      await submitEvent(makeEvent("message", { text: caption, attachments: [attachment], ...(replyTo ? { replyTo: replyTo.id } : {}) }), active, policy);
      if (roomRef.current.id === active.id) setReplyTo(null);
      notify("Attachment committed.");
    } finally { sendingRef.current = false; setSending(false); }
  }
  async function openSaved() {
    if (!session?.user) { await openConnect(); return; }
    try { const result = await api<{ room: Room }>("/api/saved", { method: "POST" }); completeJoin(result.room); }
    catch (e) { onError(e); }
  }
  async function saveToGit(message: Message) {
    if (message.locked || sendingRef.current || !security.loaded) return;
    if (!session?.user) return;
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
      for (const attachment of message.attachments || []) { const blob = await loadMedia(source, attachment); attachments.push(await uploadMedia(destination, blob, attachment.name, policy.enabled, attachment.duration, attachment.waveform)); }
      let event: ChatEvent = { v: 1, id: crypto.randomUUID(), kind: "message", actor: session.user, createdAt: new Date().toISOString(), text: message.text, ...(attachments.length ? { attachments } : {}), savedFrom: { repo: source.id, id: message.id, ...(message.sha ? { sha: message.sha } : {}) } };
      if (policy.enabled) { const key = await roomKey(destination.id); if (!key || await keyFingerprint(key) !== policy.keyId) throw new Error("Import your Saved Messages room key first."); event = await encryptEvent(key, destination.id, destination.branch, event); }
      await api("/api/chat", { method: "POST", body: JSON.stringify({ repo: destination.id, branch: destination.branch, event }) });
      libraryChanged.current = true; setRooms(old => [...old.filter(r => r.id !== destination.id), destination]);
      await api("/api/library", { method: "POST", body: JSON.stringify({ repo: destination.id, action: "add" }) });
      notify(policy.enabled ? "Saved encrypted. Back up the separate Saved Messages key in its security panel." : "Saved to your private gitmsg-saved repository.");
    } catch (e) { onError(e); } finally { sendingRef.current = false; setSending(false); }
  }
  async function react(message: Message, emoji: Reaction) {
    if (!canSend || sendingRef.current || cooldown) return;
    sendingRef.current = true;
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
    if (calls.busy) { notify("End your call before switching conversations."); return; }
    if (sendingRef.current) { notify("Wait for this commit to finish first."); return; }
    setGuide(false);
    if (roomRef.current.id.toLowerCase() === next.id.toLowerCase() && roomRef.current.branch === next.branch) { setSidebar(false); setModal(null); setSearchOpen(false); setEmojiPicker(false); setRoomInfo(false); return; }
    if (security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, text);
    roomRef.current = next; setSecurity({ enabled: false, hasKey: false, loaded: false }); setRoom({ ...next, canWrite: undefined }); setSidebar(false); setModal(null); setSearchOpen(false); setEmojiPicker(false); setRoomInfo(false);
    void api<{ room: Room }>(`/api/repos?${new URLSearchParams({ repo: next.id })}`).then(result => { if (roomRef.current.id === next.id) { setRoom(result.room); setRooms(old => old.map(item => item.id.toLowerCase() === result.room.id.toLowerCase() ? result.room : item)); } }).catch(error => { if (roomRef.current.id === next.id) { setRoom(current => ({ ...current, canWrite: false })); onError(error); } });
  }
  function openGuide() {
    if (calls.busy) { notify("End your call before leaving this conversation."); return; }
    if (sendingRef.current) { notify("Wait for this commit to finish first."); return; }
    if (room.id && security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, text);
    roomRef.current = EMPTY_ROOM; setRoom(EMPTY_ROOM); setGuide(true); setSidebar(false); setModal(null); setSearchOpen(false); setRoomInfo(false);
  }
  async function startChat(user: Actor) {
    if (calls.busy) { notify("End your call before opening another conversation."); return; }
    const existing = callRooms.find(item => item.peer?.id === user.id && item.kind === "chat");
    if (existing) { selectRoom(existing); return; }
    const result = await api<{ room: Room }>("/api/repos", { method: "POST", body: JSON.stringify({ name: `chat-${user.login.slice(0, 24)}-${crypto.randomUUID().slice(0, 6)}`, title: user.login, peer: user.login }) });
    try { await api("/api/invite", { method: "POST", body: JSON.stringify({ repo: result.room.id, login: user.login }) }); completeJoin(result.room); notify(`Invitation sent to @${user.login}.`); }
    catch (error) { completeJoin(result.room); setModal("invite"); setError(`Chat created, but invitation failed: ${(error as Error).message}`); }
  }
  async function subscribe(action: "subscribe" | "remove") {
    if (sendingRef.current) return; sendingRef.current = true; setSending(true);
    libraryChanged.current = true;
    try { const result = await api<{ rooms: Room[]; room?: Room }>("/api/library", { method: "POST", body: JSON.stringify({ repo: room.id, action }) }); setRooms(result.rooms); if (result.room) setRoom(result.room); notify(action === "subscribe" ? "Subscribed. Saved to your private GitHub chat list." : "Unsubscribed. Removed from your GitHub chat list."); }
    catch (error) { onError(error); } finally { sendingRef.current = false; setSending(false); }
  }
  function jumpToMessage(id: string) {
    followingLatest.current = false; setAtBottom(false);
    setSidebar(false); setHighlight(id);
    const node = feed.current;
    const message = document.getElementById(`message-${id}`);
    if (node && message) node.scrollTo({ top: node.scrollTop + message.getBoundingClientRect().top - node.getBoundingClientRect().top - (node.clientHeight - message.clientHeight) / 2, behavior: reduceMotion ? "instant" : "smooth" });
  }
  function togglePin(message: Message) {
    setPins(previous => toggleMessagePin(previous, room.id, message.id));
    setPinIndex(0); notify(pins[room.id]?.includes(message.id) ? "Unpinned on this browser." : "Pinned for you on this browser.");
  }
  function reply(message: Message) { setReplyTo(message); setEditing(null); composer.current?.focus(); }
  function edit(message: Message) { setEditing(message); setReplyTo(null); setText(message.text); composer.current?.focus(); }
  async function openConnect() {
    setModal("connect");
    try { const info = await api<SessionInfo>("/api/session"); setSession(info); }
    catch (e) { onError(e); }
  }
  async function copy(value: string, message = "Copied.") {
    try { await navigator.clipboard.writeText(value); notify(message); } catch { notify("Clipboard unavailable. Select and copy the text instead."); }
  }
  async function logout() {
    try { await calls.end(); await api("/api/auth/logout", { method: "POST" }); setSession(null); setRooms([]); setTimelines({}); setRoom(EMPTY_ROOM); setProfile(DEFAULT_PROFILE); setProfilePublished(false); setPerson(null); setSidebar(true); writeLocal("gitmsg:connected", false); setModal(null); }
    catch (e) { onError(e); }
  }
  const repoUrl = `https://github.com/${room.id}`;
  const currentReply = replyTo || editing;
  const panelTitles: Partial<Record<NonNullable<Modal>, string>> = { profile: "Edit Profile", person: "Profile", settings: "Settings", new: newKind === "channel" ? "New Channel" : newKind === "connect" ? "Connect Repository" : "New Message", security: "Room Security", proposals: "Message proposals", bot: "Actions participant", clients: "Other clients", tools: "Chat tools", invite: "Add members", help: "Help" };

  if (!session?.user) return <LoginScreen session={session} error={error} onRetry={() => location.reload()} />;

  return <div className={`app ${sidebar ? "show-conversations" : "show-chat"}`}>
    {confetti && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <span key={i} style={{ left: `${(i * 17.3) % 100}%`, animationDelay: `${(i % 7) * 0.08}s`, background: ["#fff", "#aaa", "#666"][i % 3] }} />)}</div>}
    <main className="main"><Frame className="workspace-frame"><FramePanel className={`chat-workspace ${roomInfo ? "with-room-info" : ""}`}>
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className={`sidebar-base ${sidebarScreen ? "behind-screen" : ""}`} inert={!!sidebarScreen}>
      <ConversationList rooms={rooms} active={room} timelines={timelines} unread={unread} guideActive={guide} onGuide={openGuide} menu={<NavigationMenu account={session.user.login} onSaved={() => void openSaved()} onNew={() => { setNewKind("chat"); setModal("new"); }} onSettings={() => setModal("settings")} onHelp={() => setModal("help")} onAccount={() => { setProfileBack(null); setModal("profile"); }} />} onSelect={selectRoom} onNew={() => { setNewKind("chat"); setModal("new"); }} onCreate={kind => { setNewKind(kind); setModal("new"); }} onMenu={() => setModal("settings")} onUser={openUser} onChannel={selectRoom} />
      </div>
      <SidebarScreen screen={sidebarScreen} title={modal ? panelTitles[modal] || "Search" : "Search"} onBack={() => { if (modal === "settings" && settingsQuery !== null) { setSettingsQuery(null); return; } setModal(modal === "profile" ? profileBack : null); setSearchOpen(false); setSearch(""); if (modal !== "profile" || !profileBack) later(() => document.querySelector<HTMLButtonElement>('[aria-label="Open navigation menu"]')?.focus({ preventScroll: true }), 0); }} actions={modal === "settings" ? <SettingsActions onSearch={() => setSettingsQuery(value => value === null ? "" : null)} onEdit={() => { setProfileBack("settings"); setModal("profile"); }} onHelp={() => setModal("help")} onLogout={() => void logout()} /> : undefined} header={sidebarScreen === "search" ? <label className="conversation-search"><Search /><input autoFocus type="search" placeholder="Search messages" aria-label="Search conversation" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear message search" onClick={() => setSearch("")}><X /></button>}</label> : undefined}>
        {sidebarScreen === "search" && <div className="sidebar-search"><p className="search-scope">Search in {room.name}<small>{search ? `${filtered.length} results in loaded history` : "Search loaded messages in this conversation"}</small></p><div className="search-results">{search && filtered.map(message => <button type="button" className="search-result" key={message.id} onClick={() => jumpToMessage(message.id)}><Avatar actor={message.actor} /><span><b>{message.actor.login}</b><small>{message.text || "Attachment"}</small></span><time>{time(message.createdAt)}</time></button>)}{search && !filtered.length && <p className="notice">No messages found</p>}</div></div>}
        {modal === "profile" && <ProfileSettings key={profileActor.id} actor={profileActor} profile={profile} published={profilePublished} onSave={async value => { const result = await api<{ profile: GitHubProfile }>("/api/profile", { method: "POST", body: JSON.stringify({ profile: value, publish: true }) }); setProfile(result.profile); setProfilePublished(true); setModal("settings"); notify("Profile saved to GitHub."); }} />}
        {modal === "person" && person && <PersonProfile key={person.id} user={person} existing={callRooms.some(item => item.peer?.id === person.id)} onCall={callRooms.some(item => item.peer?.id === person.id && callableRoom(item, actor)) ? () => requestCall(callRooms.find(item => item.peer?.id === person.id && callableRoom(item, actor))!) : undefined} onStart={startChat} />}
        {modal === "settings" && <AccountSettings actor={profileActor} profile={profile} sound={sound} query={settingsQuery} onQuery={setSettingsQuery} onEdit={() => { setProfileBack("settings"); setModal("profile"); }} onSound={() => setSound(value => !value)} onSaved={() => void openSaved()} onSecurity={room.id ? () => setModal("security") : undefined} onTools={room.id ? () => setModal("tools") : undefined} onHelp={() => setModal("help")} onConnect={() => void openConnect()} onExport={room.id ? () => { download(`${room.name}-history.json`, JSON.stringify({ app: "gitmsg", repository: room.id, exportedAt: new Date().toISOString(), events: timeline.events }, null, 2)); notify("Loaded history exported. Unloaded history is not included."); } : undefined} onClone={room.id ? () => void copy(`git clone ${repoUrl}.git`, "Clone command copied.") : undefined} />}
        {modal === "new" && <NewRoom key={newKind} kind={newKind} session={session} onConnect={() => void openConnect()} onWarning={notify} onDone={newRoom => { completeJoin(newRoom); }} />}
        {modal === "security" && room.id && <RoomSecurity key={room.id} room={room} security={security} onChange={loadSecurity} />}
        {modal === "proposals" && room.id && <Proposals room={room} onMerged={() => { void sync(); notify("Pull request merged. Fetching messages…"); }} />}
        {modal === "bot" && room.id && <BotPanel room={room} secure={security.enabled} />}
        {modal === "clients" && room.id && <OtherClients room={room} actor={actor} secure={security.enabled} />}
        {modal === "tools" && <div className="tool-list"><Button variant="ghost" onClick={() => setModal("security")}><ShieldCheck /><span>Room Security<small>Encryption and key backup</small></span></Button><Button variant="ghost" onClick={() => setModal("proposals")}><GitPullRequest /><span>Message proposals<small>Review GitHub pull requests</small></span></Button><Button variant="ghost" onClick={() => setModal("bot")}><Bot /><span>Actions participant</span></Button><Button variant="ghost" onClick={() => setModal("clients")}><Terminal /><span>Other clients</span></Button><Button variant="ghost" onClick={() => setModal("invite")}><Plus /><span>Add members</span></Button><Button variant="ghost" render={<a href={repoUrl} target="_blank" rel="noreferrer" />}><Github /><span>Open repository</span></Button></div>}
        {modal === "invite" && <><p className="notice">Invite a GitHub collaborator, then share the chat link. A link alone does not grant access. Channel collaborators can publish; subscribers do not need an invitation.</p><InviteForm repo={room.id} /><ChatQR repo={room.id} />{security.enabled && <Button variant="outline" onClick={() => setModal("security")}><ShieldCheck />Share secret key separately</Button>}</>}
        {modal === "help" && <div className="help-screen"><h3>Messages with receipts.</h3><p>Chats live in private GitHub repositories. Public channels are readable by anyone; only repository writers can publish. Subscribe to save a channel in your private GitHub chat list.</p><dl className="shortcuts"><dt>Enter</dt><dd>Send</dd><dt>Shift ↵</dt><dd>New line</dd><dt>⌘ / Ctrl K</dt><dd>Search loaded messages</dd><dt>↑ in empty input</dt><dd>Edit last message</dd><dt>Esc</dt><dd>Close panel</dd></dl><p>Standard messages are readable by GitHub. Encryption protects future content, not old Git history. Back up your room keys.</p><h3>Calls</h3><p>Free direct audio, no TURN relay. Keep both chats open and online; some networks cannot connect. Git batches parameters after 2.5 seconds, never the audio. Public STUN helps discover addresses. Parameters, including possible IP addresses, stay readable in Git history unless Room Security is enabled. Accept turns on your microphone; speaker toggles playback.</p></div>}
      </SidebarScreen>
    </aside>

    <section className={`workspace-content ${room.id || guide ? "" : "no-conversation"}`}>
      {guide && !room.id && <WelcomeChannel onBack={() => setSidebar(true)} onNew={() => { setNewKind("chat"); setModal("new"); }} />}
      {!room.id && error && <p role="alert" className="empty-inbox-error notice error">{error}</p>}
      {room.id && <><header className="channel-header"><Button variant="ghost" size="icon-lg" className="mobile-menu round-button" aria-label="Back to chats" onClick={() => setSidebar(true)}><ArrowLeft /></Button><button type="button" className="channel-title" aria-label={room.kind === "channel" ? "Open channel info" : "Open chat info"} aria-expanded={roomInfo} onClick={() => setRoomInfo(value => !value)}><ConversationAvatar room={room} small /><span className="channel-heading"><h1>{room.name}</h1><span className="channel-status">{room.kind === "channel" ? "public channel" : security.enabled ? "encrypted conversation" : "GitHub conversation"}</span></span></button><div className="channel-actions">
        {callableRoom(room, actor) && <Button variant="ghost" size="icon-lg" className="round-button" aria-label="Start audio call" title="Audio call" disabled={!canSend || voiceActive || calls.busy || sending || cooldown > 0} onClick={() => requestCall(room)}><Phone /></Button>}
        <CommandButton className="channel-search round-button" disabled={modal !== null && !sidebarModal} aria-label="Search messages" title="Search messages · ⌘K" onClick={() => { setModal(null); setSearchOpen(v => !v); setSidebar(true); }}><Search /><span className="sr-only">Search messages</span></CommandButton><ChatMenu onTool={tool => { setModal(tool); setSidebar(true); }} onInfo={() => setRoomInfo(true)} muted={mutedRooms.includes(room.id.toLowerCase())} onMute={() => { const id = room.id.toLowerCase(); setMutedRooms(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]); }} onSearch={() => { setModal(null); setSearchOpen(true); setSidebar(true); }} /></div></header>

      <div className="conversation-layout"><section className="chat-panel" aria-label="Chat">
        {activePin && <button type="button" className="pinned-message" aria-label="Go to pinned message" title="Pinned for you on this browser" onClick={() => { jumpToMessage(activePin.id); setPinIndex(index => (index + 1) % pinned.length); }}><span className="pin-segments">{pinned.map((message, index) => <i key={message.id} className={index === pinIndex % pinned.length ? "active" : ""} />)}</span><span className="pinned-copy" key={activePin.id}><b>Pinned Message{pinned.length > 1 ? ` #${pinIndex % pinned.length + 1}` : ""}<small> · for me</small></b><span>{activePin.text || "Attachment"}</span></span><Pin size={20} /></button>}
        <div className={`message-feed ${!messages.length ? "is-empty" : ""}`} ref={feed} onWheel={() => { scrollIntentUntil.current = Date.now() + 1500; }} onTouchMove={() => { scrollIntentUntil.current = Date.now() + 1500; }} onPointerDown={() => { scrollIntentUntil.current = Date.now() + 1500; }} onKeyDown={event => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) scrollIntentUntil.current = Date.now() + 1500; }} onScroll={() => { const node = feed.current; if (node) { const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < 150; if (bottom || !followingLatest.current || Date.now() < scrollIntentUntil.current) { followingLatest.current = bottom; setAtBottom(bottom); } } }}>
          {timeline.older && !search && <Button variant="ghost" size="sm" className="load-history" loading={syncing} onClick={() => void sync(true)}>Load earlier messages</Button>}
          {syncing && !messages.length && <Loader className="history-loader" size="sm" title="Loading messages…" subtitle="Reading your Git history" />}
          {!syncing && !messages.length && <div className="empty-state"><MessageSquare size={24} />No messages yet</div>}
          <motion.div className="messages" key={room.id} initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : .2, ease: [.33, 1, .68, 1] }} role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text">{messages.map((message, index) => {
            const previous = messages[index - 1]; const grouped = isGrouped(previous, message);
            const next = messages[index + 1]; const lastInGroup = !next || !isGrouped(message, next);
            const mine = message.actor.id === actor.id;
            const photo = message.attachments?.some(attachment => attachment.mime.startsWith("image/"));
            const receipt = <span className="message-meta-bottom">{pins[room.id]?.includes(message.id) && <Pin size={11} aria-label="Pinned for me" />}{message.edited && <span>edited</span>}<time dateTime={message.createdAt}>{time(message.createdAt)}</time>{mine && <Check className="commit-check" aria-label="Committed to GitHub" />}</span>;
            const replied = message.replyTo ? messages.find(m => m.id === message.replyTo) : null;
            return <div className="message-unit" key={message.id}>
              {(!previous || !sameDay(previous.createdAt, message.createdAt)) && <div className="date-divider"><span>{dayLabel(message.createdAt)}</span></div>}
              <MessageMenu mine={mine} editable={!!message.text.trim() && !message.locked && !message.deleted} disabled={!canSend || sending || !!message.locked || message.deleted} saveDisabled={sending || !security.loaded || !!message.locked || message.deleted} pinned={pins[room.id]?.includes(message.id) || false} onReply={() => reply(message)} onEdit={() => edit(message)} onDelete={() => { setSelected(message); setModal("delete"); }} onCopy={() => void copy(message.text)} onSave={() => void saveToGit(message)} onInspect={() => { setSelected(message); setModal("inspect"); }} onPin={() => togglePin(message)} onReact={emoji => void react(message, emoji)}>
              <motion.article tabIndex={0} aria-label={`Message from ${message.actor.login}`} onDoubleClick={event => { if (canSend && !(event.target as HTMLElement).closest("a,button,input,audio")) reply(message); }} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }} className={`message ${highlight === message.id ? "highlighted" : ""} ${grouped ? "grouped" : ""} ${lastInGroup ? "group-end" : ""} ${mine ? "mine" : ""} ${message.deleted ? "deleted" : ""}`} id={`message-${message.id}`}>
              {!room.peer && room.kind !== "channel" && <div className="message-avatar">{lastInGroup && <button type="button" aria-label={`Open @${message.actor.login} profile`} onClick={() => openUser(message.actor)}><Avatar actor={message.actor} /></button>}</div>}
              <div className={`message-content ${photo ? "photo-message" : ""}`}>
                {!grouped && !mine && !room.peer && room.kind !== "channel" && <div className="message-meta"><button type="button" onClick={() => openUser(message.actor)}><b>{actorName(message.actor)}</b></button>{message.actor.login === "dependabot" && <span className="bot-label">bot</span>}</div>}
                {message.replyTo && <Button variant="ghost" size="xs" className="reply-preview" onClick={() => { if (replied) jumpToMessage(replied.id); else notify("Load earlier messages to view the original reply."); }}><b>{replied ? actorName(replied.actor) : "Original message"}</b><span>{replied?.text.slice(0, 100) || (replied ? "Attachment" : "Not in loaded history")}</span></Button>}
                {!photo && message.text && <div className="message-text">{richText(message.text)}</div>}
                {message.locked && <Button size="xs" variant="outline" onClick={() => setModal("security")}><LockKeyhole />Import room key</Button>}
                {message.attachments?.map(attachment => <MediaMessage key={attachment.id} room={room} attachment={attachment} />)}
                {photo && message.text && <div className="photo-caption"><div className="message-text">{richText(message.text)}</div>{receipt}</div>}
                {message.savedFrom && <span className="saved-source"><Bookmark size={11} />Saved from {message.savedFrom.repo}</span>}
                {message.bot?.command === "roll" && Number.isInteger(message.bot.value) && message.bot.value! >= 1 && message.bot.value! <= 6 && <div className="dice-result" role="img" aria-label={`Die result: ${message.bot.value}`}>{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][message.bot.value! - 1]}</div>}
                {Object.entries(message.reactions).some(([, users]) => users.length) && <div className="reactions">{Object.entries(message.reactions).filter(([, users]) => users.length).map(([emoji, users]) => <Button key={emoji} variant={users.some(u => u.id === actor.id) ? "secondary" : "outline"} size="xs" aria-pressed={users.some(u => u.id === actor.id)} title={users.map(u => u.login).join(", ")} onClick={() => void react(message, emoji as Reaction)}>{emoji}<span>{users.length}</span></Button>)}</div>}
                {(!photo || !message.text) && receipt}
              </div>
            </motion.article></MessageMenu></div>;
          })}</motion.div>
        </div>
        {!atBottom && messages.length > 0 && <Button variant="outline" size="icon-lg" className="jump-to-latest" aria-label="Jump to latest messages" onClick={() => scrollToLatest()}><ArrowDown />{!!unread[room.id.toLowerCase()] && <span className="unread-badge">{unread[room.id.toLowerCase()]}</span>}</Button>}
        <div className="composer-area" ref={composerArea}>
          {(error || syncError) && <div className="error-banner" role="alert"><Info size={16} /><span>{error || syncError}{cooldown > 0 && ` (${cooldown}s)`}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={() => { setError(""); setSyncError(""); }}><X /></Button></div>}
          {security.enabled && !security.hasKey && <Button className="unlock-room" variant="outline" onClick={() => setModal("security")}><LockKeyhole />Import the room key to send and read encrypted messages</Button>}
          <AnimatePresence initial={false}>{currentReply && <motion.div className="composing-context-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2, ease: [.33, 1, .68, 1] }}><div className="composing-context">{editing ? <Pencil size={13} /> : <Reply size={13} />}<span>{editing ? "Editing your message" : `Replying to ${currentReply.actor.login}`}<small>{currentReply.text.slice(0, 80)}</small></span><Button variant="ghost" size="icon-xs" aria-label="Cancel reply or edit" onClick={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }}><X /></Button></div></motion.div>}</AnimatePresence>
          {room.kind === "channel" && room.canWrite === false && <div className="channel-subscription"><Button variant={rooms.some(item => item.id.toLowerCase() === room.id.toLowerCase()) ? "ghost" : "default"} disabled={sending} onClick={() => { if (rooms.some(item => item.id.toLowerCase() === room.id.toLowerCase())) { const id = room.id.toLowerCase(); setMutedRooms(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]); } else void subscribe("subscribe"); }}>{rooms.some(item => item.id.toLowerCase() === room.id.toLowerCase()) ? mutedRooms.includes(room.id.toLowerCase()) ? "Unmute" : "Mute" : "Join Channel"}</Button></div>}
          {room.canWrite !== false && <form className={`composer ${text.trim() ? "has-text" : ""}`} onSubmit={send}>
            <div className="composer-input-shell"><div className="attachment-controls"><MediaComposer key={room.id} disabled={!canSend || sending || cooldown > 0 || calls.busy} onSend={sendMedia} onError={onError} onActiveChange={setVoiceActive} /></div>
            <Textarea ref={composer} aria-label="Message" disabled={voiceActive} placeholder={security.enabled && !security.hasKey ? "Import the room key to unlock…" : editing ? "Edit message…" : "Message"} rows={1} maxLength={MAX_TEXT} value={text} onChange={e => { setText(e.target.value); if (security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, e.target.value); }} onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } if (e.key === "ArrowUp" && !text) { const last = [...messages].reverse().find(m => m.actor.id === actor.id && !m.deleted && !m.locked && m.text.trim()); if (last) { setEditing(last); setText(last.text); } } }} />
            <EmojiPicker open={emojiPicker} onOpenChange={setEmojiPicker} onSelect={emoji => { const input = composer.current; const start = input?.selectionStart ?? text.length; const end = input?.selectionEnd ?? start; const next = text.slice(0, start) + emoji + text.slice(end); if (next.length > MAX_TEXT) return; setText(next); if (security.loaded && !security.enabled) writeLocal(`gitmsg:draft:${room.id}`, next); input?.focus(); later(() => input?.setSelectionRange(start + emoji.length, start + emoji.length), 0); }} /></div>
            {text.length > 3500 && <span className="character-count">{text.length}/{MAX_TEXT}</span>}
            <ParticleButton className="send-button" size="icon-lg" type="submit" status={sending ? "pending" : "idle"} pendingLabel={<span className="sr-only">Committing</span>} particles={false} disabled={sending || !text.trim() || cooldown > 0 || !canSend} aria-label={editing ? "Save edit" : "Send message"} icon={editing ? <Check /> : <Send />}><span className="sr-only">{editing ? "Save" : "Send"}</span></ParticleButton>
          </form>}
          <div className="sr-only">{security.enabled ? "Browser-encrypted · keys stay on your devices" : "Stored on GitHub · standard mode is not encrypted"}</div>
        </div>
        {terminal && <div className="terminal-panel"><div><span>Activity log</span><Button variant="ghost" size="icon-xs" aria-label="Close log" onClick={() => setTerminal(false)}><X /></Button></div><pre>{logs.join("\n")}</pre></div>}
    </section>
    <AnimatePresence>{roomInfo && room.id && <RoomInfo key={room.id} room={room} messages={messages} encrypted={security.enabled} subscribed={rooms.some(item => item.id.toLowerCase() === room.id.toLowerCase())} muted={mutedRooms.includes(room.id.toLowerCase())} busy={sending} onProfile={room.peer ? () => openUser(room.peer!) : undefined} onCall={callableRoom(room, actor) ? () => requestCall(room) : undefined} onClose={() => { setRoomInfo(false); document.querySelector<HTMLButtonElement>(".channel-title")?.focus({ preventScroll: true }); }} onSecurity={() => { setRoomInfo(false); setModal("security"); setSidebar(true); }} onLeave={() => void subscribe("remove")} onToggleMute={() => { const id = room.id.toLowerCase(); setMutedRooms(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]); }} />}</AnimatePresence>

      </div>
      <div className="sync-status sr-only" role="status">{cooldown ? `Retry in ${cooldown}s` : syncing ? "Syncing…" : lastSync ? `Synced ${time(lastSync)}` : "Connecting…"}</div></>}
      </section>
    </FramePanel></Frame></main>

    <AudioCallPanel view={calls.view} blocked={calls.blocked} quiet={calls.quiet} onAccept={() => { if (!voiceActive) void calls.accept(); else notify("Finish your voice recording before accepting."); }} onEnd={() => void calls.end()} onMute={calls.mute} onOutput={calls.output} onClose={calls.dismiss} />
    {toast && <div className="toast" role="status"><Check size={14} /><span>{toast}</span><Button variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={() => setToast("")}><X /></Button></div>}
    <Dialog open={modal !== null && !sidebarModal} onOpenChange={open => { if (!open && !sidebarModal) setModal(null); }}><DialogContent className={`modal ${modal === "help" ? "wide" : ""}`} aria-describedby="dialog-description"><DialogTitle className="sr-only">{modal === "connect" ? "Sign in with GitHub" : modal === "join" ? "Join chat" : modal === "invite" ? "Invite a collaborator" : modal === "help" ? "README and keyboard shortcuts" : modal === "inspect" ? "Inspect commit" : modal === "delete" ? "Hide message" : modal === "security" ? "Room security" : modal === "proposals" ? "Message proposals" : modal === "bot" ? "GitHub Actions participant" : modal === "clients" ? "Other chat clients" : modal === "tools" ? "Chat tools" : "Preferences"}</DialogTitle><DialogDescription id="dialog-description" className="sr-only">{modal === "connect" ? "Authorize GitHub to create and access your chat repositories." : "Manage your gitmsg conversation."}</DialogDescription>
      {modal === "connect" && <AuthPanel session={session} onContinue={() => setModal(invitedRepo ? "join" : "new")} onClose={() => setModal(null)} />}
      {modal === "join" && session?.user && <JoinChat repo={invitedRepo} login={session.user.login} onDone={completeJoin} />}
      {modal === "inspect" && selected && <><h2>Receipts</h2><div className="commit-detail"><div><span>SHA</span><code>{selected.sha || "Sync to retrieve SHA"}</code></div><div><span>Author</span><b>@{selected.actor.login}</b></div><div><span>Date</span><span>{new Date(selected.createdAt).toLocaleString("en-US")}</span></div><div><span>Branch</span><code>{room.branch}</code></div></div><h3>Loaded version history</h3>{timeline.events.filter(e => e.id === selected.id || e.target === selected.id).filter(e => e.kind !== "reaction").map(e => <div key={e.id} className="receipt"><small>{e.kind} · {new Date(e.createdAt).toLocaleString()} · {e.sha?.slice(0, 7)}</small><p>{e.text || (e.kind === "delete" ? "Hidden from conversation; old content remains in Git." : "Attachment")}</p></div>)}{selected.url && <Button render={<a href={selected.url} target="_blank" rel="noreferrer" />}>View on GitHub<ExternalLink /></Button>}<Button variant="outline" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Copy />Copy decrypted JSON</Button></>}
      {modal === "delete" && <><h2>Hide message?</h2><p>The message will be hidden in this chat. Its original text remains in Git history and downloaded copies. This is not secure erasure.</p><Button disabled={sending} loading={sending} onClick={() => void removeMessage()}><Trash2 />Hide message</Button><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button></>}
    </DialogContent></Dialog>
  </div>;
}

function NewRoom({ kind, session, onConnect, onDone, onWarning }: { kind: ConversationKind; session: SessionInfo | null; onConnect: () => void; onDone: (room: Room) => void; onWarning: (message: string) => void }) {
  const tab = kind === "chat" ? "create" : kind;
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [found, setFound] = useState<Room[]>([]);
  const [joining, setJoining] = useState("");
  const [description, setDescription] = useState(""); const [publicConfirmed, setPublicConfirmed] = useState(false);
  const [avatar, setAvatar] = useState<string>(); const [photoBusy, setPhotoBusy] = useState(false); const photo = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError("");
    try {
      if (tab === "connect") { const repo = name.trim().replace(/^https:\/\/github.com\//, "").replace(/\/$/, ""); try { const result = await api<{ room: Room }>(`/api/repos?${new URLSearchParams({ repo })}`); onDone(result.room); } catch (error) { if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error; sessionStorage.setItem("gitmsg:invite", repo); setJoining(repo); } }
      else { const title = name.trim(); const result = await api<{ room: Room; warning?: string }>("/api/repos", { method: "POST", body: JSON.stringify({ name: roomRepositoryName(title, crypto.randomUUID()), title, ...(avatar ? { avatar } : {}), kind: tab === "channel" ? "channel" : "chat", description, public: publicConfirmed }) }); onDone(result.room); if (result.warning) onWarning(result.warning); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open conversation."); } finally { setBusy(false); }
  }
  async function discover() { setBusy(true); try { const result = await api<{ rooms: Room[] }>("/api/repos"); setFound(result.rooms); if (!result.rooms.length) setError("No gitmsg- repositories found in the 100 most recently pushed repositories. Enter any writable repo above."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (joining && session?.user) return <><JoinChat repo={joining} login={session.user.login} onDone={onDone} /><Button variant="ghost" onClick={() => setJoining("")}>Back</Button></>;
  return <div className="new-conversation-screen">{tab === "connect" ? <div className="new-chat-avatar"><BookOpen /></div> : <><input ref={photo} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={async event => { const image = event.target.files?.[0]; event.target.value = ""; if (!image) return; setPhotoBusy(true); setError(""); try { setAvatar(await avatarImage(image)); } catch (error) { setError((error as Error).message); } finally { setPhotoBusy(false); } }} /><button type="button" className="new-chat-avatar" aria-label={tab === "channel" ? "Set channel photo" : "Set chat photo"} onClick={() => photo.current?.click()} disabled={busy || photoBusy}>{avatar && <img src={avatar} alt="" />}<Camera /></button></>}
    {!session?.user ? <><p>Sign in with GitHub to open a conversation.</p><Button onClick={onConnect}><Github />Sign in with GitHub</Button></> : <form className="new-room-form" onSubmit={submit}>
      <label className="profile-field outlined-field"><span className="field-caption">{tab === "connect" ? "Repository" : tab === "channel" ? "Channel name" : "Chat name"}</span><Input id="room-name" placeholder={tab === "connect" ? "octocat/gitmsg-friends" : undefined} value={name} onChange={e => setName(e.target.value)} maxLength={tab === "connect" ? 200 : 100} autoComplete="off" required /></label>
      {tab === "channel" && <><label className="profile-field outlined-field"><span className="field-caption">Description (optional)</span><Input value={description} maxLength={250} onChange={event => setDescription(event.target.value)} /></label><p className="new-channel-note">You can provide an optional description for your channel.</p><label className="check-label"><input type="checkbox" checked={publicConfirmed} onChange={event => setPublicConfirmed(event.target.checked)} />Posts and Git history will be public on GitHub.</label></>}
      {tab !== "channel" && <p className="fine-print">{tab === "connect" ? "Connect an existing chat or public channel." : "Creates a private gitmsg- repository in your account."}</p>}
      {session?.installUrl && <Button variant="link" render={<a href={session.installUrl} target="_blank" rel="noreferrer" />}>Install GitHub App<ExternalLink /></Button>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button type="submit" className="create-chat-next" loading={busy} disabled={busy || photoBusy || !name.trim() || (tab === "channel" && !publicConfirmed)} aria-label={tab === "connect" ? "Open chat" : tab === "channel" ? "Create channel" : "Create chat"}><ArrowRight /></Button>
      {tab === "connect" && <Button variant="ghost" onClick={() => void discover()} disabled={busy}>Find my repositories</Button>}
      {found.length > 0 && <div className="found-repos">{found.map(r => <Button variant="ghost" key={r.id} onClick={() => onDone(r)}><BookOpen />{r.id}<ArrowRight /></Button>)}</div>}
    </form>}
  </div>;
}
