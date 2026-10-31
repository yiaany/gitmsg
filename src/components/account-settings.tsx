"use client";

import { Menu } from "@base-ui/react/menu";
import { AtSign, Bell, Bookmark, ChevronRight, CircleHelp, Copy, Download, Info, LogOut, MoreVertical, Music2, Pencil, Search, Settings2, ShieldCheck, UserRound, Wrench } from "lucide-react";
import type { Actor } from "@/lib/protocol";
import type { GitHubProfile } from "@/lib/github-models";
import { ProfileCard } from "./profile-settings";
import { useAppearance } from "./appearance-provider";
import { Github } from "./github-icon";
import { Button } from "./ui/button";

export function SettingsActions({ onSearch, onEdit, onHelp, onLogout }: { onSearch: () => void; onEdit: () => void; onHelp: () => void; onLogout: () => void }) {
  return <div className="settings-header-actions"><Button variant="ghost" className="round-button" size="icon-lg" aria-label="Search settings" onClick={onSearch}><Search /></Button><Button variant="ghost" className="round-button" size="icon-lg" aria-label="Edit profile" onClick={onEdit}><Pencil /></Button><Menu.Root><Menu.Trigger aria-label="Settings options" render={<Button variant="ghost" className="round-button" size="icon-lg" />}><MoreVertical /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={8} className="island-menu-positioner"><Menu.Popup className="island-menu compact-menu"><Menu.Item className="island-menu-item" onClick={onHelp}><CircleHelp />Help</Menu.Item><Menu.Item className="island-menu-item destructive" onClick={onLogout}><LogOut />Sign out</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>;
}

export function AccountSettings({ actor, profile, sound, query, onQuery, onEdit, onSound, onSaved, onSecurity, onTools, onHelp, onConnect, onExport, onClone }: {
  actor: Actor; profile: GitHubProfile; sound: boolean; query: string | null; onQuery: (query: string) => void;
  onEdit: () => void; onSound: () => void; onSaved: () => void; onSecurity?: () => void; onTools?: () => void; onHelp: () => void; onConnect: () => void; onExport?: () => void; onClone?: () => void;
}) {
  const { appearance, toggle } = useAppearance();
  const items = [
    { label: "Account", detail: "Username, Name, Bio, Music", icon: UserRound, color: "blue", action: onEdit },
    { label: "General Settings", detail: `Theme · ${appearance === "dark" ? "Night" : "Day"} mode`, icon: Settings2, color: "orange", action: toggle },
    { label: "Notifications", detail: "Message sound in the open conversation", icon: Bell, color: "red", action: onSound, checked: sound },
    { label: "Privacy and Security", detail: "Encryption, Keys, GitHub access", icon: ShieldCheck, color: "slate", action: onSecurity || onHelp },
    { label: "Saved Messages", detail: "Your private GitHub-backed notes", icon: Bookmark, color: "blue", action: onSaved },
    ...(onTools ? [{ label: "Chat Tools", detail: "Members, Proposals, Integrations", icon: Wrench, color: "purple", action: onTools }] : []),
    { label: "GitHub Account", detail: `@${actor.login}`, icon: Github, color: "green", action: onConnect },
  ];
  const filtered = items.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes((query || "").toLowerCase()));
  return <div className="account-settings">
    {query !== null && <label className="settings-search conversation-search"><Search /><input autoFocus type="search" placeholder="Search settings" aria-label="Search settings" value={query} onChange={event => onQuery(event.target.value)} /></label>}
    {query === null && <><div className="settings-hero"><button type="button" className="settings-profile" aria-label="Edit profile" onClick={onEdit}><ProfileCard actor={actor} profile={{ ...profile, bio: "" }} /></button>{profile.music ? <a className="settings-music" href={profile.music.url} target="_blank" rel="noreferrer" title="Open favorite music link"><Music2 /><span>{profile.music.title}</span>{profile.music.artist && <small>{profile.music.artist}</small>}<ChevronRight /></a> : <button type="button" className="settings-music" onClick={onEdit}><Music2 /><span>Add Music</span><ChevronRight /></button>}</div>
      <div className="settings-group account-details"><a className="settings-row" href={`https://github.com/${actor.login}`} target="_blank" rel="noreferrer"><span className="settings-icon blue"><AtSign /></span><span>@{actor.login}<small>Username</small></span></a>{profile.bio && <div className="settings-row"><span className="settings-icon slate"><Info /></span><span>{profile.bio}<small>Bio</small></span></div>}</div></>}
    <div className="settings-group">{filtered.map(item => <button type="button" className="settings-row" key={item.label} onClick={item.action} {...("checked" in item ? { role: "switch", "aria-checked": item.checked } : {})}><span className={`settings-icon ${item.color}`}><item.icon /></span><span>{item.label}<small>{item.detail}</small></span>{"checked" in item && <i className={`appearance-switch ${item.checked ? "on" : ""}`} aria-hidden="true" />}</button>)}{!filtered.length && <p className="notice settings-no-results">No settings found</p>}</div>
    {query === null && <><div className="settings-group">{onExport && <button type="button" className="settings-row" onClick={onExport}><span className="settings-icon green"><Download /></span><span>Export loaded history</span></button>}{onClone && <button type="button" className="settings-row" onClick={onClone}><span className="settings-icon purple"><Copy /></span><span>Copy clone command</span></button>}<button type="button" className="settings-row" onClick={onHelp}><span className="settings-icon blue"><CircleHelp /></span><span>Help</span></button></div><p className="settings-footer">gitmsg · Messages with receipts</p></>}
  </div>;
}
