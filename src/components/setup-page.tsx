"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, GitBranch, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { api } from "@/lib/client";

export function SetupPage() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const cleanOrigin = origin.replace(/\/+$/, "");
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setStatus("Clipboard access is unavailable. Copy the displayed values manually."); }
  }
  async function generateSecret() {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
    await copy(secret, "secret");
  }
  async function check() {
    setBusy(true);
    try { const result = await api<{ configured: boolean }>("/api/session"); setStatus(result.configured ? "GitHub credentials are configured on this deployment. Return to the chat and test Sign in with GitHub. This check does not verify the credentials with GitHub." : "Configuration is still missing. Add all four environment variables and redeploy."); }
    catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="setup-shell"><a className="setup-back" href="/"><ArrowLeft size={13} />Back to chat</a><div className="setup-heading"><GitBranch size={24} /><h1>GitHub setup</h1></div><p className="setup-lead">One-time configuration for the site owner.</p>
    <div className="setup-grid"><Card className="setup-card"><CardHeader><CardTitle>Site address</CardTitle></CardHeader><CardContent><p>Use your stable production domain, or the exact local origin and port for testing.</p><div className="setup-url"><label htmlFor="site-origin">Site origin</label><Input id="site-origin" type="url" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="https://your-gitmsg.vercel.app" /></div></CardContent></Card>
    <Card className="setup-card"><CardHeader><CardTitle>GitHub OAuth App</CardTitle></CardHeader><CardContent><p>GitHub Settings → Developer settings → OAuth Apps → New OAuth App.</p><div className="setup-fields">{[["Application name", "gitmsg"], ["Homepage URL", cleanOrigin], ["Callback URL", `${cleanOrigin}/api/auth/callback`]].map(([label, value]) => <div className="setup-copy-field" key={label}><span>{label}</span><code>{value || "Your site origin"}</code><Button variant="ghost" size="icon-sm" aria-label={`Copy ${label}`} onClick={() => void copy(value, label)}>{copied === label ? <Check /> : <Copy />}</Button></div>)}</div><Button variant="outline" render={<a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer" />}><Github />Register OAuth App<ArrowUpRight /></Button></CardContent></Card>
    <Card className="setup-card"><CardHeader><CardTitle>Environment variables</CardTitle></CardHeader><CardContent><p>Copy your Client ID and generate a Client Secret. Save these in Vercel → Project → Settings → Environment Variables, or locally in <code>.env.local</code>.</p><pre className="setup-env">{`GITHUB_CLIENT_ID=<your GitHub Client ID>\nGITHUB_CLIENT_SECRET=<your GitHub Client Secret>\nSESSION_SECRET=<generate a secret below>\nAPP_URL=${cleanOrigin || "https://your-domain"}\nGITHUB_AUTH_MODE=oauth`}</pre><div className="setup-actions"><Button onClick={() => void generateSecret()}>{copied === "secret" ? <Check /> : <KeyRound />}{copied === "secret" ? "Secret copied" : "Generate & copy session secret"}</Button><Button variant="outline" render={<a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" />}>Open Vercel<ExternalLink /></Button></div><div className="setup-warning"><ShieldCheck size={16} /><span>The generated secret stays in your browser and clipboard. Never share secrets in chat or commit them. OAuth’s <code>repo</code> scope grants broad private-repository access.</span></div></CardContent></Card>
    <Card className="setup-card"><CardHeader><CardTitle>Verify configuration</CardTitle></CardHeader><CardContent><p>Redeploy after saving the variables, then sign in. The first sign-in creates a private <code>gitmsg-inbox</code>. Invite collaborators from a chat; they must accept on GitHub.</p><div className="setup-actions"><Button onClick={() => void check()} loading={busy}><ShieldCheck />Check configuration</Button><Button variant="outline" render={<a href="/" />}>Open messenger<ArrowUpRight /></Button></div>{status && <div className="setup-result" role="status">{status}</div>}</CardContent></Card></div>
    <p className="setup-footnote">Authentication uses the GitHub authorization-code flow with state + PKCE and encrypted HttpOnly sessions. No message database is needed. GitHub account permissions and free-tier limits still apply. <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub Developer Settings ↗</a></p>
  </main>;
}
