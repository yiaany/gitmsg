"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Bookmark, Menu, Radio, Search, UserRound, X } from "lucide-react";
import { materialize, type Actor, type ChatEvent, type Room } from "@/lib/protocol";
import { dayLabel, messagePreview, roomInitials } from "@/lib/conversation-view";
import { Button } from "./ui/button";
import { NewConversationMenu, type ConversationKind } from "./new-conversation-menu";
import { validDiscoveryQuery } from "@/lib/github-models";

export function ConversationAvatar({ room, small = false }: { room: Room; small?: boolean }) {
  const tone = [...room.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
  return <span className={`conversation-avatar ${small ? "small" : ""}`} style={room.color ? { background: `linear-gradient(#fff -300%, ${room.color})` } : undefined} data-tone={tone} aria-hidden="true">{room.id.endsWith("/gitmsg-saved") ? <Bookmark /> : room.avatar ? <img src={room.avatar} alt="" referrerPolicy="no-referrer" /> : roomInitials(room)}</span>;
}

export function ConversationList({ rooms, active, timelines, menu, unread = {}, guideActive, onGuide, onSelect, onNew, onMenu, onUser, onChannel, onCreate }: {
  rooms: Room[]; active: Room; timelines: Record<string, { events: ChatEvent[] }>;
  menu?: ReactNode;
  unread?: Record<string, number>; guideActive?: boolean; onGuide?: () => void;
  onSelect: (room: Room) => void; onNew: () => void; onMenu: () => void;
  onUser?: (user: Actor) => void; onChannel?: (room: Room) => void;
  onCreate?: (kind: ConversationKind) => void;
}) {
  const [query, setQuery] = useState("");
  const [discovery, setDiscovery] = useState<{ users: Actor[]; channels: Room[] }>({ users: [], channels: [] });
  const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState("");
  useEffect(() => {
    if (!onUser || !validDiscoveryQuery(query.trim().replace(/^@/, ""))) { setDiscovery({ users: [], channels: [] }); setSearching(false); setSearchError(""); return; }
    const controller = new AbortController(); setSearching(true); setSearchError(""); setDiscovery({ users: [], channels: [] });
    const timer = setTimeout(() => { fetch(`/api/search?${new URLSearchParams({ q: query.trim() })}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }).then(data => { if (!controller.signal.aborted) setDiscovery(data); }).catch(error => { if (!controller.signal.aborted) setSearchError(error.message); }).finally(() => { if (!controller.signal.aborted) setSearching(false); }); }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, onUser]);
  const previews = useMemo(() => Object.fromEntries(rooms.map(room => [room.id, materialize(timelines[room.id]?.events || []).at(-1)])), [rooms, timelines]);
  const visible = rooms.filter(room => `${room.name} ${room.id} ${room.description}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (Date.parse(previews[b.id]?.createdAt || "") || 0) - (Date.parse(previews[a.id]?.createdAt || "") || 0));
  return <>
    <div className="list-header">{menu || <Button variant="ghost" size="icon-lg" className="round-button" aria-label="Open settings" title="Settings" onClick={onMenu}><Menu /></Button>}<div className="conversation-search"><Search aria-hidden="true" /><input type="search" aria-label="Search chats" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />{query && <button type="button" aria-label="Clear chat search" onClick={() => setQuery("")}><X /></button>}</div></div>
    <nav className="rooms" aria-label="Chats">{onGuide && (!query || /gitmsg|start|guide/i.test(query)) && <button type="button" className="room guide-room" aria-current={guideActive ? "page" : undefined} onClick={onGuide}><span className="conversation-avatar guide-avatar"><BookOpen /></span><span className="room-summary"><span className="room-name">gitmsg</span><span className="room-preview">Getting started · chats, friends, and links</span></span></button>}{visible.map(room => {
      const last = previews[room.id];
      const count = unread[room.id.toLowerCase()] || 0;
      return <button className="room" type="button" key={room.id} aria-current={active.id === room.id ? "page" : undefined} onClick={() => onSelect(room)}>
        <ConversationAvatar room={room} />
        <span className="room-summary"><span className="room-topline"><span className="room-name">{room.name}</span>{last && <time dateTime={last.createdAt}>{dayLabel(last.createdAt) === "Today" ? new Date(last.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : new Date(last.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>}</span><span className="room-bottomline"><span className="room-preview">{last && !last.locked && !last.deleted && !room.peer && room.kind !== "channel" && <b>{last.actor.login}: </b>}{!last && !timelines[room.id] ? "" : messagePreview(last)}</span>{count > 0 && <span className="unread-badge" aria-label={`${count} unread messages`}>{count > 999 ? "999+" : count}</span>}</span></span>
      </button>;
    })}{!visible.length && <div className="chat-list-empty"><Search /><p>{query ? "No matching chats" : "No chats yet"}</p>{!query && <Button variant="ghost" onClick={onNew}>Start a conversation</Button>}</div>}
    {query && onUser && <div className="discovery-results"><h3><UserRound size={16} />GitHub users</h3>{searching && <p role="status">Searching GitHub…</p>}{discovery.users.map(user => <button type="button" key={user.id} className="discovery-result" onClick={() => onUser(user)}>{user.avatar?.startsWith("https://avatars.githubusercontent.com/") ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <UserRound />}<span>@{user.login}<small>GitHub account</small></span></button>)}{!searching && !discovery.users.length && !searchError && <p>Search usernames with 2–39 Latin letters, numbers or hyphens.</p>}{discovery.channels.length > 0 && <><h3><Radio size={16} />Public channels</h3>{discovery.channels.map(channel => <button type="button" key={channel.id} className="discovery-result" onClick={() => onChannel?.(channel)}><ConversationAvatar room={channel} /><span>{channel.name}<small>{channel.id}</small></span></button>)}</>}{searchError && <p role="alert">{searchError}</p>}</div>}
    </nav>
    <NewConversationMenu onSelect={kind => onCreate ? onCreate(kind) : onNew()} />
  </>;
}
