"use client";
import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { Check, Copy, Download, KeyRound, LockKeyhole, QrCode, ShieldCheck } from "lucide-react";
import { api, readLocal, writeLocal } from "@/lib/client";
import { exportKey, generateKey, importKey, keyFingerprint, roomKey, storeRoomKey } from "@/lib/room-crypto";
import type { Room } from "@/lib/protocol";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export type SecurityInfo = { enabled: boolean; keyId?: string; hasKey: boolean; loaded: boolean };
export function RoomSecurity({ room, security, onChange }: { room: Room; security: SecurityInfo; onChange: () => Promise<void> }) {
  const [fingerprint, setFingerprint] = useState(""); const [share, setShare] = useState(""); const [input, setInput] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [acknowledged, setAcknowledged] = useState(false); const [copied, setCopied] = useState(false);
  useEffect(() => { let disposed = false; roomKey(room.id).then(async key => { if (key && !disposed) setFingerprint(await keyFingerprint(key)); }).catch(() => {}); return () => { disposed = true; }; }, [room.id, security.hasKey]);
  async function enable() {
    setBusy(true); setError("");
    try {
      const key = await roomKey(room.id) || await generateKey(); await storeRoomKey(room.id, key); const keyId = await keyFingerprint(key);
      if (room.demo) writeLocal(`gitmsg:security:${room.id}`, { enabled: true, keyId });
      else await api("/api/security", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, keyId }) });
      setFingerprint(keyId); await onChange(); await reveal();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function reveal() {
    try { const key = await roomKey(room.id); if (!key) throw new Error("This device does not have the room key."); setShare(`${location.origin}/?repo=${encodeURIComponent(room.id)}#key=${await exportKey(key)}`); }
    catch (e) { setError((e as Error).message); }
  }
  async function restore() {
    setBusy(true); setError("");
    try {
      let raw = input.trim(); if (raw.includes("#")) raw = new URLSearchParams(raw.split("#")[1]).get("key") || "";
      const key = await importKey(raw); const keyId = await keyFingerprint(key);
      if (security.keyId && security.keyId !== keyId) throw new Error("This key does not match the room's SHA-256 fingerprint.");
      await storeRoomKey(room.id, key); setInput(""); setFingerprint(keyId); await onChange();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  let svg = "";
  if (share) { const qr = qrcode(0, "M"); qr.addData(share); qr.make(); svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); }
  return <><h2><ShieldCheck size={22} /> Secure conversation</h2><p>Messages, voice notes, pictures and board snapshots are encrypted in your browser with AES-256-GCM. GitHub receives ciphertext, not the key.</p>
    <div className="security-status"><LockKeyhole /><span>{security.enabled ? security.hasKey ? "Secure mode · key on this device" : "Secure mode · key required" : "Standard mode · GitHub can read content"}</span></div>
    <p className="fine-print">This protects future content, not old commits. Authors, timing, sizes and repository membership remain visible. No forward secrecy, identity signatures or independent security audit. Trust the website and everyone with the key.</p>
    {room.demo && <p className="fine-print">Open a live private chat to enable enforced encryption. Demo messages stay in this browser.</p>}
    {!security.enabled && <><label className="check-label"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I understand: losing the key loses access; old plaintext stays in Git history. I will back up the key and verify its fingerprint with my friend.</label><Button role="switch" aria-checked={false} disabled={room.demo || !acknowledged || busy || !security.loaded} loading={busy} onClick={() => void enable()}><LockKeyhole />Enable secure conversation</Button></>}
    {security.enabled && <Button variant="outline" disabled={!security.hasKey} onClick={() => void reveal()}><QrCode />Show key QR / backup</Button>}
    {fingerprint && <div className="fingerprint"><span>SHA-256 fingerprint · compare out of band</span><code>{fingerprint.match(/.{1,8}/g)?.join(" ")}</code></div>}
    {share && <div className="key-share"><div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} /><p className="fine-print">This QR contains the secret key. Share only through a trusted channel, never inside this repository. It does not grant GitHub access. The URL fragment is removed before sign-in and is not sent in HTTP requests.</p><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(share); setCopied(true); } catch { setError("Clipboard unavailable. Download the key backup instead."); } }}>{copied ? <Check /> : <Copy />}Copy secret invite link</Button><Button variant="ghost" onClick={() => { const url = URL.createObjectURL(new Blob([share], { type: "text/plain" })); const a = document.createElement("a"); a.href = url; a.download = "gitmsg-room-key.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download />Download key backup</Button><Button variant="ghost" onClick={() => setShare("")}>Hide key</Button></div>}
    <label className="field-label" htmlFor="room-key">Import key or secret invite link</label><Input id="room-key" type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" placeholder="Paste a key from a trusted participant" /><Button variant="outline" loading={busy} disabled={!input.trim()} onClick={() => void restore()}><KeyRound />Import room key</Button>
    {error && <div role="alert" className="notice error">{error}</div>}
  </>;
}
