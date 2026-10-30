"use client";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import type { Actor } from "@/lib/protocol";

export function AuthPanel({ session, onContinue, onClose }: { session: { user: Actor | null; configured: boolean; mode: string } | null; onContinue: () => void; onClose: () => void }) {
  return <div className="auth-panel"><Github size={28} /><h2>Sign in with GitHub</h2><p>Connect your account to create private chats and invite collaborators.</p>
    {session?.user ? <Button onClick={onContinue}>Continue as @{session.user.login}</Button> : session?.configured ? <Button render={<a href="/api/auth/login" />}><Github />Sign in with GitHub</Button> : <><Button disabled>{session ? "GitHub setup required" : "Checking configuration…"}</Button>{session && <Button variant="link" render={<a href="/setup" />}>Configure GitHub OAuth</Button>}</>}
    <p className="fine-print">{session?.mode === "app" ? "Access depends on the GitHub App installation and its permissions." : "OAuth requests the repo scope, which grants broad access to private repositories."} Standard rooms are readable by GitHub. Secure mode encrypts future content in your browser.</p>
    <Button variant="ghost" onClick={onClose}>Continue in demo</Button>
  </div>;
}
