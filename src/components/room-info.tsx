"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Bell, ExternalLink, Info, LogOut, ShieldCheck, UserRound, X } from "lucide-react";
import type { Message, Room } from "@/lib/protocol";
import { sharedContent } from "@/lib/shared-content";
import { ConversationAvatar } from "./conversation-list";
import { Github } from "./github-icon";
import { MediaMessage } from "./media-message";
import { Button } from "./ui/button";

const TABS = ["Media", "Files", "Links"] as const;
export function RoomInfo({ room, messages, encrypted, subscribed, muted, busy, onClose, onSecurity, onLeave, onToggleMute }: {
  room: Room; messages: Message[]; encrypted: boolean; subscribed: boolean; muted: boolean; busy: boolean;
  onClose: () => void; onSecurity: () => void; onLeave: () => void; onToggleMute: () => void;
}) {
  const [tab, setTab] = useState<typeof TABS[number]>("Media");
  const [direction, setDirection] = useState(1);
  const [shared, setShared] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  const content = sharedContent(messages);
  const attachments = tab === "Media" ? content.media : content.files;
  const title = room.kind === "channel" ? "Channel Info" : room.peer ? "User Info" : "Chat Info";
  function select(value: typeof tab) {
    setDirection(TABS.indexOf(value) >= TABS.indexOf(tab) ? 1 : -1);
    setTab(value); setShared(true);
    const node = scroll.current, target = tabs.current;
    if (node && target) node.scrollTo({ top: node.scrollTop + target.getBoundingClientRect().top - node.getBoundingClientRect().top, behavior: reduceMotion ? "instant" : "smooth" });
  }
  return <motion.aside id="room-info" className="room-info-panel" aria-label={title} initial={{ x: reduceMotion ? 0 : "calc(100% + 16px)" }} animate={{ x: 0 }} exit={{ x: reduceMotion ? 0 : "calc(100% + 16px)", opacity: reduceMotion ? 0 : 1 }} transition={{ duration: reduceMotion ? 0 : .3, ease: [.33, 1, .68, 1] }}>
    <header><Button ref={close} variant="ghost" size="icon-lg" className="round-button" aria-label={shared ? "Back to profile" : "Close chat info"} onClick={() => { if (shared) { setShared(false); scroll.current?.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" }); } else onClose(); }}>{shared ? <ArrowLeft /> : <><X className="info-close-desktop" /><ArrowLeft className="info-close-mobile" /></>}</Button><h2>{shared ? "Shared Media" : title}</h2></header>
    <div className="room-info-scroll" ref={scroll}><div className="room-info-hero"><ConversationAvatar room={room} /><div className="room-info-name"><h3>{room.name}</h3><p>{room.peer ? `@${room.peer.login}` : room.kind === "channel" ? "public channel" : "GitHub conversation"}</p></div></div>
      <div className="room-info-details">
        {room.description && <div className="info-row"><Info /><span>{room.description}<small>{room.peer ? "Bio" : "Description"}</small></span></div>}
        {room.peer && <a className="info-row" href={`https://github.com/${room.peer.login}`} target="_blank" rel="noreferrer"><UserRound /><span>@{room.peer.login}<small>Username · GitHub</small></span></a>}
        <Button variant="ghost" className="info-row" role="switch" aria-checked={!muted} aria-label="Conversation notifications" onClick={onToggleMute}><Bell /><span>Notifications</span><i className={`appearance-switch ${!muted ? "on" : ""}`} aria-hidden="true" /></Button>
        <details className="room-github-details"><summary><Github />GitHub details</summary>
          <a className="info-row" href={`https://github.com/${room.id}`} target="_blank" rel="noreferrer"><Github /><span>{room.id}<small>GitHub repository</small></span></a>
          <Button variant="ghost" className="info-row" onClick={onSecurity}><ShieldCheck /><span>Room Security<small>{encrypted ? "Encrypted" : "Standard mode"}</small></span></Button>
          {room.kind === "channel" && subscribed && <Button variant="ghost" className="info-row destructive" disabled={busy} onClick={onLeave}><LogOut /><span>Leave Channel</span></Button>}
        </details>
      </div>
      <div className="room-info-tabs" ref={tabs} role="tablist" aria-label="Shared content" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : (TABS.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
        select(TABS[index]); event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index]?.focus({ preventScroll: true });
      }}>{TABS.map(value => <button type="button" role="tab" id={`shared-${value}`} aria-controls="shared-content" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => select(value)}>{tab === value && <motion.span className="shared-tab-selection" layoutId={`shared-selection-${room.id}`} transition={{ duration: reduceMotion ? 0 : .3, ease: [.25, 1, .5, 1] }} />}<span>{value}</span></button>)}</div>
      <div className="shared-content-viewport"><AnimatePresence initial={false} custom={direction} mode="popLayout"><motion.div key={tab} id="shared-content" className={`room-info-media ${tab === "Media" ? "media-grid" : ""}`} role="tabpanel" aria-labelledby={`shared-${tab}`} tabIndex={0} custom={direction} variants={{ enter: (direction: number) => ({ x: reduceMotion ? 0 : `${direction * 100}%`, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (direction: number) => ({ x: reduceMotion ? 0 : `${direction * -100}%`, opacity: 0 }) }} initial="enter" animate="center" exit="exit" transition={{ duration: reduceMotion ? 0 : .3, ease: [.25, 1, .5, 1] }}>{tab === "Links" ? content.links.map(url => <a className="info-row shared-link" href={url} key={url} target="_blank" rel="noreferrer"><ExternalLink /><span>{new URL(url).hostname}<small>{url}</small></span></a>) : attachments.map(attachment => <MediaMessage key={attachment.id} room={room} attachment={attachment} compact={tab === "Media"} />)}{!(tab === "Links" ? content.links.length : attachments.length) && <p className="shared-content-empty">No {tab.toLowerCase()} here yet</p>}</motion.div></AnimatePresence></div>
    </div>
  </motion.aside>;
}
