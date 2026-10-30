"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client";
import { validRepo, type Room } from "@/lib/protocol";
import type { JoinStatus } from "@/lib/repository-access";
import { Button } from "./ui/button";

export function JoinChat({ repo, login, onDone }: { repo: string; login: string; onDone: (room: Room) => void }) {
  const [result, setResult] = useState<JoinStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const done = useRef(onDone); done.current = onDone;
  const generation = useRef(0);
  const check = useCallback(async (accept = false) => {
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      if (!validRepo(repo)) throw new Error("This chat link is invalid. Ask the owner for a new room link.");
      const next = await api<JoinStatus>(accept ? "/api/join" : `/api/join?repo=${encodeURIComponent(repo)}`, accept ? { method: "POST", body: JSON.stringify({ repo }) } : undefined);
      if (current !== generation.current) return;
      setResult(next);
      if (next.status === "ready") done.current(next.room);
    } catch (e) { if (current === generation.current) setError((e as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }, [repo]);
  useEffect(() => { void check(); return () => { generation.current++; }; }, [check]);
  return <><h2>Join chat</h2><p><strong>{repo}</strong></p><p className="fine-print">Signed in as @{login}. A room link does not grant access to a private repository.</p>
    {busy ? <p role="status"><LoaderCircle className="spin" size={16} /> Checking GitHub access…</p> : <>
      {result?.status === "invited" && <><p>The owner invited you to this repository. Accept the invitation to join and send messages.</p><Button onClick={() => void check(true)}>Accept invitation and open chat<ArrowRight /></Button></>}
      {result?.status === "unavailable" && <div className="notice" role="status">No write access or pending invitation for @{login}. Ask the owner to open this chat → Invite and enter <strong>{login}</strong>. Then check access again. If you accepted on GitHub already, make sure you used this same account.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button variant="outline" onClick={() => void check()}>Check access again</Button>
      {validRepo(repo) && <Button variant="link" render={<a href={`https://github.com/${repo}/invitations`} target="_blank" rel="noreferrer" />}>Open invitation on GitHub<ExternalLink /></Button>}
      <Button variant="ghost" render={<a href="/api/auth/login" />}>Reconnect GitHub</Button>
    </>}
  </>;
}
