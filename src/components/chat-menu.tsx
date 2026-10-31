"use client";

import { Menu } from "@base-ui/react/menu";
import { Bell, BellOff, Bot, ChevronRight, GitPullRequest, Info, MoreVertical, Search, ShieldCheck, Terminal, UserPlus } from "lucide-react";
import { Button } from "./ui/button";

export function ChatMenu({ onSearch, onTool, onInfo, muted, onMute }: { onSearch: () => void; onInfo: () => void; muted: boolean; onMute: () => void; onTool: (tool: "invite" | "security" | "proposals" | "bot" | "clients" | "tools") => void }) {
  return <Menu.Root><Menu.Trigger aria-label="More options" title="Chat options" render={<Button variant="ghost" size="icon-lg" className="round-button" />}><MoreVertical /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={16} className="island-menu-positioner"><Menu.Popup className="island-menu compact-menu chat-options-menu">
    <Menu.Item className="island-menu-item" onClick={onSearch}><Search /><span>Search</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={onMute}>{muted ? <Bell /> : <BellOff />}<span>{muted ? "Unmute" : "Mute"}</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={onInfo}><Info /><span>View Info</span></Menu.Item>
    <Menu.Separator className="island-menu-divider" />
    <Menu.SubmenuRoot><Menu.SubmenuTrigger className="island-menu-item"><Terminal /><span>GitHub tools</span><ChevronRight className="submenu-chevron" /></Menu.SubmenuTrigger><Menu.Portal><Menu.Positioner side="right" align="start" sideOffset={4} className="island-menu-positioner"><Menu.Popup className="island-menu compact-menu">
    <Menu.Item className="island-menu-item" onClick={() => onTool("invite")}><UserPlus /><span>Add members</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onTool("security")}><ShieldCheck /><span>Room security</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onTool("proposals")}><GitPullRequest /><span>Message proposals</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onTool("bot")}><Bot /><span>Actions participant</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onTool("clients")}><Terminal /><span>Other clients</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onTool("tools")}><MoreVertical /><span>All chat tools</span></Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.SubmenuRoot>
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
