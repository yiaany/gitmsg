import { useEffect, useRef, useState } from "react";
import { useBlur, useFocus, useKeyboard, usePaste, useRenderer, useTerminalDimensions, type InputProps } from "@opentui/react";
import { ClientError, publicError, terminalText } from "./safety";
import { requestDeviceCode, waitForAuthorization, type DeviceCode } from "./device-flow";
import { forgetCredential, readCredential, saveCredential, type Vault } from "./credentials";
import { GitHub } from "./github";
import { Rooms, loadRoomKey, type History, type Invitation, type TerminalRoom } from "./rooms";
import type { Actor, Attachment, Message } from "../../src/lib/protocol";
import { command, commandSuggestions, roomLink } from "./commands";
import { localImage, pastedImagePath, type LocalImage } from "./images";
import { clipboardImage, subscribeImages } from "./image-input";
import { ChatImage, checkImage, ImageLightbox, ImageView } from "./image-view";
import { Help } from "./help";
import { conversationName } from "./presentation";
import { ChatRow, FocusFrame, MessageBubble, Panel, Reveal, SendActivity } from "./motion";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { ThemeContext, useTheme } from "./theme";
import { THEMES, themeById, type Theme } from "./themes";
import { Brand } from "./brand";
import { CommandMenu } from "./command-menu";
import { Composer } from "./composer";
import { copyText as writeClipboard, type CopyText } from "./clipboard";
import { messageCopyTargets } from "./clipboard-targets";
import { GITHUB_DEVICE_URL, openGitHubLogin, type OpenBrowser } from "./browser";
import { exportKey, generateKey, keyFingerprint } from "../../src/lib/room-crypto";
import { privateBackupPath, readPrivateBackup, readRoomKey, savePrivateBackup, saveRoomKey } from "./room-keys";
import { voiceDriver, type VoiceDriver } from "./voice";
import { VoiceMessage, VoiceRecorder } from "./voice-view";
import type { LocalVoice } from "./voice-data";
import { TerminalCalls, type TerminalCallView } from "./calls";
import { CallPanel } from "./call-view";
import type { CallDeviceFactory, CallLevels } from "./call-device";

type Screen = "loading" | "signin" | "client" | "device" | "choose" | "join" | "name" | "confirm" | "chat" | "logout" | "help" | "invite" | "inviteConfirm" | "inviteDone" | "inbox" | "accept" | "image" | "themes" | "remove" | "voice" | "secure" | "call" | "callConfirm";
type Focus = "composer" | "history" | "sidebar" | "invite";
export type AppProps = { vault: Vault; initialClientId?: string; initialRepo?: string; initialToken?: string; roomKey?: CryptoKey | null; createRooms?: (token: string) => Rooms; readLocalImage?: typeof localImage; readClipboardImage?: typeof clipboardImage; receiveImages?: typeof subscribeImages; copyText?: CopyText; openBrowser?: OpenBrowser; audio?: VoiceDriver; callDevice?: CallDeviceFactory; readKeyBackup?: typeof readPrivateBackup; reducedMotion?: boolean; initialTheme?: string };

// Explicit focused colors and a line cursor prevent a block cursor from painting
// the first placeholder letter white when the empty input receives focus.
function Field(props: InputProps) {
  const c = useTheme();
  return <input width="100%" backgroundColor={c.panel} focusedBackgroundColor={c.panel} textColor={c.text} focusedTextColor={c.text} placeholderColor={c.muted} cursorColor={c.accent} cursorStyle={{ style: "line", blinking: true }} {...props} />;
}

export function App(props: AppProps) {
  const [theme, setTheme] = useState(() => themeById(props.initialTheme));
  return <ThemeContext.Provider value={theme.colors}><Messenger {...props} theme={theme} setTheme={setTheme} /></ThemeContext.Provider>;
}

function Messenger({ vault, initialClientId = "", initialRepo, initialToken, roomKey = null, createRooms, readLocalImage = localImage, readClipboardImage = clipboardImage, receiveImages = subscribeImages, copyText, openBrowser = openGitHubLogin, audio, callDevice, readKeyBackup = readPrivateBackup, reducedMotion = false, theme, setTheme }: AppProps & { theme: Theme; setTheme: (theme: Theme) => void }) {
  const c = useTheme();
  const selection = { backgroundColor: c.panel, focusedBackgroundColor: c.panel, textColor: c.muted, focusedTextColor: c.text, selectedBackgroundColor: c.elevated, selectedTextColor: c.accent, showDescription: false };
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [screen, setScreen] = useState<Screen>("loading");
  const screenRef = useRef(screen); screenRef.current = screen;
  const [clientId, setClientId] = useState(initialClientId);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const openingBrowser = useRef(false);
  const [actor, setActor] = useState<Actor | null>(null);
  const [rooms, setRooms] = useState<string[]>([]);
  const [room, setRoom] = useState<TerminalRoom | null>(null);
  const [removeId, setRemoveId] = useState("");
  const hiddenRooms = useRef(new Set<string>());
  const [securePolicy, setSecurePolicy] = useState(false);
  const [secureKey, setSecureKey] = useState<CryptoKey | null>(null);
  const [secureBackup, setSecureBackup] = useState(false);
  const [secureRooms, setSecureRooms] = useState(new Set<string>());
  const driver = audio ?? voiceDriver();
  const [history, setHistory] = useState<History>();
  const calls = useRef<TerminalCalls | null>(null);
  const [callView, setCallView] = useState<TerminalCallView | null>(null);
  const [callLevels, setCallLevels] = useState<CallLevels>({ local: 0, remote: 0 });
  const callTarget = useRef<TerminalRoom | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [composerRows, setComposerRows] = useState(1);
  const [reply, setReply] = useState<Message | null>(null);
  const [replyFocusRequest, setReplyFocusRequest] = useState(0);
  const replies = useRef(new Map<string, Message>());
  const [repoInput, setRepoInput] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [image, setImage] = useState<LocalImage | null>(null);
  const [viewedImage, setViewedImage] = useState<{ room: TerminalRoom; attachment: Attachment } | null>(null);
  const viewingImage = useRef(false); viewingImage.current = !!viewedImage;
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const themeBefore = useRef(theme);
  const themesReturn = useRef<Screen>("choose");
  const [focus, setFocus] = useState<Focus>("composer");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [peers, setPeers] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [roomBranches, setRoomBranches] = useState<Record<string, string>>({});
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const sidebar = useRef<ScrollBoxRenderable | null>(null);
  const timeline = useRef<ScrollBoxRenderable | null>(null);
  const service = useRef<Rooms | null>(null);
  const viewer = useRef<Actor | null>(null);
  const savedCredential = useRef(false);
  const alive = useRef(true), active = useRef(true), working = useRef(false);
  const authorization = useRef<AbortController | null>(null);
  const lifetime = useRef(new AbortController());
  const historyRequest = useRef<AbortController | null>(null);
  const historyRef = useRef<History | undefined>(undefined);
  const roomRef = useRef<TerminalRoom | null>(null);
  const histories = useRef(new Map<string, History>());
  const roomCache = useRef(new Map<string, TerminalRoom>());
  const navigation = useRef(0);
  const attaching = useRef(false);
  const drafts = useRef(new Map<string, string>());
  const draftRef = useRef("");
  const pollCooldown = useRef(0);
  useEffect(() => {
    if (!process.connected || !process.send) return;
    let previous = "";
    const publish = () => {
      const targets = screenRef.current === "chat" && !viewingImage.current ? messageCopyTargets(renderer, historyRef.current?.messages ?? [], terminalText) : [];
      const serialized = JSON.stringify(targets);
      if (serialized !== previous && process.connected) { previous = serialized; process.send?.({ type: "gitmsg:copy-targets", targets }); }
    };
    renderer.addPostProcessFn(publish);
    return () => { renderer.removePostProcessFn(publish); if (process.connected) process.send?.({ type: "gitmsg:copy-targets", targets: [] }); };
  }, [renderer]);
  const roomKeyId = (target: TerminalRoom) => `${target.id.toLowerCase()}:${target.branch}`;
  const hiddenSlot = (account: number) => ({ service: "fun.gitmsg.terminal.ui", name: `${account}:hidden-chats` });
  async function rememberHidden() {
    if (!viewer.current) return;
    try { await vault.set({ ...hiddenSlot(viewer.current.id), value: JSON.stringify([...hiddenRooms.current]), persist: "local" }); }
    catch { setNotice("Chat list changed for this session only · local storage unavailable."); }
  }
  function requestRemove(id: string) { if (!working.current) { setRemoveId(id); setScreen("remove"); } }
  async function removeChat() {
    const id = removeId;
    hiddenRooms.current.add(id.toLowerCase());
    const remaining = rooms.filter(room => room.toLowerCase() !== id.toLowerCase());
    setRooms(remaining); setSidebarIndex(0);
    if (roomRef.current?.id.toLowerCase() === id.toLowerCase()) {
      navigation.current++; historyRequest.current?.abort(); historyRequest.current = null;
      if (remaining[0]) await open(remaining[0]);
      else { roomRef.current = null; historyRef.current = undefined; setRoom(null); setHistory(undefined); setReply(null); setScreen("choose"); }
    } else back();
    await rememberHidden();
  }
  function showVoice() {
    if (!roomRef.current?.canWrite || working.current || calls.current?.busy) return;
    setNotice(""); setScreen("voice");
  }
  async function sendVoice(voice: LocalVoice) {
    if (working.current || !service.current || !roomRef.current || !actor) return;
    working.current = true; setBusy(true);
    const target = roomRef.current;
    try {
      const attachment = await service.current.uploadVoice(target, voice, true, historyRef.current);
      await service.current.send(target, actor, "", historyRef.current, [attachment], reply?.id);
      setReplyTarget(null); setScreen("chat"); setNotice("Voice sent");
      try { await refresh(target, true); } catch { errorNotice(new ClientError("Voice sent, but refresh failed. Do not resend.")); }
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function errorNotice(error: unknown) { if (alive.current) { setNoticeIsError(true); setNotice(publicError(error)); } }
  async function openLogin() {
    if (openingBrowser.current) return;
    openingBrowser.current = true;
    try { await openBrowser(); } catch (error) { errorNotice(error); }
    finally { openingBrowser.current = false; }
  }
  async function copy(value: string, inline = false) {
    try {
      const result = await (copyText ? copyText(value) : writeClipboard(value, renderer));
      if (alive.current && !inline) { setNoticeIsError(false); setNotice(result === "copied" ? "Copied" : "Copy requested · check your clipboard"); }
      return result;
    } catch (error) { if (!inline) errorNotice(error); return "failed" as const; }
  }
  function setReplyTarget(message: Message | null) {
    if (!roomRef.current) return;
    const key = roomKeyId(roomRef.current);
    if (message) replies.current.set(key, message); else replies.current.delete(key);
    setReply(message);
    setFocus("composer");
    // The same target can be clicked twice; native mouse focus still changes.
    setReplyFocusRequest(value => value + 1);
  }
  function updateDraft(value: string) {
    setSlashIndex(0); setSlashDismissed(false);
    draftRef.current = value; setDraft(value);
    if (roomRef.current) drafts.current.set(roomKeyId(roomRef.current), value);
  }
  function updateCommand(value: string) { setCommandInput(value); setSlashIndex(0); setSlashDismissed(false); }
  const slashValue = screen === "chat" && focus === "composer" ? draft : screen === "choose" ? commandInput : "";
  const suggestions = commandSuggestions(slashValue);
  const showCommands = !busy && !slashDismissed && suggestions.length > 0;
  function completeCommand(usage: string) {
    const value = usage.split(" ")[0] + (usage.includes(" ") ? " " : "");
    if (screen === "chat") updateDraft(value); else updateCommand(value);
    setSlashDismissed(true);
  }
  async function refresh(target = roomRef.current, force = false) {
    if (!target || !service.current) return;
    const source = service.current;
    if (historyRequest.current) { if (!force) return; historyRequest.current.abort(); }
    const controller = new AbortController(); historyRequest.current = controller;
    try {
      const next = await source.history(target, force ? undefined : histories.current.get(roomKeyId(target)), controller.signal);
      if (controller.signal.aborted || !alive.current || service.current !== source) return;
      histories.current.set(roomKeyId(target), next);
      void calls.current?.observe(target, next.events);
      const last = next.messages.at(-1);
      if (last) setPreviews(value => ({ ...value, [target.id]: last.locked ? "Encrypted message" : terminalText(last.text || (last.attachments?.length ? "Image attachment" : "Message"), 30).replace(/\s+/g, " ") }));
      if (roomRef.current && roomKeyId(roomRef.current) === roomKeyId(target)) { historyRef.current = next; setHistory(next); }
    } finally { if (historyRequest.current === controller) historyRequest.current = null; }
  }
  async function open(input: string, nextFocus: Focus = "composer") {
    if (!service.current) return;
    const source = service.current;
    const id = roomLink(input), request = ++navigation.current;
    // Previously validated metadata is a UI cache only. Every write still validates
    // repository visibility, write access, branch and encryption against GitHub.
    const next = roomCache.current.get(id.toLowerCase()) ?? await source.open(id);
    if (!alive.current || request !== navigation.current || service.current !== source) return;
    roomCache.current.set(next.id.toLowerCase(), next);
    if (hiddenRooms.current.delete(next.id.toLowerCase())) void rememberHidden();
    renderer.clearSelection();
    if (roomRef.current) drafts.current.set(roomKeyId(roomRef.current), draftRef.current);
    historyRequest.current?.abort(); historyRequest.current = null;
    const previous = histories.current.get(roomKeyId(next));
    historyRef.current = previous; roomRef.current = next;
    setHistory(previous); setRoom(next); updateDraft(drafts.current.get(roomKeyId(next)) ?? "");
    setReply(replies.current.get(roomKeyId(next)) ?? null);
    setTitles(value => ({ ...value, [next.id]: next.title }));
    setRoomBranches(value => ({ ...value, [next.id]: next.branch }));
    const peer = next.participants?.find(login => login.toLowerCase() !== viewer.current?.login.toLowerCase());
    if (peer) setPeers(value => ({ ...value, [next.id]: peer }));
    setRooms(value => value.includes(next.id) ? value : [...value, next.id]);
    setSidebarIndex(Math.max(0, rooms.indexOf(next.id)));
    setFocus(nextFocus); setScreen("chat"); setNotice("");
    // Never disable the input or block another selection on history I/O.
    void refresh(next).catch(error => { if (request === navigation.current) errorNotice(error); });
  }
  async function connected(token: string) {
    const next = createRooms ? createRooms(token) : new Rooms(new GitHub(token, fetch, lifetime.current.signal), roomKey);
    const user = await next.user();
    if (!alive.current) return;
    service.current = next; viewer.current = user; setActor(user); setScreen("choose");
    next.setKeyLoader(async target => await readRoomKey(vault, user.id, target) ?? await readKeyBackup(user.id, target));
    calls.current?.dispose();
    calls.current = new TerminalCalls(next, user, view => {
      if (!alive.current) return;
      setCallView(view);
      if (view?.phase === "incoming" && screenRef.current !== "voice") setScreen("call");
    }, value => { if (alive.current) setCallLevels(value); }, callDevice);
    try {
      try {
        const raw = await vault.get(hiddenSlot(user.id)), ids: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(ids)) hiddenRooms.current = new Set(ids.filter((id): id is string => typeof id === "string" && /^[a-z0-9-]+\/[a-z0-9_.-]+$/.test(id)).slice(0, 200));
      } catch { /* An unavailable keychain must not block session-only sign-in. */ }
      const list = (await next.list()).filter(id => !hiddenRooms.current.has(id.toLowerCase()));
      if (!alive.current || service.current !== next) return;
      setRooms(list);
      // Bounded read-only decoration; don't expose raw repository IDs while it loads.
      void (async () => {
        for (let start = 0; start < Math.min(24, list.length) && alive.current && service.current === next; start += 3) {
          await Promise.allSettled(list.slice(start, start + 3).map(async id => {
            const metadata = await next.open(id);
            if (!alive.current || service.current !== next) return;
            roomCache.current.set(id.toLowerCase(), metadata);
            setTitles(value => ({ ...value, [id]: metadata.title }));
            const peer = metadata.participants?.find(login => login.toLowerCase() !== user.login.toLowerCase());
            if (peer) setPeers(value => ({ ...value, [id]: peer }));
          }));
        }
      })();
    } catch (error) { errorNotice(error); }
    if (initialRepo && alive.current && service.current === next) {
      try { await open(initialRepo); }
      catch (error) {
        if (error instanceof ClientError && error.status === 404) { try { await runCommand(`/join ${initialRepo}`); } catch (joinError) { errorNotice(joinError); } }
        else errorNotice(error);
      }
    }
  }
  async function task(run: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setNotice(""); setNoticeIsError(false);
    try { await run(); } catch (error) {
      if (error instanceof ClientError) pollCooldown.current = Math.max(pollCooldown.current, Date.now() + error.retryAfterMs);
      errorNotice(error);
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        if (initialToken) { await connected(initialToken); return; }
        let credential;
        try { credential = await readCredential(vault); }
        catch { setNotice("Keychain unavailable · sign-in will last for this session only."); }
        if (!alive.current) return;
        if (credential) { savedCredential.current = true; setClientId(credential.clientId); await connected(credential.token); }
        else setScreen(initialClientId ? "signin" : "client");
      } catch (error) { if (alive.current) { setScreen(initialClientId ? "signin" : "client"); errorNotice(error); } }
    })();
    return () => { alive.current = false; calls.current?.dispose(); authorization.current?.abort(); historyRequest.current?.abort(); lifetime.current.abort(); };
  }, []);
  useEffect(() => {
    if (!notice || noticeIsError || busy) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice, noticeIsError, busy]);
  useFocus(() => { active.current = true; });
  useBlur(() => { active.current = false; });
  useEffect(() => {
    if (screen !== "chat" && screen !== "call" && !calls.current?.busy) return;
    let stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      try { if (Date.now() >= pollCooldown.current) { await refresh(); const calling = calls.current?.activeRoom; if (calling && calling.id !== roomRef.current?.id) await refresh(calling); } failures = 0; }
      catch (error) {
        if (!stopped) { failures++; errorNotice(error); }
        if (error instanceof ClientError) pollCooldown.current = Date.now() + error.retryAfterMs;
      }
      if (!stopped) timer = setTimeout(poll, Math.max(calls.current?.busy ? 3000 : active.current ? 5000 : 60000, Math.min(60000, (calls.current?.busy ? 3000 : 5000) * 2 ** failures), pollCooldown.current - Date.now()));
    };
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [screen, room?.id, room?.branch, !!callView && callView.phase !== "finished"]);
  useEffect(() => {
    if (screen === "chat" && focus === "sidebar") sidebar.current?.scrollChildIntoView(`sidebar-row-${sidebarIndex}`, { align: "nearest" });
  }, [sidebarIndex, focus, screen]);
  useEffect(() => {
    // Mouse focus may move into the timeline before a Reply click is handled.
    // Reassert editor focus even when the React focus value was already composer.
    if (screen === "chat" && focus === "composer" && !viewedImage) (renderer.root.findDescendantById("composer") as TextareaRenderable | undefined)?.focus();
  }, [replyFocusRequest, focus, screen, viewedImage]);
  useEffect(() => { if (width < 90 && focus === "sidebar") setScreen("choose"); }, [width]);
  function focusSidebar() {
    setSidebarIndex(Math.max(0, rooms.indexOf(roomRef.current?.id ?? "")));
    if (width < 90) { setPickerIndex(Math.max(0, rooms.indexOf(roomRef.current?.id ?? ""))); setScreen("choose"); }
    else setFocus("sidebar");
  }
  function showInvite() { if (!working.current && roomRef.current) { setInviteLogin(""); setScreen("invite"); } }
  function back() { if (screenRef.current === "image") setImage(null); setScreen(roomRef.current ? "chat" : actor ? "choose" : initialClientId ? "signin" : "client"); setNotice(""); setFocus("composer"); }
  function selectRoom(id: string, nextFocus: Focus = "composer") {
    const request = navigation.current + 1;
    void open(id, nextFocus).catch(error => { if (request === navigation.current) errorNotice(error); });
  }
  function stageImage(preview: LocalImage) {
    if (screenRef.current !== "chat" || !roomRef.current || working.current || viewingImage.current) throw new ClientError("Open a chat and finish the current action before attaching an image.");
    if (!roomRef.current.canWrite) throw new ClientError("This conversation is read-only.");
    checkImage(preview.bytes); setImage(preview); setScreen("image");
  }
  async function attach(read: () => Promise<LocalImage>) {
    const target = roomRef.current, request = navigation.current;
    if (!target || working.current || attaching.current || screenRef.current !== "chat") return;
    attaching.current = true;
    try {
      const preview = await read();
      if (!alive.current) return;
      if (roomRef.current !== target || request !== navigation.current) throw new ClientError("Conversation changed. Paste the image again in the intended chat.");
      stageImage(preview);
    } catch (error) { errorNotice(error); }
    finally { attaching.current = false; }
  }
  useEffect(() => receiveImages(preview => { try { stageImage(preview); } catch (error) { errorNotice(error); } }, errorNotice), [receiveImages]);
  usePaste(event => {
    if (screen !== "chat" || focus !== "composer" || working.current || viewedImage) return;
    const path = pastedImagePath(new TextDecoder().decode(event.bytes));
    if (!path) return;
    event.preventDefault();
    void attach(() => readLocalImage(path));
  });
  useKeyboard(key => {
    const copyShortcut = key.name === "c" && (key.ctrl || key.meta || key.super);
    if (copyShortcut) {
      const editor = renderer.root.findDescendantById("composer") as TextareaRenderable | undefined;
      const selected = renderer.getSelection()?.getSelectedText() || (editor?.hasSelection() ? editor.getSelectedText() : "");
      if (selected || key.shift || key.meta || key.super) { key.preventDefault(); if (selected) void copy(selected); return; }
      if (key.ctrl) { key.preventDefault(); alive.current = false; calls.current?.dispose(); authorization.current?.abort(); historyRequest.current?.abort(); lifetime.current.abort(); renderer.destroy(); return; }
    }
    if (viewedImage) {
      key.preventDefault();
      if (key.name === "escape" || key.name === "return") setViewedImage(null);
      return;
    }
    if (screen === "call") {
      key.preventDefault();
      if (key.name === "h") { void calls.current?.end().catch(errorNotice); if (!callView) back(); }
      if (key.name === "m") calls.current?.mute();
      if (key.name === "a" && callView?.phase === "incoming") void calls.current?.accept().catch(errorNotice);
      if (key.name === "escape") { if (!callView) void calls.current?.end().catch(errorNotice); if (callView?.phase === "finished") calls.current?.dismiss(); back(); }
      return;
    }
    if (screen === "device" && key.name === "return") { key.preventDefault(); void openLogin(); return; }
    if (screen === "voice") {
      if (key.name === "escape" && !working.current) { key.preventDefault(); back(); }
      return;
    }
    if (screen === "themes") {
      if (["up", "down", "return", "escape"].includes(key.name)) {
        key.preventDefault();
        if (key.name === "escape") { setTheme(themeBefore.current); setScreen(themesReturn.current); }
        else if (key.name === "return") { setScreen(themesReturn.current); }
        else setTheme(THEMES[(THEMES.indexOf(theme) + (key.name === "down" ? 1 : -1) + THEMES.length) % THEMES.length]);
        return;
      }
    }
    if (showCommands && ["up", "down", "tab", "return", "escape"].includes(key.name)) {
      if (key.name === "return" && suggestions.some(([usage]) => usage.split(" ")[0] === slashValue)) { /* An exact command runs normally. */ }
      else {
        key.preventDefault();
        if (key.name === "escape") setSlashDismissed(true);
        else if (key.name === "tab" || key.name === "return") completeCommand(suggestions[Math.min(slashIndex, suggestions.length - 1)][0]);
        else setSlashIndex(value => (value + (key.name === "down" ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
    }
    if (key.name === "escape") {
      key.preventDefault();
      if (screen === "device") { authorization.current?.abort(); return; }
      if (!working.current) {
        if (screen === "chat") {
          if (reply && focus === "composer") { setReplyTarget(null); return; }
          if (focus === "composer" || focus === "invite") setFocus("history");
          else if (focus === "history") focusSidebar();
          else { setScreen("choose"); setCommandInput(""); }
        } else back();
      }
      return;
    }
    if (screen === "chat" && !busy) {
      if (key.ctrl && key.name === "v") {
        key.preventDefault();
        if (renderer.capabilities?.remote && readClipboardImage === clipboardImage) errorNotice(new ClientError("Use your terminal's image paste, drop a file, or /attach. The remote host clipboard is not read."));
        else void attach(readClipboardImage);
        return;
      }
      if (key.ctrl && key.name === "g") { key.preventDefault(); showInvite(); return; }
      if (key.name === "tab") {
        key.preventDefault();
        const order: Focus[] = width >= 90 ? ["sidebar", "history", "invite", "composer"] : ["history", "invite", "composer"];
        setFocus(order[(order.indexOf(focus) + (key.shift ? -1 : 1) + order.length) % order.length]); return;
      }
      if (focus === "sidebar") {
        if (["delete", "backspace", "x"].includes(key.name) && rooms[sidebarIndex]) { key.preventDefault(); requestRemove(rooms[sidebarIndex]); return; }
        if (["up", "down", "home", "end"].includes(key.name)) {
          key.preventDefault(); setSidebarIndex(value => key.name === "home" ? 0 : key.name === "end" ? rooms.length + 2 : Math.max(0, Math.min(rooms.length + 2, value + (key.name === "down" ? 1 : -1)))); return;
        }
        if (key.name === "return") { key.preventDefault(); choose(String(options[sidebarIndex]?.value ?? room?.id)); return; }
        if (key.name === "right") {
          key.preventDefault();
          const id = rooms[sidebarIndex];
          if (id && id !== roomRef.current?.id) selectRoom(id, "composer");
          else setFocus("composer");
          return;
        }
      } else if (focus === "history") {
        if (key.name === "left") { key.preventDefault(); focusSidebar(); return; }
        if (key.name === "right") { key.preventDefault(); setFocus("composer"); return; }
        if (key.name === "return" || key.name === "down" && timeline.current && timeline.current.scrollTop >= timeline.current.scrollHeight - timeline.current.viewport.height) { key.preventDefault(); setFocus("composer"); return; }
      } else if (focus === "invite") {
        if (key.name === "return") { key.preventDefault(); showInvite(); return; }
        if (key.name === "left") { key.preventDefault(); setFocus("history"); return; }
        if (key.name === "down") { key.preventDefault(); setFocus("composer"); return; }
      } else if (focus === "composer") {
        if (key.name === "up" && !key.shift && !key.ctrl && !key.meta) {
          const editor = renderer.root.findDescendantById("composer") as TextareaRenderable | undefined;
          if (editor && editor.scrollY + editor.visualCursor.visualRow === 0) { key.preventDefault(); setFocus("history"); return; }
        }
        if (key.name === "left" && !key.shift && !key.ctrl && (!draftRef.current || (renderer.root.findDescendantById("composer") as TextareaRenderable | undefined)?.cursorOffset === 0)) { key.preventDefault(); focusSidebar(); return; }
        if (key.meta && key.name === "left") { key.preventDefault(); focusSidebar(); return; }
      }
    }
    if (actor && key.ctrl && key.name === "k" && !working.current) { key.preventDefault(); setPickerIndex(Math.max(0, rooms.indexOf(roomRef.current?.id ?? ""))); setScreen("choose"); setCommandInput(""); }
    if (screen === "choose" && !commandInput && ["up", "down"].includes(key.name) && !busy) {
      key.preventDefault(); setPickerIndex(value => (value + (key.name === "down" ? 1 : -1) + rooms.length + 3) % (rooms.length + 3));
    }
    if (screen === "chat" && key.ctrl && key.name === "r") { key.preventDefault(); void task(async () => { if (Date.now() < pollCooldown.current) throw new ClientError("GitHub cooldown is active. Please wait."); await refresh(); }); }
  });
  async function authorize() {
    await task(async () => {
      const controller = new AbortController(); authorization.current = controller;
      const code = await requestDeviceCode(clientId.trim(), { signal: controller.signal });
      if (!alive.current) return;
      setDevice(code); setScreen("device");
      try {
        const credential = await waitForAuthorization(clientId.trim(), code, { signal: controller.signal });
        if (!alive.current || controller.signal.aborted) return;
        await connected(credential.token);
        if (!alive.current || controller.signal.aborted) return;
        try { await saveCredential(vault, credential); savedCredential.current = true; } catch { setNotice("Signed in for this session · OS keychain unavailable."); }
      } catch (error) { if (alive.current) setScreen(initialClientId ? "signin" : "client"); throw error; }
      finally { if (alive.current) setDevice(null); }
    });
  }
  async function inbox() { const values = await service.current!.invitations(); if (alive.current) { setInvitations(values); setScreen("inbox"); } }
  async function runCommand(value: string) {
    const parsed = command(value);
    if (!parsed) return false;
    const { name: action, argument } = parsed;
    if (action === "help") setScreen("help");
    else if (action === "themes") { themeBefore.current = theme; themesReturn.current = screen; setScreen("themes"); }
    else if (!actor) throw new ClientError("Sign in before using this command.");
    else if (action === "chats") { setRooms(current => [...new Set([...current])]); setScreen("choose"); }
    else if (action === "new") { setName(argument); setScreen(argument ? "confirm" : "name"); }
    else if (action === "join") {
      if (!argument) setScreen("join");
      else {
        const id = roomLink(argument);
        const pending = (await service.current!.invitations()).find(i => i.repo.toLowerCase() === id.toLowerCase());
        if (pending) { setInvitation(pending); setScreen("accept"); } else await open(id);
      }
    } else if (action === "inbox") await inbox();
    else if (action === "logout") setScreen("logout");
    else if (action === "refresh") { if (Date.now() < pollCooldown.current) throw new ClientError("GitHub cooldown is active. Please wait."); await refresh(); }
    else if (action === "invite") {
      if (!roomRef.current) throw new ClientError("Open a chat before inviting a friend.");
      const login = argument.replace(/^@/, ""); setInviteLogin(login); setScreen(login ? "inviteConfirm" : "invite");
    } else if (action === "attach") {
      if (!roomRef.current) throw new ClientError("Open a chat before attaching an image.");
      const preview = await readLocalImage(argument); checkImage(preview.bytes); setImage(preview); setScreen("image");
    } else if (action === "voice") {
      if (!roomRef.current?.canWrite) throw new ClientError("Open a writable chat before recording.");
      if (calls.current?.busy) throw new ClientError("End the call before recording a voice message.");
      setScreen("voice");
    } else if (action === "call") {
      if (!roomRef.current) throw new ClientError("Open a private direct chat before calling.");
      if (calls.current?.busy) { setScreen("call"); return true; }
      await service.current!.callRoom(roomRef.current, actor!);
      callTarget.current = roomRef.current; setScreen("callConfirm");
    } else if (action === "hangup") {
      await calls.current?.end();
    } else if (action === "secure") {
      const target = roomRef.current;
      if (!target || !service.current) throw new ClientError("Open a chat before enabling encryption.");
      const policy = await service.current.policy(target);
      let key = await service.current.roomKey(target);
      let backup = !!roomKey || !!await readKeyBackup(actor!.id, target);
      if (argument.startsWith("import ")) {
        key = await loadRoomKey(argument.slice(7).trim());
        if (!key) throw new ClientError("Choose a valid key backup.");
        if (policy.enabled && await keyFingerprint(key) !== policy.keyId) throw new ClientError("This key does not match the chat. Nothing was changed.");
        try { await saveRoomKey(vault, actor!.id, target, key); } catch { /* Explicit owner-only backup remains the durable source. */ }
        service.current.setRoomKey(target, key); backup = true;
        await refresh(target, true);
      } else if (argument) throw new ClientError("Use /secure or /secure import /absolute/key-file. Never paste a raw key into the composer.");
      if (policy.enabled && key && await keyFingerprint(key) !== policy.keyId) key = null;
      setSecurePolicy(policy.enabled); setSecureKey(key); setSecureBackup(backup); setScreen("secure");
      if (policy.enabled) setSecureRooms(value => new Set([...value, roomKeyId(target)]));
    }
    return true;
  }
  async function submit(value: string) {
    if (!value.trim()) return;
    await task(async () => {
      const origin = screen === "chat" && roomRef.current ? roomKeyId(roomRef.current) : null;
      if (await runCommand(value)) {
        if (origin) drafts.current.set(origin, "");
        if (origin && roomRef.current && roomKeyId(roomRef.current) === origin) updateDraft("");
        setCommandInput(""); return;
      }
      if (!roomRef.current || !actor || !service.current) throw new ClientError("Choose a chat first, or type /help.");
      const current = roomRef.current;
      setSending(true);
      try {
        const result = await service.current.send(current, actor, value.startsWith("//") ? value.slice(1) : value, historyRef.current, [], reply?.id);
        if (!alive.current) return;
        updateDraft(""); setReplyTarget(null); setNotice(result.sha === "already-confirmed" ? "Sent · confirmed, no duplicate" : "Sent");
        try { await refresh(current, true); } catch { throw new ClientError("Sent, but refresh failed. Use /refresh; do not resend."); }
      } finally { if (alive.current) setSending(false); }
    });
  }
  const choose = (value: string) => {
    if (busy) return;
    setCommandInput("");
    if (value === "+new") { setName(""); setScreen("name"); }
    else if (value === "+join") setScreen("join");
    else if (value === "+inbox") void task(inbox);
    else selectRoom(value);
  };
  const label = (id: string) => {
    const name = conversationName(titles[id], peers[id]);
    return name === "Conversation" && rooms.length > 1 ? `Conversation ${rooms.indexOf(id) + 1}` : name;
  };
  const options = [
    ...rooms.map(id => ({ name: `${room?.id === id ? "● " : "  "}${label(id)}`, description: "", value: id })),
    { name: "+ New chat", description: "", value: "+new" }, { name: "↗ Join chat", description: "", value: "+join" }, { name: "↓ Invitations", description: "", value: "+inbox" },
  ];
  const panelWidth = Math.max(24, Math.min(76, width - 6));
  const composerWidth = Math.max(1, width - (width >= 90 ? 33 : 2) - 6);
  const maxComposerRows = height < 26 ? 3 : 5;
  const visibleComposerRows = Math.min(composerRows, maxComposerRows);
  const autoImages = new Set(history?.messages.flatMap(message => message.locked ? [] : (message.attachments ?? []).filter(a => a.mime.startsWith("image/"))).slice(-4).map(a => a.id));
  const inputBox = { height: 3, flexShrink: 0, border: ["bottom"] as ("bottom")[], borderColor: c.accent, backgroundColor: c.panel, paddingX: 1 };
  const confirm = (label: string, onConfirm: () => Promise<void>, cancel = back, primaryFirst = false) => {
    const options = [{ name: "Cancel", description: "", value: false }, { name: label, description: "", value: true }];
    return <select key={label} id={primaryFirst ? "image-send-actions" : undefined} {...selection} selectedIndex={0} focused={!busy} height={2} options={primaryFirst ? options.reverse() : options} onSelect={(_, option) => { if (busy) return; if (option?.value) void task(onConfirm); else cancel(); }} />;
  };
  return <box id="messenger" width={width} height={height} backgroundColor={c.bg} flexDirection="column" paddingTop={1} paddingX={1} paddingBottom={2}>
    <box id="brand-header" height={height < 26 ? 3 : 4} flexShrink={0} paddingX={2}>
      <Brand />
    </box>
    {screen === "chat" && room ? <box flexGrow={1} minHeight={0} flexDirection="row" gap={1}>
      {width >= 90 && <box id="sidebar" width={30} backgroundColor={c.bg} flexDirection="column">
        <box paddingX={2} height={3} paddingTop={1} flexDirection="row" justifyContent="space-between"><text selectable={false} fg={c.muted}>MESSAGES</text><text selectable={false} fg={c.accent} onMouseDown={() => choose("+new")}>＋</text></box>
        <scrollbox ref={sidebar} flexGrow={1} minHeight={0} scrollX={false}>
          {rooms.map((id, index) => <ChatRow key={id} id={`sidebar-row-${index}`} name={terminalText(label(id), 21)} preview={terminalText(drafts.current.get(`${id.toLowerCase()}:${roomBranches[id] ?? "main"}`) ? "Draft · not sent" : previews[id] ?? "", 22)} active={room.id === id} selected={focus === "sidebar" && sidebarIndex === index} reduced={reducedMotion} onClick={() => { setSidebarIndex(index); choose(id); }} onRemove={() => requestRemove(id)} />)}
          {options.slice(rooms.length).map((option, index) => {
            const selected = focus === "sidebar" && sidebarIndex === rooms.length + index;
            return <box key={option.value} id={`sidebar-row-${rooms.length + index}`} height={3} flexShrink={0} marginX={1} paddingX={1} border borderStyle="rounded" borderColor={selected ? c.border : c.bg} flexDirection="row" alignItems="center" backgroundColor={selected ? c.elevated : c.bg} onMouseDown={() => choose(option.value)}><text selectable={false} fg={selected ? c.text : c.muted}>{option.name}</text></box>;
          })}
        </scrollbox>
      </box>}
      <box flexGrow={1} minWidth={0} flexDirection="column" gap={1}>
        <box height={3} flexShrink={0} border={["bottom"]} borderColor={c.border} paddingX={2} alignItems="center" flexDirection="row" justifyContent="space-between">
          <text fg={c.text}><strong>{terminalText(label(room.id), Math.max(8, Math.min(30, width - (width >= 90 ? 72 : 35))))}</strong><span fg={c.muted}>{history?.encrypted || secureRooms.has(roomKeyId(room)) ? "  encrypted" : "  private"}</span></text>
          <box flexDirection="row" gap={2}><text id="call-button" fg={callView && callView.phase !== "finished" ? c.success : c.accent} selectable={false} onMouseDown={() => { if (callView) setScreen("call"); else void task(async () => { await runCommand("/call"); }); }}>◉ Call</text><text id="voice-button" fg={c.accent} selectable={false} onMouseDown={showVoice}>● Voice</text><box id="invite-button" backgroundColor={focus === "invite" ? c.elevated : c.bg} paddingX={1} onMouseDown={showInvite}><text fg={c.accent}>{focus === "invite" ? "› + Invite" : "+ Invite"}</text></box></box>
        </box>
        <FocusFrame id="history-panel" quiet flexGrow={1} flexShrink={1} minHeight={0} border={["left"]} active={focus === "history"} reduced={reducedMotion}>
        <Reveal key={roomKeyId(room)} reduced>
        <scrollbox id="history" ref={timeline} flexGrow={1} minHeight={0} focused={focus === "history"} stickyScroll stickyStart="bottom" paddingX={1} onMouseDown={() => setFocus("history")}>
          {!history && <text fg={c.muted}>Loading messages…</text>}
          {history && history.messages.length === 0 && <box paddingY={height < 26 ? 0 : 3} paddingX={2} flexDirection="column" gap={1}>{height >= 26 && <text fg={c.border}>{"○───╮\n    ╰───○"}</text>}<text fg={c.text}>A fresh conversation.</text><text fg={c.accent} onMouseDown={showInvite}>+ Invite a friend</text></box>}
          {history?.truncated && <text fg={c.muted}>Recent 300 events</text>}
            {history?.messages.map((message, index) => <MessageBubble id={`message-${message.id}`} key={message.id} own={message.actor.id === actor?.id} reduced={reducedMotion || index < history.messages.length - 3} feedbackReduced={reducedMotion} onCopy={!message.locked && !message.deleted && message.text ? () => copy(terminalText(message.text), true) : undefined} onReply={!message.locked && !message.deleted && room.canWrite ? () => setReplyTarget(message) : undefined}>
            <text selectable={false} fg={message.actor.id === actor?.id ? c.accent : c.success}><strong>{terminalText(message.actor.login, 39)}</strong><span fg={c.muted}>{`  ${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${message.edited ? " · edited" : ""}`}</span></text>
            {message.replyTo && <text selectable={false} fg={c.muted} onMouseDown={() => timeline.current?.scrollChildIntoView(`message-${message.replyTo}`, { align: "nearest" })}>{(() => { const original = history.messages.find(item => item.id === message.replyTo); return original && !original.deleted && !original.locked ? `↳ @${original.actor.login}: ${terminalText(original.text || "Image", 55).replace(/\s+/g, " ")}` : "↳ Earlier message"; })()}</text>}
            {!!message.text && <text minWidth={0} maxWidth="100%" selectionBg={c.elevated} selectionFg={c.text} fg={message.deleted || message.locked ? c.muted : c.text} wrapMode="word">{terminalText(message.text)}</text>}
            {!message.locked && message.attachments?.map(attachment => attachment.mime.startsWith("image/") && service.current ? <ChatImage key={attachment.id} rooms={service.current} room={room} attachment={attachment} autoLoad={autoImages.has(attachment.id)} width={Math.min(56, width - (width >= 90 ? 40 : 14))} onOpen={() => { if (!working.current) { renderer.clearSelection(); setViewedImage({ room, attachment }); } }} /> : attachment.mime.startsWith("audio/") && service.current ? <VoiceMessage key={attachment.id} rooms={service.current} room={room} attachment={attachment} driver={driver} /> : <text key={attachment.id} fg={c.muted}>{terminalText(attachment.name, 80)}</text>)}
            {!!Object.keys(message.reactions).length && <text fg={c.accent}>{Object.entries(message.reactions).filter(([, users]) => users?.length).map(([emoji, users]) => `${emoji} ${users!.length}`).join("  ")}</text>}
          </MessageBubble>)}
          {sending && <box paddingX={2} height={2} flexShrink={0}><SendActivity reduced={reducedMotion} /></box>}
        </scrollbox>
        </Reveal>
        </FocusFrame>
        {showCommands && <CommandMenu value={slashValue} index={slashIndex} height={height} wide={width >= 120} bottom={visibleComposerRows + 2 + (reply ? 4 : 0)} reduced={reducedMotion} onComplete={completeCommand} />}
        {reply && <box id="reply-preview" height={3} flexShrink={0} border borderStyle="rounded" borderColor={c.border} backgroundColor={c.panel} paddingX={1} flexDirection="row" justifyContent="space-between">
          <text selectable={false} fg={c.muted} flexShrink={1} minWidth={0} wrapMode="none">{`Reply to @${reply.actor.login} · ${terminalText(reply.text || "Image", 100).replace(/\s+/g, " ")}`}</text>
          <text id="reply-cancel" selectable={false} fg={c.accent} onMouseDown={() => setReplyTarget(null)}>×</text>
        </box>}
        <FocusFrame id="composer-panel" border borderStyle="rounded" backgroundColor={c.panel} height={visibleComposerRows + 2} paddingX={2} active={focus === "composer"} reduced={reducedMotion} onMouseDown={() => setFocus("composer")}>
          <Composer key={`composer-${roomKeyId(room)}`} value={draft} width={composerWidth} rows={visibleComposerRows} maxRows={maxComposerRows} onRows={setComposerRows} onChange={updateDraft} onSubmit={() => void submit(draftRef.current)} focused={!busy && !viewedImage && focus === "composer"} placeholder={room.canWrite ? "Message…" : "Read-only · /help"} />
        </FocusFrame>
      </box>
    </box> : <box flexGrow={1} minHeight={0} alignItems="center" justifyContent="center">
      <Panel key={screen} reduced={reducedMotion} width={panelWidth} maxHeight={Math.max(10, height - (height < 26 ? 6 : 8))} border={["left"]} borderColor={c.accent} backgroundColor={c.panel} padding={screen === "image" || screen === "voice" || screen === "call" || screen === "secure" && height < 30 ? 1 : 2} flexDirection="column" gap={height < 30 && (screen === "secure" || screen === "call") ? 0 : 1}>
        <text fg={c.text}><strong>{({ loading: "Connecting…", signin: "Your GitHub. Your conversations.", client: "Connect your OAuth App", device: "One code. You're in.", choose: "Messages", join: "Join a conversation", name: "New conversation", confirm: "Create private chat?", logout: "Sign out?", chat: "gitmsg", help: "Help", invite: "Invite a friend", inviteConfirm: "Send invitation?", inviteDone: "You're ready to share.", inbox: "Invitations", accept: "Accept invitation?", image: "Send image?", themes: "Themes", remove: "Remove from chat list?", voice: "Voice message", secure: "Secure conversation", call: "Audio connection", callConfirm: "Start audio call?" })[screen]}</strong></text>
        {screen === "callConfirm" && <>
          <text fg={c.muted}>Starts your microphone and calls this chat's verified partner. GitHub stores signaling only; audio is WebRTC encrypted. Direct connections may fail behind restrictive networks (no TURN relay).</text>
          {confirm("Start call", async () => { const target = callTarget.current!; setScreen("call"); void calls.current!.start(target).catch(error => { errorNotice(error); back(); }); })}
        </>}
        {screen === "call" && callView && <CallPanel view={callView} levels={callLevels} width={panelWidth - 2} compact={height < 36} reduced={reducedMotion} onAccept={() => { void calls.current?.accept().catch(errorNotice); }} onEnd={() => { void calls.current?.end().catch(errorNotice); }} onMute={() => calls.current?.mute()} onClose={() => { calls.current?.dismiss(); back(); }} />}
        {screen === "call" && !callView && <><text fg={c.muted}>Verifying call partner… Microphone is off.</text><text fg={c.accent} selectable={false} onMouseDown={() => { void calls.current?.end().catch(errorNotice); back(); }}>[Esc / H] Cancel</text></>}
        {screen === "remove" && <>
          <text fg={c.text}>{label(removeId)}</text>
          <text fg={c.muted}>Hides this chat on this device. Repository, messages and access stay unchanged. Reopen with /join.</text>
          {confirm("Remove chat", removeChat)}
        </>}
        {screen === "voice" && <VoiceRecorder driver={driver} width={panelWidth - 2} compact={height < 30} onSend={sendVoice} onClose={back} />}
        {screen === "secure" && <>
          <text fg={c.accent}>{securePolicy ? "AES-256-GCM enabled" : "AES-256-GCM · 256-bit random room key"}</text>
          <scrollbox height={height < 30 ? 3 : 6} scrollX={false}>
          <text fg={c.muted}>{height < 30 ? "New messages and voice encrypted. Old Git history stays. Metadata remains visible." : "Encrypts new messages, images and voice bytes before upload. GitHub still sees authors, times and file sizes. Older Git history stays as it was."}</text>
          <text fg={c.muted}>{height < 30 ? "Share the key privately. Lost key = lost content." : "Share the key separately through a trusted channel. Everyone needs the same key. Losing it means losing access to encrypted content."}</text>
          </scrollbox>
          {securePolicy ? <>
            <text fg={secureKey ? c.success : c.error}>{secureKey ? "Matching key available on this device." : "Key missing. /secure import /absolute/key-file"}</text>
            <select {...selection} height={secureKey ? 2 : 1} focused={!busy} options={[{ name: "Back to conversation", description: "", value: "back" }, ...(secureKey ? [{ name: "Copy secret key · share privately", description: "", value: "copy" }] : [])]} onSelect={(_, option) => { if (option?.value === "copy" && secureKey) void task(async () => { await copy(await exportKey(secureKey)); }); else back(); }} />
          </> : <>
            <text fg={c.muted} wrapMode="word">{`Optional unencrypted owner-only backup (0600): ${privateBackupPath(actor!.id, roomRef.current!)}`}</text>
            <select id="secure-actions" {...selection} focused={!busy} height={3} selectedIndex={0} options={[
              { name: "Cancel", description: "", value: "cancel" }, { name: "Enable encryption · system keychain", description: "", value: "vault" }, { name: "Enable + create private key backup", description: "", value: "backup" },
            ]} onSelect={(_, option) => {
              if (busy) return;
              if (option?.value === "cancel") { back(); return; }
              void task(async () => {
                const target = roomRef.current!, key = secureKey ?? await generateKey();
                // Retain a failed-attempt key, so a retry cannot overwrite its backup.
                setSecureKey(key);
                if (option?.value === "backup") await savePrivateBackup(actor!.id, target, key);
                else if (!secureBackup) await saveRoomKey(vault, actor!.id, target, key);
                await service.current!.secure(target, key, true);
                setSecurePolicy(true); setSecureRooms(value => new Set([...value, roomKeyId(target)]));
                setNotice("Encryption enabled for new messages. Share the key privately.");
              });
            }} />
          </>}
        </>}
        {screen === "signin" && <>
          <text fg={c.muted}>Sign in on GitHub with a one-time code. No token to copy.</text>
          <text fg={c.muted}>GitHub will ask for repo + read:user access. Review before approving.</text>
          <select {...selection} focused={!busy} height={2} options={[{ name: "Continue with GitHub →", description: "", value: "signin" }, { name: "Use a different OAuth App", description: "", value: "custom" }]} onSelect={(_, option) => { if (busy) return; if (option?.value === "custom") setScreen("client"); else void authorize(); }} />
        </>}
        {screen === "client" && <>
          <text fg={c.muted}>Public Client ID · Device Flow must be enabled.</text>
          <text fg={c.muted}>Requests repo + read:user. Never enter a token or Client Secret.</text>
          <box {...inputBox}><Field value={clientId} onInput={setClientId} onSubmit={() => void authorize()} focused={!busy} placeholder="Public client ID" maxLength={100} /></box>
        </>}
        {screen === "device" && device && <>
          <text id="github-login-link" fg={c.accent} selectable={false} onMouseDown={event => { event.stopPropagation(); void openLogin(); }}><a href={GITHUB_DEVICE_URL}>{GITHUB_DEVICE_URL} ↗</a></text><text fg={c.accent}><strong>{device.user_code}</strong></text>
          <text fg={c.muted}>Check the app name and permissions, then enter this code.</text><text fg={c.muted}>Waiting for approval…</text>
        </>}
        {screen === "choose" && <>
          <select key={`picker-${rooms.join()}`} {...selection} focused={false} selectedIndex={Math.min(pickerIndex, options.length - 1)} height={Math.min(12, Math.max(3, options.length))} options={options} onSelect={(_, option) => option && choose(String(option.value))} />
          <box {...inputBox}><Field id="command-input" value={commandInput} onInput={updateCommand} onSubmit={() => commandInput ? void submit(commandInput) : choose(String(options[Math.min(pickerIndex, options.length - 1)].value))} focused={!busy} placeholder="/" /></box>
          {showCommands && <CommandMenu value={slashValue} index={slashIndex} height={height} wide={width >= 120} reduced={reducedMotion} onComplete={completeCommand} />}
        </>}
        {screen === "themes" && <>
          <box flexDirection="column">
            {THEMES.map(item => <box key={item.id} height={1} flexShrink={0} backgroundColor={theme.id === item.id ? c.elevated : c.panel} paddingX={1} flexDirection="row" onMouseDown={() => setTheme(item)}>
              <text width={25} fg={theme.id === item.id ? c.accent : c.text}>{`${theme.id === item.id ? "●" : " "} ${item.name}`}</text>
              {width >= 90 && <text fg={c.muted}>{item.description}</text>}
            </box>)}
          </box>
          {height >= 28 && <box paddingX={2} paddingY={1} backgroundColor={c.own} flexDirection="column" gap={1}><text fg={c.accent}>Hello, terminal.</text><text fg={c.text}>Less noise. More conversation.</text><text fg={c.muted}>A preview, not a message.</text></box>}
          <text fg={c.muted}>↑↓ preview · Enter apply · Esc cancel</text>
        </>}
        {screen === "help" && <Help height={Math.max(6, Math.min(26, height - 14))} />}
        {screen === "join" && <><text fg={c.muted}>Paste a chat repository or invitation link.</text><box {...inputBox}><Field value={repoInput} onInput={setRepoInput} focused={!busy} onSubmit={() => void task(async () => { await runCommand(`/join ${repoInput}`); })} placeholder="github.com/friend/gitmsg-room" /></box></>}
        {screen === "name" && <><text fg={c.muted}>A separate private repository. 2–40 letters, numbers or hyphens.</text><box {...inputBox}><Field value={name} onInput={setName} maxLength={40} focused={!busy} placeholder="after-hours" onSubmit={() => setScreen("confirm")} /></box></>}
        {screen === "confirm" && <>
          <text fg={c.text}>{`${actor?.login}/gitmsg-${terminalText(name, 40)}`}</text><text fg={c.muted}>Creates a private repository and room marker. No local project files uploaded.</text>
          {confirm("Create chat", async () => { const result = await service.current!.create(name, true); if (result.warning) { setScreen("choose"); throw new ClientError(result.warning); } await open(result.room.id); }, () => setScreen("name"))}
        </>}
        {screen === "invite" && <><text fg={c.muted}>Their GitHub username. No Settings page needed.</text><box {...inputBox}><Field value={inviteLogin} onInput={setInviteLogin} maxLength={40} focused={!busy} placeholder="@friend" onSubmit={() => { setInviteLogin(value => value.replace(/^@/, "")); setScreen("inviteConfirm"); }} /></box></>}
        {screen === "inviteConfirm" && <>
          <text fg={c.text}>{`Invite @${terminalText(inviteLogin, 39)} to ${room ? label(room.id) : "this conversation"}?`}</text><text fg={c.muted}>Grants repository write access. They must accept; encryption keys are shared separately.</text>
          {confirm("Send invitation", async () => { const result = await service.current!.invite(roomRef.current!, inviteLogin, true); setInviteUrl(result.url); setScreen("inviteDone"); setNotice(result.alreadyMember ? "Already a member" : `Invited @${inviteLogin}`); })}
        </>}
        {screen === "inviteDone" && <>
          <text fg={c.text}>{`@${terminalText(inviteLogin, 39)} can accept with /inbox or this link:`}</text>
          <text fg={c.accent}>{inviteUrl}</text>
          <select {...selection} focused={!busy} height={3} options={[{ name: "Back to conversation", description: "", value: "back" }, { name: "Copy invitation link", description: "", value: "copy" }, { name: "Invite another friend", description: "", value: "another" }]} onSelect={(_, option) => {
            if (option?.value === "copy") void copy(inviteUrl);
            else if (option?.value === "another") showInvite();
            else back();
          }} />
        </>}
        {screen === "inbox" && <>
          {!invitations.length ? <text fg={c.muted}>No pending chat invitations.</text> : <select {...selection} focused={!busy} height={Math.min(10, invitations.length)} options={invitations.map(i => ({ name: `${i.repo} · from @${terminalText(i.from, 39)}`, description: "", value: i }))} onSelect={(_, option) => { if (option) { setInvitation(option.value); setScreen("accept"); } }} />}
        </>}
        {screen === "accept" && invitation && <><text fg={c.text}>{invitation.repo}</text><text fg={c.muted}>Accept GitHub repository access, then verify its chat marker.</text>{confirm("Accept and open", async () => { const joined = await service.current!.accept(invitation, true); await open(joined.id); })}</>}
        {screen === "image" && image && <>
          <text fg={c.text}>{`${terminalText(image.name, 80)} · ${Math.ceil(image.bytes.length / 1024)} KB`}</text><ImageView bytes={image.bytes} width={Math.min(64, panelWidth - 8)} maxRows={Math.max(3, Math.min(18, height - 20))} />
          <text fg={c.muted}>Uploads this image to the current chat repository.</text>
           {confirm("Send Image", async () => { const target = roomRef.current!; const attachment = await service.current!.uploadImage(target, image, true, historyRef.current); await service.current!.send(target, actor!, "", historyRef.current, [attachment], reply?.id); setReplyTarget(null); setImage(null); setScreen("chat"); setNotice("Image sent"); try { await refresh(target, true); } catch { throw new ClientError("Image sent, but refresh failed. Do not resend."); } }, () => { setImage(null); back(); }, true)}
        </>}
        {screen === "logout" && confirm("Remove saved sign-in", async () => {
          if (savedCredential.current) await forgetCredential(vault);
          navigation.current++; historyRequest.current?.abort(); historyRequest.current = null;
          savedCredential.current = false; service.current = null; viewer.current = null;
          roomRef.current = null; historyRef.current = undefined;
          roomCache.current.clear(); histories.current.clear(); drafts.current.clear(); replies.current.clear(); setReply(null); hiddenRooms.current.clear(); setSecureKey(null); setSecureRooms(new Set());
          calls.current?.dispose(); calls.current = null; setCallView(null);
          setActor(null); setRooms([]); setRoom(null); setHistory(undefined); setImage(null); setViewedImage(null);
          setTitles({}); setPeers({}); setPreviews({}); setRoomBranches({}); setInvitations([]); setInvitation(null); setInviteUrl(""); setInviteLogin("");
          updateDraft(""); setScreen(initialClientId ? "signin" : "client"); setNotice("Signed out locally. Revoke authorization separately in GitHub Applications.");
        })}
      </Panel>
    </box>}
    {(!!notice || busy && screen !== "device" && !sending) && <box id="status-footer" position="absolute" bottom={0} left={2} width={Math.max(1, width - 4)} height={2} flexShrink={0}><text fg={noticeIsError ? c.error : c.muted} wrapMode="word">{notice ? `${noticeIsError ? "! " : ""}${terminalText(notice, 350)}` : "Connecting…"}</text></box>}
    {viewedImage && service.current && <ImageLightbox key={`${viewedImage.room.id}:${viewedImage.attachment.id}`} rooms={service.current} room={viewedImage.room} attachment={viewedImage.attachment} onClose={() => setViewedImage(null)} />}
  </box>;
}
