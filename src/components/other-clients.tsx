"use client";
import { useState } from "react";
import { Copy, Download, ExternalLink, Terminal } from "lucide-react";
import { EVENT_PREFIX, eventPath, type Actor, type ChatEvent, type Room } from "@/lib/protocol";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
export function OtherClients({ room, actor, secure }: { room: Room; actor: Actor; secure: boolean }) {
  const [text, setText] = useState(""); const [event, setEvent] = useState<ChatEvent | null>(null); const [copied, setCopied] = useState(false);
  function prepare() { setEvent({ v: 1, id: crypto.randomUUID(), kind: "message", actor, createdAt: new Date().toISOString(), text: text.trim() }); }
  return <><h2><Terminal /> One chat, three clients</h2><p>Website, terminal and GitHub use the same append-only event protocol. No separate account or database.</p>
    <Button variant="outline" render={<a href="/integrations/gitmsg.mjs" download="gitmsg.mjs" />}><Download />Download Node 22 CLI</Button>
    <pre className="json-preview">{`# Authenticate via your credential manager\n# GITHUB_TOKEN must have access to this repo\nnode gitmsg.mjs ${room.id} read\nnode gitmsg.mjs ${room.id} send "hello from terminal"\nnode gitmsg.mjs ${room.id} propose "please approve"`}</pre>
    <p className="fine-print">For secure rooms, set GITMSG_KEY_FILE to a private key-backup file (chmod 600). Never put keys or tokens in arguments, commits or screenshots. CLI read shows the latest 100 event commits, including mutations; the website materializes the conversation.</p>
    <h3>Post directly on GitHub</h3>{secure ? <p>Plaintext GitHub editing is disabled for secure rooms. Use the CLI with the room key instead.</p> : <><p>Create the event file, then paste the exact protocol body below into GitHub's commit description. The JSON file alone is not enough: synchronization reads protocol commit messages.</p><Textarea aria-label="GitHub message" placeholder="Message from the GitHub editor…" value={text} onChange={e => setText(e.target.value)} maxLength={1000} /><Button disabled={room.demo || !text.trim()} onClick={prepare}>Prepare GitHub commit</Button>{event && <><Button variant="outline" render={<a href={`https://github.com/${room.id}/new/${encodeURIComponent(room.branch)}?${new URLSearchParams({ filename: eventPath(event), value: JSON.stringify(event, null, 2) })}`} target="_blank" rel="noreferrer" />}>1. Open prefilled file<ExternalLink /></Button><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(`${EVENT_PREFIX}${JSON.stringify(event)}`); setCopied(true); }}><Copy />2. {copied ? "Copied · paste into commit description" : "Copy commit description"}</Button><p className="fine-print">3. Commit directly to the chat branch. Keep the description exactly as copied. Use your own GitHub identity; repository writers are trusted and can forge protocol actors.</p></>}</>}
  </>;
}
