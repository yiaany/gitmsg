"use client";

import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { Button } from "./ui/button";

export function WelcomeChannel({ onBack, onNew }: { onBack: () => void; onNew: () => void }) {
  const posts = [
    <><b>Alright, you’re in.</b><p>A messenger on top of GitHub. Your account is your identity, your chats are repositories, and every message is a commit. Here’s the short version.</p></>,
    <><b>Your first chat</b><p>Click the pencil below the chat list → <strong>New Message</strong>. Search for a friend’s GitHub username, open their profile, then choose <strong>Start chat</strong>.</p><p>gitmsg creates a private repository and sends your friend a collaborator invitation. They accept it on GitHub, and you’re ready to talk.</p></>,
    <><b>Bring your people</b><p>Already in a chat? Open <strong>⋮ → GitHub tools → Add members</strong>. Enter their GitHub username, then copy the chat link or share the QR code.</p><p>A link alone doesn’t grant access to a private chat. Invitation first, conversation second.</p></>,
    <><b>Links & channels</b><p>Chat links look like <code>?repo=owner/repository</code>. Find public channels through search and hit <strong>Join Channel</strong> to save one to your list. Only repository writers can publish.</p></>,
    <><b>More than text</b><p>The paperclip opens a photo preview. Add a caption, then send. The microphone records a voice note: pause, listen, resume, or send directly.</p><p>Open a message’s menu for replies, reactions, editing, and saving. New messages show up in your chat list with an unread count.</p></>,
    <><b>Your conversations, your keys</b><p>GitHub can read standard messages. Want browser encryption? Open <strong>⋮ → GitHub tools → Room security</strong>. Share the key separately and back it up — lost keys mean lost access.</p><p>Deleting a message hides it from the chat, not from Git history. Unread counts stay in this browser; messages sync while the site is open.</p></>,
    <>That’s it. Go talk to someone.</>,
  ];
  return <section className="welcome-channel" aria-label="Getting started" lang="en">
    <header className="channel-header"><Button variant="ghost" size="icon-lg" className="mobile-menu round-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft /></Button><span className="conversation-avatar small guide-avatar"><BookOpen /></span><span className="channel-heading"><h1>gitmsg</h1><span className="channel-status">Getting started</span></span></header>
    <div className="welcome-feed message-feed"><div className="messages" aria-label="Getting started messages"><div className="date-divider"><span>Welcome to gitmsg</span></div>{posts.map((post, index) => <div className="message-unit" key={index}><article className="message group-end guide-message"><div className="message-content"><div className="message-text">{post}</div></div></article></div>)}</div>
    </div><div className="guide-footer"><Button onClick={onNew}><Plus />Start a conversation</Button></div>
  </section>;
}
