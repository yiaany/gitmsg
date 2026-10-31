"use client";
import { useEffect, useState } from "react";
import { ExternalLink, GitMerge, GitPullRequest, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import type { Room } from "@/lib/protocol";
import { Button } from "./ui/button";
type Proposal = { number: number; title: string; url: string; author: string };
export function Proposals({ room, onMerged }: { room: Room; onMerged: () => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function load() { setBusy(true); setError(""); try { const result = await api<{ proposals: Proposal[] }>(`/api/proposals?${new URLSearchParams({ repo: room.id, branch: room.branch })}`); setProposals(result.proposals); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [room.id]);
  async function merge(proposal: Proposal) { if (!confirm(`Merge proposal #${proposal.number} into this chat? Its message becomes visible to everyone.`)) return; setBusy(true); setError(""); try { await api("/api/proposals", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, number: proposal.number }) }); await load(); onMerged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <><h2><GitPullRequest /> Message proposals</h2><p>Use Chat tools to propose your current draft. It stays off the timeline until a repository writer merges the real GitHub pull request.</p><Button variant="outline" loading={busy} onClick={() => void load()}><RefreshCw />Refresh proposals</Button>{!busy && !proposals.length && <p>No open proposals.</p>}{proposals.map(p => <div key={p.number} className="proposal"><div><strong>#{p.number} · {p.title}</strong><small>@{p.author}</small></div><Button size="sm" variant="outline" render={<a href={p.url} target="_blank" rel="noreferrer" />}>Review<ExternalLink /></Button><Button size="sm" disabled={busy || !room.canWrite} onClick={() => void merge(p)}><GitMerge />Merge</Button></div>)}{error && <p role="alert">{error}</p>}</>;
}
