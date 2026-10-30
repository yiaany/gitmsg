"use client";
import { GitBranch } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import type { Actor } from "@/lib/protocol";

export function SiteHeader({ user, onConnect, onSettings, onSecret }: { user?: Actor | null; onConnect: () => void; onSettings: () => void; onSecret: () => void }) {
  return <header className="site-header"><div className="site-header-inner">
    <Button variant="ghost" className="site-logo" onClick={onSecret} aria-label="gitmsg"><GitBranch />gitmsg</Button>
    <Button size="sm" variant={user ? "outline" : "default"} onClick={user ? onSettings : onConnect}><Github />{user ? `@${user.login}` : "Sign in with GitHub"}</Button>
  </div></header>;
}
