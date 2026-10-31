"use client";
import { useEffect, useState } from "react";
import { Bot, Dice5, Download, ExternalLink, ListChecks, Rocket } from "lucide-react";
import { api } from "@/lib/client";
import type { Room } from "@/lib/protocol";
import { Button } from "./ui/button";
export function BotPanel({ room, secure }: { room: Room; secure: boolean }) {
  const [installed, setInstalled] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [queued, setQueued] = useState("");
  async function check() { setBusy(true); try { const result = await api<{ installed: boolean }>(`/api/bot?repo=${encodeURIComponent(room.id)}`); setInstalled(result.installed); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(() => { void check(); }, [room.id]);
  async function command(value: string) { if (value === "deploy" && !confirm("Request the administrator-configured deployment workflow? This may deploy real infrastructure.")) return; setBusy(true); setError(""); try { const result = await api<{ url: string }>("/api/bot", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, command: value }) }); setQueued(result.url); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <><h2><Bot /> GitHub Actions participant</h2><p>Real workflows, real commits. No always-on bot server. Results arrive as chat messages after Actions starts; jobs are not instantaneous and consume your repository's Actions quota.</p>
    {secure ? <div className="notice">Disabled in secure rooms: Actions does not receive your decryption key.</div> : installed ? <div className="feature-grid"><Button disabled={busy} variant="outline" onClick={() => void command("roll")}><Dice5 />Roll a die</Button><Button disabled={busy} variant="outline" onClick={() => void command("standup")}><ListChecks />Standup</Button><Button disabled={busy} variant="outline" onClick={() => void command("deploy")}><Rocket />Request deploy</Button></div> : <>
      <p>Install these two files in the chat repository on its default branch. We do not request permission to silently install executable workflows.</p>
      <Button variant="outline" render={<a href="/integrations/gitmsg-bot.yml" download="gitmsg-bot.yml" />}><Download />.github/workflows/gitmsg-bot.yml</Button><Button variant="outline" render={<a href="/integrations/gitmsg-bot.cjs" download="gitmsg-bot.cjs" />}><Download />.github/scripts/gitmsg-bot.cjs</Button>
      <p className="fine-print">For deploy, add gitmsg/bot.json with {`{"deployWorkflow":"deploy.yml"}`}. It must name a workflow you already trust in this same repository. Secure-room checks fail closed.</p><Button variant="ghost" loading={busy} onClick={() => void check()}>Check installation</Button>
    </>}
    {queued && <div className="notice">Workflow queued. Wait for the real result in chat.<Button variant="link" render={<a href={queued} target="_blank" rel="noreferrer" />}>View run<ExternalLink /></Button></div>}{error && <div className="notice error" role="alert">{error}</div>}
  </>;
}
