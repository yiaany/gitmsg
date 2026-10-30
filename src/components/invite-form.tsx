"use client";
import { useState, type FormEvent } from "react";
import { Check, ExternalLink, LoaderCircle, UserPlus } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function InviteForm({ repo }: { repo: string }) {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ alreadyMember: boolean; acceptanceUrl: string } | null>(null);
  async function invite(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { setResult(await api("/api/invite", { method: "POST", body: JSON.stringify({ repo, login: login.replace(/^@/, "").trim() }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="invite-form" onSubmit={invite}><label htmlFor="invite-login" className="field-label">Their GitHub username</label><div className="flex gap-2"><Input id="invite-login" placeholder="octocat" autoComplete="off" maxLength={40} value={login} onChange={e => { setLogin(e.target.value); setResult(null); }} required /><Button type="submit" disabled={busy || !login.trim()}>{busy ? <LoaderCircle className="spin" /> : result ? <Check /> : <UserPlus />}Invite</Button></div>{error && <div className="notice error" role="alert">{error}</div>}{result && <div className="notice"><Check size={16} /><div>{result.alreadyMember ? "Already a collaborator. They can open the room now." : "Invitation sent! They must accept it on GitHub before joining."}<a className="acceptance-link" href={result.acceptanceUrl} target="_blank" rel="noreferrer">Open repository invitation <ExternalLink size={11} /></a></div></div>}</form>;
}
