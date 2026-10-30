"use client";
import { GitBranch } from "lucide-react";
import { Github } from "./github-icon";
import { Button } from "./ui/button";
import type { Actor } from "@/lib/protocol";
import SlideTextButton from "./kokonutui/slide-text-button";

export function SiteHeader({ user, onConnect, onSettings, onSecret }: { user?: Actor | null; onConnect: () => void; onSettings: () => void; onSecret: () => void }) {
  return <header className="site-header"><div className="site-header-inner">
    <div className="site-identity"><Button variant="ghost" className="site-logo" onClick={onSecret} aria-label="gitmsg"><span className="brand-mark"><GitBranch /></span>gitmsg<span className="brand-period">.</span></Button><span className="site-tagline">A little less fleeting.</span></div>
    <div className="site-header-actions"><SlideTextButton className="setup-nav" variant="ghost" href="/setup" text="GitHub setup" hoverText="Connect your account" /><Button size="sm" className="account-button" variant={user ? "outline" : "default"} onClick={user ? onSettings : onConnect}><Github />{user ? `@${user.login}` : "Sign in with GitHub"}</Button></div>
  </div></header>;
}
